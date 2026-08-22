use std::{env, fs};

use chrono::{Duration, TimeZone, Utc};

use crate::{
    AuditLog, AuditOutcome, InterfaceStatus, InterfaceTrafficTracker, RouterProfile,
    RouterProfileStore,
    config::{ConfigSnapshot, DiffKind, SnapshotFile},
    diagnostics::{DiagnosticCheck, DiagnosticReport, DiagnosticSeverity},
    inspect_host_key,
    management::{ConfigurationArea, LogCategory, ManagedCommand, ReadCommand, WriteCommand},
    ssh::{TrustDecision, TrustedHostStore},
    traffic::{TrafficSample, TrafficSeries, calculate_rate},
};

#[test]
fn audit_log_is_bounded_and_rejects_sensitive_summaries() {
    use crate::RouterOperation;

    let now = Utc.timestamp_opt(20_000, 0).unwrap();
    let mut audit_log = AuditLog::new(2);
    audit_log
        .record(
            "router-a",
            RouterOperation::ApplyFirewall,
            AuditOutcome::Prepared,
            now,
            "防火墙变更已通过确认",
        )
        .unwrap();
    audit_log
        .record(
            "router-b",
            RouterOperation::RunDiagnostics,
            AuditOutcome::Succeeded,
            now + Duration::seconds(1),
            "网络诊断已完成",
        )
        .unwrap();
    audit_log
        .record(
            "router-a",
            RouterOperation::RestartService,
            AuditOutcome::Succeeded,
            now + Duration::seconds(2),
            "DDNS 服务已重启",
        )
        .unwrap();
    assert_eq!(audit_log.entries().len(), 2);
    assert_eq!(audit_log.entries()[0].router_id, "router-a");
    assert_eq!(audit_log.for_router("router-a").count(), 1);
    assert!(
        audit_log
            .record(
                "router-a",
                RouterOperation::ReadStatus,
                AuditOutcome::Failed,
                now,
                "password=secret",
            )
            .is_err()
    );
}

#[test]
fn calculates_traffic_rate_from_monotonic_samples() {
    let before = TrafficSample {
        collected_at: Utc.timestamp_opt(1_000, 0).unwrap(),
        rx_bytes: 100,
        tx_bytes: 50,
    };
    let after = TrafficSample {
        collected_at: Utc.timestamp_opt(1_002, 0).unwrap(),
        rx_bytes: 500,
        tx_bytes: 150,
    };
    let rate = calculate_rate(&before, &after).unwrap();
    assert_eq!(rate.rx_bytes_per_second, 200.0);
    assert_eq!(rate.tx_bytes_per_second, 50.0);
}

#[test]
fn rejects_non_monotonic_traffic_samples() {
    let time = Utc::now();
    let sample = TrafficSample {
        collected_at: time,
        rx_bytes: 1,
        tx_bytes: 1,
    };
    assert!(calculate_rate(&sample, &sample).is_err());
}

#[test]
fn traffic_history_respects_capacity() {
    let time = Utc::now();
    let mut history = TrafficSeries::new(2);
    for seconds in 1..=3 {
        history.push(crate::TrafficRate {
            collected_at: time + Duration::seconds(seconds),
            sample_seconds: 1.0,
            rx_bytes_per_second: seconds as f64,
            tx_bytes_per_second: seconds as f64,
        });
    }
    assert_eq!(history.values().len(), 2);
    assert_eq!(history.values()[0].rx_bytes_per_second, 2.0);
}

