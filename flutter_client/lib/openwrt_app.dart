import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import 'rust_bridge.dart';

enum AppThemeMode { system, light, dark }

class OpenWrtStatusApp extends StatefulWidget {
  const OpenWrtStatusApp({super.key});

  @override
  State<OpenWrtStatusApp> createState() => _OpenWrtStatusAppState();
}

class _OpenWrtStatusAppState extends State<OpenWrtStatusApp> {
  AppThemeMode _themeMode = AppThemeMode.system;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'OpenWrt 状态',
    debugShowCheckedModeBanner: false,
    themeMode: switch (_themeMode) {
      AppThemeMode.system => ThemeMode.system,
      AppThemeMode.light => ThemeMode.light,
      AppThemeMode.dark => ThemeMode.dark,
    },
    theme: appTheme(Brightness.light),
    darkTheme: appTheme(Brightness.dark),
    home: RootShell(
      themeMode: _themeMode,
      onThemeChanged: (value) => setState(() => _themeMode = value),
    ),
  );
}

ThemeData appTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  const primary = Color(0xFF007E7A);
  final scheme = ColorScheme(
    brightness: brightness,
    primary: primary,
    onPrimary: Colors.white,
    secondary: const Color(0xFF3E6780),
    onSecondary: Colors.white,
    error: const Color(0xFFC74444),
    onError: Colors.white,
    surface: dark ? const Color(0xFF13212B) : Colors.white,
    onSurface: dark ? const Color(0xFFF0F7FA) : const Color(0xFF18242D),
  );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark
        ? const Color(0xFF0D171E)
        : const Color(0xFFF5F8FA),
    dividerColor: dark ? const Color(0xFF294A60) : const Color(0xFFD9E5EA),
    navigationBarTheme: NavigationBarThemeData(
      height: 72,
      backgroundColor: scheme.surface,
      indicatorColor: dark ? const Color(0xFF174C4A) : const Color(0xFFE6F5F4),
    ),
  );
}

class RootShell extends StatefulWidget {
  const RootShell({
    required this.themeMode,
    required this.onThemeChanged,
    super.key,
  });
  final AppThemeMode themeMode;
  final ValueChanged<AppThemeMode> onThemeChanged;

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      StatusScreen(onOpenRouters: () => setState(() => _tab = 1)),
      const RoutersScreen(),
      const ControlScreen(),
      const ServicesScreen(),
      const ToolsScreen(),
      SettingsScreen(
        current: widget.themeMode,
        onChanged: widget.onThemeChanged,
      ),
    ];
    return PopScope(
      canPop: _tab == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _tab != 0) setState(() => _tab = 0);
      },
      child: Scaffold(
        body: SafeArea(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            child: KeyedSubtree(key: ValueKey(_tab), child: pages[_tab]),
          ),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (value) => setState(() => _tab = value),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard),
              label: '状态',
            ),
            NavigationDestination(
              icon: Icon(Icons.router_outlined),
              selectedIcon: Icon(Icons.router),
              label: '路由器',
            ),
            NavigationDestination(
              icon: Icon(Icons.tune_outlined),
              selectedIcon: Icon(Icons.tune),
              label: '控制',
            ),
            NavigationDestination(
              icon: Icon(Icons.monitor_heart_outlined),
              selectedIcon: Icon(Icons.monitor_heart),
              label: '服务',
            ),
            NavigationDestination(
              icon: Icon(Icons.handyman_outlined),
              selectedIcon: Icon(Icons.handyman),
              label: '工具',
            ),
            NavigationDestination(
              icon: Icon(Icons.settings_outlined),
              selectedIcon: Icon(Icons.settings),
              label: '设置',
            ),
          ],
        ),
      ),
    );
  }
}

class StatusScreen extends StatefulWidget {
  const StatusScreen({required this.onOpenRouters, super.key});
  final VoidCallback onOpenRouters;

  @override
  State<StatusScreen> createState() => _StatusScreenState();
}

class _StatusScreenState extends State<StatusScreen> {
  final RustNativeBridge? _rust = RustNativeBridge.tryLoad();
  DateTime _updatedAt = DateTime.now();
  bool _refreshing = false;

