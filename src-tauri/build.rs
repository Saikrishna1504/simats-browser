fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "fetch_exam_url",
                "verify_exit_password",
                "get_device_id",
                "secure_exit",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