#[test]
fn interface_traffic_tracker_updates_only_after_second_sample_and_bounds_history() {
    let mut tracker = InterfaceTrafficTracker::new(2);
    let initial = InterfaceStatus {
        id: "wan".into(),
        name: "WAN".into(),
        device: Some("eth0.2".into()),
        up: true,
        ipv4: vec!["203.0.113.2".into()],
        ipv6: Vec::new(),
        rx_bytes: 1_000,
        tx_bytes: 400,
    };
    let start = Utc.timestamp_opt(10_000, 0).unwrap();
    assert!(tracker.ingest(&[initial.clone()], start).is_empty());

    let mut second = initial.clone();
    second.rx_bytes = 1_600;
    second.tx_bytes = 700;
    let rates = tracker.ingest(&[second.clone()], start + Duration::seconds(2));
    assert_eq!(rates.len(), 1);
    assert_eq!(rates[0].rate.rx_bytes_per_second, 300.0);
    assert_eq!(rates[0].rate.tx_bytes_per_second, 150.0);

    // 计数器变小（路由器重启或接口重连）时不显示虚假的峰值流量。
    let mut reset = second.clone();
    reset.rx_bytes = 20;
    reset.tx_bytes = 10;
    let reset_rates = tracker.ingest(&[reset], start + Duration::seconds(3));
    assert_eq!(reset_rates[0].rate.rx_bytes_per_second, 0.0);
    assert_eq!(reset_rates[0].rate.tx_bytes_per_second, 0.0);
    assert_eq!(tracker.history("wan").unwrap().values().len(), 2);
}

#[test]
fn reports_snapshot_diff_without_cross_router_restore() {
    let time = Utc::now();
    let original = ConfigSnapshot {
        id: "a".into(),
        router_id: "router-1".into(),
        created_at: time,
        label: "before".into(),
        firmware: None,
        files: vec![SnapshotFile {
            path: "/etc/config/network".into(),
            content: "old".into(),
        }],
    };
    let current = ConfigSnapshot {
        id: "b".into(),
        router_id: "router-1".into(),
        created_at: time,
        label: "current".into(),
        firmware: None,
        files: vec![
            SnapshotFile {
                path: "/etc/config/network".into(),
                content: "new".into(),
            },
            SnapshotFile {
                path: "/etc/config/firewall".into(),
                content: "added".into(),
            },
        ],
    };
    let changes = original.diff_against(&current).unwrap();
    assert_eq!(changes.len(), 2);
    assert!(changes.iter().any(|diff| diff.kind == DiffKind::Changed));
    assert!(changes.iter().any(|diff| diff.kind == DiffKind::Added));
}

#[test]
fn requires_explicit_trust_for_first_seen_or_changed_host_key() {
    let mut store = TrustedHostStore::default();
    let now = Utc::now();
    assert_eq!(
        store.evaluate("router", "192.168.1.1", 22, "ssh-ed25519", b"first"),
        TrustDecision::FirstSeen
    );
    store.trust(
        "router".into(),
        "192.168.1.1".into(),
        22,
        "ssh-ed25519".into(),
        b"first",
        now,
    );
    assert_eq!(
        store.evaluate("router", "192.168.1.1", 22, "ssh-ed25519", b"first"),
        TrustDecision::Trusted
    );
    assert_eq!(
        store.evaluate("router", "192.168.1.1", 22, "ssh-ed25519", b"changed"),
        TrustDecision::Changed
    );
    assert!(
        store
            .require_trusted("router", "192.168.1.1", 22, "ssh-ed25519", b"changed")
            .is_err()
    );
}

#[test]
fn host_key_challenge_exposes_exact_fingerprint_without_implicit_trust() {
    let mut store = TrustedHostStore::default();
    let challenge = inspect_host_key(&store, "router", "192.168.1.1", 22, "ssh-ed25519", b"first");
    assert_eq!(challenge.decision, TrustDecision::FirstSeen);
    assert_eq!(
        challenge.fingerprint_sha256,
        TrustedHostStore::fingerprint(b"first")
    );

    store.trust(
        "router".into(),
        "192.168.1.1".into(),
        22,
        "ssh-ed25519".into(),
        b"first",
        Utc::now(),
    );
    assert_eq!(
        inspect_host_key(&store, "router", "192.168.1.1", 22, "ssh-ed25519", b"first",).decision,
        TrustDecision::Trusted
    );
    assert_eq!(
        inspect_host_key(
            &store,
            "router",
            "192.168.1.1",
            22,
            "ssh-ed25519",
            b"replaced",
        )
        .decision,
        TrustDecision::Changed
    );
}