  DashboardPreview get _dashboard {
    final rust = _rust;
    if (rust == null) return DashboardPreview.fallback;
    try {
      return DashboardPreview.fromJson(
        jsonDecode(rust.dashboardPreviewJson) as Map<String, dynamic>,
      );
    } on FormatException {
      return DashboardPreview.fallback;
    }
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (mounted) {
      setState(() {
        _updatedAt = DateTime.now();
        _refreshing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final softPrimary = dark
        ? const Color(0xFF1C485C)
        : const Color(0xFFE6F5F4);
    final rustLoaded = _rust != null;
    final rustVersion = _rust?.versionJson;
    final dashboard = _dashboard;
    return RefreshIndicator(
      onRefresh: _refresh,
      color: colors.primary,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '当前路由器',
                      style: TextStyle(
                        color: muted(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: .4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dashboard.routerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.onSurface,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dashboard.endpoint,
                      style: TextStyle(color: muted(context), fontSize: 13),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Column(
                children: [
                  IconButton.filledTonal(
                    tooltip: '刷新状态',
                    onPressed: _refresh,
                    style: IconButton.styleFrom(
                      backgroundColor: softPrimary,
                      foregroundColor: colors.primary,
                      minimumSize: const Size(46, 46),
                    ),
                    icon: _refreshing
                        ? SizedBox(
                            width: 21,
                            height: 21,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              color: colors.primary,
                            ),
                          )
                        : const Icon(Icons.refresh_rounded),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _refreshing ? '刷新中' : '已更新',
                    style: TextStyle(
                      color: muted(context),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          AppCard(
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: softPrimary,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Icon(Icons.router, color: colors.primary, size: 29),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      StatusPill(
                        label: dashboard.isPreview
                            ? '预览数据'
                            : dashboard.online
                            ? '在线'
                            : '连接失败',
                        color: dashboard.isPreview
                            ? warning
                            : dashboard.online
                            ? success
                            : colors.error,
                      ),
                      const SizedBox(height: 7),
                      Text(
                        dashboard.hostname,
                        style: TextStyle(
                          color: colors.onSurface,
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${dashboard.model} · ${dashboard.isPreview ? 'Rust 预览' : 'Rust 原生状态'}',
                        style: TextStyle(color: muted(context), fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          TrafficCard(updatedAt: _updatedAt, traffic: dashboard.traffic),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: MetricTile(
                  icon: Icons.timer_outlined,
                  label: '运行时间',
                  value: dashboard.uptime,
                  accent: success,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: MetricTile(
                  icon: Icons.speed_outlined,
                  label: '系统负载',
                  value: dashboard.load,
                  caption: '1 / 5 / 15 分钟',
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: MetricTile(
                  icon: Icons.memory_outlined,
                  label: '内存',
                  value: dashboard.memory,
                  caption: '486 MB 可用',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: MetricTile(
                  icon: Icons.system_update_alt_outlined,
                  label: '固件',
                  value: dashboard.firmware,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          SectionCard(
            title: '网络接口',
            action: '${dashboard.interfaces.length} 个',
            child: Column(
              children: [
                for (final (index, item) in dashboard.interfaces.indexed) ...[
                  InterfaceRow(
                    name: item.name,
                    address: item.address,
                    connected: item.connected,
                  ),
                  if (index < dashboard.interfaces.length - 1)
                    const Divider(height: 1),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          SectionCard(
            title: '无线网络',
            action: '2 个',
            child: const Column(
              children: [
                WirelessRow(
                  ssid: 'OpenWrt-5G',
                  detail: 'radio0 · 信道 149',
                  clients: '6 台',
                ),
                Divider(height: 1),
                WirelessRow(
                  ssid: 'OpenWrt-2.4G',
                  detail: 'radio1 · 信道 6',
                  clients: '3 台',
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: dark ? const Color(0xFF59451F) : const Color(0xFFFFF4DD),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              rustLoaded
                  ? dashboard.isPreview
                        ? 'Rust 原生库已加载：$rustVersion。当前是离线预览载荷，尚未发起 LuCI 请求，所有状态均不可视为真实路由器状态。'
                        : 'Rust 原生库已加载：$rustVersion。状态来自已验证的 Rust 核心请求。'
                  : 'Rust 原生库尚未随当前调试运行复制到 APK；界面安全降级为预览数据，不会伪造真实路由器状态。',
              style: TextStyle(color: warning, fontSize: 13, height: 1.45),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            '上次刷新于 ${formatTime(_updatedAt)} · 支持下拉或手动刷新',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted(context), fontSize: 12),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: widget.onOpenRouters,
            icon: const Icon(Icons.router_outlined),
            label: const Text('管理路由器档案'),
          ),
        ],
      ),
    );
  }
}

class RoutersScreen extends StatelessWidget {
  const RoutersScreen({super.key});
  @override
  Widget build(BuildContext context) => AppPage(
    title: '路由器',
    subtitle: '多个路由器档案与连接状态',
    actions: [
      IconButton(onPressed: () {}, icon: const Icon(Icons.add_circle_outline)),
    ],
    children: const [
      RouterCard(
        name: 'OpenWrt 主路由',
        endpoint: 'http://192.168.1.1/luci',
        online: true,
        current: true,
      ),
      SizedBox(height: 12),
      RouterCard(
        name: '客厅 AP',
        endpoint: 'http://192.168.1.2/luci',
        online: false,
        current: false,
      ),
      SizedBox(height: 18),
      SectionCard(
        title: '安全说明',
        child: Padding(
          padding: EdgeInsets.all(14),
          child: Text('密码和私钥不会写入档案。SSH 主机指纹必须由用户明确确认后才能继续连接。'),
        ),
      ),
    ],
  );
}

class ControlScreen extends StatelessWidget {
  const ControlScreen({super.key});
  @override
  Widget build(BuildContext context) => AppPage(
    title: '控制中心',
    subtitle: '常用 OpenWrt 管理入口',
    children: const [
      ActionGrid(
        items: [
          ActionItem(Icons.wifi_outlined, '无线网络', 'SSID、客户端与信道'),
          ActionItem(Icons.security_outlined, '防火墙', '规则与端口转发'),
          ActionItem(Icons.device_hub_outlined, 'DHCP 租约', '静态租约与设备'),
          ActionItem(Icons.inventory_2_outlined, '软件包', 'opkg 安装与卸载'),
          ActionItem(Icons.folder_outlined, '文件管理', 'SFTP 浏览与传输'),
          ActionItem(Icons.system_update_outlined, '固件升级', '校验与安全门禁'),
        ],
      ),
      SizedBox(height: 18),
      SectionCard(
        title: '高风险操作',
        child: Padding(
          padding: EdgeInsets.all(14),
          child: Text('网络、无线、防火墙、固件和恢复操作均需由 Rust 核心验证快照与精确确认文本。'),
        ),
      ),
    ],
  );
}

class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key});
  @override
  Widget build(BuildContext context) => AppPage(
    title: '服务健康',
    subtitle: '服务、容器与日志状态',
    children: const [
      ServiceCard(
        icon: Icons.shield_outlined,
        name: 'OpenClash',
        description: '代理与规则服务',
        healthy: true,
      ),
      SizedBox(height: 10),
      ServiceCard(
        icon: Icons.dns_outlined,
        name: 'AdGuard Home',
        description: 'DNS 与广告过滤',
        healthy: true,
      ),
      SizedBox(height: 10),
      ServiceCard(
        icon: Icons.cloud_outlined,
        name: 'DDNS',
        description: '动态域名更新',
        healthy: false,
      ),
      SizedBox(height: 10),
      ServiceCard(
        icon: Icons.widgets_outlined,
        name: 'Docker',
        description: '容器与镜像管理',
        healthy: true,
      ),
    ],
  );
}

class ToolsScreen extends StatelessWidget {
  const ToolsScreen({super.key});
  @override
  Widget build(BuildContext context) => AppPage(
    title: '工具',
    subtitle: '诊断、维护与安全远程访问',
    children: const [
      ActionGrid(
        items: [
          ActionItem(Icons.health_and_safety_outlined, '网络诊断', 'Ping、DNS、路由'),
          ActionItem(Icons.terminal_outlined, 'SSH 终端', '显式确认后执行'),
          ActionItem(Icons.description_outlined, '系统日志', '读取与安全过滤'),
          ActionItem(Icons.bolt_outlined, 'Wake-on-LAN', '局域网设备唤醒'),
          ActionItem(Icons.groups_outlined, '批量操作', '跨路由器任务'),
          ActionItem(Icons.speed_outlined, '性能测试', '网络与磁盘基准'),
        ],
      ),
    ],
  );
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({
    required this.current,
    required this.onChanged,
    super.key,
  });
  final AppThemeMode current;
  final ValueChanged<AppThemeMode> onChanged;
  @override
  Widget build(BuildContext context) => AppPage(
    title: '设置',
    subtitle: '外观、刷新与安全偏好',
    children: [
      SectionCard(
        title: '外观',
        child: Column(
          children: [
            for (final mode in AppThemeMode.values)
              ListTile(
                onTap: () => onChanged(mode),
                leading: Icon(switch (mode) {
                  AppThemeMode.system => Icons.brightness_auto_outlined,
                  AppThemeMode.light => Icons.light_mode_outlined,
                  AppThemeMode.dark => Icons.dark_mode_outlined,
                }),
                title: Text(switch (mode) {
                  AppThemeMode.system => '跟随系统',
                  AppThemeMode.light => '浅色模式',
                  AppThemeMode.dark => '深色模式',
                }),
                trailing: Icon(
                  current == mode
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: current == mode
                      ? Theme.of(context).colorScheme.primary
                      : muted(context),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      const SectionCard(
        title: '刷新策略',
        child: ListTile(
          leading: Icon(Icons.timer_outlined),
          title: Text('状态刷新间隔'),
          subtitle: Text('当前仅支持手动刷新；后续由 Rust 偏好模型约束为 2–60 秒'),
          trailing: Text('手动'),
        ),
      ),
      const SizedBox(height: 14),
      const SectionCard(
        title: '关于',
        child: ListTile(
          leading: Icon(Icons.info_outline),
          title: Text('Flutter UI + Rust 核心'),
          subtitle: Text('Rust-Dev 重构预览'),
        ),
      ),
    ],
  );
}

class AppPage extends StatelessWidget {
  const AppPage({
    required this.title,
    required this.subtitle,
    required this.children,
    this.actions,
    super.key,
  });
  final String title;
  final String subtitle;
  final List<Widget> children;
  final List<Widget>? actions;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
    children: [
      Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: TextStyle(color: muted(context), fontSize: 13),
                ),
              ],
            ),
          ),
          ...(actions ?? const []),
        ],
      ),
      const SizedBox(height: 20),
      ...children,
    ],
  );
}

class AppCard extends StatelessWidget {
  const AppCard({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      border: Border.all(color: Theme.of(context).dividerColor),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: Padding(padding: const EdgeInsets.all(16), child: child),
    ),
  );
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    required this.title,
    required this.child,
    this.action,
    super.key,
  });
  final String title;
  final String? action;
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      border: Border.all(color: Theme.of(context).dividerColor),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 15, 16, 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (action != null)
                  Text(
                    action!,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: muted(context),
                    ),
                  ),
              ],
            ),
          ),
          child,
        ],
      ),
    ),
  );
}

class StatusPill extends StatelessWidget {
  const StatusPill({required this.label, required this.color, super.key});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .15),
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(
      label,
      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color),
    ),
  );
}

class MetricTile extends StatelessWidget {
  const MetricTile({
    required this.icon,
    required this.label,
    required this.value,
    this.caption,
    this.accent,
    super.key,
  });

  final IconData icon;
  final String label;
  final String value;
  final String? caption;
  final Color? accent;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          icon,
          color: accent ?? Theme.of(context).colorScheme.primary,
          size: 20,
        ),
        const SizedBox(height: 11),
        Text(label, style: TextStyle(color: muted(context), fontSize: 12)),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
        ),
        if (caption != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              caption!,
              style: TextStyle(fontSize: 11, color: muted(context)),
            ),
          ),
      ],
    ),
  );
}

