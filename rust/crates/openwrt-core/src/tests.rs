use std::{env, fs};

use chrono::{Duration, TimeZone, Utc};

use crate::{
    RouterProfile, RouterProfileStore,
    config::{ConfigSnapshot, DiffKind, SnapshotFile},
    diagnostics::{DiagnosticCheck, DiagnosticReport, DiagnosticSeverity},
    ssh::{TrustDecision, TrustedHostStore},
    traffic::{TrafficSample, TrafficSeries, calculate_rate},
};

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

    let serialized = fs::read_to_string(store.path()).unwrap();
    assert!(!serialized.contains("password"));
    assert!(!serialized.contains("private_key"));
    assert!(store.remove("router-main").unwrap().is_empty());
    assert!(store.load().unwrap().is_empty());
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
