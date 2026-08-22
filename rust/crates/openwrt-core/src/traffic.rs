use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::{CoreError, InterfaceStatus};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrafficSample {
    pub collected_at: DateTime<Utc>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrafficRate {
    pub collected_at: DateTime<Utc>,
    pub sample_seconds: f64,
    pub rx_bytes_per_second: f64,
    pub tx_bytes_per_second: f64,
}

pub fn calculate_rate(
    previous: &TrafficSample,
    current: &TrafficSample,
) -> Result<TrafficRate, CoreError> {
    let elapsed = current
        .collected_at
        .signed_duration_since(previous.collected_at);
    if elapsed <= Duration::zero() {
        return Err(CoreError::NonMonotonicSample);
    }
    let seconds = elapsed.num_milliseconds() as f64 / 1_000.0;
    Ok(TrafficRate {
        collected_at: current.collected_at,
        sample_seconds: seconds,
        // OpenWrt 接口重连、设备重启或 32 位计数器回绕时计数可能变小。将负增量
        // 视为零比生成虚假的超高流量更安全，下一轮稳定样本会恢复正常速率。
        rx_bytes_per_second: current.rx_bytes.saturating_sub(previous.rx_bytes) as f64 / seconds,
        tx_bytes_per_second: current.tx_bytes.saturating_sub(previous.tx_bytes) as f64 / seconds,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrafficSeries {
    capacity: usize,
    samples: Vec<TrafficRate>,
}

impl TrafficSeries {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            samples: Vec::new(),
        }
    }

    pub fn push(&mut self, rate: TrafficRate) {
        self.samples.push(rate);
        let overflow = self.samples.len().saturating_sub(self.capacity);
        if overflow > 0 {
            self.samples.drain(0..overflow);
        }
    }

    pub fn values(&self) -> &[TrafficRate] {
        &self.samples
    }
}

/// 单个 OpenWrt 接口的当前实时速率快照。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InterfaceTrafficRate {
    pub interface_id: String,
    pub interface_name: String,
    pub rate: TrafficRate,
}

/// 为 UI 轮询建立的有界接口流量采样器。
///
/// 每次调用 `ingest` 只更新该采样器的局部状态，调用方可将返回的轻量速率列表
/// 传给独立的流量卡片，而无需刷新整个路由器状态首页。
#[derive(Debug, Clone)]
pub struct InterfaceTrafficTracker {
    capacity: usize,
    previous: BTreeMap<String, TrafficSample>,
    history: BTreeMap<String, TrafficSeries>,
}

impl InterfaceTrafficTracker {
    pub fn new(history_capacity: usize) -> Self {
        Self {
            capacity: history_capacity.max(1),
            previous: BTreeMap::new(),
            history: BTreeMap::new(),
        }
    }

    pub fn ingest(
        &mut self,
        interfaces: &[InterfaceStatus],
        collected_at: DateTime<Utc>,
    ) -> Vec<InterfaceTrafficRate> {
        let visible_ids: BTreeSet<_> = interfaces
            .iter()
            .filter(|interface| interface.up)
            .map(|interface| interface.id.as_str())
            .collect();
        self.previous
            .retain(|interface_id, _| visible_ids.contains(interface_id.as_str()));
        self.history
            .retain(|interface_id, _| visible_ids.contains(interface_id.as_str()));

        interfaces
            .iter()
            .filter(|interface| interface.up)
            .filter_map(|interface| {
                let sample = TrafficSample {
                    collected_at,
                    rx_bytes: interface.rx_bytes,
                    tx_bytes: interface.tx_bytes,
                };
                // 无论是否已有上一轮样本，都必须先记录当前计数器；否则首次采样
                // 会永久缺少基线，第二次轮询也无法计算速率。
                let previous = self.previous.insert(interface.id.clone(), sample.clone());
                let rate = previous.and_then(|item| calculate_rate(&item, &sample).ok())?;
                self.history
                    .entry(interface.id.clone())
                    .or_insert_with(|| TrafficSeries::new(self.capacity))
                    .push(rate.clone());
                Some(InterfaceTrafficRate {
                    interface_id: interface.id.clone(),
                    interface_name: interface.name.clone(),
                    rate,
                })
            })
            .collect()
    }

    /// 注册初始样本；首次采样不会凭空显示速率。
    pub fn prime(&mut self, interfaces: &[InterfaceStatus], collected_at: DateTime<Utc>) {
        for interface in interfaces.iter().filter(|interface| interface.up) {
            self.previous.insert(
                interface.id.clone(),
                TrafficSample {
                    collected_at,
                    rx_bytes: interface.rx_bytes,
                    tx_bytes: interface.tx_bytes,
                },
            );
        }
    }

    pub fn history(&self, interface_id: &str) -> Option<&TrafficSeries> {
        self.history.get(interface_id)
    }
}
