#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod ai;
mod bridge;
mod sense;
mod settings;
use bridge::Bridge;
use serde_json::{json, Value};
use settings::Settings;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::AppHandleExt as WindowStateExt;

pub struct AppState {
    core: Arc<Bridge>,
    settings: Mutex<Settings>,
    data: PathBuf,
    mutation: Mutex<()>,
    exiting: AtomicBool,
    warning: Mutex<String>,
}
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        Err("This operation is only available in the main window".into())
    } else {
        Ok(())
    }
}
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
fn quick_ask(app: &AppHandle) {
    // WebView2 creation must not block the Windows event-loop thread.
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || quick_ask_window(&app));
}
fn quick_ask_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html?quick=1".into()))
        .title("ORBIT Quick Ask")
        .inner_size(640.0, 240.0)
        .resizable(false)
        .center()
        .always_on_top(true)
        .on_navigation(|url| {
            matches!(url.scheme(), "tauri" | "http")
                && matches!(
                    url.host_str(),
                    Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")
                )
        })
        .build();
}
fn config(settings: &Settings, data: &std::path::Path, key: String) -> Value {
    let keys: serde_json::Map<String, Value> = settings
        .providers
        .iter()
        .map(|p| {
            (
                p.id.clone(),
                json!(settings::provider_key(&p.id).unwrap_or_default()),
            )
        })
        .collect();
    json!({"providers":settings.providers,"providerKeys":keys,"workspace":settings.workspace,"stateDirectory":data.to_string_lossy(),"key":key,"model":settings.model,
      "verificationCommand":settings.verification_command,"filesEnabled":settings.files_enabled,"terminalEnabled":settings.terminal_enabled})
}
fn commit_project(state: &AppState, next: Settings) -> Result<(), String> {
    let previous = state.settings.lock().unwrap().clone();
    let key = settings::key()?;
    state
        .core
        .call("configure", config(&next, &state.data, key.clone()))?;
    if let Err(error) = settings::save(&state.data, &next) {
        state
            .core
            .call("configure", config(&previous, &state.data, key))
            .map_err(|_| "Project change failed. Restart ORBIT before running tasks.")?;
        return Err(error);
    }
    *state.settings.lock().unwrap() = next;
    Ok(())
}
fn validate_project(raw: &str, data: &std::path::Path) -> Result<String, String> {
    let path =
        dunce::canonicalize(raw).map_err(|_| "Project folder is unavailable. Select it again.")?;
    if !path.is_dir() {
        return Err("Select a folder".into());
    }
    let private = dunce::canonicalize(data).map_err(|_| "Private data directory is unavailable")?;
    if path.starts_with(&private) || private.starts_with(&path) {
        return Err("Projects must not contain ORBIT private data or be inside it".into());
    }
    std::fs::read_dir(&path).map_err(|_| "Project access is denied")?;
    Ok(path.to_string_lossy().into())
}
fn shutdown(app: AppHandle) {
    let state = app.state::<AppState>();
    if state.exiting.swap(true, Ordering::SeqCst) {
        return;
    }
    let core = state.core.clone();
    tauri::async_runtime::spawn_blocking(move || match core.call("shutdown", json!({})) {
        Ok(_) => {
            let _ = app.save_window_state(tauri_plugin_window_state::StateFlags::all());
            app.exit(0);
        }
        Err(error) => {
            app.state::<AppState>()
                .exiting
                .store(false, Ordering::SeqCst);
            show_main(&app);
            let _ = app.emit_to("main", "orbit-error", error);
        }
    });
}
fn request_exit(app: AppHandle) {
    show_main(&app);
    let core = app.state::<AppState>().core.clone();
    tauri::async_runtime::spawn_blocking(move || match core.call("status", json!({})) {
        Ok(status) if status["busy"].as_bool().unwrap_or(false) => {
            let _ = app.emit_to("main", "orbit-exit-required", ());
        }
        Ok(_) => shutdown(app),
        Err(error) => {
            let _ = app.emit_to("main", "orbit-error", error);
        }
    });
}
#[tauri::command]
async fn desktop_state(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move|| {
        let state=app.state::<AppState>();
        let settings=state.settings.lock().unwrap().clone();
        let projects:Vec<Value>=settings.projects.iter().map(|p|json!({"path":p,"available":validate_project(p,&state.data).is_ok()})).collect();
        Ok(json!({"settings":settings,"projects":projects,"hasKey":!settings::key().unwrap_or_default().is_empty(),
            "version":app.package_info().version.to_string(),"warning":state.warning.lock().unwrap().clone(),
            "autostart":app.autolaunch().is_enabled().unwrap_or(false)}))
    }).await.map_err(|_|"Settings worker failed")?
}
#[tauri::command]
async fn core_command(
    app: AppHandle,
    window: WebviewWindow,
    method: String,
    params: Value,
) -> Result<Value, String> {
    main_only(&window)?;
    if ![
        "ai.preview",
        "ai.packagePreview",
        "ai.versions",
        "ai.restore",
        "ai.memorySearchInfo",
        "ai.memoryClear",
        "ai.memoryCreate",
        "ai.memorySuggestions",
        "ai.memoryDecide",
        "ai.memoryEdit",
        "ai.memoryReview",
        "ai.memoryExport",
        "ai.memoryRecords",
        "ai.memoryUpdate",
        "ai.clearConversations",
        "ai.dataSummary",
        "ai.knowledgeRetained",
        "ai.knowledgeRecover",
        "ai.knowledgeJobs",
        "ai.knowledgeResume",
        "ai.knowledgeSpaces",
        "ai.knowledgeSpaceCreate",
        "ai.knowledgeSpaceAccess",
        "ai.knowledgeSpaceAssign",
        "ai.knowledgeSpaceRemove",
        "ai.knowledgeStatus",
        "ai.knowledgeCancel",
        "ai.knowledgeList",
        "ai.knowledgePreview",
        "ai.knowledgeSearch",
        "ai.knowledgeNote",
        "ai.knowledgeRemove",
        "ai.knowledgeReindex",
        "ai.knowledgeSettings",
        "ai.knowledgeSettingsGet",
        "ai.state",
        "ai.models",
        "ai.test",
        "ai.detect",
        "ai.hardware",
        "ai.brainTest",
        "ai.capabilityTest",
        "ai.brainHealth",
        "ai.localDownload",
        "ai.localDownloadStatus",
        "ai.localDownloadCancel",
        "ai.saveProfile",
        "ai.create",
        "ai.duplicate",
        "ai.delete",
        "ai.select",
        "ai.localOnly",
        "ai.export",
        "ai.importPreview",
        "ai.import",
        "ai.memory",
        "ai.memoryAdd",
        "ai.memoryDelete",
        "chat.start",
        "chat.status",
        "chat.stop",
        "chat.history",
        "chat.rename",
        "chat.delete",
        "chat.messages",
        "status",
        "pause",
        "resume",
        "history",
        "historyEvents",
        "start",
        "stop",
        "answer",
        "undo",
        "files",
        "read",
        "testConnection",
    ]
    .contains(&method.as_str())
    {
        return Err("Unsupported operation".into());
    }
    let core = app.state::<AppState>().core.clone();
    tauri::async_runtime::spawn_blocking(move || core.call(&method, params))
        .await
        .map_err(|_| "Core worker failed")?
}
#[tauri::command]
async fn choose_project(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selection = app
            .dialog()
            .file()
            .set_title("Choose an ORBIT project")
            .blocking_pick_folder();
        let Some(selection) = selection else {
            return Ok(Value::Null);
        };
        let selected = selection
            .into_path()
            .map_err(|_| "Unsupported project location")?;
        let state = app.state::<AppState>();
        let _lock = state.mutation.lock().unwrap();
        let canonical = validate_project(&selected.to_string_lossy(), &state.data)?;
        if state.core.call("status", json!({}))?["busy"]
            .as_bool()
            .unwrap_or(false)
        {
            return Err("Stop the active task first".into());
        }
        let mut next = state.settings.lock().unwrap().clone();
        if !next.projects.contains(&canonical) {
            next.projects.push(canonical.clone());
        }
        next.workspace = Some(canonical.clone());
        commit_project(&state, next)?;
        Ok(json!({"path":canonical}))
    })
    .await
    .map_err(|_| "Folder picker failed")?
}
#[tauri::command]
async fn select_project(
    app: AppHandle,
    window: WebviewWindow,
    project: String,
) -> Result<(), String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _lock = state.mutation.lock().unwrap();
        let mut next = state.settings.lock().unwrap().clone();
        if !next.projects.contains(&project) {
            return Err("Add this project with the native folder picker first".into());
        }
        next.workspace = Some(validate_project(&project, &state.data)?);
        commit_project(&state, next)?;
        Ok(())
    })
    .await
    .map_err(|_| "Project worker failed")?
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SettingsInput {
    model: String,
    verification_command: String,
    files_enabled: bool,
    terminal_enabled: bool,
    close_behavior: String,
    notifications: bool,
    shortcut: String,
    palette_shortcut: String,
    settings_shortcut: String,
    new_task_shortcut: String,
    onboarding: bool,
    autostart: bool,
    api_key: Option<String>,
    disconnect: bool,
}
#[tauri::command]
async fn save_settings(
    app: AppHandle,
    window: WebviewWindow,
    input: SettingsInput,
) -> Result<(), String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        if input.model.is_empty()
            || input.model.len() > 200
            || !["exit", "tray"].contains(&input.close_behavior.as_str())
            || input.shortcut.len() > 80
            || !valid_local_shortcuts(&[
                &input.palette_shortcut,
                &input.settings_shortcut,
                &input.new_task_shortcut,
            ])
            || input.verification_command.trim().is_empty()
            || input.verification_command.len() > 2000
            || input
                .api_key
                .as_ref()
                .is_some_and(|key| key.len() > 1000 || key.contains(['\n', '\r']))
        {
            return Err("Invalid settings".into());
        }
        let state = app.state::<AppState>();
        let _lock = state.mutation.lock().unwrap();
        if state.core.call("status", json!({}))?["busy"]
            .as_bool()
            .unwrap_or(false)
        {
            return Err("Stop the active task before changing settings".into());
        }
        let old = state.settings.lock().unwrap().clone();
        let old_autostart = app.autolaunch().is_enabled().unwrap_or(false);
        let old_key = settings::key()?;
        let key = if input.disconnect {
            String::new()
        } else {
            input
                .api_key
                .filter(|k| !k.trim().is_empty())
                .map(|k| k.trim().to_string())
                .unwrap_or(old_key.clone())
        };
        let mut next = old.clone();
        next.model = input.model;
        next.verification_command = input.verification_command;
        next.files_enabled = input.files_enabled;
        next.terminal_enabled = input.terminal_enabled;
        next.close_behavior = input.close_behavior;
        next.notifications = input.notifications;
        next.shortcut = input.shortcut;
        next.palette_shortcut = input.palette_shortcut;
        next.settings_shortcut = input.settings_shortcut;
        next.new_task_shortcut = input.new_task_shortcut;
        next.onboarding = input.onboarding;
        let changed = next.shortcut != old.shortcut;
        if changed && !next.shortcut.is_empty() {
            app.global_shortcut()
                .register(next.shortcut.as_str())
                .map_err(|_| "Shortcut is unavailable. Choose another combination.")?;
        }
        let result = (|| {
            state
                .core
                .call("configure", config(&next, &state.data, key.clone()))?;
            if key.is_empty() {
                match settings::entry()?.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => {}
                    Err(_) => return Err("Cannot remove stored API key".into()),
                }
            } else {
                settings::entry()?
                    .set_password(&key)
                    .map_err(|_| "Cannot save API key in Windows Credential Manager")?;
            }
            if input.autostart && !old_autostart {
                app.autolaunch()
                    .enable()
                    .map_err(|_| "Cannot enable Windows startup")?;
            } else if !input.autostart && old_autostart {
                app.autolaunch()
                    .disable()
                    .map_err(|_| "Cannot disable Windows startup")?;
            }
            settings::save(&state.data, &next)?;
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            if changed && !next.shortcut.is_empty() {
                let _ = app.global_shortcut().unregister(next.shortcut.as_str());
            }
            let _ = state
                .core
                .call("configure", config(&old, &state.data, old_key.clone()));
            if let Ok(entry) = settings::entry() {
                if old_key.is_empty() {
                    let _ = entry.delete_credential();
                } else {
                    let _ = entry.set_password(&old_key);
                }
            }
            if old_autostart {
                let _ = app.autolaunch().enable();
            } else {
                let _ = app.autolaunch().disable();
            }
            return Err(error);
        }
        if changed && !old.shortcut.is_empty() {
            let _ = app.global_shortcut().unregister(old.shortcut.as_str());
        }
        *state.settings.lock().unwrap() = next;
        *state.warning.lock().unwrap() = String::new();
        Ok(())
    })
    .await
    .map_err(|_| "Settings worker failed")?
}
#[tauri::command]
fn window_action(app: AppHandle, window: WebviewWindow, action: String) -> Result<(), String> {
    main_only(&window)?;
    match action.as_str() {
        "quick" => quick_ask(&app),
        "exit" => request_exit(app),
        "stop-exit" => shutdown(app),
        "keep-running" => {
            sense::stop(&app);
            window.hide().map_err(|_| "Cannot hide window")?;
        }
        "logs" => {
            let directory = app.state::<AppState>().data.join("logs");
            app.opener()
                .open_path(directory.to_string_lossy(), None::<&str>)
                .map_err(|_| "Cannot open logs folder")?;
        }
        "ollama-install" => {
            app.opener()
                .open_url("https://ollama.com/download/windows", None::<&str>)
                .map_err(|_| "Cannot open official Ollama installer page")?;
        }
        "docs" => {
            app.opener()
                .open_url("https://docs.anthropic.com/", None::<&str>)
                .map_err(|_| "Cannot open documentation")?;
        }
        _ => return Err("Unsupported window action".into()),
    }
    Ok(())
}
#[tauri::command]
fn quick_submit(app: AppHandle, window: WebviewWindow, request: String) -> Result<(), String> {
    if window.label() != "quick" || request.trim().is_empty() || request.len() > 10000 {
        return Err("Invalid Quick Ask request".into());
    }
    show_main(&app);
    app.emit_to("main", "orbit-quick", request)
        .map_err(|_| "Main window unavailable")?;
    window.hide().map_err(|_| "Cannot hide Quick Ask")?;
    Ok(())
}
fn valid_local_shortcuts(values: &[&str]) -> bool {
    let mut seen = std::collections::HashSet::new();
    values.iter().all(|value| {
        if value.is_empty() {
            return true;
        }
        let lower = value.to_ascii_lowercase();
        let mut parts = lower.split('+').collect::<Vec<_>>();
        let key = parts.pop().unwrap_or("");
        value.len() < 40
            && key.chars().count() == 1
            && !parts.is_empty()
            && parts
                .iter()
                .all(|part| ["ctrl", "alt", "shift", "meta"].contains(part))
            && seen.insert(lower)
    })
}
#[tauri::command]
async fn quick_sense(app: AppHandle, window: WebviewWindow, request: String) -> Result<(), String> {
    if !["quick", "main"].contains(&window.label()) || request.len() > 5000 {
        return Err("Invalid Sense entry.".into());
    }
    show_main(&app);
    app.emit_to("main", "orbit-sense", request)
        .map_err(|_| "Could not open Sense.")?;
    if window.label() == "quick" {
        let _ = window.hide();
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["quick"])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        quick_ask(app)
                    }
                })
                .build(),
        )
        .manage(sense::SenseState::default())
        .invoke_handler(tauri::generate_handler![
            sense::sense_command,
            ai::save_provider,
            ai::export_ai,
            ai::add_knowledge,
            desktop_state,
            core_command,
            choose_project,
            select_project,
            save_settings,
            window_action,
            quick_submit,
            quick_sense
        ])
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            for name in ["database", "settings", "logs", "undo", "cache"] {
                std::fs::create_dir_all(data.join(name))?;
            }
            let mut settings = settings::load(&data).map_err(std::io::Error::other)?;
            let mut warning = String::new();
            if let Some(project) = settings.workspace.clone() {
                match validate_project(&project, &data) {
                    Ok(path) => settings.workspace = Some(path),
                    Err(_) => {
                        settings.workspace = None;
                        warning =
                            "The previous project is unavailable. Select a project again.".into();
                    }
                }
            }
            let resources = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
            } else {
                app.path().resource_dir()?
            };
            let bridge = Arc::new(
                Bridge::spawn(app.handle().clone(), &resources, &data)
                    .map_err(std::io::Error::other)?,
            );
            let key = match settings::key() {
                Ok(key) => key,
                Err(error) => {
                    warning = error;
                    String::new()
                }
            };
            bridge
                .call("configure", config(&settings, &data, key))
                .map_err(std::io::Error::other)?;
            if !settings.shortcut.is_empty()
                && app
                    .global_shortcut()
                    .register(settings.shortcut.as_str())
                    .is_err()
            {
                warning =
                    "Quick Ask shortcut could not be registered. Change it in Settings.".into();
            }
            app.manage(AppState {
                core: bridge,
                settings: Mutex::new(settings),
                data,
                mutation: Mutex::new(()),
                exiting: AtomicBool::new(false),
                warning: Mutex::new(warning),
            });
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                        || (cfg!(debug_assertions)
                            && url.scheme() == "http"
                            && url.host_str() == Some("127.0.0.1")
                            && url.port() == Some(1420))
                })
                .build()?;
            use tauri::menu::{Menu, MenuItem};
            let items = [
                ("open", "Open ORBIT"),
                ("ask", "Ask ORBIT"),
                ("new", "New Agent Task"),
                ("pause", "Pause Agents"),
                ("settings", "Settings"),
                ("quit", "Quit ORBIT"),
            ];
            let menu_items: Vec<_> = items
                .iter()
                .map(|(id, label)| MenuItem::with_id(app, *id, *label, true, None::<&str>))
                .collect::<Result<_, _>>()?;
            let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = menu_items
                .iter()
                .map(|i| i as &dyn tauri::menu::IsMenuItem<_>)
                .collect();
            let menu = Menu::with_items(app, &refs)?;
            let pause_item = menu_items[3].clone();
            tauri::tray::TrayIconBuilder::with_id("orbit")
                .icon(
                    app.default_window_icon()
                        .ok_or("Missing ORBIT icon")?
                        .clone(),
                )
                .tooltip("ORBIT — Your computer, understood.")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "ask" => quick_ask(app),
                    "new" | "settings" => {
                        show_main(app);
                        let _ = app.emit_to("main", "orbit-navigation", event.id.as_ref());
                    }
                    "pause" => {
                        let pause_item = pause_item.clone();
                        let core = app.state::<AppState>().core.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            if let Ok(status) = core.call("status", json!({})) {
                                let paused = status["paused"].as_bool().unwrap_or(false);
                                if core
                                    .call(if paused { "resume" } else { "pause" }, json!({}))
                                    .is_ok()
                                {
                                    let _ = pause_item.set_text(if paused {
                                        "Pause Agents"
                                    } else {
                                        "Resume Agents"
                                    });
                                }
                            }
                        });
                    }
                    "quit" => request_exit(app.clone()),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, WindowEvent::Resized(_))
                && window.is_minimized().unwrap_or(false)
            {
                sense::stop(window.app_handle());
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "quick" {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }
                let app = window.app_handle();
                sense::stop(app);
                let state = app.state::<AppState>();
                if state.exiting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    return;
                }
                api.prevent_close();
                let mut settings = state.settings.lock().unwrap();
                if settings.close_behavior == "tray" {
                    if !settings.tray_explained {
                        settings.tray_explained = true;
                        let _ = settings::save(&state.data, &settings);
                        let _ = app.emit_to("main", "orbit-tray-explained", ());
                    } else {
                        let _ = window.hide();
                    }
                } else {
                    drop(settings);
                    request_exit(app.clone());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("ORBIT could not initialize")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<AppState>().exiting.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    request_exit(app.clone());
                }
            }
        });
}
