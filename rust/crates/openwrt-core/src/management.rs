//! OpenWrt 管理命令目录与安全执行计划。
//!
//! 该模块把应用可操作的路由器功能映射为**受限命令模板**，而不是接受任意 shell
//! 字符串。所有写操作在构建计划时即绑定 `RouterOperation`，并在执行前再次验证
//! `OperationApproval`。这样 UI、批量操作和未来自动化都不会绕开同一套安全门禁。

use serde::{Deserialize, Serialize};

use crate::{OperationApproval, RouterOperation};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ServiceAction {
    Start,
    Stop,
    Restart,
}

impl ServiceAction {
    const fn as_command(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogCategory {
    System,
    Kernel,
    Dns,
    Dial,
    Firewall,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DockerAction {
    Start,
    Stop,
    Restart,
    Remove,
}

impl DockerAction {
    const fn as_command(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
            Self::Remove => "rm -f",
        }
    }

    const fn operation(self) -> RouterOperation {
        match self {
            Self::Remove => RouterOperation::DeleteFile,
            Self::Start | Self::Stop | Self::Restart => RouterOperation::RestartService,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConfigurationArea {
    Network,
    Wireless,
    Firewall,
    Dhcp,
    Service,
}

impl ConfigurationArea {
    const fn operation(self) -> RouterOperation {
        match self {
            Self::Network | Self::Dhcp => RouterOperation::ApplyNetwork,
            Self::Wireless => RouterOperation::ApplyWireless,
            Self::Firewall => RouterOperation::ApplyFirewall,
            Self::Service => RouterOperation::RestartService,
        }
    }

    const fn reload_command(self) -> &'static str {
        match self {
            Self::Network | Self::Dhcp => "/etc/init.d/network reload",
            Self::Wireless => "wifi reload",
            Self::Firewall => "/etc/init.d/firewall reload",
            Self::Service => "true",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadCommand {
    SystemHealth,
    ServiceSnapshot,
    DockerSnapshot,
    WirelessSnapshot,
    DhcpLeases,
    FirewallSnapshot,
    PackageList {
        query: Option<String>,
    },
    Logs {
        category: LogCategory,
        limit: u16,
        filter: Option<String>,
    },
    ConfigurationFile {
        path: String,
    },
    DiskSpeedBenchmark,
    NatDetection,
}

impl ReadCommand {
    /// 构建只读命令。该函数校验所有用户提供的片段，并在需要时做 POSIX shell 引号。
    pub fn build(&self) -> Result<String, ManagementError> {
        match self {
            Self::SystemHealth => Ok("printf '__DISKS__\\n'; df -k 2>/dev/null | awk 'NR>1 && ($6==\"/overlay\" || $6==\"/\") { printf \"DISK|%s|%s|%s|%s|%s\\n\", $6,$2,$3,$4,$5 }'; printf '__TEMPERATURES__\\n'; for path in /sys/class/thermal/thermal_zone*/temp /sys/class/hwmon/hwmon*/temp*_input; do [ -r \"$path\" ] && printf 'TEMP|%s\\n' \"$(cat \"$path\" 2>/dev/null)\"; done; printf '__PING__\\n'; ping -c 3 -W 2 1.1.1.1 2>&1; printf '__DNS__\\n'; nslookup openwrt.org 127.0.0.1 2>&1".to_owned()),
            Self::ServiceSnapshot => Ok("printf '__SERVICES__\\n'; for item in openclash AdGuardHome passwall passwall2 ddns miniupnpd; do if [ -x \"/etc/init.d/$item\" ]; then /etc/init.d/$item status >/dev/null 2>&1 && state=running || state=stopped; printf 'SERVICE|%s|installed|%s\\n' \"$item\" \"$state\"; else printf 'SERVICE|%s|missing|stopped\\n' \"$item\"; fi; done".to_owned()),
            Self::DockerSnapshot => Ok("command -v docker >/dev/null 2>&1 || { echo 'DOCKER|missing'; exit 0; }; docker ps -a --format '{{.ID}}|{{.Names}}|{{.State}}|{{.Image}}'".to_owned()),
            Self::WirelessSnapshot => Ok("ubus call network.wireless status 2>/dev/null || wifi status 2>/dev/null".to_owned()),
            Self::DhcpLeases => Ok("printf '__DHCP4__\\n'; ubus call dhcp ipv4leases 2>/dev/null; printf '__DHCP6__\\n'; ubus call dhcp ipv6leases 2>/dev/null; printf '__NEIGHBORS__\\n'; ip neigh show 2>/dev/null".to_owned()),
            Self::FirewallSnapshot => Ok("printf '__FIREWALL__\\n'; uci show firewall 2>/dev/null; printf '__UPNP__\\n'; if [ -x /etc/init.d/miniupnpd ]; then /etc/init.d/miniupnpd status >/dev/null 2>&1 && state=running || state=stopped; enabled=$(uci -q get miniupnpd.config.enabled 2>/dev/null || echo 0); echo \"UPNP|installed|$state|$enabled\"; else echo 'UPNP|missing|stopped|0'; fi".to_owned()),
            Self::PackageList { query } => {
                let query = query.as_deref().map(validate_log_filter).transpose()?;
                let filter = query.map(|value| format!(" | grep -Fi -- {}", shell_quote(&value))).unwrap_or_default();
                Ok(format!("opkg list-installed 2>&1{filter} | head -n 1000"))
            }
            Self::Logs { category, limit, filter } => {
                let limit = (*limit).clamp(20, 400);
                let base = match category {
                    LogCategory::System => "logread",
                    LogCategory::Kernel => "dmesg",
                    LogCategory::Dns => "logread | grep -Ei 'dnsmasq|AdGuardHome|adguard|unbound'",
                    LogCategory::Dial => "logread | grep -Ei 'ppp|wan|udhcpc|odhcp|dhcp'",
                    LogCategory::Firewall => "logread | grep -Ei 'firewall|fw4|nft|miniupnpd'",
                };
                let filter = filter.as_deref().map(validate_log_filter).transpose()?;
                let filter_command = filter.map(|value| format!(" | grep -F -- {}", shell_quote(&value))).unwrap_or_default();
                Ok(format!("({base}) 2>&1{filter_command} | tail -n {limit}"))
            }
            Self::ConfigurationFile { path } => {
                let path = validate_absolute_path(path)?;
                Ok(format!("[ -r {} ] && sed -n '1,4000p' {} || {{ echo '配置文件不可读。'; exit 2; }}", shell_quote(&path), shell_quote(&path)))
            }
            Self::DiskSpeedBenchmark => Ok("command -v dd >/dev/null 2>&1 || exit 2; temp=/tmp/openwrt-status-benchmark.$$; dd if=/dev/zero of=\"$temp\" bs=1M count=32 conv=fsync 2>&1; rm -f \"$temp\"".to_owned()),
            Self::NatDetection => Ok("printf '__IPV4__\\n'; wget -qO- --timeout=8 https://api.ipify.org 2>/dev/null || true; printf '\\n__IPV6__\\n'; wget -qO- --timeout=8 -6 https://api64.ipify.org 2>/dev/null || true; printf '\\n__ROUTE__\\n'; ip route get 1.1.1.1 2>/dev/null".to_owned()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriteCommand {
    Service {
        service: String,
        action: ServiceAction,
    },
    Package {
        package: String,
        install: bool,
    },
    Docker {
        container: String,
        action: DockerAction,
    },
    WakeOnLan {
        mac_address: String,
        interface: Option<String>,
    },
    UciOption {
        area: ConfigurationArea,
        package: String,
        section: String,
        option: String,
        value: Option<String>,
    },
    FirmwareUpgrade {
        image_path: String,
        preserve_config: bool,
    },
    Reboot,
}

impl WriteCommand {
    pub const fn operation(&self) -> RouterOperation {
        match self {
            Self::Service { .. } => RouterOperation::RestartService,
            Self::Package { install: true, .. } => RouterOperation::InstallPackage,
            Self::Package { install: false, .. } => RouterOperation::RemovePackage,
            Self::Docker { action, .. } => action.operation(),
            Self::WakeOnLan { .. } => RouterOperation::SendWakeOnLan,
            Self::UciOption { area, .. } => area.operation(),
            Self::FirmwareUpgrade { .. } => RouterOperation::UpgradeFirmware,
            Self::Reboot => RouterOperation::RebootRouter,
        }
    }

    pub fn build(&self) -> Result<String, ManagementError> {
        match self {
            Self::Service { service, action } => {
                let service = validate_identifier(service, "服务名称")?;
                Ok(format!(
                    "[ -x /etc/init.d/{service} ] || {{ echo '服务未安装。'; exit 2; }}; /etc/init.d/{service} {}",
                    action.as_command()
                ))
            }
            Self::Package { package, install } => {
                let package = validate_package(package)?;
                let action = if *install { "install" } else { "remove" };
                Ok(format!("opkg {action} {}", shell_quote(&package)))
            }
            Self::Docker { container, action } => {
                let container = validate_identifier(container, "Docker 容器")?;
                Ok(format!(
                    "command -v docker >/dev/null 2>&1 || {{ echo 'Docker 未安装。'; exit 2; }}; docker {} {}",
                    action.as_command(),
                    shell_quote(&container)
                ))
            }
            Self::WakeOnLan {
                mac_address,
                interface,
            } => {
                let mac_address = validate_mac_address(mac_address)?;
                let interface = interface
                    .as_deref()
                    .map(|item| validate_identifier(item, "网络接口"))
                    .transpose()?;
                let interface_flag = interface
                    .map(|item| format!("-i {}", shell_quote(&item)))
                    .unwrap_or_default();
                Ok(format!(
                    "command -v etherwake >/dev/null 2>&1 || {{ echo '未安装 etherwake。'; exit 2; }}; etherwake {interface_flag} {}",
                    shell_quote(&mac_address)
                ))
            }
            Self::UciOption {
                area,
                package,
                section,
                option,
                value,
            } => {
                let package = validate_identifier(package, "UCI 包")?;
                let section = validate_uci_section(section)?;
                let option = validate_uci_option(option)?;
                let target = format!("{package}.{section}.{option}");
                let backup = format!("/etc/config/{package}.openwrt-status.bak");
                let update = match value {
                    Some(value) => {
                        let value = validate_uci_value(value)?;
                        format!("uci set {}", shell_quote(&format!("{target}={value}")))
                    }
                    None => format!("uci -q delete {}", shell_quote(&target)),
                };
                let restart = match area {
                    ConfigurationArea::Service => format!(
                        "[ -x /etc/init.d/{package} ] && /etc/init.d/{package} restart || true"
                    ),
                    _ => area.reload_command().to_owned(),
                };
                Ok(format!(
                    "[ -r /etc/config/{package} ] && cp /etc/config/{package} {} || true; {update}; uci commit {}; {restart}",
                    shell_quote(&backup),
                    shell_quote(&package)
                ))
            }
            Self::FirmwareUpgrade {
                image_path,
                preserve_config,
            } => {
                let image_path = validate_firmware_path(image_path)?;
                let no_keep = if *preserve_config { "" } else { " -n" };
                Ok(format!(
                    "sysupgrade -T {} && sysupgrade{no_keep} {}",
                    shell_quote(&image_path),
                    shell_quote(&image_path)
                ))
            }
            Self::Reboot => Ok("sync && reboot".to_owned()),
        }
    }
}

/// 可审计的写操作计划。它不包含密码、私钥或配置正文。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedCommand {
    pub router_id: String,
    pub operation: RouterOperation,
    pub command: String,
}

impl ManagedCommand {
    pub fn router_id(&self) -> &str {
        &self.router_id
    }

    pub const fn operation(&self) -> RouterOperation {
        self.operation
    }

    pub fn command(&self) -> &str {
        &self.command
    }

    /// 在真正下发前复验审批单，避免计划在确认界面之后被复用或跨路由器执行。
    pub fn validate_approval(&self, approval: &OperationApproval) -> Result<(), ManagementError> {
        if approval.router_id != self.router_id {
            return Err(ManagementError::Approval(
                "审批单不属于当前路由器".to_owned(),
            ));
        }
        if approval.operation != self.operation {
            return Err(ManagementError::Approval(format!(
                "此操作需要“{}”审批单",
                self.operation.label()
            )));
        }
        approval.validate().map_err(ManagementError::Approval)
    }

    pub fn prepare(
        router_id: impl Into<String>,
        write: &WriteCommand,
        approval: &OperationApproval,
    ) -> Result<Self, ManagementError> {
        let router_id = router_id.into();
        if router_id.trim().is_empty() {
            return Err(ManagementError::InvalidInput(
                "路由器 ID 不能为空".to_owned(),
            ));
        }
        let plan = Self {
            router_id,
            operation: write.operation(),
            command: write.build()?,
        };
        plan.validate_approval(approval)?;
        Ok(plan)
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ManagementError {
    #[error("管理输入无效：{0}")]
    InvalidInput(String),
    #[error("安全审批无效：{0}")]
    Approval(String),
}

fn validate_identifier(input: &str, label: &str) -> Result<String, ManagementError> {
    let value = input.trim();
    if value.is_empty()
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
        })
    {
        return Err(ManagementError::InvalidInput(format!("{label}格式无效。")));
    }
    Ok(value.to_owned())
}

fn validate_package(input: &str) -> Result<String, ManagementError> {
    let value = validate_identifier(input, "软件包名称")?;
    if value.len() > 128 {
        return Err(ManagementError::InvalidInput("软件包名称过长。".to_owned()));
    }
    Ok(value)
}

fn validate_uci_section(input: &str) -> Result<String, ManagementError> {
    let value = input.trim();
    let indexed = value
        .strip_prefix('@')
        .and_then(|rest| rest.split_once('['))
        .is_some_and(|(kind, suffix)| {
            suffix.ends_with(']')
                && suffix[..suffix.len() - 1]
                    .chars()
                    .all(|character| character.is_ascii_digit())
                && validate_identifier(kind, "UCI 段").is_ok()
        });
    if indexed || validate_identifier(value, "UCI 段").is_ok() {
        return Ok(value.to_owned());
    }
    Err(ManagementError::InvalidInput("UCI 段格式无效。".to_owned()))
}

fn validate_uci_option(input: &str) -> Result<String, ManagementError> {
    let value = input.trim();
    if value.is_empty()
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err(ManagementError::InvalidInput(
            "UCI 选项格式无效。".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

fn validate_uci_value(input: &str) -> Result<String, ManagementError> {
    let value = input.trim();
    if value.len() > 4096 || value.contains('\0') || value.contains(['\r', '\n']) {
        return Err(ManagementError::InvalidInput(
            "UCI 选项值格式无效。".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

fn validate_log_filter(input: &str) -> Result<String, ManagementError> {
    let value = input.trim();
    if value.len() > 80 || value.contains(['\r', '\n', '\0']) {
        return Err(ManagementError::InvalidInput(
            "日志筛选词格式无效。".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

fn validate_absolute_path(input: &str) -> Result<String, ManagementError> {
    let value = input.trim();
    if !value.starts_with('/')
        || value.contains('\0')
        || value.contains(['\r', '\n'])
        || value.contains("../")
        || value.ends_with("/..")
    {
        return Err(ManagementError::InvalidInput(
            "文件路径格式无效。".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

fn validate_firmware_path(input: &str) -> Result<String, ManagementError> {
    let value = validate_absolute_path(input)?;
    let supported = value.ends_with(".bin") || value.ends_with(".img");
    if !value.starts_with("/tmp/") || !supported {
        return Err(ManagementError::InvalidInput(
            "固件必须是 /tmp 目录内的 .bin 或 .img 文件。".to_owned(),
        ));
    }
    Ok(value)
}

fn validate_mac_address(input: &str) -> Result<String, ManagementError> {
    let value = input.trim().to_ascii_lowercase();
    let parts: Vec<_> = value.split(':').collect();
    if parts.len() != 6
        || parts.iter().any(|part| {
            part.len() != 2 || !part.chars().all(|character| character.is_ascii_hexdigit())
        })
    {
        return Err(ManagementError::InvalidInput(
            "MAC 地址格式无效。".to_owned(),
        ));
    }
    Ok(value)
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\\"'\\\"'"))
}