class TrafficCard extends StatelessWidget {
  const TrafficCard({
    required this.updatedAt,
    required this.traffic,
    super.key,
  });
  final DateTime updatedAt;
  final List<TrafficPreview> traffic;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              Icons.insights_outlined,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            const Text(
              '实时流量',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const Spacer(),
            Text('按需刷新', style: TextStyle(fontSize: 11, color: muted(context))),
          ],
        ),
        const SizedBox(height: 14),
        if (traffic.isEmpty)
          Text('尚无可显示的流量采样。', style: TextStyle(color: muted(context)))
        else
          for (final (index, item) in traffic.indexed) ...[
            TrafficRow(name: item.name, down: item.down, up: item.up),
            if (index < traffic.length - 1) const Divider(height: 20),
          ],
        const SizedBox(height: 4),
        Text(
          '刷新时间 ${formatTime(updatedAt)} · 仅在用户刷新后更新',
          style: TextStyle(color: muted(context), fontSize: 11),
        ),
      ],
    ),
  );
}

class TrafficRow extends StatelessWidget {
  const TrafficRow({
    required this.name,
    required this.down,
    required this.up,
    super.key,
  });
  final String name;
  final String down;
  final String up;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      Text(
        '↓ $down',
        style: TextStyle(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
      ),
      const SizedBox(width: 12),
      Text(
        '↑ $up',
        style: TextStyle(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
      ),
    ],
  );
}

