import 'package:flutter/services.dart';

class PlatformStorage {
  const PlatformStorage._();

  static const _channel = MethodChannel('openwrt_status_flutter/storage');

  /// 返回 Android 内部 filesDir，供 Rust 的非机密档案仓库使用。
  ///
  /// 该路径不在共享外部存储中；密码仍不会写入该目录。
  static Future<String> applicationFilesPath() async {
    final value = await _channel.invokeMethod<String>('applicationFilesPath');
    if (value == null || value.trim().isEmpty) {
      throw PlatformException(
        code: 'storage_path_missing',
        message: 'Android 未返回应用专属存储目录。',
      );
    }
    return value;
  }
}
