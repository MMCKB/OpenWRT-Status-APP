//! OpenWrt Status 的纯 Rust 领域核心。
//!
//! 此 crate 不依赖 Android、UI 或网络运行时；它承载可跨平台测试的
//! 数据模型、流量采样、配置快照差异、诊断报告和 SSH 主机信任策略。

pub mod config;
pub mod diagnostics;
pub mod model;
pub mod ssh;
pub mod traffic;

#[cfg(test)]
mod tests;

pub use config::{ConfigDiff, ConfigSnapshot, SnapshotFile};
pub use diagnostics::{DiagnosticCheck, DiagnosticReport, DiagnosticSeverity};
pub use model::{InterfaceStatus, RouterProfile, RouterStatus, SystemStatus};
pub use ssh::{KnownHost, TrustDecision, TrustedHostStore};
pub use traffic::{TrafficRate, TrafficSample, TrafficSeries};

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CoreError {
    #[error("路由器地址无效：{0}")]
    InvalidRouterUrl(String),
    #[error("采样时间必须递增")]
    NonMonotonicSample,
    #[error("配置快照不属于当前路由器")]
    SnapshotRouterMismatch,
    #[error("SSH 主机指纹已变化，需要用户重新确认")]
    HostKeyChanged,
}
