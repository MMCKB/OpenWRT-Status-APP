//! 路由器档案的本地持久化。
//!
//! 此模块只保存非机密连接元数据（名称、LuCI 地址、用户名和 SSH 端口）。
//! 密码、私钥及令牌绝不能写入该 JSON 文件，必须交由 Android Keystore 支撑的
//! 平台安全存储适配层处理。

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{CoreError, RouterProfile};

const STORAGE_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct ProfileDocument {
    version: u8,
    profiles: Vec<RouterProfile>,
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

    pub fn load(&self) -> Result<Vec<RouterProfile>, CoreError> {
        if !self.path.exists() {
            return Ok(Vec::new());
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
        validate_profiles(&document.profiles)?;
        Ok(document.profiles)
    }

    pub fn save(&self, profiles: &[RouterProfile]) -> Result<(), CoreError> {
        validate_profiles(profiles)?;
        let document = ProfileDocument {
            version: STORAGE_VERSION,
            profiles: profiles.to_vec(),
        };
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

    pub fn upsert(&self, profile: RouterProfile) -> Result<Vec<RouterProfile>, CoreError> {
        let mut profiles = self.load()?;
        if let Some(index) = profiles.iter().position(|item| item.id == profile.id) {
            profiles[index] = profile;
        } else {
            profiles.push(profile);
        }
        self.save(&profiles)?;
        Ok(profiles)
    }

    pub fn remove(&self, router_id: &str) -> Result<Vec<RouterProfile>, CoreError> {
        let mut profiles = self.load()?;
        profiles.retain(|profile| profile.id != router_id);
        self.save(&profiles)?;
        Ok(profiles)
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