#[test]
fn diagnostics_summarize_highest_severity() {
    let report = DiagnosticReport {
        router_id: "router".into(),
        generated_at: Utc::now(),
        checks: vec![DiagnosticCheck {
            id: "dns".into(),
            title: "DNS".into(),
            severity: DiagnosticSeverity::Error,
            summary: "无法解析域名".into(),
            evidence: vec!["timeout".into()],
            suggested_action: Some("检查 DNS".into()),
        }],
    };
    assert_eq!(report.highest_severity(), DiagnosticSeverity::Error);
    assert!(report.summary().contains('1'));
}

#[test]
fn normalizes_router_endpoint_to_ubus_without_query_or_fragment() {
    let endpoint = crate::normalize_router_endpoint("192.168.1.1/luci?unsafe=yes#ignored").unwrap();
    assert_eq!(endpoint.as_str(), "http://192.168.1.1/luci/ubus");
    let endpoint = crate::normalize_router_endpoint("https://router.example/ubus/").unwrap();
    assert_eq!(endpoint.as_str(), "https://router.example/ubus");
}

#[test]
fn rejects_empty_router_endpoint() {
    assert!(crate::normalize_router_endpoint("  ").is_err());
}

#[test]
fn router_profile_store_round_trips_updates_and_deletes_non_secret_metadata() {
    let directory = env::temp_dir().join(format!(
        "openwrt-profile-store-{}-{}",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let store = RouterProfileStore::new(directory.join("profiles.json"));
    let profile = RouterProfile {
        id: "router-main".into(),
        name: "主路由".into(),
        base_url: "https://192.168.1.1/luci".into(),
        username: "root".into(),
        ssh_port: 22,
    };

    assert_eq!(
        store.upsert(profile.clone()).unwrap(),
        vec![profile.clone()]
    );
    let mut updated = profile.clone();
    updated.name = "客厅主路由".into();
    assert_eq!(
        store.upsert(updated.clone()).unwrap(),
        vec![updated.clone()]
    );
    assert_eq!(store.load().unwrap(), vec![updated]);

    let mut state = store.load_state().unwrap();
    state.trusted_hosts.trust(
        "router-main".into(),
        "192.168.1.1".into(),
        22,
        "ssh-ed25519".into(),
        b"router-key",
        Utc::now(),
    );
    store.save_state(&state).unwrap();
    assert_eq!(
        store.load_state().unwrap().trusted_hosts.evaluate(
            "router-main",
            "192.168.1.1",
            22,
            "ssh-ed25519",
            b"router-key"
        ),
        TrustDecision::Trusted
    );

    let audit_entry = store
        .record_audit(
            "router-main",
            crate::RouterOperation::ApplyFirewall,
            AuditOutcome::Prepared,
            Utc::now(),
            "防火墙变更已通过确认",
        )
        .unwrap();
    assert_eq!(audit_entry.router_id, "router-main");
    assert_eq!(store.load_state().unwrap().audit_log.entries().len(), 1);

    let serialized = fs::read_to_string(store.path()).unwrap();
    assert!(!serialized.contains("password"));
    assert!(!serialized.contains("private_key"));
    assert!(store.remove("router-main").unwrap().is_empty());
    assert!(store.load().unwrap().is_empty());
    assert_eq!(
        store.load_state().unwrap().trusted_hosts.evaluate(
            "router-main",
            "192.168.1.1",
            22,
            "ssh-ed25519",
            b"router-key"
        ),
        TrustDecision::FirstSeen
    );
    assert_eq!(store.load_state().unwrap().audit_log.entries().len(), 1);
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn router_profile_store_rejects_duplicate_ids_and_invalid_profiles() {
    let directory = env::temp_dir().join(format!(
        "openwrt-profile-validation-{}-{}",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let store = RouterProfileStore::new(directory.join("profiles.json"));
    let profile = RouterProfile {
        id: "router-main".into(),
        name: "主路由".into(),
        base_url: "https://192.168.1.1".into(),
        username: "root".into(),
        ssh_port: 22,
    };
    assert!(store.save(&[profile.clone(), profile]).is_err());

    assert!(
        store
            .save(&[RouterProfile {
                id: " ".into(),
                name: "无效".into(),
                base_url: "not-a-router".into(),
                username: "root".into(),
                ssh_port: 22,
            }])
            .is_err()
    );
    assert!(!store.path().exists());
}

#[test]
fn management_read_commands_bound_logs_and_reject_injection() {
    let command = ReadCommand::Logs {
        category: LogCategory::System,
        limit: 3,
        filter: Some("dnsmasq".into()),
    }
    .build()
    .unwrap();
    assert!(command.contains("tail -n 20"));
    assert!(command.contains("grep -F -- 'dnsmasq'"));
    assert!(
        ReadCommand::Logs {
            category: LogCategory::System,
            limit: 100,
            filter: Some("bad\nfilter".into()),
        }
        .build()
        .is_err()
    );
    assert!(
        ReadCommand::ConfigurationFile {
            path: "/etc/config/../shadow".into(),
        }
        .build()
        .is_err()
    );
}

#[test]
fn management_write_commands_require_matching_snapshot_and_typed_approval() {
    use crate::{OperationApproval, RouterOperation};

    let firewall_change = WriteCommand::UciOption {
        area: ConfigurationArea::Firewall,
        package: "firewall".into(),
        section: "lan".into(),
        option: "input".into(),
        value: Some("ACCEPT".into()),
    };
    let missing_snapshot = OperationApproval {
        operation: RouterOperation::ApplyFirewall,
        router_id: "router".into(),
        snapshot_id: None,
        typed_phrase: Some("应用防火墙配置".into()),
    };
    assert!(ManagedCommand::prepare("router", &firewall_change, &missing_snapshot).is_err());

    let approved = OperationApproval {
        operation: RouterOperation::ApplyFirewall,
        router_id: "router".into(),
        snapshot_id: Some("snapshot-before-firewall".into()),
        typed_phrase: Some("应用防火墙配置".into()),
    };
    let plan = ManagedCommand::prepare("router", &firewall_change, &approved).unwrap();
    assert!(plan.command.contains("uci commit 'firewall'"));
    assert!(plan.command.contains("/etc/init.d/firewall reload"));
    assert!(plan.command.contains("openwrt-status.bak"));
}

#[test]
fn firmware_command_allows_only_staged_bin_or_img_files() {
    let valid = WriteCommand::FirmwareUpgrade {
        image_path: "/tmp/openwrt-sysupgrade.bin".into(),
        preserve_config: true,
    };
    assert!(valid.build().unwrap().contains("sysupgrade -T"));
    assert!(
        WriteCommand::FirmwareUpgrade {
            image_path: "/etc/config/network".into(),
            preserve_config: false,
        }
        .build()
        .is_err()
    );
    assert!(
        WriteCommand::Package {
            package: "luci; reboot".into(),
            install: true,
        }
        .build()
        .is_err()
    );
}

#[test]
fn high_risk_operations_require_snapshot_and_exact_typed_confirmation() {
    use crate::{OperationApproval, RouterOperation};

    let missing_snapshot = OperationApproval {
        operation: RouterOperation::UpgradeFirmware,
        router_id: "router".into(),
        snapshot_id: None,
        typed_phrase: Some("升级固件".into()),
    };
    assert!(missing_snapshot.validate().is_err());

    let wrong_phrase = OperationApproval {
        operation: RouterOperation::ApplyFirewall,
        router_id: "router".into(),
        snapshot_id: Some("snapshot-1".into()),
        typed_phrase: Some("确认".into()),
    };
    assert!(wrong_phrase.validate().is_err());

    let approved = OperationApproval {
        operation: RouterOperation::ApplyFirewall,
        router_id: "router".into(),
        snapshot_id: Some("snapshot-1".into()),
        typed_phrase: Some("应用防火墙配置".into()),
    };
    assert!(approved.validate().is_ok());
}
