use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::CoreError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigSnapshot {
    pub id: String,
    pub router_id: String,
    pub created_at: DateTime<Utc>,
    pub label: String,
    pub firmware: Option<String>,
    pub files: Vec<SnapshotFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffKind {
    Added,
    Removed,
    Changed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigDiff {
    pub path: String,
    pub kind: DiffKind,
    pub before: Option<String>,
    pub after: Option<String>,
}

impl ConfigSnapshot {
    pub fn diff_against(&self, current: &Self) -> Result<Vec<ConfigDiff>, CoreError> {
        if self.router_id != current.router_id {
            return Err(CoreError::SnapshotRouterMismatch);
        }

        let mut diffs = Vec::new();
        for expected in &self.files {
            match current
                .files
                .iter()
                .find(|actual| actual.path == expected.path)
            {
                Some(actual) if actual.content != expected.content => diffs.push(ConfigDiff {
                    path: expected.path.clone(),
                    kind: DiffKind::Changed,
                    before: Some(expected.content.clone()),
                    after: Some(actual.content.clone()),
                }),
                None => diffs.push(ConfigDiff {
                    path: expected.path.clone(),
                    kind: DiffKind::Removed,
                    before: Some(expected.content.clone()),
                    after: None,
                }),
                _ => {}
            }
        }
        for actual in &current.files {
            if !self
                .files
                .iter()
                .any(|expected| expected.path == actual.path)
            {
                diffs.push(ConfigDiff {
                    path: actual.path.clone(),
                    kind: DiffKind::Added,
                    before: None,
                    after: Some(actual.content.clone()),
                });
            }
        }
        diffs.sort_by(|left, right| left.path.cmp(&right.path));
        Ok(diffs)
    }
}
