import 'dart:async';

import 'package:flutter/material.dart';

import 'router_controller.dart';
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
  late final RouterController _router;

  @override
  void initState() {
    super.initState();
    _router = RouterController(bridge: RustNativeBridge.tryLoad());
    _router.addListener(_onRouterChanged);
    _router.initialize();
  }

  void _onRouterChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _router
      ..removeListener(_onRouterChanged)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      LiveStatusScreen(
        controller: _router,
        onOpenRouters: () => setState(() => _tab = 1),
      ),
      LiveRoutersScreen(controller: _router),
      LiveReadScreen(
        controller: _router,
        title: '控制中心',
        subtitle: '网络、无线、防火墙、DHCP 与软件包',
        actions: const [
          ReadAction(
            Icons.wifi_outlined,
            '无线网络',
            'wireless_snapshot',
            '读取无线射频、SSID 与客户端状态',
          ),
          ReadAction(
            Icons.security_outlined,
            '防火墙',
            'firewall_snapshot',
            '读取防火墙规则和 UPnP 状态',
          ),
          ReadAction(
            Icons.device_hub_outlined,
            'DHCP 租约',
            'dhcp_leases',
            '读取 DHCPv4、DHCPv6 与邻居表',
          ),
          ReadAction(
            Icons.inventory_2_outlined,
            '已安装软件包',
            'package_list',
            '读取 opkg 已安装软件包列表',
          ),
        ],
      ),
      LiveReadScreen(
        controller: _router,
        title: '服务健康',
        subtitle: '服务、容器与当前运行状态',
        actions: const [
          ReadAction(
            Icons.monitor_heart_outlined,
            '服务快照',
            'service_snapshot',
            '读取 OpenClash、AdGuard Home、DDNS 等服务状态',
          ),
          ReadAction(
            Icons.widgets_outlined,
            'Docker 容器',
            'docker_snapshot',
            '读取 Docker 容器与镜像状态',
          ),
        ],
        managedActions: const [
          ManagedAction(Icons.restart_alt, '重启 DNS 服务', 'restart_service', {
            'kind': 'service',
            'service': 'dnsmasq',
            'action': 'restart',
          }, '会通过已验证 SSH 会话重启 dnsmasq。'),
          ManagedAction(Icons.restart_alt, '重启 DHCPv6 服务', 'restart_service', {
            'kind': 'service',
            'service': 'odhcpd',
            'action': 'restart',
          }, '会通过已验证 SSH 会话重启 odhcpd。'),
        ],
      ),
      LiveReadScreen(
        controller: _router,
        title: '工具',
        subtitle: '诊断、日志、NAT 与性能测试',
        actions: const [
          ReadAction(
            Icons.health_and_safety_outlined,
            '系统健康检查',
            'system_health',
            '执行受限 Ping、DNS、温度与磁盘检查',
          ),
          ReadAction(
            Icons.description_outlined,
            '系统日志',
            'logs',
            '读取并过滤路由器系统日志',
          ),
          ReadAction(
            Icons.public_outlined,
            'NAT 检测',
            'nat_detection',
            '读取公网地址与路由信息',
          ),
          ReadAction(
            Icons.speed_outlined,
            '磁盘性能测试',
            'disk_speed_benchmark',
            '执行受限临时磁盘测试',
          ),
        ],
      ),
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
          subtitle: Text('Flutter UI + Rust 原生核心'),
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

