use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiagnosticSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiagnosticCheck {
    pub id: String,
    pub title: String,
    pub severity: DiagnosticSeverity,
    pub summary: String,
    pub evidence: Vec<String>,
    pub suggested_action: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiagnosticReport {
    pub router_id: String,
    pub generated_at: DateTime<Utc>,
    pub checks: Vec<DiagnosticCheck>,
}

impl DiagnosticReport {
    pub fn highest_severity(&self) -> DiagnosticSeverity {
        self.checks
            .iter()
            .map(|check| check.severity)
            .max_by_key(|severity| match severity {
                DiagnosticSeverity::Info => 0,
                DiagnosticSeverity::Warning => 1,
                DiagnosticSeverity::Error => 2,
            })
            .unwrap_or(DiagnosticSeverity::Info)
    }

    pub fn summary(&self) -> String {
        let errors = self
            .checks
            .iter()
            .filter(|check| check.severity == DiagnosticSeverity::Error)
            .count();
        let warnings = self
            .checks
            .iter()
            .filter(|check| check.severity == DiagnosticSeverity::Warning)
            .count();
        match (errors, warnings) {
            (0, 0) => "网络检查未发现异常。".to_owned(),
            (0, count) => format!("发现 {count} 项需要关注的网络问题。"),
            (count, _) => format!("发现 {count} 项网络错误，需要优先处理。"),
        }
    }
}
