use tauri::Manager;

#[tauri::command]
fn smoke_report(payload: String) {
    println!("[smoke] {payload}");
}

fn smoke_enabled() -> bool {
    std::env::var("TF_SMOKE").map(|v| v == "1").unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![smoke_report])
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                println!("[tauri] main window ready, inner size = {:?}", win.inner_size());
            }
            if smoke_enabled() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    for attempt in 1..=3 {
                        std::thread::sleep(std::time::Duration::from_secs(3 * attempt as u64));
                        if let Some(win) = handle.get_webview_window("main") {
                            println!("[tauri] smoke tick {attempt}");
                            let _ = win.eval("window.__tfSmoke && window.__tfSmoke()");
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