const success = Color(0xFF1B9A6A);
const warning = Color(0xFFB06C00);
Color muted(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
    ? const Color(0xFFADC1CF)
    : const Color(0xFF64748B);
String formatTime(DateTime value) =>
    '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';

class LiveStatusScreen extends StatelessWidget {
  const LiveStatusScreen({
    required this.controller,
    required this.onOpenRouters,
    super.key,
  });

  final RouterController controller;
  final VoidCallback onOpenRouters;

  @override
  Widget build(BuildContext context) {
    if (!controller.initialized || controller.loadingProfiles) {
      return const _LiveStatePage(
        icon: Icons.sync,
        title: '正在加载路由器档案',
        detail: 'Rust 原生库正在读取应用专属目录中的非机密档案。',
      );
    }
    if (!controller.nativeAvailable) {
      return const _LiveStatePage(
        icon: Icons.memory_outlined,
        title: 'Rust 原生库不可用',
        detail: '当前运行未加载 libopenwrt_ffi.so，应用不会展示模拟状态。',
      );
    }
    final profile = controller.activeProfile;
    if (profile == null) {
      return _LiveStatePage(
        icon: Icons.router_outlined,
        title: '尚未添加路由器',
        detail: '请先创建路由器档案并输入 LuCI 连接资料；状态页不会使用默认地址或示例数据。',
        action: OutlinedButton.icon(
          onPressed: onOpenRouters,
          icon: const Icon(Icons.add_circle_outline),
          label: const Text('添加路由器'),
        ),
      );
    }
    final status = controller.status;
    if (status == null) {
      return _LiveStatePage(
        icon: controller.loadingStatus
            ? Icons.sync
            : Icons.admin_panel_settings_outlined,
        title: controller.loadingStatus ? '正在读取路由器状态' : '尚未建立 LuCI 连接',
        detail:
            controller.lastError ??
            '请在“路由器”页输入此档案的 LuCI 密码后连接。密码只用于当前内存中的 Rust 请求。',
        action: OutlinedButton.icon(
          onPressed: onOpenRouters,
          icon: const Icon(Icons.router_outlined),
          label: const Text('打开路由器档案'),
        ),
      );
    }
    return _RealStatusDashboard(
      controller: controller,
      profile: profile,
      status: status,
      onOpenRouters: onOpenRouters,
    );
  }
}

class _LiveStatePage extends StatelessWidget {
  const _LiveStatePage({
    required this.icon,
    required this.title,
    required this.detail,
    this.action,
  });

  final IconData icon;
  final String title;
  final String detail;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: AppCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 36, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              detail,
              textAlign: TextAlign.center,
              style: TextStyle(color: muted(context), height: 1.45),
            ),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    ),
  );
}

class _RealStatusDashboard extends StatelessWidget {
  const _RealStatusDashboard({
    required this.controller,
    required this.profile,
    required this.status,
    required this.onOpenRouters,
  });

  final RouterController controller;
  final RouterProfileData profile;
  final RouterStatusData status;
  final VoidCallback onOpenRouters;

  @override
  Widget build(BuildContext context) {
    final system = status.system;
    final colors = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final hostname = system['hostname'] as String? ?? '路由器未报告主机名';
    final model = system['model'] as String? ?? '路由器未报告型号';
    final firmware = system['firmware'] as String? ?? '未报告';
    final uptime = _formatUptime(system['uptime_seconds'] as int?);
    final load = _formatLoad(system['load_1']);
    final memory = _formatMemory(
      system['memory_available_bytes'] as int?,
      system['memory_total_bytes'] as int?,
    );
    return RefreshIndicator(
      onRefresh: controller.fetchStatus,
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
                      profile.name,
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
                      profile.baseUrl,
                      style: TextStyle(color: muted(context), fontSize: 13),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                tooltip: '刷新真实状态',
                onPressed: controller.loadingStatus
                    ? null
                    : controller.fetchStatus,
                icon: controller.loadingStatus
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded),
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
                    color: dark
                        ? const Color(0xFF1C485C)
                        : const Color(0xFFE6F5F4),
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
                        label: status.online ? '在线' : '连接失败',
                        color: status.online ? success : colors.error,
                      ),
                      const SizedBox(height: 7),
                      Text(
                        hostname,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$model · $firmware',
                        style: TextStyle(color: muted(context), fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: MetricTile(
                  icon: Icons.timer_outlined,
                  label: '运行时间',
                  value: uptime,
                  accent: success,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: MetricTile(
                  icon: Icons.speed_outlined,
                  label: '系统负载',
                  value: load,
                  caption: 'LuCI system.info',
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
                  value: memory,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: MetricTile(
                  icon: Icons.system_update_alt_outlined,
                  label: '固件',
                  value: firmware,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SectionCard(
            title: '网络接口',
            action: '${status.interfaces.length} 个',
            child: status.interfaces.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      '该路由器未返回接口数据。',
                      style: TextStyle(color: muted(context)),
                    ),
                  )
                : Column(
                    children: [
                      for (final (index, item)
                          in status.interfaces.indexed) ...[
                        InterfaceRow(
                          name: item['name'] as String? ?? '未命名接口',
                          address: _interfaceAddress(item),
                          connected: item['up'] as bool? ?? false,
                        ),
                        if (index < status.interfaces.length - 1)
                          const Divider(height: 1),
                      ],
                    ],
                  ),
          ),
          const SizedBox(height: 14),
          SectionCard(
            title: '接口计数',
            child: status.interfaces.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      '没有接口计数可显示。',
                      style: TextStyle(color: muted(context)),
                    ),
                  )
                : Column(
                    children: [
                      for (final (index, item)
                          in status.interfaces.take(6).indexed) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 15,
                            vertical: 11,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  item['name'] as String? ?? '接口',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              Text(
                                '↓ ${_formatBytes(item['rx_bytes'] as int?)}',
                                style: TextStyle(
                                  color: colors.primary,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Text(
                                '↑ ${_formatBytes(item['tx_bytes'] as int?)}',
                                style: TextStyle(
                                  color: colors.primary,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (index < status.interfaces.take(6).length - 1)
                          const Divider(height: 1),
                      ],
                    ],
                  ),
          ),
          if (status.warnings.isNotEmpty) ...[
            const SizedBox(height: 14),
            SectionCard(
              title: '路由器提示',
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final warningText in status.warnings)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          warningText,
                          style: TextStyle(color: warning),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Text(
            '真实 LuCI 数据更新于 ${formatTime(status.fetchedAt)}',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted(context), fontSize: 12),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: onOpenRouters,
            icon: const Icon(Icons.router_outlined),
            label: const Text('管理路由器档案'),
          ),
        ],
      ),
    );
  }
}

