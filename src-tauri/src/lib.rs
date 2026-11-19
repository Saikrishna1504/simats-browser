use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use uuid::Uuid;

const SERVER_BASE_URL: &str = "http://simatslab.saveetha.com/server-php";
const EXAM_USER_AGENT: &str = "SimatsSecureBrowser/1.0 Chrome";
const INIT_SCRIPT: &str = include_str!("init_script.js");

static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

fn is_valid_serial(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    !matches!(
        lower.as_str(),
        "none"
            | "unknown"
            | "default string"
            | "to be filled by o.e.m."
            | "not specified"
            | "not applicable"
            | "n/a"
            | "0"
            | "00000000-0000-0000-0000-000000000000"
    )
}

#[cfg(target_os = "windows")]
fn resolve_hardware_id() -> Option<String> {
    use std::collections::HashMap;
    use wmi::{COMLibrary, Variant, WMIConnection};

    let com = COMLibrary::new().ok()?;
    let wmi_con = WMIConnection::new(com).ok()?;

    for query in [
        "SELECT SerialNumber FROM Win32_BaseBoard",
        "SELECT SerialNumber FROM Win32_PhysicalMedia",
    ] {
        if let Ok(results) = wmi_con.raw_query::<HashMap<String, Variant>>(query) {
            for row in results {
                if let Some(Variant::String(serial)) = row.get("SerialNumber") {
                    if is_valid_serial(serial) {
                        return Some(serial.trim().to_string());
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn resolve_hardware_id() -> Option<String> {
    // Prefer motherboard/DMI serial when readable (e.g. via udev rules or elevated perms),
    // then fall back to the world-readable persistent OS machine-id.
    const CANDIDATES: &[&str] = &[
        "/sys/class/dmi/id/board_serial",
        "/sys/class/dmi/id/product_uuid",
        "/etc/machine-id",
        "/var/lib/dbus/machine-id",
    ];

    for path in CANDIDATES {
        if let Ok(raw) = fs::read_to_string(path) {
            if is_valid_serial(&raw) {
                return Some(raw.trim().to_string());
            }
        }
    }
    None
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn resolve_hardware_id() -> Option<String> {
    None
}

#[tauri::command]
async fn fetch_exam_url() -> Result<String, String> {
    let url = format!("{}/get_exam_url.php", SERVER_BASE_URL);
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Server error (HTTP {})", status.as_u16()));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err("No URL found in the database".to_string());
    }

    Ok(trimmed.to_string())
}

#[tauri::command]
async fn verify_exit_password(password: String) -> Result<bool, String> {
    let url = format!("{}/verify_password.php", SERVER_BASE_URL);
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .form(&[("password", password)])
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Server error (HTTP {})", status.as_u16()));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    Ok(body.trim() == "true")
}

#[tauri::command]
fn get_device_id(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "No app data dir found".to_string())?;
    let cache_path = app_dir.join(".sysdata_cache");

    if cache_path.exists() {
        let cached = fs::read_to_string(&cache_path).map_err(|e| format!("Read error: {}", e))?;
        let trimmed = cached.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    let device_id = resolve_hardware_id().unwrap_or_else(|| Uuid::new_v4().to_string());

    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Write error: {}", e))?;
    }
    fs::write(&cache_path, &device_id).map_err(|e| format!("Write error: {}", e))?;

    Ok(device_id)
}

#[tauri::command]
fn secure_exit(app: tauri::AppHandle) {
    ALLOW_EXIT.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg(target_os = "windows")]
fn start_windows_keyboard_hook() {
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, RegisterHotKey, MOD_ALT, VK_CONTROL, VK_ESCAPE, VK_LMENU, VK_LWIN,
        VK_MENU, VK_RMENU, VK_RWIN, VK_TAB,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, WH_KEYBOARD_LL, WM_HOTKEY,
    };

    unsafe extern "system" fn keyboard_hook_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 {
            let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            if (kb.flags.0 & LLKHF_INJECTED.0) == 0 {
                let vk = kb.vkCode as u16;
                let block = vk == VK_LWIN.0
                    || vk == VK_RWIN.0
                    || vk == VK_MENU.0
                    || vk == VK_LMENU.0
                    || vk == VK_RMENU.0
                    || (vk == VK_ESCAPE.0 && GetAsyncKeyState(VK_CONTROL.0 as i32) < 0);
                if block {
                    return LRESULT(1);
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    let _ = std::thread::Builder::new()
        .name("simats-kb-hook".into())
        .spawn(|| unsafe {
            let _ = RegisterHotKey(None, 1, MOD_ALT, VK_TAB.0 as u32);
            let _ = RegisterHotKey(None, 2, MOD_ALT, VK_ESCAPE.0 as u32);
            let _hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), None, 0);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_HOTKEY {
                    continue;
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
}

#[cfg(target_os = "linux")]
fn apply_linux_lockdown(window: &tauri::WebviewWindow) {
    use gtk::gdk::{keys::constants as key, ModifierType};
    use gtk::glib::Propagation;
    use gtk::prelude::*;
    use webkit2gtk::{
        DeviceInfoPermissionRequest, PermissionRequestExt, SettingsExt, UserMediaPermissionRequest,
        WebViewExt,
    };

    if let Ok(gtk_win) = window.gtk_window() {
        gtk_win.set_keep_above(true);
        gtk_win.set_deletable(false);
        gtk_win.fullscreen();

        // Intercept escape/close/devtools/reload shortcuts at the GTK level before WebKit sees them.
        gtk_win.connect_key_press_event(|_, event| {
            let keyval = event.keyval();
            let mods = event.state();
            let ctrl = mods.contains(ModifierType::CONTROL_MASK);
            let alt = mods.contains(ModifierType::MOD1_MASK);
            let super_mod =
                mods.contains(ModifierType::SUPER_MASK) || mods.contains(ModifierType::META_MASK);

            let blocked = super_mod
                || matches!(
                    keyval,
                    key::Super_L | key::Super_R | key::Meta_L | key::Meta_R | key::F11 | key::F12
                )
                || (alt && matches!(keyval, key::F4 | key::Tab | key::ISO_Left_Tab | key::Escape))
                || (ctrl
                    && matches!(
                        keyval,
                        key::Escape | key::r | key::R | key::w | key::W | key::q | key::Q
                    ));

            if blocked {
                Propagation::Stop
            } else {
                Propagation::Proceed
            }
        });
    }

    let _ = window.with_webview(|webview| {
        let wv = webview.inner();

        // Suppress native WebKitGTK context menu (prevents Inspect Element / Reload / Back).
        wv.connect_context_menu(|_, _, _, _| true);

        // Allow camera/microphone access for proctored exam portals (matches WebView2).
        wv.connect_permission_request(|_, request| {
            if request.is::<UserMediaPermissionRequest>()
                || request.is::<DeviceInfoPermissionRequest>()
            {
                request.allow();
                return true;
            }
            false
        });

        if let Some(settings) = WebViewExt::settings(&wv) {
            settings.set_enable_media_stream(true);
            #[cfg(not(debug_assertions))]
            settings.set_enable_developer_extras(false);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Secure Exam Browser")
            .fullscreen(true)
            .always_on_top(true)
            .decorations(false)
            .resizable(false)
            .user_agent(EXAM_USER_AGENT)
            .initialization_script(INIT_SCRIPT)
            .build()?;

            let _ = window.set_content_protected(true);

            window.on_window_event(|event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    if !ALLOW_EXIT.load(Ordering::SeqCst) {
                        api.prevent_close();
                    }
                }
            });

            #[cfg(target_os = "windows")]
            start_windows_keyboard_hook();

            #[cfg(target_os = "linux")]
            apply_linux_lockdown(&window);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_exam_url,
            verify_exit_password,
            get_device_id,
            secure_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_oem_placeholder_serials() {
        assert!(!is_valid_serial(""));
        assert!(!is_valid_serial("   "));
        assert!(!is_valid_serial("To be filled by O.E.M."));
        assert!(!is_valid_serial("Default string"));
        assert!(!is_valid_serial("None"));
        assert!(!is_valid_serial("00000000-0000-0000-0000-000000000000"));
        assert!(is_valid_serial("a1b2c3d4e5f60718293a4b5c6d7e8f90"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn resolves_non_empty_linux_hardware_id() {
        let id = resolve_hardware_id().expect("expected /etc/machine-id or DMI serial on Linux");
        assert!(is_valid_serial(&id));
        assert!(id.len() >= 8);
    }
}
