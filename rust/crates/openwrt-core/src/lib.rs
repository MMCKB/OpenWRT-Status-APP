//! OpenWrt Status 的纯 Rust 领域核心。
//!
//! 此 crate 不依赖 Android、UI 或网络运行时；它承载可跨平台测试的
//! 数据模型、流量采样、配置快照差异、诊断报告和 SSH 主机信任策略。

pub mod audit;
pub mod config;
pub mod diagnostics;
pub mod luci;
pub mod management;
pub mod model;
pub mod operations;
pub mod profiles;
pub mod ssh;
pub mod traffic;

#[cfg(test)]
mod tests;

pub use audit::{AuditEntry, AuditError, AuditLog, AuditOutcome};
pub use config::{ConfigDiff, ConfigSnapshot, SnapshotFile};
pub use diagnostics::{DiagnosticCheck, DiagnosticReport, DiagnosticSeverity};
pub use luci::{LuCiClient, normalize_router_endpoint};
pub use management::{
    ConfigurationArea, DockerAction, LogCategory, ManagedCommand, ManagementError, ReadCommand,
    ServiceAction, WriteCommand,
};
pub use model::{InterfaceStatus, RouterProfile, RouterStatus, SystemStatus};
pub use operations::{ConfirmationLevel, OperationApproval, RouterOperation};
pub use profiles::{RouterAppState, RouterProfileStore};
pub use ssh::{
    HostKeyChallenge, KnownHost, RemoteFileEntry, SftpClient, SshClient, SshCommandResult,
    SshConnectionRequest, SshTransportError, TrustDecision, TrustedHostStore, inspect_host_key,
};
pub use traffic::{
    InterfaceTrafficRate, InterfaceTrafficTracker, TrafficRate, TrafficSample, TrafficSeries,
};

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CoreError {
    #[error("路由器地址无效：{0}")]
    InvalidRouterUrl(String),
    #[error("路由器档案无效：{0}")]
    InvalidRouterProfile(String),
    #[error("路由器档案存储失败：{0}")]
    Persistence(String),
    #[error("采样时间必须递增")]
    NonMonotonicSample,
    #[error("无法访问路由器：{0}")]
    Transport(String),
    #[error("路由器返回 HTTP {0}")]
    Http(u16),
    #[error("路由器拒绝 RPC 请求：{0}")]
    Rpc(String),
    #[error("路由器返回了无法识别的响应：{0}")]
    InvalidResponse(String),
    #[error("配置快照不属于当前路由器")]
    SnapshotRouterMismatch,
    #[error("SSH 主机指纹已变化，需要用户重新确认")]
    HostKeyChanged,
}