class LiveRoutersScreen extends StatefulWidget {
  const LiveRoutersScreen({required this.controller, super.key});
  final RouterController controller;

  @override
  State<LiveRoutersScreen> createState() => _LiveRoutersScreenState();
}

class _LiveRoutersScreenState extends State<LiveRoutersScreen> {
  final _name = TextEditingController(text: '我的 OpenWrt');
  final _endpoint = TextEditingController(text: 'http://192.168.1.1');
  final _username = TextEditingController(text: 'root');
  final _password = TextEditingController();
  final _sshPassword = TextEditingController();
  final _sshPort = TextEditingController(text: '22');
  String? _editingId;
  bool _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    _endpoint.dispose();
    _username.dispose();
    _password.dispose();
    _sshPassword.dispose();
    _sshPort.dispose();
    super.dispose();
  }

  void _edit(RouterProfileData profile) {
    setState(() {
      _editingId = profile.id;
      _name.text = profile.name;
      _endpoint.text = profile.baseUrl;
      _username.text = profile.username;
      _password.clear();
      _sshPassword.clear();
      _sshPort.text = profile.sshPort.toString();
    });
  }

  Future<void> _saveAndConnect() async {
    final port = int.tryParse(_sshPort.text.trim());
    if (port == null || port < 1 || port > 65535) {
      _showMessage('SSH 端口必须介于 1 到 65535。');
      return;
    }
    if (_password.text.isEmpty) {
      _showMessage('请输入 LuCI 密码后再连接；密码不会写入档案。');
      return;
    }
    setState(() => _submitting = true);
    final id = _editingId ?? 'router-${DateTime.now().microsecondsSinceEpoch}';
    final profile = RouterProfileData(
      id: id,
      name: _name.text.trim(),
      baseUrl: _endpoint.text.trim(),
      username: _username.text.trim(),
      sshPort: port,
    );
    final saved = await widget.controller.saveProfile(
      profile,
      luciPassword: _password.text,
      sshPassword: _sshPassword.text,
    );
    if (saved) {
      await widget.controller.fetchStatus(password: _password.text);
      if (mounted && widget.controller.lastError == null) {
        _showMessage('已通过 Rust 原生核心读取真实 LuCI 状态。');
      }
    }
    if (mounted) {
      setState(() => _submitting = false);
      if (widget.controller.lastError != null) {
        _showMessage(widget.controller.lastError!);
      }
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
      children: [
        Text(
          '路由器',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '真实档案与 LuCI 连接',
          style: TextStyle(color: muted(context), fontSize: 13),
        ),
        const SizedBox(height: 20),
        SectionCard(
          title: '已保存档案',
          action: '${controller.profiles.length} 个',
          child: controller.profiles.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '尚未保存路由器档案。',
                    style: TextStyle(color: muted(context)),
                  ),
                )
              : Column(
                  children: [
                    for (final (index, profile)
                        in controller.profiles.indexed) ...[
                      InkWell(
                        onTap: () async {
                          await controller.selectProfile(profile.id);
                          _edit(profile);
                        },
                        child: RouterCard(
                          name: profile.name,
                          endpoint: profile.baseUrl,
                          online:
                              controller.status?.routerId == profile.id &&
                              controller.status?.online == true,
                          current: controller.activeRouterId == profile.id,
                        ),
                      ),
                      if (index < controller.profiles.length - 1)
                        const Divider(height: 1),
                    ],
                  ],
                ),
        ),
        const SizedBox(height: 14),
        SectionCard(
          title: _editingId == null ? '添加路由器' : '编辑路由器',
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _RouterField(label: '显示名称', controller: _name),
                _RouterField(
                  label: 'LuCI 地址',
                  controller: _endpoint,
                  keyboardType: TextInputType.url,
                ),
                _RouterField(label: 'LuCI 用户名', controller: _username),
                _RouterField(
                  label: 'LuCI 密码',
                  controller: _password,
                  obscureText: true,
                ),
                _RouterField(
                  label: 'SSH 密码（管理功能需要）',
                  controller: _sshPassword,
                  obscureText: true,
                ),
                _RouterField(
                  label: 'SSH 端口',
                  controller: _sshPort,
                  keyboardType: TextInputType.number,
                ),
                Text(
                  '密码仅用于当前连接；Rust 档案库不会写入密码、私钥、令牌或 Cookie。',
                  style: TextStyle(
                    color: muted(context),
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _submitting ? null : _saveAndConnect,
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link),
                  label: Text(_submitting ? '正在连接' : '保存并连接'),
                ),
                if (_editingId != null) ...[
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () async {
                      final id = _editingId;
                      if (id == null) return;
                      await controller.removeProfile(id);
                      if (mounted) {
                        setState(() {
                          _editingId = null;
                          _password.clear();
                        });
                      }
                    },
                    child: const Text('删除当前档案'),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        const SectionCard(
          title: 'SSH 安全说明',
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              '未知或变化的 SSH 主机密钥必须显示精确 SHA-256 指纹，并由用户明确确认；应用不会自动接受主机密钥。',
            ),
          ),
        ),
      ],
    );
  }
}

