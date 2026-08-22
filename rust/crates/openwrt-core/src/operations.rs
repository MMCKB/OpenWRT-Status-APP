//! 路由器管理操作的安全策略。
//!
//! UI 和传输层只能在本模块给出的确认规则满足后执行写操作，避免网络、固件、
//! 防火墙或文件变更因一次误触而直接下发到设备。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouterOperation {
    ReadStatus,
    RunDiagnostics,
    ExecuteTerminal,
    SendWakeOnLan,
    CreateConfigSnapshot,
    RestoreConfigSnapshot,
    RestartService,
    RebootRouter,
    ApplyNetwork,
    ApplyWireless,
    ApplyFirewall,
    InstallPackage,
    RemovePackage,
    UploadFile,
    DeleteFile,
    RenameFile,
    WriteFile,
    UpgradeFirmware,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ConfirmationLevel {
    None,
    SingleConfirm,
    TypedConfirm,
}

impl RouterOperation {
    pub const fn confirmation_level(self) -> ConfirmationLevel {
        match self {
            Self::ReadStatus | Self::RunDiagnostics => ConfirmationLevel::None,
            Self::ExecuteTerminal
            | Self::SendWakeOnLan
            | Self::CreateConfigSnapshot
            | Self::RestartService
            | Self::UploadFile
            | Self::RenameFile => ConfirmationLevel::SingleConfirm,
            Self::RestoreConfigSnapshot
            | Self::RebootRouter
            | Self::ApplyNetwork
            | Self::ApplyWireless
            | Self::ApplyFirewall
            | Self::InstallPackage
            | Self::RemovePackage
            | Self::DeleteFile
            | Self::WriteFile
            | Self::UpgradeFirmware => ConfirmationLevel::TypedConfirm,
        }
    }

    pub const fn requires_snapshot(self) -> bool {
        matches!(
            self,
            Self::ApplyNetwork
                | Self::ApplyWireless
                | Self::ApplyFirewall
                | Self::UpgradeFirmware
                | Self::RestoreConfigSnapshot
        )
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::ReadStatus => "读取状态",
            Self::RunDiagnostics => "执行诊断",
            Self::ExecuteTerminal => "执行 SSH 终端命令",
            Self::SendWakeOnLan => "发送网络唤醒",
            Self::CreateConfigSnapshot => "创建配置快照",
            Self::RestoreConfigSnapshot => "恢复配置快照",
            Self::RestartService => "重启服务",
            Self::RebootRouter => "重启路由器",
            Self::ApplyNetwork => "应用网络配置",
            Self::ApplyWireless => "应用无线配置",
            Self::ApplyFirewall => "应用防火墙配置",
            Self::InstallPackage => "安装软件包",
            Self::RemovePackage => "卸载软件包",
            Self::UploadFile => "上传文件",
            Self::DeleteFile => "删除文件",
            Self::RenameFile => "重命名文件",
            Self::WriteFile => "写入文件",
            Self::UpgradeFirmware => "升级固件",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationApproval {
    pub operation: RouterOperation,
    pub router_id: String,
    pub snapshot_id: Option<String>,
    pub typed_phrase: Option<String>,
}

impl OperationApproval {
    pub fn validate(&self) -> Result<(), String> {
        if self.operation.requires_snapshot()
            && self.snapshot_id.as_deref().unwrap_or_default().is_empty()
        {
            return Err(format!(
                "{} 前必须选择已验证的配置快照。",
                self.operation.label()
            ));
        }
        if self.operation.confirmation_level() == ConfirmationLevel::TypedConfirm {
            let expected = self.operation.label();
            if self.typed_phrase.as_deref() != Some(expected) {
                return Err(format!("请准确输入“{expected}”以确认此操作。"));
            }
        }
        Ok(())
    }
}
