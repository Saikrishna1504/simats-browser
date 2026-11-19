#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="simats-browser"
BIN_SRC="$ROOT_DIR/src-tauri/target/release/$APP_NAME"
DESKTOP_SRC="$ROOT_DIR/packaging/simats-browser.desktop"

INSTALL_DEPS=0
SYSTEM_INSTALL=0
UNINSTALL=0
SKIP_BUILD=0

usage() {
  cat <<'EOF'
Usage: ./install.sh [OPTIONS]

Build SIMATS Browser from source and install it on Linux.

Options:
  --install-deps   Install required system libraries using the detected package manager (uses sudo)
  --system         Install system-wide to /usr/local (default: user install in ~/.local)
  --no-build       Skip cargo build and install the existing release binary
  --uninstall      Remove installed binary, desktop entry, and icons
  -h, --help       Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-deps) INSTALL_DEPS=1 ;;
    --system)       SYSTEM_INSTALL=1 ;;
    --no-build)     SKIP_BUILD=1 ;;
    --uninstall)    UNINSTALL=1 ;;
    -h|--help)      usage; exit 0 ;;
    *)              echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ $SYSTEM_INSTALL -eq 1 ]]; then
  BIN_DIR="/usr/local/bin"
  DATA_DIR="/usr/local/share"
  SUDO="sudo"
else
  BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
  DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
  SUDO=""
fi

APP_DIR="$DATA_DIR/applications"
ICON_BASE="$DATA_DIR/icons/hicolor"

if [[ $UNINSTALL -eq 1 ]]; then
  echo "Removing SIMATS Browser from $BIN_DIR and $DATA_DIR..."
  $SUDO rm -f \
    "$BIN_DIR/$APP_NAME" \
    "$APP_DIR/simats-browser.desktop" \
    "$ICON_BASE/32x32/apps/$APP_NAME.png" \
    "$ICON_BASE/128x128/apps/$APP_NAME.png" \
    "$ICON_BASE/256x256/apps/$APP_NAME.png"
  command -v update-desktop-database >/dev/null 2>&1 && $SUDO update-desktop-database "$APP_DIR" 2>/dev/null || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && $SUDO gtk-update-icon-cache -f -t "$ICON_BASE" 2>/dev/null || true
  echo "Uninstalled."
  exit 0
fi

detect_install_cmd() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "sudo apt-get update && sudo apt-get install -y build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libsoup-3.0-dev"
  elif command -v dnf >/dev/null 2>&1; then
    echo "sudo dnf install -y gcc gcc-c++ pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel librsvg2-devel libsoup3-devel"
  elif command -v pacman >/dev/null 2>&1; then
    echo "sudo pacman -S --needed base-devel pkgconf gtk3 webkit2gtk-4.1 librsvg libsoup3"
  elif command -v zypper >/dev/null 2>&1; then
    echo "sudo zypper install -y -t pattern devel_basis && sudo zypper install -y pkg-config gtk3-devel webkit2gtk3-devel librsvg-devel libsoup-devel"
  elif command -v xbps-install >/dev/null 2>&1; then
    echo "sudo xbps-install -Sy base-devel pkg-config gtk+3-devel webkit2gtk41-devel librsvg-devel libsoup3-devel"
  else
    echo ""
  fi
}

check_native_deps() {
  local missing=()
  if ! command -v pkg-config >/dev/null 2>&1; then
    missing+=("pkg-config")
  else
    for pc in gtk+-3.0 webkit2gtk-4.1 libsoup-3.0; do
      if ! pkg-config --exists "$pc" 2>/dev/null; then
        missing+=("$pc")
      fi
    done
  fi
  if ! command -v cc >/dev/null 2>&1; then
    missing+=("C compiler (gcc/clang)")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Missing system build dependencies: ${missing[*]}" >&2
    local cmd
    cmd="$(detect_install_cmd)"
    if [[ $INSTALL_DEPS -eq 1 ]]; then
      if [[ -z "$cmd" ]]; then
        echo "Unsupported package manager. Install GTK 3, WebKitGTK 4.1, libsoup 3, pkg-config, and a C compiler manually." >&2
        exit 1
      fi
      echo "Installing dependencies: $cmd"
      bash -c "$cmd"
    else
      if [[ -n "$cmd" ]]; then
        echo "Install them with:" >&2
        echo "  $cmd" >&2
        echo "Or re-run with: ./install.sh --install-deps" >&2
      else
        echo "Install GTK 3, WebKitGTK 4.1, libsoup 3, pkg-config, and a C compiler via your distro package manager." >&2
      fi
      exit 1
    fi
  fi
}

if [[ $SKIP_BUILD -eq 0 ]]; then
  check_native_deps

  if ! command -v cargo >/dev/null 2>&1; then
    echo "Rust/Cargo not found. Install Rust via rustup:" >&2
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" >&2
    exit 1
  fi

  echo "Building SIMATS Browser (release)..."
  cargo build --release --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml"
fi

if [[ ! -x "$BIN_SRC" ]]; then
  echo "Release binary not found at $BIN_SRC" >&2
  exit 1
fi

echo "Installing binary to $BIN_DIR/$APP_NAME..."
$SUDO install -d "$BIN_DIR" "$APP_DIR" \
  "$ICON_BASE/32x32/apps" \
  "$ICON_BASE/128x128/apps" \
  "$ICON_BASE/256x256/apps"

$SUDO install -m 755 "$BIN_SRC" "$BIN_DIR/$APP_NAME"
$SUDO install -m 644 "$ROOT_DIR/src-tauri/icons/32x32.png"  "$ICON_BASE/32x32/apps/$APP_NAME.png"
$SUDO install -m 644 "$ROOT_DIR/src-tauri/icons/128x128.png" "$ICON_BASE/128x128/apps/$APP_NAME.png"
$SUDO install -m 644 "$ROOT_DIR/src-tauri/icons/icon.png"   "$ICON_BASE/256x256/apps/$APP_NAME.png"

# Write desktop entry with absolute Exec path so GUI launchers work even if ~/.local/bin is not in PATH.
TMP_DESKTOP="$(mktemp)"
trap 'rm -f "$TMP_DESKTOP"' EXIT
sed "s|^Exec=.*|Exec=$BIN_DIR/$APP_NAME|" "$DESKTOP_SRC" > "$TMP_DESKTOP"
$SUDO install -m 644 "$TMP_DESKTOP" "$APP_DIR/simats-browser.desktop"

command -v update-desktop-database >/dev/null 2>&1 && $SUDO update-desktop-database "$APP_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && $SUDO gtk-update-icon-cache -f -t "$ICON_BASE" 2>/dev/null || true

echo ""
echo "SIMATS Browser installed successfully."
echo "  Binary:        $BIN_DIR/$APP_NAME"
echo "  Desktop entry: $APP_DIR/simats-browser.desktop"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "  Note: $BIN_DIR is not in your shell PATH; launch from your app menu or run $BIN_DIR/$APP_NAME"
fi
