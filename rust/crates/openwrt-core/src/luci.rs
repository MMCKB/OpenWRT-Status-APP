//! LuCI / ubus JSON-RPC 客户端。
//!
//! 该实现保持与现有 TypeScript 客户端一致的协议：先调用 `session.login`
//! 获得 `ubus_rpc_session`，再调用 system、network 和 uci 对象。

use std::sync::LazyLock;

use chrono::Utc;
use reqwest::Client;
use serde_json::{Map, Value, json};
use url::Url;

use crate::{CoreError, InterfaceStatus, RouterStatus, SystemStatus};

const ANONYMOUS_SESSION: &str = "00000000000000000000000000000000";

#[derive(Clone, Debug)]
pub struct LuCiClient {
    endpoint: Url,
    username: String,
    password: String,
    http: Client,
}

impl LuCiClient {
    pub fn new(
        raw_endpoint: &str,
        username: impl Into<String>,
        password: impl Into<String>,
    ) -> Result<Self, CoreError> {
        let endpoint = normalize_router_endpoint(raw_endpoint)?;
        let http = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|error| CoreError::Transport(error.to_string()))?;
        Ok(Self {
            endpoint,
            username: username.into(),
            password: password.into(),
            http,
        })
    }

    pub fn endpoint(&self) -> &Url {
        &self.endpoint
    }

    pub async fn login(&self) -> Result<String, CoreError> {
        let payload = self
            .call_raw(
                ANONYMOUS_SESSION,
                "session",
                "login",
                json!({ "username": self.username, "password": self.password }),
            )
            .await?;
        payload
            .get("ubus_rpc_session")
            .and_then(Value::as_str)
            .filter(|token| !token.is_empty())
            .map(ToOwned::to_owned)
            .ok_or(CoreError::InvalidResponse(
                "LuCI 未返回有效会话令牌".to_owned(),
            ))
    }

    pub async fn fetch_status(
        &self,
        router_id: impl Into<String>,
    ) -> Result<RouterStatus, CoreError> {
        let session = self.login().await?;
        let board = self
            .call_raw(&session, "system", "board", json!({}))
            .await?;
        let info = self.call_raw(&session, "system", "info", json!({})).await?;
        let interfaces = self
            .call_raw(&session, "network.interface", "dump", json!({}))
            .await
            .unwrap_or(Value::Null);
        let devices = self
            .call_raw(&session, "network.device", "status", json!({}))
            .await
            .unwrap_or(Value::Null);

        let mut warnings = Vec::new();
        if interfaces.is_null() {
            warnings.push("网络接口状态暂不可用。".to_owned());
        }
        if devices.is_null() {
            warnings.push("设备流量计数暂不可用。".to_owned());
        }

        Ok(RouterStatus {
            router_id: router_id.into(),
            online: true,
            fetched_at: Utc::now(),
            system: map_system_status(&board, &info),
            interfaces: map_interfaces(&interfaces, &devices),
            warnings,
            error: None,
        })
    }

    pub async fn fetch_interface_counters(&self) -> Result<Vec<InterfaceStatus>, CoreError> {
        let session = self.login().await?;
        let interfaces = self
            .call_raw(&session, "network.interface", "dump", json!({}))
            .await?;
        let devices = self
            .call_raw(&session, "network.device", "status", json!({}))
            .await
            .unwrap_or(Value::Null);
        Ok(map_interfaces(&interfaces, &devices))
    }

    async fn call_raw(
        &self,
        session: &str,
        object: &str,
        method: &str,
        params: Value,
    ) -> Result<Value, CoreError> {
        let response = self
            .http
            .post(self.endpoint.clone())
            .json(&json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "call",
                "params": [session, object, method, params],
            }))
            .send()
            .await
            .map_err(|error| CoreError::Transport(error.to_string()))?;
        if !response.status().is_success() {
            return Err(CoreError::Http(response.status().as_u16()));
        }
        let body: Value = response
            .json()
            .await
            .map_err(|error| CoreError::InvalidResponse(error.to_string()))?;
        let result = body
            .get("result")
            .and_then(Value::as_array)
            .ok_or_else(|| CoreError::InvalidResponse("LuCI 响应中缺少 result 数组".to_owned()))?;
        if result.first().and_then(Value::as_i64) != Some(0) {
            return Err(CoreError::Rpc(format!("{object}.{method} 被路由器拒绝")));
        }
        Ok(result.get(1).cloned().unwrap_or(Value::Object(Map::new())))
    }
}

