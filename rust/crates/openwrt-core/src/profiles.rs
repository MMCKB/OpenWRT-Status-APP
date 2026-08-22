//! 路由器档案与 SSH 主机信任的本地持久化。
//!
//! 此模块只保存非机密连接元数据（名称、LuCI 地址、用户名、SSH 端口）以及用户
//! 已明确确认过的 SSH 主机公钥指纹。密码、私钥及令牌绝不能写入该 JSON 文件，
//! 必须交由 Android Keystore 支撑的平台安全存储适配层处理。

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    AuditEntry, AuditLog, AuditOutcome, CoreError, RouterOperation, RouterProfile, TrustedHostStore,
};

const STORAGE_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

/// 不涉及凭据的界面与轮询偏好。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppPreferences {
    pub theme: ThemePreference,
    /// 仅允许 2–60 秒，避免将路由器置于高频轮询压力之下。
    pub traffic_poll_seconds: u8,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme: ThemePreference::System,
            traffic_poll_seconds: 2,
        }
    }
}

impl AppPreferences {
    pub fn validate(&self) -> Result<(), CoreError> {
        if !(2..=60).contains(&self.traffic_poll_seconds) {
            return Err(CoreError::InvalidPreferences(
                "流量刷新间隔必须在 2 到 60 秒之间".to_owned(),
            ));
        }
        Ok(())
    }
}

/// Android 应用专属目录中持久化的非机密状态。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RouterAppState {
    pub profiles: Vec<RouterProfile>,
    #[serde(default)]
    pub trusted_hosts: TrustedHostStore,
    #[serde(default)]
    pub audit_log: AuditLog,
    #[serde(default)]
    pub preferences: AppPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProfileDocument {
    version: u8,
    profiles: Vec<RouterProfile>,
    /// 对已有 v1 JSON 文件缺失该字段时保持兼容，默认为空信任仓库。
    #[serde(default)]
    trusted_hosts: TrustedHostStore,
    #[serde(default)]
    audit_log: AuditLog,
    #[serde(default)]
    preferences: AppPreferences,
}

impl From<ProfileDocument> for RouterAppState {
    fn from(document: ProfileDocument) -> Self {
        Self {
            profiles: document.profiles,
            trusted_hosts: document.trusted_hosts,
            audit_log: document.audit_log,
            preferences: document.preferences,
        }
    }
}

impl From<RouterAppState> for ProfileDocument {
    fn from(state: RouterAppState) -> Self {
        Self {
            version: STORAGE_VERSION,
            profiles: state.profiles,
            trusted_hosts: state.trusted_hosts,
            audit_log: state.audit_log,
            preferences: state.preferences,
        }
    }
}

/// 基于单个 JSON 文档的路由器档案仓库。
///
/// 它适用于 Android 的应用专属目录；调用方负责选择该目录，而不是把数据写入
/// 共用外部存储。写入先落到同目录临时文件，再通过重命名替换旧版本，从而避免
/// 正常中断时留下半截 JSON。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RouterProfileStore {
    path: PathBuf,
}

