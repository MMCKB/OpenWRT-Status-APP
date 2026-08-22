use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::CoreError;

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

#[derive(Debug, Default, Clone)]
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
