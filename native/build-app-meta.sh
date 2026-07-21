#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
SDK_ROOT=${ANDROID_SDK_ROOT:-/opt/android-sdk}
PLATFORM=${ANDROID_PLATFORM:-android-34}
BUILD_TOOLS=${ANDROID_BUILD_TOOLS:-35.0.0}
MIN_API=${ANDROID_MIN_API:-26}
BUILD_DIR=${APP_META_BUILD_DIR:-$HOME/tmp/corona-app-meta}
SOURCE_FILE="$SCRIPT_DIR/app-meta/src/com/corona/appmeta/AppMeta.java"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/classes" "$BUILD_DIR/dex"

javac -source 8 -target 8 -Xlint:-options \
    -cp "$SDK_ROOT/platforms/$PLATFORM/android.jar" \
    -d "$BUILD_DIR/classes" \
    "$SOURCE_FILE"

"$SDK_ROOT/build-tools/$BUILD_TOOLS/d8" \
    --min-api "$MIN_API" \
    --output "$BUILD_DIR/dex" \
    "$BUILD_DIR/classes/com/corona/appmeta/AppMeta.class"

install -Dm644 "$BUILD_DIR/dex/classes.dex" "$REPO_DIR/bin/app-meta.dex"
