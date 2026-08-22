//! SSH 主机身份验证、终端命令与 SFTP 文件传输。
//!
//! 所有 SSH 握手均经过 `TrustedHostStore`。未知或变更后的主机密钥默认被拒绝；
//! UI 必须先把用户明确确认过的**精确 SHA-256 指纹**传回，握手回调才会接受并
//! 记录该密钥。这里绝不提供自动接受未知主机密钥的回退路径。

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use chrono::{DateTime, Utc};
use russh::{
    ChannelMsg, Disconnect,
    client::{self, Handle},
    keys::{PublicKeyBase64, PublicKeyOrCertificate},
};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::{
    CoreError, OperationApproval, RouterOperation,
    management::{ManagedCommand, ReadCommand},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KnownHost {
    pub router_id: String,
    pub host: String,
    pub port: u16,
    pub algorithm: String,
    pub fingerprint_sha256: String,
    pub verified_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrustDecision {
    FirstSeen,
    Trusted,
    Changed,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TrustedHostStore {
    records: BTreeMap<String, KnownHost>,
}

impl TrustedHostStore {
    pub fn fingerprint(public_key: &[u8]) -> String {
        let digest = Sha256::digest(public_key);
        format!("SHA256:{}", hex::encode(digest))
    }

    pub fn evaluate(
        &self,
        router_id: &str,
        host: &str,
        port: u16,
        algorithm: &str,
        public_key: &[u8],
    ) -> TrustDecision {
        let key = Self::record_key(router_id, host, port);
        let fingerprint = Self::fingerprint(public_key);
        match self.records.get(&key) {
            None => TrustDecision::FirstSeen,
            Some(record)
                if record.algorithm == algorithm && record.fingerprint_sha256 == fingerprint =>
            {
                TrustDecision::Trusted
            }
            Some(_) => TrustDecision::Changed,
        }
    }

    pub fn trust(
        &mut self,
        router_id: String,
        host: String,
        port: u16,
        algorithm: String,
        public_key: &[u8],
        verified_at: DateTime<Utc>,
    ) -> KnownHost {
        let record = KnownHost {
            fingerprint_sha256: Self::fingerprint(public_key),
            router_id,
            host,
            port,
            algorithm,
            verified_at,
        };
        self.records.insert(
            Self::record_key(&record.router_id, &record.host, record.port),
            record.clone(),
        );
        record
    }

    pub fn forget_router(&mut self, router_id: &str) {
        self.records
            .retain(|_, record| record.router_id.as_str() != router_id);
    }

    pub fn require_trusted(
        &self,
        router_id: &str,
        host: &str,
        port: u16,
        algorithm: &str,
        public_key: &[u8],
    ) -> Result<(), CoreError> {
        matches!(
            self.evaluate(router_id, host, port, algorithm, public_key),
            TrustDecision::Trusted
        )
        .then_some(())
        .ok_or(CoreError::HostKeyChanged)
    }

    fn record_key(router_id: &str, host: &str, port: u16) -> String {
        format!("{router_id}\u{0}{host}\u{0}{port}")
    }
}

/// 在呈现给用户的确认对话框中使用的 SSH 主机密钥信息。
///
/// 原始主机公钥不会离开传输层；UI 只显示算法与 SHA-256 指纹，并在确认后把
/// `fingerprint_sha256` 原样交回 `SshConnectionRequest`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostKeyChallenge {
    pub router_id: String,
    pub host: String,
    pub port: u16,
    pub algorithm: String,
    pub fingerprint_sha256: String,
    pub decision: TrustDecision,
}

pub fn inspect_host_key(
    trusted_hosts: &TrustedHostStore,
    router_id: &str,
    host: &str,
    port: u16,
    algorithm: &str,
    public_key: &[u8],
) -> HostKeyChallenge {
    HostKeyChallenge {
        router_id: router_id.to_owned(),
        host: host.to_owned(),
        port,
        algorithm: algorithm.to_owned(),
        fingerprint_sha256: TrustedHostStore::fingerprint(public_key),
        decision: trusted_hosts.evaluate(router_id, host, port, algorithm, public_key),
    }
}

/// SSH 连接所需的瞬态输入。
///
/// `password` 不实现 `Debug`、不序列化，也不应复制到日志、档案或诊断信息中。
pub struct SshConnectionRequest {
    pub router_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    /// 仅在用户已经在 UI 中检查并确认过同一指纹时填写。
    pub approved_fingerprint_sha256: Option<String>,
}

impl SshConnectionRequest {
    fn validate(&self) -> Result<(), SshTransportError> {
        if self.router_id.trim().is_empty() {
            return Err(SshTransportError::InvalidConnection(
                "路由器 ID 不能为空".to_owned(),
            ));
        }
        if self.host.trim().is_empty() {
            return Err(SshTransportError::InvalidConnection(
                "SSH 主机不能为空".to_owned(),
            ));
        }
        if self.port == 0 {
            return Err(SshTransportError::InvalidConnection(
                "SSH 端口必须介于 1 到 65535".to_owned(),
            ));
        }
        if self.username.trim().is_empty() {
            return Err(SshTransportError::InvalidConnection(
                "SSH 用户名不能为空".to_owned(),
            ));
        }
        if self.password.is_empty() {
            return Err(SshTransportError::InvalidConnection(
                "SSH 密码不能为空".to_owned(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SshCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_status: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteFileEntry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub is_symlink: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Error)]
pub enum SshTransportError {
    #[error("SSH 连接资料无效：{0}")]
    InvalidConnection(String),
    #[error("SSH 主机密钥需要用户确认：{0}@{1}:{2} {3}")]
    HostKeyUntrusted(String, String, u16, String),
    #[error("SSH 身份验证失败")]
    AuthenticationFailed,
    #[error("SSH 命令不能为空")]
    EmptyCommand,
    #[error("SFTP 路径不能为空")]
    EmptyPath,
    #[error("安全审批无效：{0}")]
    Approval(String),
    #[error("SSH/SFTP 传输错误：{0}")]
    Transport(String),
}

impl SshTransportError {
    fn from_host_key(challenge: HostKeyChallenge) -> Self {
        Self::HostKeyUntrusted(
            challenge.router_id,
            format!("{} ({})", challenge.host, challenge.algorithm),
            challenge.port,
            challenge.fingerprint_sha256,
        )
    }
}

impl From<russh::Error> for SshTransportError {
    fn from(error: russh::Error) -> Self {
        Self::Transport(error.to_string())
    }
}

/// 通过 Russh 建立的已认证 SSH 会话。
///
/// 该会话仅由 `connect` 构造，因而不可能绕过主机密钥验证或认证结果检查。
pub struct SshClient {
    router_id: String,
    session: Handle<HostKeyVerifier>,
}

impl SshClient {
    pub async fn connect(
        request: SshConnectionRequest,
        trusted_hosts: Arc<Mutex<TrustedHostStore>>,
    ) -> Result<Self, SshTransportError> {
        request.validate()?;
        let observed_challenge = Arc::new(Mutex::new(None));
        let verifier = HostKeyVerifier {
            router_id: request.router_id.clone(),
            host: request.host.clone(),
            port: request.port,
            trusted_hosts,
            approved_fingerprint_sha256: request.approved_fingerprint_sha256.clone(),
            observed_challenge: Arc::clone(&observed_challenge),
        };
        let config = client::Config {
            inactivity_timeout: Some(Duration::from_secs(20)),
            ..Default::default()
        };
        let mut session = client::connect(
            Arc::new(config),
            (request.host.as_str(), request.port),
            verifier,
        )
        .await
        .map_err(|error| {
            take_challenge(&observed_challenge)
                .map(SshTransportError::from_host_key)
                .unwrap_or(error)
        })?;
        let authentication = session
            .authenticate_password(request.username, request.password)
            .await
            .map_err(SshTransportError::from)?;
        if !authentication.success() {
            return Err(SshTransportError::AuthenticationFailed);
        }
        Ok(Self {
            router_id: request.router_id,
            session,
        })
    }

    /// 执行内置只读命令目录中的查询。调用方无法提供任意 shell 文本。
    pub async fn execute_read(
        &self,
        command: &ReadCommand,
    ) -> Result<SshCommandResult, SshTransportError> {
        let shell_command = command
            .build()
            .map_err(|error| SshTransportError::Transport(error.to_string()))?;
        self.execute_raw(&shell_command).await
    }

    /// 执行已由 `ManagedCommand::prepare` 构建的变更计划，并在下发前再次验证审批单。
    pub async fn execute_managed(
        &self,
        command: &ManagedCommand,
        approval: &OperationApproval,
    ) -> Result<SshCommandResult, SshTransportError> {
        if command.router_id() != self.router_id {
            return Err(SshTransportError::Approval(
                "管理计划不属于当前路由器".to_owned(),
            ));
        }
        command
            .validate_approval(approval)
            .map_err(|error| SshTransportError::Approval(error.to_string()))?;
        self.execute_raw(command.command()).await
    }

    /// 执行用户显式输入的终端命令。此入口始终要求“执行 SSH 终端命令”的确认。
    pub async fn execute_terminal(
        &self,
        command: &str,
        approval: &OperationApproval,
    ) -> Result<SshCommandResult, SshTransportError> {
        if approval.router_id != self.router_id {
            return Err(SshTransportError::Approval(
                "审批单不属于当前路由器".to_owned(),
            ));
        }
        if approval.operation != RouterOperation::ExecuteTerminal {
            return Err(SshTransportError::Approval(
                "终端命令需要专用审批单".to_owned(),
            ));
        }
        approval.validate().map_err(SshTransportError::Approval)?;
        self.execute_raw(command).await
    }

    async fn execute_raw(&self, command: &str) -> Result<SshCommandResult, SshTransportError> {
        if command.trim().is_empty() {
            return Err(SshTransportError::EmptyCommand);
        }
        let mut channel = self
            .session
            .channel_open_session()
            .await
            .map_err(SshTransportError::from)?;
        channel
            .exec(true, command)
            .await
            .map_err(SshTransportError::from)?;
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut exit_status = None;
        while let Some(message) = channel.wait().await {
            match message {
                ChannelMsg::Data { data } => stdout.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => stderr.extend_from_slice(&data),
                ChannelMsg::ExitStatus {
                    exit_status: status,
                } => exit_status = Some(status),
                _ => {}
            }
        }
        Ok(SshCommandResult {
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
            exit_status,
        })
    }

    pub async fn open_sftp(&self) -> Result<SftpClient, SshTransportError> {
        let channel = self
            .session
            .channel_open_session()
            .await
            .map_err(SshTransportError::from)?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(SshTransportError::from)?;
        let session = SftpSession::new(channel.into_stream())
            .await
            .map_err(|error| SshTransportError::Transport(error.to_string()))?;
        session.set_timeout(20);
        Ok(SftpClient {
            router_id: self.router_id.clone(),
            session,
        })
    }

    pub async fn disconnect(&mut self) -> Result<(), SshTransportError> {
        self.session
            .disconnect(Disconnect::ByApplication, "", "en")
            .await
            .map_err(SshTransportError::from)
    }
}

/// 已通过同一 SSH 身份验证会话开启的 SFTP 文件管理器。
pub struct SftpClient {
    router_id: String,
    session: SftpSession,
}

impl SftpClient {
    pub async fn list_directory(
        &self,
        path: impl Into<String>,
    ) -> Result<Vec<RemoteFileEntry>, SshTransportError> {
        let path = require_path(path.into())?;
        let entries = self
            .session
            .read_dir(path)
            .await
            .map_err(|error| SshTransportError::Transport(error.to_string()))?;
        Ok(entries
            .map(|entry| {
                let metadata = entry.metadata();
                let file_type = entry.file_type();
                RemoteFileEntry {
                    path: entry.path(),
                    name: entry.file_name(),
                    is_directory: file_type.is_dir(),
                    is_symlink: file_type.is_symlink(),
                    size_bytes: metadata.len(),
                }
            })
            .collect())
    }

    pub async fn read_file(&self, path: impl Into<String>) -> Result<Vec<u8>, SshTransportError> {
        let path = require_path(path.into())?;
        self.session
            .read(path)
            .await
            .map_err(|error| SshTransportError::Transport(error.to_string()))
    }

    pub async fn write_file(
        &self,
        path: impl Into<String>,
        contents: &[u8],
        approval: &OperationApproval,
    ) -> Result<(), SshTransportError> {
        require_approval(&self.router_id, RouterOperation::WriteFile, approval)?;
        let path = require_path(path.into())?;
        self.session
            .write(path, contents)
            .await
            .map_err(|error| SshTransportError::Transport(error.to_string()))
    }

    pub async fn remove_file(
        &self,
        path: impl Into<String>,
        approval: &OperationApproval,
    ) -> Result<(), SshTransportError> {
        require_approval(&self.router_id, RouterOperation::DeleteFile, approval)?;
        let path = require_path(path.into())?;
        self.session
            .remove_file(path)
            .await
            .map_err(|error| SshTransportError::Transport(error.to_string()))
    }

    pub async fn rename(
        &self,
        old_path: impl Into<String>,
        new_path: impl Into<String>,
        approval: &OperationApproval,
    ) -> Result<(), SshTransportError> {
        require_approval(&self.router_id, RouterOperation::RenameFile, approval)?;
        let old_path = require_path(old_path.into())?;
        let new_path = require_path(new_path.into())?;
        self.session
            .rename(old_path, new_path)
            .await
            .map_err(|error| SshTransportError::Transport(error.to_string()))
    }
}

struct HostKeyVerifier {
    router_id: String,
    host: String,
    port: u16,
    trusted_hosts: Arc<Mutex<TrustedHostStore>>,
    approved_fingerprint_sha256: Option<String>,
    observed_challenge: Arc<Mutex<Option<HostKeyChallenge>>>,
}

impl client::Handler for HostKeyVerifier {
    type Error = SshTransportError;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let public_key = server_public_key.public_key();
        let algorithm = public_key.algorithm().as_str().to_owned();
        let encoded_key = public_key.public_key_bytes();
        let challenge = {
            let store = self
                .trusted_hosts
                .lock()
                .map_err(|_| SshTransportError::Transport("SSH 主机信任存储不可用".to_owned()))?;
            inspect_host_key(
                &store,
                &self.router_id,
                &self.host,
                self.port,
                &algorithm,
                &encoded_key,
            )
        };
        if challenge.decision == TrustDecision::Trusted {
            return Ok(true);
        }
        let explicitly_approved = self
            .approved_fingerprint_sha256
            .as_deref()
            .is_some_and(|fingerprint| fingerprint == challenge.fingerprint_sha256);
        if explicitly_approved {
            let mut store = self
                .trusted_hosts
                .lock()
                .map_err(|_| SshTransportError::Transport("SSH 主机信任存储不可用".to_owned()))?;
            store.trust(
                self.router_id.clone(),
                self.host.clone(),
                self.port,
                algorithm,
                &encoded_key,
                Utc::now(),
            );
            return Ok(true);
        }
        let mut observed = self
            .observed_challenge
            .lock()
            .map_err(|_| SshTransportError::Transport("SSH 主机密钥确认状态不可用".to_owned()))?;
        *observed = Some(challenge);
        Ok(false)
    }
}

fn take_challenge(
    observed_challenge: &Arc<Mutex<Option<HostKeyChallenge>>>,
) -> Option<HostKeyChallenge> {
    observed_challenge.lock().ok()?.take()
}

fn require_path(path: String) -> Result<String, SshTransportError> {
    (!path.trim().is_empty())
        .then_some(path)
        .ok_or(SshTransportError::EmptyPath)
}

fn require_approval(
    router_id: &str,
    expected_operation: RouterOperation,
    approval: &OperationApproval,
) -> Result<(), SshTransportError> {
    if approval.router_id != router_id {
        return Err(SshTransportError::Approval(
            "审批单不属于当前路由器".to_owned(),
        ));
    }
    if approval.operation != expected_operation {
        return Err(SshTransportError::Approval(format!(
            "此操作需要“{}”审批单",
            expected_operation.label()
        )));
    }
    approval.validate().map_err(SshTransportError::Approval)
}
