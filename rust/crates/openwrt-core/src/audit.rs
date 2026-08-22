//! 路由器管理审计日志。
//!
//! 审计记录只保存操作类别、结果、时间与经过清洗的摘要；永不保存密码、私钥、
//! cookie、完整命令行或配置正文。调用方应在执行受审批操作的前后分别记录计划和
//! 结果，从而能解释高风险变更，而不扩大敏感信息暴露面。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::RouterOperation;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AuditOutcome {
    Prepared,
    Succeeded,
    Rejected,
    Failed,
}

impl AuditOutcome {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Prepared => "已准备",
            Self::Succeeded => "已完成",
            Self::Rejected => "已拒绝",
            Self::Failed => "失败",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub router_id: String,
    pub operation: RouterOperation,
    pub outcome: AuditOutcome,
    pub recorded_at: DateTime<Utc>,
    pub summary: String,
}

/// 有界、按时间倒序的审计日志。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditLog {
    capacity: usize,
    entries: Vec<AuditEntry>,
}

impl AuditLog {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            entries: Vec::new(),
        }
    }

    pub fn record(
        &mut self,
        router_id: impl Into<String>,
        operation: RouterOperation,
        outcome: AuditOutcome,
        recorded_at: DateTime<Utc>,
        summary: impl Into<String>,
    ) -> Result<&AuditEntry, AuditError> {
        let router_id = router_id.into();
        let summary = sanitize_summary(&summary.into())?;
        if router_id.trim().is_empty() {
            return Err(AuditError::InvalidRouterId);
        }
        let sequence = self
            .entries
            .iter()
            .filter(|entry| entry.recorded_at == recorded_at)
            .count();
        self.entries.insert(
            0,
            AuditEntry {
                id: format!("{}-{sequence}", recorded_at.timestamp_millis()),
                router_id,
                operation,
                outcome,
                recorded_at,
                summary,
            },
        );
        self.entries.truncate(self.capacity);
        Ok(&self.entries[0])
    }

    pub fn entries(&self) -> &[AuditEntry] {
        &self.entries
    }

    pub fn for_router(&self, router_id: &str) -> impl Iterator<Item = &AuditEntry> {
        self.entries
            .iter()
            .filter(move |entry| entry.router_id == router_id)
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AuditError {
    #[error("路由器 ID 不能为空")]
    InvalidRouterId,
    #[error("审计摘要无效")]
    InvalidSummary,
}

fn sanitize_summary(value: &str) -> Result<String, AuditError> {
    let summary = value.trim();
    if summary.is_empty()
        || summary.len() > 240
        || summary.contains(['\r', '\n', '\0'])
        || looks_sensitive(summary)
    {
        return Err(AuditError::InvalidSummary);
    }
    Ok(summary.to_owned())
}

fn looks_sensitive(summary: &str) -> bool {
    let normalized = summary.to_ascii_lowercase();
    [
        "password",
        "passwd",
        "private key",
        "authorization:",
        "cookie=",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}
