#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
NDK_ROOT=${ANDROID_NDK_HOME:-/opt/android-sdk/ndk/29.0.14206865}
TARGET_DIR=${CARGO_TARGET_DIR:-/root/tmp/coronad-target}
API=${ANDROID_API:-26}
NDK_HOST=${ANDROID_NDK_HOST:-linux-x86_64}

export CARGO_TARGET_DIR="$TARGET_DIR"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK_ROOT/toolchains/llvm/prebuilt/$NDK_HOST/bin/aarch64-linux-android${API}-clang"

cargo build --manifest-path "$SCRIPT_DIR/coronad/Cargo.toml" --release --target aarch64-linux-android
install -Dm755 "$TARGET_DIR/aarch64-linux-android/release/coronad" "$REPO_DIR/bin/coronad"
