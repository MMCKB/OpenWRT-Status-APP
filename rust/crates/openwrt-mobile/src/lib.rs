//! Dioxus 驱动的 Rust-first 移动界面。
//!
//! Android 打包层只负责启动 Activity 与资源；所有界面状态、路由、主题和
//! OpenWrt 领域模型都保留在 Rust 中。平台插件能力在独立适配层接入。

use std::time::Duration as StdDuration;

use dioxus::prelude::*;
use openwrt_core::{
    InterfaceTrafficRate, InterfaceTrafficTracker, LuCiClient, RouterProfile, RouterStatus,
};
use tokio::time::sleep;

#[derive(Clone, Copy, PartialEq, Eq)]
enum ThemePreference {
    System,
    Light,
    Dark,
}

impl ThemePreference {
    const fn label(self) -> &'static str {
        match self {
            Self::System => "跟随系统",
            Self::Light => "浅色",
            Self::Dark => "深色",
        }
    }

    const fn css_class(self) -> &'static str {
        match self {
            Self::System => "theme-system",
            Self::Light => "theme-light",
            Self::Dark => "theme-dark",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab {
    Status,
    Routers,
    Services,
    Tools,
    Settings,
}

impl Tab {
    const fn label(self) -> &'static str {
        match self {
            Self::Status => "状态",
            Self::Routers => "路由器",
            Self::Services => "服务",
            Self::Tools => "工具",
            Self::Settings => "设置",
        }
    }
}

/// 仅驻留在内存中的连接草稿。
///
/// `password` 永远不会进入 `RouterProfileStore`；后续 Android 安全存储适配层只会
/// 处理显式确认需要记住的凭据。
#[derive(Clone, PartialEq, Eq)]
struct ConnectionDraft {
    profile: RouterProfile,
    password: String,
}

impl Default for ConnectionDraft {
    fn default() -> Self {
        Self {
            profile: RouterProfile {
                id: "router-main".to_owned(),
                name: "我的 OpenWrt".to_owned(),
                base_url: "http://192.168.1.1".to_owned(),
                username: "root".to_owned(),
                ssh_port: 22,
            },
            password: String::new(),
        }
    }
}

#[component]
pub fn App() -> Element {
    let mut selected_tab = use_signal(|| Tab::Status);
    let theme = use_signal(|| ThemePreference::System);
    let draft = use_signal(ConnectionDraft::default);
    let active_connection = use_signal(ConnectionDraft::default);
    let theme_class = theme().css_class();

    // 该资源只依赖已提交的连接资料。用户在表单中输入密码或地址时不会反复拉取，
    // 从而避免轮询造成整个页面不断重播动画。显式连接或刷新才会重新请求路由器。
    let mut router_status = use_resource(move || {
        let connection = active_connection();
        async move { fetch_router_status(connection).await }
    });
    let status_snapshot = router_status();
    let active_profile = active_connection().profile;
    let endpoint_text = active_profile.base_url.clone();
    let connection_state = match &status_snapshot {
        None => "正在连接路由器",
        Some(Ok(status)) if status.online => "已安全连接",
        Some(Ok(_)) => "路由器离线",
        Some(Err(_)) => "需要连接资料",
    };

    rsx! {
        style { {APP_STYLES} }
        main { class: "app {theme_class}",
            header { class: "top-bar",
                div {
                    p { class: "eyebrow", "当前路由器" }
                    h1 { "{active_profile.name}" }
                    p { class: "endpoint", "{endpoint_text} · {connection_state}" }
                }
                button {
                    class: "refresh-button",
                    aria_label: "刷新路由器状态",
                    onclick: move |_| router_status.restart(),
                    if status_snapshot.is_none() { "连接中" } else { "刷新" }
                }
            }
            section { class: "content",
                match selected_tab() {
                    Tab::Status => rsx! {
                        StatusDashboard {
                            status: status_snapshot.clone(),
                            active_connection,
                        }
                    },
                    Tab::Routers => rsx! {
                        RouterList {
                            draft,
                            active_connection,
                            on_connect: move |_| router_status.restart(),
                        }
                    },
                    Tab::Services => rsx! { ServicesPanel {} },
                    Tab::Tools => rsx! { ToolsPanel {} },
                    Tab::Settings => rsx! { SettingsPanel { theme } },
                }
            }
            nav { class: "tab-bar",
                for tab in [Tab::Status, Tab::Routers, Tab::Services, Tab::Tools, Tab::Settings] {
                    button {
                        class: if selected_tab() == tab { "tab selected" } else { "tab" },
                        onclick: move |_| selected_tab.set(tab),
                        {tab.label()}
                    }
                }
            }
        }
    }
}

