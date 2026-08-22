import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

typedef _NativeJson = Pointer<Utf8> Function();
typedef _DartJson = Pointer<Utf8> Function();

/// Flutter 到 `libopenwrt_ffi.so` 的极薄调用层。
///
/// 当前 ABI 仅返回静态 JSON，不存在跨语言内存释放；真实路由器凭据和安全审批
/// 仍会停留在 Rust 核心内，不能由 Flutter 直接构造或绕过。
class RustNativeBridge {
  RustNativeBridge._(DynamicLibrary library)
    : _version = library.lookupFunction<_NativeJson, _DartJson>(
        'openwrt_ffi_version_json',
      ),
      _dashboard = library.lookupFunction<_NativeJson, _DartJson>(
        'openwrt_ffi_dashboard_preview_json',
      );
  final _DartJson _version;
  final _DartJson _dashboard;

  static RustNativeBridge? tryLoad() {
    if (!Platform.isAndroid) return null;
    try {
      return RustNativeBridge._(DynamicLibrary.open('libopenwrt_ffi.so'));
    } on ArgumentError {
      return null;
    }
  }

  String get versionJson => _version().toDartString();
  String get dashboardPreviewJson => _dashboard().toDartString();
}