class InterfaceRow extends StatelessWidget {
  const InterfaceRow({
    required this.name,
    required this.address,
    required this.connected,
    super.key,
  });
  final String name;
  final String address;
  final bool connected;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
    child: Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: connected ? success : Theme.of(context).colorScheme.error,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 3),
              Text(
                address,
                style: TextStyle(color: muted(context), fontSize: 12),
              ),
            ],
          ),
        ),
        Text(
          connected ? '已连接' : '未连接',
          style: TextStyle(
            color: muted(context),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

class WirelessRow extends StatelessWidget {
  const WirelessRow({
    required this.ssid,
    required this.detail,
    required this.clients,
    super.key,
  });
  final String ssid;
  final String detail;
  final String clients;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
    child: Row(
      children: [
        Icon(Icons.wifi, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(ssid, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 3),
              Text(
                detail,
                style: TextStyle(color: muted(context), fontSize: 12),
              ),
            ],
          ),
        ),
        Text(
          clients,
          style: TextStyle(
            color: muted(context),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

class RouterCard extends StatelessWidget {
  const RouterCard({
    required this.name,
    required this.endpoint,
    required this.online,
    required this.current,
    super.key,
  });
  final String name;
  final String endpoint;
  final bool online;
  final bool current;
  @override
  Widget build(BuildContext context) => AppCard(
    child: Row(
      children: [
        CircleAvatar(
          backgroundColor:
              (online ? success : Theme.of(context).colorScheme.error)
                  .withValues(alpha: .14),
          foregroundColor: online
              ? success
              : Theme.of(context).colorScheme.error,
          child: const Icon(Icons.router_outlined),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (current)
                    StatusPill(
                      label: '当前',
                      color: Theme.of(context).colorScheme.primary,
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                endpoint,
                style: TextStyle(color: muted(context), fontSize: 12),
              ),
            ],
          ),
        ),
        Icon(Icons.chevron_right, color: muted(context)),
      ],
    ),
  );
}

class ServiceCard extends StatelessWidget {
  const ServiceCard({
    required this.icon,
    required this.name,
    required this.description,
    required this.healthy,
    super.key,
  });
  final IconData icon;
  final String name;
  final String description;
  final bool healthy;
  @override
  Widget build(BuildContext context) => AppCard(
    child: Row(
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(
                description,
                style: TextStyle(color: muted(context), fontSize: 12),
              ),
            ],
          ),
        ),
        StatusPill(
          label: healthy ? '运行中' : '需检查',
          color: healthy ? success : warning,
        ),
        const SizedBox(width: 4),
        const Icon(Icons.chevron_right),
      ],
    ),
  );
}

