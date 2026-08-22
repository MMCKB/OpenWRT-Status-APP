plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.openwrtstatus.openwrt_status_flutter"
    compileSdk = flutter.compileSdkVersion
    // 与 Rust cdylib 构建统一使用 Android NDK r27d LTS。
    ndkVersion = "27.3.13750724"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.openwrtstatus.openwrt_status_flutter"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

val buildRustFfiArm64 by tasks.registering(Exec::class) {
    group = "build"
    description = "Builds the Rust OpenWrt core cdylib for Flutter ARM64 APKs."
    workingDir = rootProject.projectDir.parentFile
    commandLine("bash", "tool/build-rust-ffi-arm64.sh")
    environment(
        "ANDROID_NDK_HOME",
        System.getenv("ANDROID_NDK_HOME")
            ?: System.getenv("ANDROID_NDK_ROOT")
            ?: "${android.sdkDirectory}/ndk/${android.ndkVersion}",
    )
}

tasks.named("preBuild").configure {
    dependsOn(buildRustFfiArm64)
}
