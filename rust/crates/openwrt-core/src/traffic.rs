use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::CoreError;

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