async fn fetch_router_status(connection: ConnectionDraft) -> Result<RouterStatus, String> {
    if connection.password.trim().is_empty() {
        return Err("请输入 LuCI 密码后再连接。密码仅保留在当前运行内存中。".to_owned());
    }
    let client = LuCiClient::new(
        &connection.profile.base_url,
        &connection.profile.username,
        &connection.password,
    )
    .map_err(|error| error.to_string())?;
    client
        .fetch_status(connection.profile.id)
        .await
        .map_err(|error| error.to_string())
}

#[component]
fn StatusDashboard(
    status: Option<Result<RouterStatus, String>>,
    active_connection: Signal<ConnectionDraft>,
) -> Element {
    let Some(result) = status else {
        return rsx! {
            section { class: "section-card state-card",
                h2 { "正在获取状态" }
                p { "正在建立 LuCI/ubus 会话。首次请求不会重复触发卡片动画。" }
            }
        };
    };
    let status = match result {
        Ok(status) => status,
        Err(error) => {
            return rsx! {
                section { class: "section-card state-card error-state",
                    h2 { "尚未连接到路由器" }
                    p { "{error}" }
                    p { "请在“路由器”页填写 LuCI 地址、用户名和密码，然后选择“使用此连接”。" }
                }
            };
        }
    };

    let online_label = if status.online { "在线" } else { "离线" };
    let online_class = if status.online { "online" } else { "offline" };
    let host_label = status
        .system
        .hostname
        .clone()
        .unwrap_or_else(|| "OpenWrt 路由器".to_owned());
    let model_label = status
        .system
        .model
        .clone()
        .or(status.system.firmware.clone())
        .unwrap_or_else(|| "LuCI/ubus 已返回状态".to_owned());
    let uptime_label = status
        .system
        .uptime_seconds
        .map(format_duration)
        .unwrap_or_else(|| "未报告".to_owned());
    let load_label = status
        .system
        .load_1
        .map(|value| format!("{value:.2}"))
        .unwrap_or_else(|| "—".to_owned());
    let load_detail = match (status.system.load_5, status.system.load_15) {
        (Some(load_5), Some(load_15)) => format!("5 分钟 {load_5:.2} · 15 分钟 {load_15:.2}"),
        _ => "LuCI system.info".to_owned(),
    };
    let memory_ratio = status.system.memory_used_ratio();
    let memory_label = memory_ratio
        .map(format_ratio)
        .unwrap_or_else(|| "—".to_owned());
    let memory_detail = match (
        status.system.memory_available_bytes,
        status.system.memory_total_bytes,
    ) {
        (Some(available), Some(total)) => {
            format!("{} / {} 可用", format_bytes(available), format_bytes(total))
        }
        _ => "路由器未报告内存".to_owned(),
    };
    let temperature_label = status
        .system
        .cpu_temperature_celsius
        .map(|value| format!("{value:.0}°C"))
        .unwrap_or_else(|| "—".to_owned());
    let disk_ratio = status.system.disk_used_ratio();
    let disk_label = disk_ratio
        .map(format_ratio)
        .unwrap_or_else(|| "—".to_owned());
    let disk_detail = match (
        status.system.disk_available_bytes,
        status.system.disk_total_bytes,
    ) {
        (Some(available), Some(total)) => {
            format!("{} / {} 可用", format_bytes(available), format_bytes(total))
        }
        _ => "路由器未报告磁盘".to_owned(),
    };
    let interface_count = status.interfaces.len();
    let fetched_at = status.fetched_at.format("%H:%M:%S").to_string();

    rsx! {
        article { class: "hero-card",
            div { class: "status-dot {online_class}" }
            div {
                strong { "{online_label}" }
                p { "{host_label} · {model_label}" }
            }
            span { class: "refresh-hint", "更新于 {fetched_at}" }
        }
        section { class: "traffic-card",
            h2 { "接口流量计数" }
            p { class: "section-note", "已绑定 LuCI 设备计数器。秒级速率仅更新此卡片，不触发全页重绘或重播状态动画。" }
            RealtimeTrafficCard { active_connection }
            div { class: "traffic-grid",
                Metric {
                    label: "接口数",
                    value: interface_count.to_string(),
                    detail: "来自 network.interface.dump".to_owned(),
                    progress: (interface_count as f32 / 8.0).min(1.0),
                }
                Metric {
                    label: "运行时间",
                    value: uptime_label,
                    detail: "system.info".to_owned(),
                    progress: 0.0,
                }
            }
        }
        section { class: "metric-grid",
            Metric { label: "CPU 负载", value: load_label, detail: load_detail, progress: status.system.load_1.unwrap_or_default() / 4.0 }
            Metric { label: "内存", value: memory_label, detail: memory_detail, progress: memory_ratio.unwrap_or_default() }
            Metric { label: "温度", value: temperature_label, detail: "硬件传感器待接入".to_owned(), progress: 0.0 }
            Metric { label: "磁盘", value: disk_label, detail: disk_detail, progress: disk_ratio.unwrap_or_default() }
        }
        section { class: "section-card",
            h2 { "网络接口" }
            if status.interfaces.is_empty() {
                p { "路由器未报告接口；请确认账户拥有 network.interface 的 LuCI 权限。" }
            } else {
                for interface in status.interfaces.iter().take(12) {
                    InterfaceRow {
                        name: interface.name.clone(),
                        address: interface.ipv4.first().cloned().or_else(|| interface.ipv6.first().cloned()).unwrap_or_else(|| interface.device.clone().unwrap_or_else(|| "未分配地址".to_owned())),
                        status: if interface.up { "已连接".to_owned() } else { "未连接".to_owned() },
                        online: interface.up,
                    }
                }
            }
        }
        if !status.warnings.is_empty() {
            section { class: "section-card warning-card",
                h2 { "状态提示" }
                for warning in &status.warnings {
                    p { "{warning}" }
                }
            }
        }
    }
}