impl RouterProfileStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load_state(&self) -> Result<RouterAppState, CoreError> {
        if !self.path.exists() {
            return Ok(RouterAppState::default());
        }
        let bytes =
            fs::read(&self.path).map_err(|error| CoreError::Persistence(error.to_string()))?;
        let document: ProfileDocument = serde_json::from_slice(&bytes)
            .map_err(|error| CoreError::Persistence(error.to_string()))?;
        if document.version != STORAGE_VERSION {
            return Err(CoreError::Persistence(format!(
                "不支持的路由器档案版本：{}",
                document.version
            )));
        }
        let state = RouterAppState::from(document);
        validate_profiles(&state.profiles)?;
        Ok(state)
    }

    pub fn load(&self) -> Result<Vec<RouterProfile>, CoreError> {
        Ok(self.load_state()?.profiles)
    }

    pub fn save_state(&self, state: &RouterAppState) -> Result<(), CoreError> {
        validate_profiles(&state.profiles)?;
        state.preferences.validate()?;
        let document = ProfileDocument::from(state.clone());
        let bytes = serde_json::to_vec_pretty(&document)
            .map_err(|error| CoreError::Persistence(error.to_string()))?;
        let parent = self
            .path
            .parent()
            .ok_or_else(|| CoreError::Persistence("路由器档案路径必须包含父目录".to_owned()))?;
        fs::create_dir_all(parent).map_err(|error| CoreError::Persistence(error.to_string()))?;

        let temporary_path = self.path.with_extension("tmp");
        fs::write(&temporary_path, bytes)
            .map_err(|error| CoreError::Persistence(error.to_string()))?;
        fs::rename(&temporary_path, &self.path).map_err(|error| {
            let _ = fs::remove_file(&temporary_path);
            CoreError::Persistence(error.to_string())
        })
    }

    pub fn save(&self, profiles: &[RouterProfile]) -> Result<(), CoreError> {
        let mut state = self.load_state()?;
        state.profiles = profiles.to_vec();
        self.save_state(&state)
    }

    pub fn upsert(&self, profile: RouterProfile) -> Result<Vec<RouterProfile>, CoreError> {
        let mut state = self.load_state()?;
        if let Some(index) = state.profiles.iter().position(|item| item.id == profile.id) {
            state.profiles[index] = profile;
        } else {
            state.profiles.push(profile);
        }
        self.save_state(&state)?;
        Ok(state.profiles)
    }

    pub fn remove(&self, router_id: &str) -> Result<Vec<RouterProfile>, CoreError> {
        let mut state = self.load_state()?;
        state.profiles.retain(|profile| profile.id != router_id);
        state.trusted_hosts.forget_router(router_id);
        self.save_state(&state)?;
        Ok(state.profiles)
    }

    pub fn save_preferences(&self, preferences: AppPreferences) -> Result<(), CoreError> {
        let mut state = self.load_state()?;
        state.preferences = preferences;
        self.save_state(&state)
    }

    pub fn save_trusted_hosts(&self, trusted_hosts: TrustedHostStore) -> Result<(), CoreError> {
        let mut state = self.load_state()?;
        state.trusted_hosts = trusted_hosts;
        self.save_state(&state)
    }

    /// 记录不会暴露命令正文、密码或私钥的操作摘要，并与档案状态原子写入。
    pub fn record_audit(
        &self,
        router_id: impl Into<String>,
        operation: RouterOperation,
        outcome: AuditOutcome,
        recorded_at: DateTime<Utc>,
        summary: impl Into<String>,
    ) -> Result<AuditEntry, CoreError> {
        let mut state = self.load_state()?;
        let entry = state
            .audit_log
            .record(router_id, operation, outcome, recorded_at, summary)
            .map_err(|error| CoreError::Audit(error.to_string()))?
            .clone();
        self.save_state(&state)?;
        Ok(entry)
    }
}

fn validate_profiles(profiles: &[RouterProfile]) -> Result<(), CoreError> {
    let mut seen_ids = HashSet::with_capacity(profiles.len());
    for profile in profiles {
        if profile.id.trim().is_empty() {
            return Err(CoreError::InvalidRouterProfile(
                "路由器 ID 不能为空".to_owned(),
            ));
        }
        if profile.name.trim().is_empty() {
            return Err(CoreError::InvalidRouterProfile(
                "路由器名称不能为空".to_owned(),
            ));
        }
        if profile.username.trim().is_empty() {
            return Err(CoreError::InvalidRouterProfile("用户名不能为空".to_owned()));
        }
        if profile.ssh_port == 0 {
            return Err(CoreError::InvalidRouterProfile(
                "SSH 端口必须介于 1 到 65535".to_owned(),
            ));
        }
        if !seen_ids.insert(profile.id.as_str()) {
            return Err(CoreError::InvalidRouterProfile(format!(
                "路由器 ID 重复：{}",
                profile.id
            )));
        }
        profile.validate()?;
    }
    Ok(())
}
