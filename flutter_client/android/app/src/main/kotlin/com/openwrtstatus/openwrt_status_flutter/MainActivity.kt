package com.openwrtstatus.openwrt_status_flutter

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "openwrt_status_flutter/storage",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "applicationFilesPath" -> result.success(filesDir.absolutePath)
                else -> result.notImplemented()
            }
        }
    }
}