#[component]
fn RealtimeTrafficCard(active_connection: Signal<ConnectionDraft>) -> Element {
    let mut traffic_rates = use_signal(Vec::<InterfaceTrafficRate>::new);
    let mut polling_state = use_signal(|| "等待 LuCI 连接".to_owned());

    // 此 future 仅属于该卡片。Dioxus 仅在 `traffic_rates` 发生变化时重渲染卡片，
    // 因此主状态资源不会因两秒采样而重新创建或触发首次加载动画。
    let _traffic_poller = use_future(move || {
        let active_connection = active_connection;
        async move {
            let mut tracker = InterfaceTrafficTracker::new(60);
            loop {
                let connection = active_connection();
                if connection.password.trim().is_empty() {
                    traffic_rates.set(Vec::new());
                    polling_state.set("填写 LuCI 密码后开始实时采样".to_owned());
                } else {
                    match fetch_router_status(connection).await {
                        Ok(status) if status.online => {
                            let rates = tracker.ingest(&status.interfaces, status.fetched_at);
                            if !rates.is_empty() {
                                traffic_rates.set(rates);
                                polling_state.set("每 2 秒更新一次".to_owned());
                            } else {
                                polling_state.set("正在建立接口流量基线".to_owned());
                            }
                        }
                        Ok(_) => {
                            traffic_rates.set(Vec::new());
                            polling_state.set("路由器离线，已暂停速率显示".to_owned());
                        }
                        Err(_) => {
                            traffic_rates.set(Vec::new());
                            polling_state.set("实时采样连接失败，将自动重试".to_owned());
                        }
                    }
                }
                sleep(StdDuration::from_secs(2)).await;
            }
        }
    });

    let rates = traffic_rates();
    let state = polling_state();
    rsx! {
        div { class: "realtime-traffic",
            p { class: "traffic-state", "{state}" }
            if rates.is_empty() {
                p { class: "traffic-empty", "首个有效样本只建立基线；下一次采样后显示下载与上传速率。" }
            } else {
                for rate in rates.iter().take(6) {
                    div { class: "traffic-rate-row",
                        strong { "{rate.interface_name}" }
                        span { "↓ {format_rate(rate.rate.rx_bytes_per_second)}" }
                        span { "↑ {format_rate(rate.rate.tx_bytes_per_second)}" }
                    }
                }
            }
        }
    }
}

