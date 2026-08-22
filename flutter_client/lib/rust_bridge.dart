import 'dart:convert';
import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

typedef _NativeVersionJson = Pointer<Utf8> Function();
typedef _DartVersionJson = Pointer<Utf8> Function();
typedef _NativeCallJson = Pointer<Utf8> Function(Pointer<Utf8> request);
typedef _DartCallJson = Pointer<Utf8> Function(Pointer<Utf8> request);
typedef _NativeStringFree = Void Function(Pointer<Utf8> value);
typedef _DartStringFree = void Function(Pointer<Utf8> value);

/// Flutter 到 Rust 原生核心的 JSON 请求桥。
///
/// Rust 返回的所有动态字符串均在 `finally` 中释放。密码只在调用的 UTF-8 缓冲区
/// 与 Rust 本次请求的内存中短暂存在，桥接层不缓存、记录或写入它们。
class RustNativeBridge {
  RustNativeBridge._(DynamicLibrary library)
    : _version = library.lookupFunction<_NativeVersionJson, _DartVersionJson>(
        'openwrt_ffi_version_json',
      ),
      _call = library.lookupFunction<_NativeCallJson, _DartCallJson>(
        'openwrt_ffi_call_json',
      ),
      _free = library.lookupFunction<_NativeStringFree, _DartStringFree>(
        'openwrt_ffi_string_free',
      );

  final _DartVersionJson _version;
  final _DartCallJson _call;
  final _DartStringFree _free;

  static RustNativeBridge? tryLoad() {
    if (!Platform.isAndroid) return null;
    try {
      return RustNativeBridge._(DynamicLibrary.open('libopenwrt_ffi.so'));
    } on ArgumentError {
      return null;
    }
  }

  String get versionJson => _version().toDartString();

  RustCallResult call(String action, [Object? payload]) {
    final request = jsonEncode({
      'action': action,
      'payload': payload ?? const {},
    });
    final input = request.toNativeUtf8();
    Pointer<Utf8>? output;
    try {
      output = _call(input);
      if (output.address == 0) {
        return const RustCallResult.error(
          code: 'native_response_missing',
          message: 'Rust 原生库没有返回有效响应。',
        );
      }
      final decoded = jsonDecode(output.toDartString());
      if (decoded is! Map<String, dynamic>) {
        return const RustCallResult.error(
          code: 'native_response_invalid',
          message: 'Rust 原生库返回了无效响应。',
        );
      }
      if (decoded['ok'] == true) {
        return RustCallResult.success(decoded['value']);
      }
      final error = decoded['error'];
      final map = error is Map<String, dynamic>
          ? error
          : const <String, dynamic>{};
      return RustCallResult.error(
        code: map['code'] as String? ?? 'native_error',
        message: map['message'] as String? ?? 'Rust 原生请求失败。',
      );
    } on FormatException {
      return const RustCallResult.error(
        code: 'native_response_invalid',
        message: 'Rust 原生库返回了无法解析的数据。',
      );
    } finally {
      malloc.free(input);
      if (output != null && output.address != 0) _free(output);
    }
  }
}

class RustCallResult {
  const RustCallResult.success(this.value)
    : errorCode = null,
      errorMessage = null;
  const RustCallResult.error({required String code, required String message})
    : value = null,
      errorCode = code,
      errorMessage = message;

  final Object? value;
  final String? errorCode;
  final String? errorMessage;

  String get code => errorCode ?? '';
  String get message => errorMessage ?? '';
  bool get isSuccess => errorCode == null;
}
