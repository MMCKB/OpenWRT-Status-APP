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
cd "${ROOT}/crates/openwrt-mobile"

dx bundle --platform android --target aarch64-linux-android --release

find "${ROOT}/target/dx/openwrt-mobile/release/android" -type f -name '*.aab' -print