class _RouterField extends StatelessWidget {
  const _RouterField({
    required this.label,
    required this.controller,
    this.keyboardType,
    this.obscureText = false,
  });

  final String label;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final bool obscureText;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      autocorrect: false,
      enableSuggestions: !obscureText,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );
}

String _interfaceAddress(Map<String, dynamic> item) {
  final ipv4 = (item['ipv4'] as List<dynamic>? ?? const []).whereType<String>();
  final ipv6 = (item['ipv6'] as List<dynamic>? ?? const []).whereType<String>();
  final addresses = [...ipv4, ...ipv6];
  if (addresses.isNotEmpty) return addresses.join(' · ');
  return item['device'] as String? ?? '未报告地址';
}

String _formatUptime(int? seconds) {
  if (seconds == null) return '未报告';
  final days = seconds ~/ 86400;
  final hours = (seconds % 86400) ~/ 3600;
  final minutes = (seconds % 3600) ~/ 60;
  if (days > 0) return '$days 天 $hours 时';
  if (hours > 0) return '$hours 小时 $minutes 分';
  return '$minutes 分';
}

String _formatLoad(Object? value) {
  final load = value is num ? value : null;
  return load == null ? '未报告' : load.toStringAsFixed(2);
}

String _formatMemory(int? available, int? total) {
  if (available == null || total == null || total <= 0) return '未报告';
  final used = ((total - available) / total * 100).clamp(0, 100).round();
  return '$used% 已用';
}

String _formatBytes(int? bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
}

class ReadAction {
  const ReadAction(this.icon, this.title, this.command, this.detail);

  final IconData icon;
  final String title;
  final String command;
  final String detail;
}

class ManagedAction {
  const ManagedAction(
    this.icon,
    this.title,
    this.operation,
    this.command,
    this.detail,
  );

