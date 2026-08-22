use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::CoreError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouterProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub username: String,
    pub ssh_port: u16,
}

impl RouterProfile {
    pub fn validate(&self) -> Result<(), CoreError> {
        let url = Url::parse(&self.base_url)
            .map_err(|_| CoreError::InvalidRouterUrl(self.base_url.clone()))?;
        if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
            return Err(CoreError::InvalidRouterUrl(self.base_url.clone()));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SystemStatus {
    pub hostname: Option<String>,
    pub model: Option<String>,
    pub firmware: Option<String>,
    pub uptime_seconds: Option<u64>,
    pub load_1: Option<f32>,
    pub load_5: Option<f32>,
    pub load_15: Option<f32>,
    pub memory_total_bytes: Option<u64>,
    pub memory_available_bytes: Option<u64>,
    pub cpu_temperature_celsius: Option<f32>,
    pub disk_total_bytes: Option<u64>,
    pub disk_available_bytes: Option<u64>,
}

impl SystemStatus {
    pub fn memory_used_ratio(&self) -> Option<f32> {
        let total = self.memory_total_bytes?;
        let available = self.memory_available_bytes?;
        (total > 0).then(|| (total.saturating_sub(available) as f32 / total as f32).clamp(0.0, 1.0))
    }

    pub fn disk_used_ratio(&self) -> Option<f32> {
        let total = self.disk_total_bytes?;
        let available = self.disk_available_bytes?;
        (total > 0).then(|| (total.saturating_sub(available) as f32 / total as f32).clamp(0.0, 1.0))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InterfaceStatus {
    pub id: String,
    pub name: String,
    pub device: Option<String>,
    pub up: bool,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouterStatus {
    pub router_id: String,
    pub online: bool,
    pub fetched_at: DateTime<Utc>,
    pub system: SystemStatus,
    pub interfaces: Vec<InterfaceStatus>,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}
