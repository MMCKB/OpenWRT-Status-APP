//! Flutter 的受限 Rust 原生库入口。
//!
//! FFI 只接受一次性 UTF-8 JSON 请求，并把所有真实 OpenWrt 通讯交给
//! `openwrt-core`。凭据仅在本次调用内存中存在，绝不写入档案、审计或响应。

use std::{
    ffi::{CStr, CString, c_char},
    fs,
    future::Future,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use chrono::Utc;
use openwrt_core::{
    ConfigSnapshot, ConfigurationArea, ConfirmationLevel, DockerAction, LogCategory, LuCiClient,
    ManagedCommand, OperationApproval, ReadCommand, RouterOperation, RouterProfile,
    RouterProfileStore, ServiceAction, SnapshotFile, SshClient, SshConnectionRequest,
    SshTransportError, TrustedHostStore, WriteCommand, normalize_router_endpoint,
};
use serde::Deserialize;
use serde_json::{Value, json};

const VERSION_JSON: &CStr =
    c"{\"abi\":\"2\",\"version\":\"0.2.0\",\"ui\":\"flutter\",\"core\":\"rust\"}";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FfiRequest {
    action: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FfiProfile {
    id: String,
    name: String,
    base_url: String,
    username: String,
    ssh_port: u16,
}

impl TryFrom<FfiProfile> for RouterProfile {
    type Error = String;

    fn try_from(value: FfiProfile) -> Result<Self, Self::Error> {
        let profile = Self {
            id: value.id,
            name: value.name,
            base_url: value.base_url,
            username: value.username,
            ssh_port: value.ssh_port,
        };
        profile.validate().map_err(|error| error.to_string())?;
        if profile.id.trim().is_empty()
            || profile.name.trim().is_empty()
            || profile.username.trim().is_empty()
        {
            return Err("路由器 ID、名称和用户名不能为空。".to_owned());
        }
        if profile.ssh_port == 0 {
            return Err("SSH 端口必须介于 1 到 65535。".to_owned());
        }
        Ok(profile)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoragePayload {
    storage_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfilePayload {
    storage_path: String,
    profile: FfiProfile,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveProfilePayload {
    storage_path: String,
    router_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NormalizePayload {
    base_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionPayload {
    profile: FfiProfile,
    luci_password: String,
    #[serde(default)]
    ssh_password: String,
    #[serde(default)]
    approved_fingerprint_sha256: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SshReadPayload {
    storage_path: String,
    connection: ConnectionPayload,
    command: String,
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    limit: Option<u16>,
    #[serde(default)]
    filter: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalPayload {
    storage_path: String,
    connection: ConnectionPayload,
    command: String,
    typed_phrase: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotPayload {
    storage_path: String,
    connection: ConnectionPayload,
    label: String,
    #[serde(default)]
    single_confirmed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedPayload {
    storage_path: String,
    connection: ConnectionPayload,
    operation: String,
    #[serde(default)]
    snapshot_id: Option<String>,
    #[serde(default)]
    typed_phrase: Option<String>,
    #[serde(default)]
    single_confirmed: bool,
    command: ManagedCommandPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedCommandPayload {
    kind: String,
    #[serde(default)]
    service: Option<String>,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    package: Option<String>,
    #[serde(default)]
    install: Option<bool>,
    #[serde(default)]
    container: Option<String>,
    #[serde(default)]
    mac_address: Option<String>,
    #[serde(default)]
    interface: Option<String>,
    #[serde(default)]
    area: Option<String>,
    #[serde(default)]
    section: Option<String>,
    #[serde(default)]
    option: Option<String>,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    image_path: Option<String>,
    #[serde(default)]
    preserve_config: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FetchStatusPayload {
    connection: ConnectionPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperationPayload {
    operation: String,
}

/// ABI 版本与运行时自检信息。返回静态字符串，Dart 不得释放。
#[unsafe(no_mangle)]
pub extern "C" fn openwrt_ffi_version_json() -> *const c_char {
    VERSION_JSON.as_ptr()
}

/// 统一真实调用入口。返回值由 Rust 分配；Dart 必须调用
/// `openwrt_ffi_string_free`，且不得缓存其中的原始指针。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn openwrt_ffi_call_json(request: *const c_char) -> *mut c_char {
    let response = std::panic::catch_unwind(|| {
        let request = read_request(request)?;
        dispatch(request)
    })
    .unwrap_or_else(|_| {
        Err(FfiFailure::internal(
            "Rust 原生库处理请求时发生未预期错误。",
        ))
    });
    allocate_response(response)
}

/// 释放 `openwrt_ffi_call_json` 的返回值。传入空指针无副作用。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn openwrt_ffi_string_free(pointer: *mut c_char) {
    if !pointer.is_null() {
        // SAFETY: 调用方仅能传入本 crate 通过 CString::into_raw 分配的指针。
        unsafe { drop(CString::from_raw(pointer)) };
    }
}

fn read_request(pointer: *const c_char) -> Result<FfiRequest, FfiFailure> {
    if pointer.is_null() {
        return Err(FfiFailure::invalid_input("请求不能为空。"));
    }
    // SAFETY: C ABI 约定调用方提供有效、NUL 结尾的 UTF-8 JSON 指针。
    let text = unsafe { CStr::from_ptr(pointer) }
        .to_str()
        .map_err(|_| FfiFailure::invalid_input("请求必须是 UTF-8 JSON。"))?;
    serde_json::from_str(text).map_err(|_| FfiFailure::invalid_input("请求 JSON 格式无效。"))
}

fn dispatch(request: FfiRequest) -> Result<Value, FfiFailure> {
    match request.action.as_str() {
        "normalize_endpoint" => {
            let payload: NormalizePayload = decode_payload(request.payload)?;
            let endpoint = normalize_router_endpoint(&payload.base_url)
                .map_err(|error| FfiFailure::invalid_input(error.to_string()))?;
            Ok(json!({ "endpoint": endpoint.to_string() }))
        }
        "profile.list" => {
            let payload: StoragePayload = decode_payload(request.payload)?;
            let profiles = profile_store(&payload.storage_path)?
                .load()
                .map_err(FfiFailure::persistence)?;
            Ok(json!({ "profiles": profiles }))
        }
        "profile.upsert" => {
            let payload: ProfilePayload = decode_payload(request.payload)?;
            let profile =
                RouterProfile::try_from(payload.profile).map_err(FfiFailure::invalid_input)?;
            let profiles = profile_store(&payload.storage_path)?
                .upsert(profile)
                .map_err(FfiFailure::persistence)?;
            Ok(json!({ "profiles": profiles }))
        }
        "profile.remove" => {
            let payload: RemoveProfilePayload = decode_payload(request.payload)?;
            if payload.router_id.trim().is_empty() {
                return Err(FfiFailure::invalid_input("路由器 ID 不能为空。"));
            }
            let profiles = profile_store(&payload.storage_path)?
                .remove(&payload.router_id)
                .map_err(FfiFailure::persistence)?;
            Ok(json!({ "profiles": profiles }))
        }
        "status.fetch" => fetch_status(request.payload),
        "ssh.read" => ssh_read(request.payload),
        "ssh.managed" => ssh_managed(request.payload),
        "ssh.terminal" => ssh_terminal(request.payload),
        "sftp.list" => sftp_list(request.payload),
        "snapshot.create" => create_snapshot(request.payload),
        "snapshot.list" => list_snapshots(request.payload),
        "operation.policy" => {
            let payload: OperationPayload = decode_payload(request.payload)?;
            let operation = parse_operation(&payload.operation)?;
            Ok(json!({
                "operation": payload.operation,
                "label": operation.label(),
                "confirmation": confirmation_name(operation.confirmation_level()),
                "requiresSnapshot": operation.requires_snapshot(),
                "typedPhrase": if operation.confirmation_level() == ConfirmationLevel::TypedConfirm {
                    Some(operation.label())
                } else {
                    None
                },
            }))
        }
        _ => Err(FfiFailure::unsupported("不支持的原生操作。")),
    }
}

fn fetch_status(payload: Value) -> Result<Value, FfiFailure> {
    let payload: FetchStatusPayload = decode_payload(payload)?;
    if payload.connection.luci_password.is_empty() {
        return Err(FfiFailure::invalid_input(
            "请提供 LuCI 密码后再读取路由器状态。",
        ));
    }
    let profile =
        RouterProfile::try_from(payload.connection.profile).map_err(FfiFailure::invalid_input)?;
    let client = LuCiClient::new(
        &profile.base_url,
        &profile.username,
        &payload.connection.luci_password,
    )
    .map_err(FfiFailure::connection)?;
    let router_id = profile.id;
    let status = block_on_core(client.fetch_status(router_id)).map_err(FfiFailure::connection)?;
    serde_json::to_value(status).map_err(|_| FfiFailure::internal("无法编码路由器状态。"))
}

fn ssh_read(payload: Value) -> Result<Value, FfiFailure> {
    let payload: SshReadPayload = decode_payload(payload)?;
    if payload.connection.ssh_password.is_empty() {
        return Err(FfiFailure::invalid_input(
            "请提供 SSH 密码后再执行只读查询。",
        ));
    }
    let command = parse_read_command(&payload)?;
    let profile =
        RouterProfile::try_from(payload.connection.profile).map_err(FfiFailure::invalid_input)?;
    let store = profile_store(&payload.storage_path)?;
    let state = store.load_state().map_err(FfiFailure::persistence)?;
    let trusted_hosts = Arc::new(Mutex::new(state.trusted_hosts));
    let request = SshConnectionRequest {
        router_id: profile.id,
        host: ssh_host(&profile.base_url).map_err(FfiFailure::invalid_input)?,
        port: profile.ssh_port,
        username: profile.username,
        password: payload.connection.ssh_password,
        approved_fingerprint_sha256: payload.connection.approved_fingerprint_sha256,
    };
    let result = block_on_ssh(run_ssh_read(request, Arc::clone(&trusted_hosts), command));
    if let Ok(updated_hosts) = trusted_hosts.lock().map(|hosts| hosts.clone()) {
        store
            .save_trusted_hosts(updated_hosts)
            .map_err(FfiFailure::persistence)?;
    }
    let result = result.map_err(FfiFailure::ssh)?;
    Ok(json!({
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exitStatus": result.exit_status,
    }))
}

async fn run_ssh_read(
    request: SshConnectionRequest,
    trusted_hosts: Arc<Mutex<TrustedHostStore>>,
    command: ReadCommand,
) -> Result<openwrt_core::SshCommandResult, SshTransportError> {
    let mut client = SshClient::connect(request, trusted_hosts).await?;
    let result = client.execute_read(&command).await;
    client.disconnect().await?;
    result
}

fn parse_read_command(payload: &SshReadPayload) -> Result<ReadCommand, FfiFailure> {
    match payload.command.as_str() {
        "system_health" => Ok(ReadCommand::SystemHealth),
        "service_snapshot" => Ok(ReadCommand::ServiceSnapshot),
        "docker_snapshot" => Ok(ReadCommand::DockerSnapshot),
        "wireless_snapshot" => Ok(ReadCommand::WirelessSnapshot),
        "dhcp_leases" => Ok(ReadCommand::DhcpLeases),
        "firewall_snapshot" => Ok(ReadCommand::FirewallSnapshot),
        "package_list" => Ok(ReadCommand::PackageList {
            query: payload.query.clone(),
        }),
        "logs" => Ok(ReadCommand::Logs {
            category: parse_log_category(payload.query.as_deref())?,
            limit: payload.limit.unwrap_or(200),
            filter: payload.filter.clone(),
        }),
        "configuration_file" => Ok(ReadCommand::ConfigurationFile {
            path: payload
                .path
                .clone()
                .ok_or_else(|| FfiFailure::invalid_input("缺少配置文件路径。"))?,
        }),
        "disk_speed_benchmark" => Ok(ReadCommand::DiskSpeedBenchmark),
        "nat_detection" => Ok(ReadCommand::NatDetection),
        _ => Err(FfiFailure::invalid_input("未知的只读查询。")),
    }
}

fn parse_log_category(value: Option<&str>) -> Result<LogCategory, FfiFailure> {
    match value.unwrap_or("system") {
        "system" => Ok(LogCategory::System),
        "kernel" => Ok(LogCategory::Kernel),
        "dns" => Ok(LogCategory::Dns),
        "dial" => Ok(LogCategory::Dial),
        "firewall" => Ok(LogCategory::Firewall),
        _ => Err(FfiFailure::invalid_input("未知的日志类别。")),
    }
}

fn ssh_host(base_url: &str) -> Result<String, String> {
    let endpoint = normalize_router_endpoint(base_url).map_err(|error| error.to_string())?;
    endpoint
        .host_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| "路由器地址中缺少 SSH 主机。".to_owned())
}

fn sftp_list(payload: Value) -> Result<Value, FfiFailure> {
    let payload: SshReadPayload = decode_payload(payload)?;
    if payload.connection.ssh_password.is_empty() {
        return Err(FfiFailure::invalid_input("请提供 SSH 密码后再浏览文件。"));
    }
    let path = required_text(payload.path.as_deref(), "远程目录路径")?;
    let profile =
        RouterProfile::try_from(payload.connection.profile).map_err(FfiFailure::invalid_input)?;
    let store = profile_store(&payload.storage_path)?;
    let state = store.load_state().map_err(FfiFailure::persistence)?;
    let trusted_hosts = Arc::new(Mutex::new(state.trusted_hosts));
    let request = SshConnectionRequest {
        router_id: profile.id,
        host: ssh_host(&profile.base_url).map_err(FfiFailure::invalid_input)?,
        port: profile.ssh_port,
        username: profile.username,
        password: payload.connection.ssh_password,
        approved_fingerprint_sha256: payload.connection.approved_fingerprint_sha256,
    };
    let entries = block_on_ssh(run_sftp_list(request, Arc::clone(&trusted_hosts), path))
        .map_err(FfiFailure::ssh)?;
    if let Ok(updated_hosts) = trusted_hosts.lock().map(|hosts| hosts.clone()) {
        store
            .save_trusted_hosts(updated_hosts)
            .map_err(FfiFailure::persistence)?;
    }
    Ok(json!({
        "entries": entries.into_iter().map(|entry| json!({
            "path": entry.path,
            "name": entry.name,
            "isDirectory": entry.is_directory,
            "isSymlink": entry.is_symlink,
            "sizeBytes": entry.size_bytes,
        })).collect::<Vec<_>>(),
    }))
}

async fn run_sftp_list(
    request: SshConnectionRequest,
    trusted_hosts: Arc<Mutex<TrustedHostStore>>,
    path: String,
) -> Result<Vec<openwrt_core::RemoteFileEntry>, SshTransportError> {
    let mut client = SshClient::connect(request, trusted_hosts).await?;
    let entries = {
        let sftp = client.open_sftp().await?;
        sftp.list_directory(path).await?
    };
    client.disconnect().await?;
    Ok(entries)
}

fn ssh_terminal(payload: Value) -> Result<Value, FfiFailure> {
    let payload: TerminalPayload = decode_payload(payload)?;
    if payload.connection.ssh_password.is_empty() {
        return Err(FfiFailure::invalid_input("请提供 SSH 密码后再打开终端。"));
    }
    if payload.command.trim().is_empty() {
        return Err(FfiFailure::invalid_input("SSH 终端命令不能为空。"));
    }
    let profile =
        RouterProfile::try_from(payload.connection.profile).map_err(FfiFailure::invalid_input)?;
    let approval = OperationApproval {
        operation: RouterOperation::ExecuteTerminal,
        router_id: profile.id.clone(),
        snapshot_id: None,
        typed_phrase: payload.typed_phrase,
    };
    approval.validate().map_err(FfiFailure::invalid_input)?;
    let store = profile_store(&payload.storage_path)?;
    let state = store.load_state().map_err(FfiFailure::persistence)?;
    let trusted_hosts = Arc::new(Mutex::new(state.trusted_hosts));
    let request = SshConnectionRequest {
        router_id: profile.id,
        host: ssh_host(&profile.base_url).map_err(FfiFailure::invalid_input)?,
        port: profile.ssh_port,
        username: profile.username,
        password: payload.connection.ssh_password,
        approved_fingerprint_sha256: payload.connection.approved_fingerprint_sha256,
    };
    let result = block_on_ssh(run_ssh_terminal(
        request,
        Arc::clone(&trusted_hosts),
        payload.command,
        approval,
    ));
    if let Ok(updated_hosts) = trusted_hosts.lock().map(|hosts| hosts.clone()) {
        store
            .save_trusted_hosts(updated_hosts)
            .map_err(FfiFailure::persistence)?;
    }
    let result = result.map_err(FfiFailure::ssh)?;
    Ok(
        json!({ "stdout": result.stdout, "stderr": result.stderr, "exitStatus": result.exit_status }),
    )
}

async fn run_ssh_terminal(
    request: SshConnectionRequest,
    trusted_hosts: Arc<Mutex<TrustedHostStore>>,
    command: String,
    approval: OperationApproval,
) -> Result<openwrt_core::SshCommandResult, SshTransportError> {
    let mut client = SshClient::connect(request, trusted_hosts).await?;
    let result = client.execute_terminal(&command, &approval).await;
    client.disconnect().await?;
    result
}

const SNAPSHOT_FILES: [&str; 4] = [
    "/etc/config/network",
    "/etc/config/wireless",
    "/etc/config/firewall",
    "/etc/config/dhcp",
];

fn create_snapshot(payload: Value) -> Result<Value, FfiFailure> {
    let payload: SnapshotPayload = decode_payload(payload)?;
    if !payload.single_confirmed {
        return Err(FfiFailure::invalid_input("创建配置快照需要用户明确确认。"));
    }
    if payload.connection.ssh_password.is_empty() {
        return Err(FfiFailure::invalid_input(
            "请提供 SSH 密码后再创建配置快照。",
        ));
    }
    let profile =
        RouterProfile::try_from(payload.connection.profile).map_err(FfiFailure::invalid_input)?;
    let store = profile_store(&payload.storage_path)?;
    let state = store.load_state().map_err(FfiFailure::persistence)?;
    let trusted_hosts = Arc::new(Mutex::new(state.trusted_hosts));
    let request = SshConnectionRequest {
        router_id: profile.id.clone(),
        host: ssh_host(&profile.base_url).map_err(FfiFailure::invalid_input)?,
        port: profile.ssh_port,
        username: profile.username,
        password: payload.connection.ssh_password,
        approved_fingerprint_sha256: payload.connection.approved_fingerprint_sha256,
    };
    let files = block_on_ssh(read_snapshot_files(request, Arc::clone(&trusted_hosts)))
        .map_err(FfiFailure::ssh)?;
    if let Ok(updated_hosts) = trusted_hosts.lock().map(|hosts| hosts.clone()) {
        store
            .save_trusted_hosts(updated_hosts)
            .map_err(FfiFailure::persistence)?;
    }
    let snapshot = ConfigSnapshot {
        id: format!("{}-{}", profile.id, Utc::now().timestamp_millis()),
        router_id: profile.id,
        created_at: Utc::now(),
        label: required_text(Some(&payload.label), "快照名称")?,
        firmware: None,
        files,
    };
    save_snapshot(&payload.storage_path, &snapshot)?;
    serde_json::to_value(snapshot).map_err(|_| FfiFailure::internal("无法编码配置快照。"))
}

async fn read_snapshot_files(
    request: SshConnectionRequest,
    trusted_hosts: Arc<Mutex<TrustedHostStore>>,
) -> Result<Vec<SnapshotFile>, SshTransportError> {
    let mut client = SshClient::connect(request, trusted_hosts).await?;
    let files = {
        let sftp = client.open_sftp().await?;
        let mut files = Vec::with_capacity(SNAPSHOT_FILES.len());
        for path in SNAPSHOT_FILES {
            let bytes = sftp.read_file(path).await?;
            let content = String::from_utf8(bytes).map_err(|_| {
                SshTransportError::Transport("配置文件不是有效 UTF-8 文本。".to_owned())
            })?;
            files.push(SnapshotFile {
                path: path.to_owned(),
                content,
            });
        }
        files
    };
    client.disconnect().await?;
    Ok(files)
}

fn list_snapshots(payload: Value) -> Result<Value, FfiFailure> {
    let payload: StoragePayload = decode_payload(payload)?;
    let snapshots = snapshot_directory(&payload.storage_path)?;
    let mut values = Vec::new();
    if snapshots.exists() {
        for entry in fs::read_dir(&snapshots)
            .map_err(|error| FfiFailure::persistence_io(error.to_string()))?
        {
            let entry = entry.map_err(|error| FfiFailure::persistence_io(error.to_string()))?;
            if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let bytes = fs::read(entry.path())
                .map_err(|error| FfiFailure::persistence_io(error.to_string()))?;
            let snapshot: ConfigSnapshot = serde_json::from_slice(&bytes)
                .map_err(|_| FfiFailure::persistence_io("配置快照文件无效。"))?;
            values.push(snapshot);
        }
    }
    values.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(json!({ "snapshots": values }))
}

fn save_snapshot(storage_path: &str, snapshot: &ConfigSnapshot) -> Result<(), FfiFailure> {
    let directory = snapshot_directory(storage_path)?;
    fs::create_dir_all(&directory)
        .map_err(|error| FfiFailure::persistence_io(error.to_string()))?;
    let path = directory.join(format!("{}.json", snapshot.id));
    let bytes = serde_json::to_vec_pretty(snapshot)
        .map_err(|_| FfiFailure::internal("无法持久化配置快照。"))?;
    fs::write(path, bytes).map_err(|error| FfiFailure::persistence_io(error.to_string()))
}

fn require_snapshot(
    storage_path: &str,
    router_id: &str,
    snapshot_id: Option<&str>,
) -> Result<(), FfiFailure> {
    let id = snapshot_id.unwrap_or_default();
    if id.is_empty() || id.contains('/') || id.contains('\\') {
        return Err(FfiFailure::invalid_input(
            "高风险操作必须选择有效的本机配置快照。",
        ));
    }
    let path = snapshot_directory(storage_path)?.join(format!("{id}.json"));
    let bytes = fs::read(path).map_err(|_| FfiFailure::invalid_input("所选配置快照不存在。"))?;
    let snapshot: ConfigSnapshot = serde_json::from_slice(&bytes)
        .map_err(|_| FfiFailure::invalid_input("所选配置快照无效。"))?;
    if snapshot.router_id != router_id {
        return Err(FfiFailure::invalid_input("所选配置快照不属于当前路由器。"));
    }
    Ok(())
}

fn snapshot_directory(storage_path: &str) -> Result<PathBuf, FfiFailure> {
    let state_path = Path::new(storage_path);
    let parent = state_path
        .parent()
        .ok_or_else(|| FfiFailure::invalid_input("应用档案路径必须包含父目录。"))?;
    Ok(parent.join("config-snapshots"))
}

fn ssh_managed(payload: Value) -> Result<Value, FfiFailure> {
    let payload: ManagedPayload = decode_payload(payload)?;
    if payload.connection.ssh_password.is_empty() {
        return Err(FfiFailure::invalid_input(
            "请提供 SSH 密码后再执行管理操作。",
        ));
    }
    let operation = parse_operation(&payload.operation)?;
    if operation.confirmation_level() == ConfirmationLevel::SingleConfirm
        && !payload.single_confirmed
    {
        return Err(FfiFailure::invalid_input(
            "此操作需要用户明确确认后才能执行。",
        ));
    }
    let write = parse_write_command(&payload.command)?;
    if operation != write.operation() {
        return Err(FfiFailure::invalid_input("请求操作与受控命令类型不匹配。"));
    }
    let profile =
        RouterProfile::try_from(payload.connection.profile).map_err(FfiFailure::invalid_input)?;
    if operation.requires_snapshot() {
        require_snapshot(
            &payload.storage_path,
            &profile.id,
            payload.snapshot_id.as_deref(),
        )?;
    }
    let approval = OperationApproval {
        operation,
        router_id: profile.id.clone(),
        snapshot_id: payload.snapshot_id,
        typed_phrase: payload.typed_phrase,
    };
    let plan = ManagedCommand::prepare(profile.id.clone(), &write, &approval)
        .map_err(|error| FfiFailure::invalid_input(error.to_string()))?;
    let store = profile_store(&payload.storage_path)?;
    let state = store.load_state().map_err(FfiFailure::persistence)?;
    let trusted_hosts = Arc::new(Mutex::new(state.trusted_hosts));
    let request = SshConnectionRequest {
        router_id: profile.id,
        host: ssh_host(&profile.base_url).map_err(FfiFailure::invalid_input)?,
        port: profile.ssh_port,
        username: profile.username,
        password: payload.connection.ssh_password,
        approved_fingerprint_sha256: payload.connection.approved_fingerprint_sha256,
    };
    let result = block_on_ssh(run_ssh_managed(
        request,
        Arc::clone(&trusted_hosts),
        plan,
        approval,
    ));
    if let Ok(updated_hosts) = trusted_hosts.lock().map(|hosts| hosts.clone()) {
        store
            .save_trusted_hosts(updated_hosts)
            .map_err(FfiFailure::persistence)?;
    }
    let result = result.map_err(FfiFailure::ssh)?;
    Ok(json!({
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exitStatus": result.exit_status,
    }))
}

async fn run_ssh_managed(
    request: SshConnectionRequest,
    trusted_hosts: Arc<Mutex<TrustedHostStore>>,
    plan: ManagedCommand,
    approval: OperationApproval,
) -> Result<openwrt_core::SshCommandResult, SshTransportError> {
    let mut client = SshClient::connect(request, trusted_hosts).await?;
    let result = client.execute_managed(&plan, &approval).await;
    client.disconnect().await?;
    result
}

fn parse_write_command(payload: &ManagedCommandPayload) -> Result<WriteCommand, FfiFailure> {
    match payload.kind.as_str() {
        "service" => Ok(WriteCommand::Service {
            service: required_text(payload.service.as_deref(), "服务名称")?,
            action: parse_service_action(payload.action.as_deref())?,
        }),
        "package" => Ok(WriteCommand::Package {
            package: required_text(payload.package.as_deref(), "软件包名称")?,
            install: payload.install.unwrap_or(true),
        }),
        "docker" => Ok(WriteCommand::Docker {
            container: required_text(payload.container.as_deref(), "Docker 容器")?,
            action: parse_docker_action(payload.action.as_deref())?,
        }),
        "wake_on_lan" => Ok(WriteCommand::WakeOnLan {
            mac_address: required_text(payload.mac_address.as_deref(), "MAC 地址")?,
            interface: payload.interface.clone(),
        }),
        "uci_option" => Ok(WriteCommand::UciOption {
            area: parse_configuration_area(payload.area.as_deref())?,
            package: required_text(payload.package.as_deref(), "UCI 包")?,
            section: required_text(payload.section.as_deref(), "UCI 段")?,
            option: required_text(payload.option.as_deref(), "UCI 选项")?,
            value: payload.value.clone(),
        }),
        "firmware_upgrade" => Ok(WriteCommand::FirmwareUpgrade {
            image_path: required_text(payload.image_path.as_deref(), "固件路径")?,
            preserve_config: payload.preserve_config.unwrap_or(true),
        }),
        "reboot" => Ok(WriteCommand::Reboot),
        _ => Err(FfiFailure::invalid_input("未知的受控管理命令。")),
    }
}

fn required_text(value: Option<&str>, label: &str) -> Result<String, FfiFailure> {
    let value = value.unwrap_or_default().trim();
    if value.is_empty() {
        return Err(FfiFailure::invalid_input(format!("{label}不能为空。")));
    }
    Ok(value.to_owned())
}

fn parse_service_action(value: Option<&str>) -> Result<ServiceAction, FfiFailure> {
    match value.unwrap_or("restart") {
        "start" => Ok(ServiceAction::Start),
        "stop" => Ok(ServiceAction::Stop),
        "restart" => Ok(ServiceAction::Restart),
        _ => Err(FfiFailure::invalid_input("未知的服务操作。")),
    }
}

fn parse_docker_action(value: Option<&str>) -> Result<DockerAction, FfiFailure> {
    match value.unwrap_or("restart") {
        "start" => Ok(DockerAction::Start),
        "stop" => Ok(DockerAction::Stop),
        "restart" => Ok(DockerAction::Restart),
        "remove" => Ok(DockerAction::Remove),
        _ => Err(FfiFailure::invalid_input("未知的 Docker 操作。")),
    }
}

fn parse_configuration_area(value: Option<&str>) -> Result<ConfigurationArea, FfiFailure> {
    match value.unwrap_or_default() {
        "network" => Ok(ConfigurationArea::Network),
        "wireless" => Ok(ConfigurationArea::Wireless),
        "firewall" => Ok(ConfigurationArea::Firewall),
        "dhcp" => Ok(ConfigurationArea::Dhcp),
        "service" => Ok(ConfigurationArea::Service),
        _ => Err(FfiFailure::invalid_input("未知的配置区域。")),
    }
}

fn profile_store(storage_path: &str) -> Result<RouterProfileStore, FfiFailure> {
    let path = storage_path.trim();
    if path.is_empty() {
        return Err(FfiFailure::invalid_input("应用档案存储路径不能为空。"));
    }
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err(FfiFailure::invalid_input(
            "应用档案必须保存至应用专属的绝对路径。",
        ));
    }
    Ok(RouterProfileStore::new(path))
}

fn block_on_core<T>(
    future: impl Future<Output = Result<T, openwrt_core::CoreError>>,
) -> Result<T, openwrt_core::CoreError> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| openwrt_core::CoreError::Transport(error.to_string()))?
        .block_on(future)
}

fn block_on_ssh<T>(
    future: impl Future<Output = Result<T, SshTransportError>>,
) -> Result<T, SshTransportError> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| SshTransportError::Transport(error.to_string()))?
        .block_on(future)
}

fn decode_payload<T: for<'de> Deserialize<'de>>(payload: Value) -> Result<T, FfiFailure> {
    serde_json::from_value(payload)
        .map_err(|_| FfiFailure::invalid_input("请求参数不完整或格式无效。"))
}

fn confirmation_name(level: ConfirmationLevel) -> &'static str {
    match level {
        ConfirmationLevel::None => "none",
        ConfirmationLevel::SingleConfirm => "single",
        ConfirmationLevel::TypedConfirm => "typed",
    }
}

fn parse_operation(name: &str) -> Result<RouterOperation, FfiFailure> {
    match name {
        "read_status" => Ok(RouterOperation::ReadStatus),
        "run_diagnostics" => Ok(RouterOperation::RunDiagnostics),
        "execute_terminal" => Ok(RouterOperation::ExecuteTerminal),
        "wake_on_lan" => Ok(RouterOperation::SendWakeOnLan),
        "create_snapshot" => Ok(RouterOperation::CreateConfigSnapshot),
        "restore_snapshot" => Ok(RouterOperation::RestoreConfigSnapshot),
        "restart_service" => Ok(RouterOperation::RestartService),
        "reboot" => Ok(RouterOperation::RebootRouter),
        "apply_network" => Ok(RouterOperation::ApplyNetwork),
        "apply_wireless" => Ok(RouterOperation::ApplyWireless),
        "apply_firewall" => Ok(RouterOperation::ApplyFirewall),
        "install_package" => Ok(RouterOperation::InstallPackage),
        "remove_package" => Ok(RouterOperation::RemovePackage),
        "upload_file" => Ok(RouterOperation::UploadFile),
        "delete_file" => Ok(RouterOperation::DeleteFile),
        "rename_file" => Ok(RouterOperation::RenameFile),
        "write_file" => Ok(RouterOperation::WriteFile),
        "upgrade_firmware" => Ok(RouterOperation::UpgradeFirmware),
        _ => Err(FfiFailure::invalid_input("未知的路由器操作。")),
    }
}

#[derive(Debug)]
struct FfiFailure {
    code: &'static str,
    message: String,
}

impl FfiFailure {
    fn invalid_input(message: impl Into<String>) -> Self {
        Self {
            code: "invalid_input",
            message: message.into(),
        }
    }

    fn unsupported(message: impl Into<String>) -> Self {
        Self {
            code: "unsupported",
            message: message.into(),
        }
    }

    fn persistence(error: openwrt_core::CoreError) -> Self {
        Self {
            code: "persistence_failed",
            message: error.to_string(),
        }
    }

    fn persistence_io(message: impl Into<String>) -> Self {
        Self {
            code: "persistence_failed",
            message: message.into(),
        }
    }

    fn connection(error: openwrt_core::CoreError) -> Self {
        Self {
            code: "connection_failed",
            message: redact_transport_error(error.to_string()),
        }
    }

    fn ssh(error: SshTransportError) -> Self {
        Self {
            code: "ssh_failed",
            message: redact_transport_error(error.to_string()),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "internal",
            message: message.into(),
        }
    }
}

fn redact_transport_error(message: String) -> String {
    // Core errors normally omit credentials. Retain only user-actionable text and
    // prevent URI user-info from ever reaching the Flutter layer.
    message
        .split('@')
        .next_back()
        .unwrap_or("无法连接路由器。")
        .to_owned()
}

fn allocate_response(result: Result<Value, FfiFailure>) -> *mut c_char {
    let response = match result {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(error) => json!({
            "ok": false,
            "error": { "code": error.code, "message": error.message },
        }),
    };
    let serialized = serde_json::to_string(&response).unwrap_or_else(|_| {
        "{\"ok\":false,\"error\":{\"code\":\"internal\",\"message\":\"无法编码原生响应。\"}}"
            .to_owned()
    });
    CString::new(serialized)
        .expect("JSON cannot contain NUL")
        .into_raw()
}

#[cfg(test)]
mod tests {
    use std::{
        ffi::{CStr, CString},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::*;

    fn call(request: Value) -> Value {
        let input = CString::new(request.to_string()).expect("request has no NUL");
        let pointer = unsafe { openwrt_ffi_call_json(input.as_ptr()) };
        let text = unsafe { CStr::from_ptr(pointer) }
            .to_str()
            .expect("response is UTF-8")
            .to_owned();
        unsafe { openwrt_ffi_string_free(pointer) };
        serde_json::from_str(&text).expect("response is JSON")
    }

    #[test]
    fn normalizes_router_endpoint_in_rust() {
        let response = call(json!({
            "action": "normalize_endpoint",
            "payload": { "baseUrl": "https://router.example/luci/" },
        }));
        assert_eq!(response["ok"], true);
        assert_eq!(
            response["value"]["endpoint"],
            "https://router.example/luci/ubus"
        );
    }

    #[test]
    fn profile_storage_never_requires_a_password_field() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("openwrt-ffi-{suffix}.json"));
        let response = call(json!({
            "action": "profile.upsert",
            "payload": {
                "storagePath": path,
                "profile": {
                    "id": "router-1",
                    "name": "主路由",
                    "baseUrl": "http://192.168.1.1",
                    "username": "root",
                    "sshPort": 22,
                },
            },
        }));
        assert_eq!(response["ok"], true);
        assert_eq!(response["value"]["profiles"][0]["name"], "主路由");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn missing_luci_password_is_a_real_input_error_not_preview_data() {
        let response = call(json!({
            "action": "status.fetch",
            "payload": {
                "connection": {
                    "profile": {
                        "id": "router-1",
                        "name": "主路由",
                        "baseUrl": "http://192.168.1.1",
                        "username": "root",
                        "sshPort": 22,
                    },
                    "luciPassword": "",
                },
            },
        }));
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "invalid_input");
    }

    #[test]
    fn firmware_policy_remains_typed_and_snapshot_gated() {
        let response = call(json!({
            "action": "operation.policy",
            "payload": { "operation": "upgrade_firmware" },
        }));
        assert_eq!(response["ok"], true);
        assert_eq!(response["value"]["confirmation"], "typed");
        assert_eq!(response["value"]["requiresSnapshot"], true);
    }
}
