use chrono::Utc;
use openwrt_core::{DiagnosticCheck, DiagnosticReport, DiagnosticSeverity};

fn main() {
    let report = DiagnosticReport {
        router_id: "demo-router".to_owned(),
        generated_at: Utc::now(),
        checks: vec![DiagnosticCheck {
            id: "core-ready".to_owned(),
            title: "Rust 核心".to_owned(),
            severity: DiagnosticSeverity::Info,
            summary: "Rust 领域模型、流量、快照与 SSH 信任策略已可独立验证。".to_owned(),
            evidence: vec!["cargo test".to_owned()],
            suggested_action: None,
        }],
    };
    println!("{}", report.summary());
}
