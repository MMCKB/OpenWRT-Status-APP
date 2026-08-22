//! Flutter 的受限 Rust 原生库入口。
//!
//! 初始 ABI 只暴露无所有权转移的静态 UTF-8 JSON 指针，避免 Dart 端处理 Rust
//! 分配内存或绕过领域安全规则。后续字符串输入 API 必须继续采用 JSON 且接受独立
//! 审计，而不得暴露原始 SSH 命令执行入口。

use std::ffi::{CStr, c_char};

use openwrt_core::{ConfirmationLevel, RouterOperation};

const VERSION_JSON: &CStr = c"{\"version\":\"0.1.0\",\"ui\":\"flutter\",\"core\":\"rust\"}";
const DASHBOARD_PREVIEW_JSON: &CStr = c"{\"source\":\"preview\",\"routerName\":\"OpenWrt 主路由\",\"endpoint\":\"http://192.168.1.1/luci\",\"online\":true,\"hostname\":\"OpenWrt\",\"model\":\"x86_64 · 6.6.93\",\"uptime\":\"12 天 04 时\",\"load\":\"0.13\",\"memory\":\"48% 已用\",\"firmware\":\"23.05.5\",\"interfaces\":[{\"name\":\"br-lan\",\"address\":\"IPv4 192.168.1.1 · IPv6 fd00::1\",\"connected\":true},{\"name\":\"wan\",\"address\":\"IPv4 100.64.0.2 · IPv6 —\",\"connected\":true},{\"name\":\"wwan\",\"address\":\"IPv4 未分配 · IPv6 —\",\"connected\":false}],\"traffic\":[{\"name\":\"br-lan\",\"down\":\"1.82 MB/s\",\"up\":\"420 KB/s\"},{\"name\":\"wan\",\"down\":\"842 KB/s\",\"up\":\"113 KB/s\"}]}";
const POLICY_NONE_JSON: &CStr = c"{\"confirmation\":\"none\",\"requiresSnapshot\":false}";
const POLICY_CONFIRM_JSON: &CStr = c"{\"confirmation\":\"single\",\"requiresSnapshot\":false}";
const POLICY_TYPED_JSON: &CStr = c"{\"confirmation\":\"typed\",\"requiresSnapshot\":false}";
const POLICY_TYPED_SNAPSHOT_JSON: &CStr = c"{\"confirmation\":\"typed\",\"requiresSnapshot\":true}";
const POLICY_INVALID_JSON: &CStr = c"{\"error\":\"未知或不允许的操作\"}";

/// ABI 版本和 UI/核心架构标识。
#[unsafe(no_mangle)]
pub extern "C" fn openwrt_ffi_version_json() -> *const c_char {
    nul_terminated(VERSION_JSON)
}

/// Flutter 启动阶段的离线预览模型。
///
/// 真正的 LuCI 拉取仍将在 Rust 中完成；该端点让 Flutter 先验证动态库加载、JSON
/// 解码与默认分支一致的首页布局，而不将任何密码或请求细节传给 Dart。
#[unsafe(no_mangle)]
pub extern "C" fn openwrt_ffi_dashboard_preview_json() -> *const c_char {
    nul_terminated(DASHBOARD_PREVIEW_JSON)
}

/// 返回操作确认约束。`operation_code` 仅是 Flutter UI 的固定映射，真正执行前仍由
/// Rust `OperationApproval::validate()` 复验。
#[unsafe(no_mangle)]
pub extern "C" fn openwrt_ffi_operation_policy_json(operation_code: u32) -> *const c_char {
    let operation = match operation_code {
        0 => Some(RouterOperation::ReadStatus),
        1 => Some(RouterOperation::RunDiagnostics),
        2 => Some(RouterOperation::ExecuteTerminal),
        3 => Some(RouterOperation::SendWakeOnLan),
        4 => Some(RouterOperation::RestartService),
        5 => Some(RouterOperation::ApplyWireless),
        6 => Some(RouterOperation::ApplyFirewall),
        7 => Some(RouterOperation::InstallPackage),
        8 => Some(RouterOperation::DeleteFile),
        9 => Some(RouterOperation::UpgradeFirmware),
        _ => None,
    };
    let Some(operation) = operation else {
        return nul_terminated(POLICY_INVALID_JSON);
    };
    let json = match (
        operation.confirmation_level(),
        operation.requires_snapshot(),
    ) {
        (ConfirmationLevel::None, false) => POLICY_NONE_JSON,
        (ConfirmationLevel::SingleConfirm, false) => POLICY_CONFIRM_JSON,
        (ConfirmationLevel::TypedConfirm, false) => POLICY_TYPED_JSON,
        (ConfirmationLevel::TypedConfirm, true) => POLICY_TYPED_SNAPSHOT_JSON,
        _ => POLICY_INVALID_JSON,
    };
    nul_terminated(json)
}

fn nul_terminated(value: &'static CStr) -> *const c_char {
    // C 字符串字面量由编译器保证以 \0 结尾；返回的静态指针无需 Dart 释放。
    value.as_ptr()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policies_keep_firmware_behind_typed_snapshot_gate() {
        let policy = openwrt_ffi_operation_policy_json(9);
        assert_eq!(policy, nul_terminated(POLICY_TYPED_SNAPSHOT_JSON));
    }

    #[test]
    fn unknown_operation_is_not_silently_approved() {
        let policy = openwrt_ffi_operation_policy_json(999);
        assert_eq!(policy, nul_terminated(POLICY_INVALID_JSON));
    }

    #[test]
    fn exported_dashboard_is_valid_utf8_preview_json() {
        let pointer = openwrt_ffi_dashboard_preview_json();
        let json = unsafe { CStr::from_ptr(pointer) }
            .to_str()
            .expect("FFI JSON must be valid UTF-8");
        assert!(json.contains("\"source\":\"preview\""));
        assert!(json.contains("\"traffic\""));
    }
}