  final IconData icon;
  final String title;
  final String operation;
  final Map<String, Object?> command;
  final String detail;
}

class LiveReadScreen extends StatefulWidget {
  const LiveReadScreen({
    required this.controller,
    required this.title,
    required this.subtitle,
    required this.actions,
    this.managedActions = const [],
    super.key,
  });

  final RouterController controller;
  final String title;
  final String subtitle;
  final List<ReadAction> actions;
  final List<ManagedAction> managedActions;

  @override
  State<LiveReadScreen> createState() => _LiveReadScreenState();
}

class _LiveReadScreenState extends State<LiveReadScreen> {
  bool _loading = false;
  String? _output;
  String? _error;
  String? _selectedTitle;

  Future<void> _run(ReadAction action) async {
    setState(() {
      _loading = true;
      _error = null;
      _output = null;
      _selectedTitle = action.title;
    });
    final result = await widget.controller.sshRead(
      action.command,
      query: action.command == 'logs' ? 'system' : null,
    );
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (result.isSuccess) {
        final value = result.value as Map<String, dynamic>? ?? const {};
        final stdout = value['stdout'] as String? ?? '';
        final stderr = value['stderr'] as String? ?? '';
        _output = [
          stdout,
          if (stderr.isNotEmpty) '\n[stderr]\n$stderr',
        ].where((part) => part.isNotEmpty).join();
        if (_output!.isEmpty) _output = '路由器未返回可显示内容。';
      } else {
        _error = result.message;
      }
    });
  }

  Future<void> _runManaged(ManagedAction action) async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(action.title),
        content: Text('${action.detail}\n\n请确认后继续。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认执行'),
          ),
        ],
      ),
    );
    if (accepted != true || !mounted) return;
    setState(() {
      _loading = true;
      _error = null;
      _output = null;
      _selectedTitle = action.title;
    });
    final result = await widget.controller.sshManaged(
      operation: action.operation,
      command: action.command,
      singleConfirmed: true,
    );
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (result.isSuccess) {
        final value = result.value as Map<String, dynamic>? ?? const {};
        _output = [
          value['stdout'] as String? ?? '',
          value['stderr'] as String? ?? '',
        ].where((part) => part.isNotEmpty).join('\n');
        if (_output!.isEmpty) _output = '路由器未返回可显示内容。';
      } else {
        _error = result.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: widget.title,
    subtitle: widget.subtitle,
    children: [
      SectionCard(
        title: '真实路由器查询',
        child: Column(
          children: [
            for (final (index, action) in widget.actions.indexed) ...[
              ListTile(
                onTap: _loading ? null : () => _run(action),
                leading: Icon(
                  action.icon,
                  color: Theme.of(context).colorScheme.primary,
                ),
                title: Text(action.title),
                subtitle: Text(action.detail),
                trailing: _loading && _selectedTitle == action.title
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.chevron_right),
              ),
              if (index < widget.actions.length - 1) const Divider(height: 1),
            ],
          ],
        ),
      ),
      if (widget.managedActions.isNotEmpty) ...[
        const SizedBox(height: 14),
        SectionCard(
          title: '受控管理操作',
          child: Column(
            children: [
              for (final (index, action) in widget.managedActions.indexed) ...[
                ListTile(
                  onTap: _loading ? null : () => _runManaged(action),
                  leading: Icon(
                    action.icon,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  title: Text(action.title),
                  subtitle: Text('需要单次确认 · ${action.detail}'),
                  trailing: const Icon(Icons.chevron_right),
                ),
                if (index < widget.managedActions.length - 1)
                  const Divider(height: 1),
              ],
            ],
          ),
        ),
      ],
      const SizedBox(height: 14),
      if (_error != null)
        SectionCard(
          title: '查询失败',
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        )
      else if (_output != null)
        SectionCard(
          title: _selectedTitle ?? '查询结果',
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SelectionArea(
              child: Text(
                _output!,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ),
          ),
        )
      else
        SectionCard(
          title: '尚未执行查询',
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              '选择上方入口后，Rust 将通过已验证的 SSH 会话执行受限只读命令。未提供 SSH 密码或未确认主机指纹时，不会生成任何模拟结果。',
              style: TextStyle(color: muted(context), height: 1.45),
            ),
          ),
        ),
    ],
  );
}
