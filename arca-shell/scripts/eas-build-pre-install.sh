#!/usr/bin/env bash
# EAS Build: @dr.pogodin/react-native-static-server necesita cmake en el host
# (iOS archive → "cmake: command not found" sin esto).
set -euo pipefail

echo "[arca-shell] eas-build-pre-install platform=${EAS_BUILD_PLATFORM:-unknown}"

if [[ "${EAS_BUILD_PLATFORM:-}" == "ios" ]]; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install cmake pkg-config
  # Xcode / scripts de CocoaPods no siempre ven el PATH de Homebrew (Apple Silicon).
  if [[ -x /opt/homebrew/bin/cmake ]]; then
    sudo ln -sf /opt/homebrew/bin/cmake /usr/local/bin/cmake
    sudo ln -sf /opt/homebrew/bin/pkg-config /usr/local/bin/pkg-config
  elif [[ -x /usr/local/bin/cmake ]]; then
    echo "[arca-shell] cmake already on /usr/local/bin"
  fi
  cmake --version
  pkg-config --version || true
elif [[ "${EAS_BUILD_PLATFORM:-}" == "android" ]]; then
  # Android suele traer CMake vía Android SDK; no forzar brew.
  echo "[arca-shell] android: skipping brew cmake (SDK tools)"
fi