pub fn normalize_router_endpoint(raw_endpoint: &str) -> Result<Url, CoreError> {
    let trimmed = raw_endpoint.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(CoreError::InvalidRouterUrl(raw_endpoint.to_owned()));
    }
    let candidate = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_owned()
    } else {
        format!("http://{trimmed}")
    };
    let mut url =
        Url::parse(&candidate).map_err(|_| CoreError::InvalidRouterUrl(raw_endpoint.to_owned()))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(CoreError::InvalidRouterUrl(raw_endpoint.to_owned()));
    }
    let path = url.path().trim_end_matches('/').to_owned();
    let normalized_path = if path.is_empty() || path == "/" {
        "/ubus".to_owned()
    } else if path.ends_with("/ubus") {
        path
    } else {
        format!("{path}/ubus")
    };
    url.set_path(&normalized_path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn object(value: &Value) -> &Map<String, Value> {
    value.as_object().unwrap_or(&EMPTY_OBJECT)
}

static EMPTY_OBJECT: LazyLock<Map<String, Value>> = LazyLock::new(Map::new);

fn number(value: Option<&Value>) -> Option<u64> {
    value.and_then(|candidate| {
        candidate
            .as_u64()
            .or_else(|| candidate.as_str()?.parse().ok())
    })
}

fn text(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .filter(|value| !value.trim().is_empty())
}

fn map_system_status(board: &Value, info: &Value) -> SystemStatus {
    let board = object(board);
    let info = object(info);
    let memory = info.get("memory").map(object).unwrap_or(&EMPTY_OBJECT);
    let release = board.get("release").map(object).unwrap_or(&EMPTY_OBJECT);
    let load = info.get("load").and_then(Value::as_array);
    SystemStatus {
        hostname: text(board.get("hostname")),
        model: text(board.get("model")).or_else(|| text(board.get("system"))),
        firmware: text(release.get("description")).or_else(|| text(board.get("release"))),
        uptime_seconds: number(info.get("uptime")),
        load_1: load
            .and_then(|values| values.first())
            .and_then(Value::as_f64)
            .map(|value| {
                if value > 100.0 {
                    value as f32 / 65_535.0
                } else {
                    value as f32
                }
            }),
        load_5: load
            .and_then(|values| values.get(1))
            .and_then(Value::as_f64)
            .map(|value| {
                if value > 100.0 {
                    value as f32 / 65_535.0
                } else {
                    value as f32
                }
            }),
        load_15: load
            .and_then(|values| values.get(2))
            .and_then(Value::as_f64)
            .map(|value| {
                if value > 100.0 {
                    value as f32 / 65_535.0
                } else {
                    value as f32
                }
            }),
        memory_total_bytes: number(memory.get("total")),
        memory_available_bytes: ["free", "buffered", "cached"]
            .iter()
            .filter_map(|field| number(memory.get(*field)))
            .reduce(u64::saturating_add),
        cpu_temperature_celsius: None,
        disk_total_bytes: None,
        disk_available_bytes: None,
    }
}

fn map_interfaces(interfaces: &Value, devices: &Value) -> Vec<InterfaceStatus> {
    let interface_values = interfaces
        .get("interface")
        .or_else(|| interfaces.get("interfaces"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let device_values = devices
        .get("devices")
        .or_else(|| devices.get("device"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    interface_values
        .into_iter()
        .enumerate()
        .map(|(index, item)| {
            let entry = object(&item);
            let device_name = text(entry.get("l3_device"))
                .or_else(|| text(entry.get("device")))
                .unwrap_or_else(|| "未报告".to_owned());
            let statistics = entry
                .get("statistics")
                .or_else(|| entry.get("stats"))
                .map(object)
                .unwrap_or(&EMPTY_OBJECT);
            let device_stats = device_values
                .get(&device_name)
                .and_then(|device| device.get("statistics").or_else(|| device.get("stats")))
                .map(object)
                .unwrap_or(&EMPTY_OBJECT);
            InterfaceStatus {
                id: text(entry.get("interface"))
                    .or_else(|| text(entry.get("name")))
                    .unwrap_or_else(|| format!("interface-{index}")),
                name: text(entry.get("interface"))
                    .or_else(|| text(entry.get("name")))
                    .unwrap_or_else(|| format!("接口 {}", index + 1)),
                device: Some(device_name),
                up: entry.get("up").and_then(Value::as_bool).unwrap_or(false),
                ipv4: string_addresses(entry.get("ipv4-address"))
                    .or_else(|| string_addresses(entry.get("ipv4")))
                    .unwrap_or_default(),
                ipv6: string_addresses(entry.get("ipv6-address"))
                    .or_else(|| string_addresses(entry.get("ipv6")))
                    .unwrap_or_default(),
                rx_bytes: number(statistics.get("rx_bytes"))
                    .or_else(|| number(device_stats.get("rx_bytes")))
                    .unwrap_or(0),
                tx_bytes: number(statistics.get("tx_bytes"))
                    .or_else(|| number(device_stats.get("tx_bytes")))
                    .unwrap_or(0),
            }
        })
        .collect()
}

fn string_addresses(value: Option<&Value>) -> Option<Vec<String>> {
    value.and_then(Value::as_array).map(|values| {
        values
            .iter()
            .filter_map(|entry| {
                entry.as_str().map(ToOwned::to_owned).or_else(|| {
                    entry
                        .get("address")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                })
            })
            .collect()
    })
}
