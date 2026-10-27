use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

/// Plan ouvert depuis le système (double-clic, « Ouvrir avec »), en attente d'être lu par l'interface.
#[derive(serde::Serialize)]
struct PlanFile {
    path: String,
    content: String,
}

#[derive(Default)]
struct PendingPlans(Mutex<Vec<PlanFile>>);

fn is_plan(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pplan"))
}

/// Lit les plans demandés par le système, les garde en attente et prévient l'interface.
fn open_paths(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let mut opened = false;
    for path in paths.into_iter().filter(|p| is_plan(p)) {
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                let file = PlanFile {
                    path: path.to_string_lossy().into_owned(),
                    content,
                };
                app.state::<PendingPlans>().0.lock().unwrap().push(file);
                opened = true;
            }
            Err(err) => eprintln!("[plan] lecture impossible {}: {err}", path.display()),
        }
    }
    if opened {
        let _ = app.emit("plan-opened", ());
    }
}

/// Renvoie les plans en attente et vide la file : chaque plan n'est chargé qu'une fois.
#[tauri::command]
fn take_pending_plans(pending: State<PendingPlans>) -> Vec<PlanFile> {
    std::mem::take(&mut *pending.0.lock().unwrap())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tauri_app = tauri::Builder::default()
        // Windows / Linux : un second double-clic envoie son chemin à la fenêtre déjà ouverte
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            open_paths(app, args.iter().skip(1).map(PathBuf::from));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(PendingPlans::default())
        .invoke_handler(tauri::generate_handler![take_pending_plans])
        .setup(|app| {
            // Windows / Linux : chemin passé en argument au premier lancement
            open_paths(app.handle(), std::env::args_os().skip(1).map(PathBuf::from));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Planete Plan");

    tauri_app.run(|app, event| match event {
        // macOS : double-clic dans le Finder ou « Ouvrir avec » arrive comme un événement
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            open_paths(app, urls.into_iter().filter_map(|u| u.to_file_path().ok()));
        }
        _ => {}
    });
}