class ActionGrid extends StatelessWidget {
  const ActionGrid({required this.items, super.key});
  final List<ActionItem> items;

  @override
  Widget build(BuildContext context) => GridView.builder(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    itemCount: items.length,
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.14,
    ),
    itemBuilder: (context, index) {
      final item = items[index];
      return InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {},
        child: AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(item.icon, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 10),
              Text(
                item.title,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 3),
              Text(
                item.detail,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: muted(context),
                  fontSize: 11,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class ActionItem {
  const ActionItem(this.icon, this.title, this.detail);
  final IconData icon;
  final String title;
  final String detail;
}

class DashboardPreview {
  const DashboardPreview({
    required this.source,
    required this.routerName,
    required this.endpoint,
    required this.online,
    required this.hostname,
    required this.model,
    required this.uptime,
    required this.load,
    required this.memory,
    required this.firmware,
    required this.interfaces,
    required this.traffic,
  });

  final String source;
  final String routerName;
  final String endpoint;
  final bool online;
  final String hostname;
  final String model;
  final String uptime;
  final String load;
  final String memory;
  final String firmware;
  final List<InterfacePreview> interfaces;
  final List<TrafficPreview> traffic;

  bool get isPreview => source != 'live';

  factory DashboardPreview.fromJson(Map<String, dynamic> json) =>
      DashboardPreview(
        source: json['source'] as String? ?? fallback.source,
        routerName: json['routerName'] as String? ?? fallback.routerName,
        endpoint: json['endpoint'] as String? ?? fallback.endpoint,
        online: json['online'] as bool? ?? fallback.online,
        hostname: json['hostname'] as String? ?? fallback.hostname,
        model: json['model'] as String? ?? fallback.model,
        uptime: json['uptime'] as String? ?? fallback.uptime,
        load: json['load'] as String? ?? fallback.load,
        memory: json['memory'] as String? ?? fallback.memory,
        firmware: json['firmware'] as String? ?? fallback.firmware,
        interfaces: (json['interfaces'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(InterfacePreview.fromJson)
            .toList(growable: false),
        traffic: (json['traffic'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(TrafficPreview.fromJson)
            .toList(growable: false),
      );

  static const fallback = DashboardPreview(
    source: 'fallback',
    routerName: 'OpenWrt 主路由',
    endpoint: 'http://192.168.1.1/luci',
    online: false,
    hostname: '尚未连接路由器',
    model: '本地预览模式',
    uptime: '—',
    load: '—',
    memory: '未报告',
    firmware: '未报告',
    interfaces: [
      InterfacePreview(
        name: 'br-lan',
        address: 'IPv4 192.168.1.1 · IPv6 fd00::1',
        connected: true,
      ),
      InterfacePreview(
        name: 'wan',
        address: 'IPv4 100.64.0.2 · IPv6 —',
        connected: true,
      ),
      InterfacePreview(
        name: 'wwan',
        address: 'IPv4 未分配 · IPv6 —',
        connected: false,
      ),
    ],
    traffic: [
      TrafficPreview(name: 'br-lan', down: '1.82 MB/s', up: '420 KB/s'),
      TrafficPreview(name: 'wan', down: '842 KB/s', up: '113 KB/s'),
    ],
  );
}

class InterfacePreview {
  const InterfacePreview({
    required this.name,
    required this.address,
    required this.connected,
  });

  final String name;
  final String address;
  final bool connected;

  factory InterfacePreview.fromJson(Map<String, dynamic> json) =>
      InterfacePreview(
        name: json['name'] as String? ?? '未命名接口',
        address: json['address'] as String? ?? '未报告地址',
        connected: json['connected'] as bool? ?? false,
      );
}

class TrafficPreview {
  const TrafficPreview({
    required this.name,
    required this.down,
    required this.up,
  });

  final String name;
  final String down;
  final String up;

  factory TrafficPreview.fromJson(Map<String, dynamic> json) => TrafficPreview(
    name: json['name'] as String? ?? '未知接口',
    down: json['down'] as String? ?? '—',
    up: json['up'] as String? ?? '—',
  );
}

const success = Color(0xFF1B9A6A);
const warning = Color(0xFFB06C00);
Color muted(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
    ? const Color(0xFFADC1CF)
    : const Color(0xFF64748B);
String formatTime(DateTime value) =>
    '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
