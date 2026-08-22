import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'platform_storage.dart';
import 'rust_bridge.dart';

class RouterProfileData {
  const RouterProfileData({
    required this.id,
    required this.name,
    required this.baseUrl,
    required this.username,
    required this.sshPort,
  });

  final String id;
  final String name;
  final String baseUrl;
  final String username;
  final int sshPort;

  factory RouterProfileData.fromJson(Map<String, dynamic> json) =>
      RouterProfileData(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        baseUrl: json['base_url'] as String? ?? '',
        username: json['username'] as String? ?? '',
        sshPort: json['ssh_port'] as int? ?? 22,
      );

  Map<String, Object> toFfiJson() => {
    'id': id,
    'name': name,
    'baseUrl': baseUrl,
    'username': username,
    'sshPort': sshPort,
  };
}

class RouterStatusData {
  const RouterStatusData({
    required this.routerId,
    required this.online,
    required this.fetchedAt,
    required this.system,
    required this.interfaces,
    required this.warnings,
    required this.error,
  });

  final String routerId;
  final bool online;
  final DateTime fetchedAt;
  final Map<String, dynamic> system;
  final List<Map<String, dynamic>> interfaces;
  final List<String> warnings;
  final String? error;

  factory RouterStatusData.fromJson(Map<String, dynamic> json) =>
      RouterStatusData(
        routerId: json['router_id'] as String? ?? '',
        online: json['online'] as bool? ?? false,
        fetchedAt:
            DateTime.tryParse(json['fetched_at'] as String? ?? '') ??
            DateTime.now(),
        system: json['system'] as Map<String, dynamic>? ?? const {},
        interfaces: (json['interfaces'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList(growable: false),
        warnings: (json['warnings'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList(growable: false),
        error: json['error'] as String?,
      );
}

/// 仅持有非机密档案与本次运行中的 LuCI 密码。
///
/// 密码不会进入 RouterProfileStore，Flutter 也不会在控制器外暴露它们。
class RouterController extends ChangeNotifier {
  RouterController({this.bridge});

  final RustNativeBridge? bridge;
  final Map<String, String> _luciPasswords = {};
  final Map<String, String> _sshPasswords = {};

  bool initialized = false;
  bool loadingProfiles = false;
  bool loadingStatus = false;
  String? lastError;
  String? activeRouterId;
  List<RouterProfileData> profiles = const [];
  RouterStatusData? status;
  String? _storagePath;

  bool get nativeAvailable => bridge != null;

  RouterProfileData? get activeProfile {
    final selected = activeRouterId;
    if (selected == null) return null;
    for (final profile in profiles) {
      if (profile.id == selected) return profile;
    }
    return null;
  }

  Future<void> initialize() async {
    if (initialized) return;
    initialized = true;
    if (bridge == null) {
      lastError = '当前设备未加载 Rust 原生库，无法读取或管理路由器。';
      notifyListeners();
      return;
    }
    try {
      final directory = await PlatformStorage.applicationFilesPath();
      _storagePath = '$directory${Platform.pathSeparator}router-state.json';
      await loadProfiles();
    } on PlatformException catch (error) {
      lastError = error.message ?? '无法获取 Android 应用专属存储目录。';
      notifyListeners();
    }
  }

  Future<void> loadProfiles() async {
    final nativeBridge = bridge;
    final storagePath = _storagePath;
    if (nativeBridge == null || storagePath == null) return;
    loadingProfiles = true;
    lastError = null;
    notifyListeners();
    final result = nativeBridge.call('profile.list', {
      'storagePath': storagePath,
    });
    if (!result.isSuccess) {
      lastError = result.message;
    } else {
      final root = result.value as Map<String, dynamic>? ?? const {};
      profiles = (root['profiles'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(RouterProfileData.fromJson)
          .where((profile) => profile.id.isNotEmpty)
          .toList(growable: false);
      if (activeRouterId == null ||
          !profiles.any((item) => item.id == activeRouterId)) {
        activeRouterId = profiles.isEmpty ? null : profiles.first.id;
      }
    }
    loadingProfiles = false;
    notifyListeners();
  }

  Future<bool> saveProfile(
    RouterProfileData profile, {
    String? luciPassword,
    String? sshPassword,
  }) async {
    final nativeBridge = bridge;
    final storagePath = _storagePath;
    if (nativeBridge == null || storagePath == null) {
      lastError = 'Rust 原生库尚未就绪。';
      notifyListeners();
      return false;
    }
    final result = nativeBridge.call('profile.upsert', {
      'storagePath': storagePath,
      'profile': profile.toFfiJson(),
    });
    if (!result.isSuccess) {
      lastError = result.message;
      notifyListeners();
      return false;
    }
    if (luciPassword != null && luciPassword.isNotEmpty) {
      _luciPasswords[profile.id] = luciPassword;
    }
    if (sshPassword != null && sshPassword.isNotEmpty) {
      _sshPasswords[profile.id] = sshPassword;
    }
    activeRouterId = profile.id;
    status = null;
    await loadProfiles();
    return true;
  }

  Future<void> selectProfile(String routerId) async {
    if (!profiles.any((profile) => profile.id == routerId)) return;
    activeRouterId = routerId;
    status = null;
    lastError = null;
    notifyListeners();
  }

  Future<void> removeProfile(String routerId) async {
    final nativeBridge = bridge;
    final storagePath = _storagePath;
    if (nativeBridge == null || storagePath == null) return;
    final result = nativeBridge.call('profile.remove', {
      'storagePath': storagePath,
      'routerId': routerId,
    });
    if (!result.isSuccess) {
      lastError = result.message;
      notifyListeners();
      return;
    }
    _luciPasswords.remove(routerId);
    _sshPasswords.remove(routerId);
    if (activeRouterId == routerId) {
      activeRouterId = null;
      status = null;
    }
    await loadProfiles();
  }

  Future<RustCallResult> sshRead(
    String command, {
    String? query,
    String? filter,
    int? limit,
    String? path,
    String? approvedFingerprintSha256,
  }) async {
    final nativeBridge = bridge;
    final profile = activeProfile;
    final storagePath = _storagePath;
    if (nativeBridge == null || profile == null || storagePath == null) {
      return const RustCallResult.error(
        code: 'router_unavailable',
        message: '请先加载 Rust 原生库并选择一个路由器档案。',
      );
    }
    final sshPassword = _sshPasswords[profile.id] ?? '';
    if (sshPassword.isEmpty) {
      return const RustCallResult.error(
        code: 'ssh_password_missing',
        message: '请在路由器页输入 SSH 密码后再执行管理查询。',
      );
    }
    return nativeBridge.call('ssh.read', {
      'storagePath': storagePath,
      'connection': {
        'profile': profile.toFfiJson(),
        'luciPassword': _luciPasswords[profile.id] ?? '',
        'sshPassword': sshPassword,
        'approvedFingerprintSha256': approvedFingerprintSha256,
      },
      'command': command,
      'query': query,
      'filter': filter,
      'limit': limit,
      'path': path,
    });
  }

  Future<RustCallResult> sshManaged({
    required String operation,
    required Map<String, Object?> command,
    String? snapshotId,
    String? typedPhrase,
    required bool singleConfirmed,
    String? approvedFingerprintSha256,
  }) async {
    final nativeBridge = bridge;
    final profile = activeProfile;
    final storagePath = _storagePath;
    if (nativeBridge == null || profile == null || storagePath == null) {
      return const RustCallResult.error(
        code: 'router_unavailable',
        message: '请先加载 Rust 原生库并选择一个路由器档案。',
      );
    }
    final sshPassword = _sshPasswords[profile.id] ?? '';
    if (sshPassword.isEmpty) {
      return const RustCallResult.error(
        code: 'ssh_password_missing',
        message: '请在路由器页输入 SSH 密码后再执行管理操作。',
      );
    }
    return nativeBridge.call('ssh.managed', {
      'storagePath': storagePath,
      'connection': {
        'profile': profile.toFfiJson(),
        'luciPassword': _luciPasswords[profile.id] ?? '',
        'sshPassword': sshPassword,
        'approvedFingerprintSha256': approvedFingerprintSha256,
      },
      'operation': operation,
      'snapshotId': snapshotId,
      'typedPhrase': typedPhrase,
      'singleConfirmed': singleConfirmed,
      'command': command,
    });
  }

  Future<RustCallResult> sshTerminal({
    required String command,
    required String typedPhrase,
    String? approvedFingerprintSha256,
  }) async {
    final nativeBridge = bridge;
    final profile = activeProfile;
    final storagePath = _storagePath;
    if (nativeBridge == null || profile == null || storagePath == null) {
      return const RustCallResult.error(
        code: 'router_unavailable',
        message: '请先加载 Rust 原生库并选择一个路由器档案。',
      );
    }
    final sshPassword = _sshPasswords[profile.id] ?? '';
    if (sshPassword.isEmpty) {
      return const RustCallResult.error(
        code: 'ssh_password_missing',
        message: '请在路由器页输入 SSH 密码后再打开终端。',
      );
    }
    return nativeBridge.call('ssh.terminal', {
      'storagePath': storagePath,
      'connection': {
        'profile': profile.toFfiJson(),
        'luciPassword': _luciPasswords[profile.id] ?? '',
        'sshPassword': sshPassword,
        'approvedFingerprintSha256': approvedFingerprintSha256,
      },
      'command': command,
      'typedPhrase': typedPhrase,
    });
  }

  Future<void> fetchStatus({String? password}) async {
    final nativeBridge = bridge;
    final profile = activeProfile;
    if (nativeBridge == null) {
      lastError = '当前设备未加载 Rust 原生库。';
      notifyListeners();
      return;
    }
    if (profile == null) {
      lastError = '请先创建并选择一个路由器档案。';
      notifyListeners();
      return;
    }
    final effectivePassword = password ?? _luciPasswords[profile.id] ?? '';
    if (effectivePassword.isEmpty) {
      lastError = '请在路由器页输入 LuCI 密码后再连接。密码不会保存到档案。';
      notifyListeners();
      return;
    }
    loadingStatus = true;
    lastError = null;
    notifyListeners();
    final result = nativeBridge.call('status.fetch', {
      'connection': {
        'profile': profile.toFfiJson(),
        'luciPassword': effectivePassword,
      },
    });
    if (!result.isSuccess) {
      lastError = result.message;
      status = null;
    } else {
      final value = result.value;
      if (value is Map<String, dynamic>) {
        status = RouterStatusData.fromJson(value);
      } else {
        lastError = 'Rust 原生库返回的路由器状态格式无效。';
        status = null;
      }
    }
    loadingStatus = false;
    notifyListeners();
  }
}
