//! Dioxus 驱动的 Rust-first 移动界面。
//!
//! Android 打包层只负责启动 Activity 与资源；所有界面状态、路由、主题和
//! OpenWrt 领域模型都保留在 Rust 中。平台插件能力在独立适配层接入。

use dioxus::prelude::*;

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

#[component]
pub fn App() -> Element {
    let mut selected_tab = use_signal(|| Tab::Status);
    let theme = use_signal(|| ThemePreference::System);
    let mut is_refreshing = use_signal(|| false);
    let theme_class = theme().css_class();

    rsx! {
        style { {APP_STYLES} }
        main { class: "app {theme_class}",
            header { class: "top-bar",
                div {
                    p { class: "eyebrow", "当前路由器" }
                    h1 { "OpenWrt 状态" }
                    p { class: "endpoint", "192.168.1.1 · 安全连接待确认" }
                }
                button {
                    class: "refresh-button",
                    aria_label: "刷新路由器状态",
                    onclick: move |_| is_refreshing.set(!is_refreshing()),
                    if is_refreshing() { "刷新中" } else { "刷新" }
                }
            }
            section { class: "content",
                match selected_tab() {
                    Tab::Status => rsx! { StatusDashboard { refreshing: is_refreshing() } },
                    Tab::Routers => rsx! { RouterList {} },
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

#[component]
fn StatusDashboard(refreshing: bool) -> Element {
    let refresh_status = if refreshing {
        "正在刷新接口与系统状态"
    } else {
        "上次刷新：刚刚"
    };
    rsx! {
        article { class: "hero-card",
            div { class: "status-dot online" }
            div {
                strong { "在线" }
                p { "OpenWrt 路由器 · 主 WAN 接口可用" }
            }
            span { class: "refresh-hint", "{refresh_status}" }
        }
        section { class: "traffic-card",
            h2 { "实时流量" }
            div { class: "traffic-grid",
                Metric { label: "下载", value: "12.4 MB/s", detail: "WAN · 每秒采样", progress: 0.62_f32 }
                Metric { label: "上传", value: "1.8 MB/s", detail: "WAN · 每秒采样", progress: 0.28_f32 }
            }
        }
        section { class: "metric-grid",
            Metric { label: "CPU", value: "24%", detail: "负载正常", progress: 0.24_f32 }
            Metric { label: "内存", value: "48%", detail: "512 MB 可用", progress: 0.48_f32 }
            Metric { label: "温度", value: "51°C", detail: "正常范围", progress: 0.51_f32 }
            Metric { label: "磁盘", value: "36%", detail: "7.8 GB 可用", progress: 0.36_f32 }
        }
        section { class: "section-card",
            h2 { "网络接口" }
            InterfaceRow { name: "wan", address: "IPv4 203.0.113.2", status: "已连接" }
            InterfaceRow { name: "br-lan", address: "IPv4 192.168.1.1", status: "已连接" }
        }
    }
}

#[component]
fn Metric(
    label: &'static str,
    value: &'static str,
    detail: &'static str,
    progress: f32,
) -> Element {
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
fn InterfaceRow(name: &'static str, address: &'static str, status: &'static str) -> Element {
    rsx! { div { class: "interface-row", span { class: "status-dot online" }, div { strong { "{name}" } p { "{address}" } }, span { "{status}" } } }
}

#[component]
fn RouterList() -> Element {
    rsx! {
        section { class: "section-card", h2 { "路由器资料" }
            p { "纯 Rust 数据层将保存路由器资料、SSH 指纹、状态与配置快照。" }
            button { class: "primary", "添加路由器" }
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

const APP_STYLES: &str = r#"
:root { font-family: sans-serif; }
* { box-sizing: border-box; }
.app { min-height: 100vh; padding: 20px 16px 84px; background: #f5f8fa; color: #13212b; }
.theme-dark { background: #0a0f14; color: #e8f1f5; }
.top-bar, .tab-bar, .traffic-grid, .metric-grid, .interface-row, .settings-actions { display: flex; }
.top-bar { align-items: center; justify-content: space-between; gap: 16px; }
.eyebrow, .endpoint, .metric-detail, .interface-row p { margin: 0; color: #6b7c93; font-size: 12px; }
h1 { margin: 4px 0; font-size: 28px; } h2 { margin: 0 0 12px; font-size: 18px; }
.content { display: grid; gap: 16px; margin-top: 20px; }
.hero-card, .traffic-card, .metric-card, .section-card { border: 1px solid #d9e5ea; border-radius: 18px; background: #fff; padding: 16px; }
.hero-card, .interface-row { display: flex; align-items: center; gap: 10px; }
.refresh-hint { margin-left: auto; color: #6b7c93; font-size: 12px; }
.status-dot { width: 9px; height: 9px; border-radius: 99px; flex: none; }.online { background: #1b9a6a; }
.traffic-grid, .metric-grid { gap: 10px; }.traffic-grid > *, .metric-grid > * { flex: 1; min-width: 0; }
.metric-grid { flex-wrap: wrap; }.metric-grid > * { min-width: calc(50% - 5px); }
.metric-label { margin: 0; color: #6b7c93; font-size: 12px; }.metric-value { display: block; margin-top: 6px; font-size: 19px; }
.progress-track { height: 4px; margin-top: 10px; overflow: hidden; border-radius: 8px; background: #e7eef2; }.progress-fill { height: 100%; border-radius: inherit; background: #007e7a; transition: width 220ms ease; }
.interface-row { padding: 12px 0; border-top: 1px solid #e7eef2; }.interface-row > div { flex: 1; }.interface-row strong { display: block; }
.tab-bar { position: fixed; right: 0; bottom: 0; left: 0; justify-content: space-around; padding: 10px; border-top: 1px solid #d9e5ea; background: #fff; }.tab, .refresh-button, .primary, .settings-actions button { border: 0; border-radius: 12px; padding: 10px 12px; background: transparent; color: inherit; }.tab.selected, .primary { background: #007e7a; color: white; }.refresh-button { background: #e6f5f4; color: #005f5c; }
.theme-dark .hero-card, .theme-dark .traffic-card, .theme-dark .metric-card, .theme-dark .section-card, .theme-dark .tab-bar { background: #13212b; border-color: #294a60; }.theme-dark .metric-label, .theme-dark .metric-detail, .theme-dark .endpoint, .theme-dark .eyebrow, .theme-dark .interface-row p { color: #afc2d1; }
"#;
