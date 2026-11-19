# SIMATS Secure Exam Browser (Linux & Windows)

> **Unofficial / Reverse-Engineered Port:** This project is an unofficial reverse-engineered reconstruction of the Windows-only SIMATS Browser (`0.1.0`) built to add native Linux support. It is not affiliated with or officially endorsed by SIMATS / Saveetha.

Cross-platform Tauri 2 build of SIMATS Secure Exam Browser with native Linux support (X11 & Wayland) and full Windows parity.

## Quick Build & Install (Any Linux)

1. **Install Rust** (if not already installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Build from source & install** (auto-checks system libraries; pass `--install-deps` to auto-install them):
   ```bash
   ./install.sh --install-deps
   ```

   Options:
   - `./install.sh` — build and install to `~/.local/bin/simats-browser` + app menu
   - `./install.sh --install-deps` — install GTK3 / WebKitGTK 4.1 dependencies via your distro package manager, then build & install
   - `./install.sh --system` — install system-wide to `/usr/local/bin`
   - `./install.sh --uninstall` — remove binary, desktop entry, and icons

## System Dependencies by Distro

Pure-Rust TLS (`rustls`) is used for HTTPS, so OpenSSL development headers are **not** required.

- **Debian / Ubuntu / Linux Mint / Pop!_OS (22.04+):**
  ```bash
  sudo apt-get update && sudo apt-get install -y build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libsoup-3.0-dev
  ```
- **Fedora / RHEL / Nobara:**
  ```bash
  sudo dnf install -y gcc gcc-c++ pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel librsvg2-devel libsoup3-devel
  ```
- **Arch / CachyOS / Manjaro / EndeavourOS:**
  ```bash
  sudo pacman -S --needed base-devel pkgconf gtk3 webkit2gtk-4.1 librsvg libsoup3
  ```
- **openSUSE Tumbleweed / Leap:**
  ```bash
  sudo zypper install -y -t pattern devel_basis && sudo zypper install -y pkg-config gtk3-devel webkit2gtk3-devel librsvg-devel libsoup-devel
  ```
- **Void Linux:**
  ```bash
  sudo xbps-install -Sy base-devel pkg-config gtk+3-devel webkit2gtk41-devel librsvg-devel libsoup3-devel
  ```

## Manual Build

```bash
cargo build --release --manifest-path src-tauri/Cargo.toml
./src-tauri/target/release/simats-browser
```

## Linux Notes

- **Device ID:** Reads `/sys/class/dmi/id/board_serial` → `/sys/class/dmi/id/product_uuid` → `/etc/machine-id` → `/var/lib/dbus/machine-id` → UUID v4 fallback, cached in `$XDG_DATA_HOME/com.simats.browser/.sysdata_cache`.
- **NVIDIA + Wayland blank-screen workaround:** If WebKitGTK renders a blank window on older NVIDIA drivers under Wayland, launch with:
  ```bash
  WEBKIT_DISABLE_DMABUF_RENDERER=1 simats-browser
  ```