#[component]
fn Metric(label: &'static str, value: String, detail: String, progress: f32) -> Element {
    let width = format!("width: {}%", (progress.clamp(0.0, 1.0) * 100.0).round());
    rsx! {
        article { class: "metric-card",
            p { class: "metric-label", "{label}" }
            strong { class: "metric-value", "{value}" }
            p { class: "metric-detail", "{detail}" }
            div { class: "progress-track", div { class: "progress-fill", style: "{width}" } }
        }
    }
}

#[component]
fn InterfaceRow(name: String, address: String, status: String, online: bool) -> Element {
    let status_class = if online { "online" } else { "offline" };
    rsx! {
        div { class: "interface-row",
            span { class: "status-dot {status_class}" }
            div { strong { "{name}" } p { "{address}" } }
            span { "{status}" }
        }
    }
}

#[component]
fn RouterList(
    draft: Signal<ConnectionDraft>,
    mut active_connection: Signal<ConnectionDraft>,
    on_connect: EventHandler<()>,
) -> Element {
    let values = draft();
    rsx! {
        section { class: "section-card",
            h2 { "当前连接资料" }
            p { class: "section-note", "档案元数据可保存为 JSON；LuCI 密码不会写入档案或日志。" }
            label { class: "field-label", "显示名称" }
            input {
                class: "text-input",
                value: "{values.profile.name}",
                oninput: move |event| draft.write().profile.name = event.value(),
            }
            label { class: "field-label", "LuCI 地址" }
            input {
                class: "text-input",
                value: "{values.profile.base_url}",
                inputmode: "url",
                oninput: move |event| draft.write().profile.base_url = event.value(),
            }
            label { class: "field-label", "用户名" }
            input {
                class: "text-input",
                value: "{values.profile.username}",
                oninput: move |event| draft.write().profile.username = event.value(),
            }
            label { class: "field-label", "LuCI 密码" }
            input {
                class: "text-input",
                r#type: "password",
                value: "{values.password}",
                autocomplete: "current-password",
                oninput: move |event| draft.write().password = event.value(),
            }
            label { class: "field-label", "SSH 端口" }
            input {
                class: "text-input",
                r#type: "number",
                min: "1",
                max: "65535",
                value: "{values.profile.ssh_port}",
                oninput: move |event| {
                    if let Ok(port) = event.value().parse::<u16>() {
                        draft.write().profile.ssh_port = port;
                    }
                },
            }
            button {
                class: "primary",
                onclick: move |_| {
                    active_connection.set(draft());
                    on_connect.call(());
                },
                "使用此连接"
            }
        }
        section { class: "section-card",
            h2 { "多路由器档案" }
            p { "核心层已提供 JSON 档案仓库，支持新增、更新、删除和版本校验；Android 应用专属目录与安全凭据适配将在平台集成阶段接入。" }
        }
    }
}

#[component]
fn ServicesPanel() -> Element {
    rsx! { section { class: "section-card", h2 { "服务健康" } p { "计划覆盖服务、Docker、DDNS、VPN、日志与配置状态。" } } }
}

#[component]
fn ToolsPanel() -> Element {
    rsx! { section { class: "section-card", h2 { "工具" } p { "计划覆盖诊断、SSH、SFTP、文件、固件、软件包、防火墙、Wake-on-LAN 与批量操作。" } } }
}

#[component]
fn SettingsPanel(theme: Signal<ThemePreference>) -> Element {
    rsx! {
        section { class: "section-card", h2 { "主题" }
            p { "当前：{theme().label()}" }
            div { class: "settings-actions",
                for option in [ThemePreference::System, ThemePreference::Light, ThemePreference::Dark] {
                    button { onclick: move |_| theme.set(option), "{option.label()}" }
                }
            }
        }
    }
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit_index = 0;
    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }
    if unit_index == 0 {
        format!("{bytes} {}", UNITS[unit_index])
    } else {
        format!("{value:.1} {}", UNITS[unit_index])
    }
}

fn format_rate(bytes_per_second: f64) -> String {
    format!(
        "{}/s",
        format_bytes(bytes_per_second.max(0.0).round() as u64)
    )
}

fn format_ratio(ratio: f32) -> String {
    format!("{:.0}%", (ratio.clamp(0.0, 1.0) * 100.0).round())
}

