#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_NDK_HOME:?请设置 ANDROID_NDK_HOME 为 Android NDK 根目录}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "缺少 Cargo；请安装 Rust 1.98 工具链。" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST_TAG="$(uname -s | tr '[:upper:]' '[:lower:]')-x86_64"
LINKER="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/${HOST_TAG}/bin/aarch64-linux-android21-clang"
OUTPUT_DIR="${ROOT}/flutter_client/android/app/src/main/jniLibs/arm64-v8a"

if [[ ! -x "${LINKER}" ]]; then
  echo "找不到 Android ARM64 链接器：${LINKER}" >&2
  exit 1
fi

export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="${LINKER}"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_AR="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/${HOST_TAG}/bin/llvm-ar"
# `ring` 等依赖通过 cc-rs 读取该目标专属变量，而非 Cargo 的 linker 变量。
export CC_aarch64_linux_android="${LINKER}"
export CXX_aarch64_linux_android="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/${HOST_TAG}/bin/aarch64-linux-android21-clang++"
export AR_aarch64_linux_android="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/${HOST_TAG}/bin/llvm-ar"

cd "${ROOT}/rust"
cargo build -p openwrt-ffi --target aarch64-linux-android --release

mkdir -p "${OUTPUT_DIR}"
cp "${ROOT}/rust/target/aarch64-linux-android/release/libopenwrt_ffi.so" "${OUTPUT_DIR}/libopenwrt_ffi.so"
printf 'Copied Rust ARM64 library: %s\n' "${OUTPUT_DIR}/libopenwrt_ffi.so"
