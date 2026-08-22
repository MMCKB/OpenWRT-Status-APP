#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_HOME:?请设置 ANDROID_HOME 为 Android SDK 根目录}"
: "${ANDROID_NDK_HOME:?请设置 ANDROID_NDK_HOME 为 Android NDK 根目录}"

if ! command -v dx >/dev/null 2>&1; then
  echo "缺少 Dioxus CLI；请执行 cargo install dioxus-cli --locked" >&2
  exit 1
fi

HOST_TAG="$(uname -s | tr '[:upper:]' '[:lower:]')-x86_64"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/${HOST_TAG}/bin/aarch64-linux-android21-clang"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="${ROOT}/crates/openwrt-mobile"
OVERLAY_DIR="${ROOT}/android-overlay/app/src/main"
ANDROID_PROJECT="${ROOT}/target/dx/openwrt-mobile/release/android/app"
ANDROID_APP="${ANDROID_PROJECT}/app"
MANIFEST="${ANDROID_APP}/src/main/AndroidManifest.xml"
RESOURCES="${ANDROID_APP}/src/main/res"

# 在内存受限的 CI 或本地环境中保持两次 Gradle 调用可预测，避免守护进程占满可用内存。
export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8"

cd "${MOBILE_DIR}"
dx bundle --platform android --target aarch64-linux-android --release

if [[ ! -d "${OVERLAY_DIR}/res" || ! -f "${MANIFEST}" ]]; then
  echo "Dioxus 生成的 Android 工程或资源覆盖层缺失。" >&2
  exit 1
fi

# Dioxus 0.7.x 不会稳定地将 bundle 图标应用到 Android 输出。每次生成后都删除
# 默认启动图标并覆盖版本控制的自适应图标资源；其中 monochrome 层供 Android 13+
# 系统主题图标使用。
find "${RESOURCES}" -type f -path '*/mipmap-*/ic_launcher.*' -delete
cp -R "${OVERLAY_DIR}/res/." "${RESOURCES}/"

# 不拦截系统预测性返回动画；Activity 级别显式启用 Android 13+ OnBackInvoked 支持。
if ! grep -q 'android:enableOnBackInvokedCallback="true"' "${MANIFEST}"; then
  sed -i \
    's#<application android:hasCode=#<application android:enableOnBackInvokedCallback="true" android:roundIcon="@mipmap/ic_launcher" android:hasCode=#' \
    "${MANIFEST}"
fi

grep -q 'android:enableOnBackInvokedCallback="true"' "${MANIFEST}"
grep -q '<monochrome android:drawable="@drawable/openwrt_launcher_monochrome"' \
  "${RESOURCES}/mipmap-anydpi-v26/ic_launcher.xml"

# 重新运行 Gradle，使上述版本控制资源进入最终 AAB，而不是仅停留在生成目录中。
cd "${ANDROID_PROJECT}"
./gradlew --no-daemon :app:bundleRelease

find "${ANDROID_APP}/build/outputs/bundle/release" -type f -name '*.aab' -print