fn format_duration(seconds: u64) -> String {
    let days = seconds / 86_400;
    let hours = (seconds % 86_400) / 3_600;
    let minutes = (seconds % 3_600) / 60;
    if days > 0 {
        format!("{days} 天 {hours} 小时")
    } else if hours > 0 {
        format!("{hours} 小时 {minutes} 分")
    } else {
        format!("{minutes} 分")
    }
}

const APP_STYLES: &str = r#"
:root { font-family: sans-serif; }
* { box-sizing: border-box; }
.app { min-height: 100vh; padding: 20px 16px 84px; background: #f5f8fa; color: #13212b; }
.theme-dark { background: #0a0f14; color: #e8f1f5; }
.top-bar, .tab-bar, .traffic-grid, .metric-grid, .interface-row, .settings-actions { display: flex; }
.top-bar { align-items: center; justify-content: space-between; gap: 16px; }
.eyebrow, .endpoint, .metric-detail, .interface-row p, .section-note { margin: 0; color: #6b7c93; font-size: 12px; }
h1 { margin: 4px 0; font-size: 28px; } h2 { margin: 0 0 12px; font-size: 18px; }
.content { display: grid; gap: 16px; margin-top: 20px; }
.hero-card, .traffic-card, .metric-card, .section-card { border: 1px solid #d9e5ea; border-radius: 18px; background: #fff; padding: 16px; }
.hero-card, .interface-row { display: flex; align-items: center; gap: 10px; }.hero-card p { margin: 3px 0 0; color: #6b7c93; font-size: 12px; }
.refresh-hint { margin-left: auto; color: #6b7c93; font-size: 12px; }.section-note { margin: -6px 0 14px; line-height: 1.45; }
.status-dot { width: 9px; height: 9px; border-radius: 99px; flex: none; }.online { background: #1b9a6a; }.offline { background: #c74444; }
.realtime-traffic { display: grid; gap: 8px; margin-bottom: 14px; }.traffic-state, .traffic-empty { margin: 0; color: #6b7c93; font-size: 12px; }.traffic-rate-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 0; border-top: 1px solid #e7eef2; font-size: 13px; }.traffic-rate-row span { color: #007e7a; font-variant-numeric: tabular-nums; }.traffic-grid, .metric-grid { gap: 10px; }.traffic-grid > *, .metric-grid > * { flex: 1; min-width: 0; }
.metric-grid { flex-wrap: wrap; }.metric-grid > * { min-width: calc(50% - 5px); }
.metric-label { margin: 0; color: #6b7c93; font-size: 12px; }.metric-value { display: block; margin-top: 6px; font-size: 19px; }
.progress-track { height: 4px; margin-top: 10px; overflow: hidden; border-radius: 8px; background: #e7eef2; }.progress-fill { height: 100%; border-radius: inherit; background: #007e7a; transition: width 220ms ease; }
.interface-row { padding: 12px 0; border-top: 1px solid #e7eef2; }.interface-row > div { flex: 1; }.interface-row strong { display: block; }
.tab-bar { position: fixed; right: 0; bottom: 0; left: 0; justify-content: space-around; padding: 10px; border-top: 1px solid #d9e5ea; background: #fff; }.tab, .refresh-button, .primary, .settings-actions button { border: 0; border-radius: 12px; padding: 10px 12px; background: transparent; color: inherit; }.tab.selected, .primary { background: #007e7a; color: white; }.refresh-button { background: #e6f5f4; color: #005f5c; }
.field-label { display: block; margin: 14px 0 6px; color: #5d6e82; font-size: 13px; font-weight: 600; }.text-input { width: 100%; border: 1px solid #ccdbe3; border-radius: 10px; padding: 10px 12px; background: transparent; color: inherit; font: inherit; }.primary { display: inline-block; margin-top: 16px; }.state-card p, .warning-card p { line-height: 1.45; }.error-state { border-color: #c74444; }
.theme-dark .hero-card, .theme-dark .traffic-card, .theme-dark .metric-card, .theme-dark .section-card, .theme-dark .tab-bar { background: #13212b; border-color: #294a60; }.theme-dark .metric-label, .theme-dark .metric-detail, .theme-dark .endpoint, .theme-dark .eyebrow, .theme-dark .interface-row p, .theme-dark .section-note, .theme-dark .traffic-state, .theme-dark .traffic-empty { color: #afc2d1; }.theme-dark .text-input { border-color: #466475; }
"#;
