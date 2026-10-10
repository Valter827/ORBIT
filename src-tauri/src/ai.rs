use crate::{config, main_only, settings, AppState};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderInput {
    provider: settings::ProviderSettings,
    api_key: Option<String>,
    disconnect: bool,
}
#[tauri::command]
pub async fn save_provider(
    app: AppHandle,
    window: WebviewWindow,
    input: ProviderInput,
) -> Result<(), String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _lock = state.mutation.lock().unwrap();
        if state.core.call("status", json!({}))?["busy"]
            .as_bool()
            .unwrap_or(false)
        {
            return Err("Stop active AI work first".into());
        }
        if input
            .api_key
            .as_ref()
            .is_some_and(|k| k.len() > 1000 || k.contains(['\n', '\r']))
        {
            return Err("Invalid API key".into());
        }
        let old = state.settings.lock().unwrap().clone();
        let mut next = old.clone();
        let id = input.provider.id.clone();
        let changed_origin = old.providers.iter().find(|p| p.id == id).is_some_and(|p| {
            p.endpoint != input.provider.endpoint || p.kind != input.provider.kind
        });
        next.providers.retain(|p| p.id != id);
        next.providers.push(input.provider);
        state
            .core
            .call("providers.validate", json!(next.providers))?;
        let old_key = settings::provider_key(&id)?;
        let key = if input.disconnect {
            String::new()
        } else {
            input
                .api_key
                .filter(|k| !k.trim().is_empty())
                .map(|k| k.trim().to_string())
                .unwrap_or(if changed_origin {
                    String::new()
                } else {
                    old_key.clone()
                })
        };
        let mut payload = config(&next, &state.data, settings::key()?);
        payload["providerKeys"][&id] = json!(key);
        if id == "anthropic" {
            payload["key"] = json!(key);
        }
        state.core.call("configure", payload)?;
        let entry = settings::provider_entry(&id)?;
        let result = (|| {
            if key.is_empty() {
                match entry.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => {}
                    Err(_) => return Err("Cannot remove provider credential".to_string()),
                }
            } else {
                entry
                    .set_password(&key)
                    .map_err(|_| "Cannot store provider credential".to_string())?;
            }
            settings::save(&state.data, &next)?;
            Ok(())
        })();
        if let Err(error) = result {
            if old_key.is_empty() {
                let _ = entry.delete_credential();
            } else {
                let _ = entry.set_password(&old_key);
            }
            let _ = state.core.call(
                "configure",
                config(&old, &state.data, settings::key().unwrap_or_default()),
            );
            return Err(error);
        }
        *state.settings.lock().unwrap() = next;
        Ok(())
    })
    .await
    .map_err(|_| "Provider settings worker failed")?
}
#[tauri::command]
pub async fn export_ai(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    include_knowledge: Option<bool>,
    include_data: Option<bool>,
) -> Result<Value, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let data = app.state::<AppState>().core.call(
            if include_data.unwrap_or(false) {
                "ai.dataExport"
            } else {
                "ai.export"
            },
            if include_data.unwrap_or(false) {
                json!({"id":id})
            } else {
                json!({"id":id,"includeKnowledge":include_knowledge.unwrap_or(false)})
            },
        )?;
        let text = data["text"].as_str().ok_or("Invalid AI export")?;
        let selected = app
            .dialog()
            .file()
            .set_title("Export AI profile")
            .set_file_name(if include_data.unwrap_or(false) {
                "AI-private-data.json"
            } else {
                "Profile.orbit-ai"
            })
            .add_filter("ORBIT data", &["orbit-ai", "json"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(Value::Null);
        };
        let path = selected
            .into_path()
            .map_err(|_| "Unsupported export path")?;
        std::fs::write(&path, text).map_err(|_| "Unable to export profile")?;
        Ok(json!({"saved":true}))
    })
    .await
    .map_err(|_| "Export worker failed")?
}

#[tauri::command]
pub async fn add_knowledge(
    app: AppHandle,
    window: WebviewWindow,
    profile_id: String,
    folder: bool,
    spaces: Option<Vec<String>>,
) -> Result<Value, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let picker = app
            .dialog()
            .file()
            .set_title("Add knowledge — originals are never modified");
        let selected = if folder {
            picker.blocking_pick_folder().map(|p| vec![p])
        } else {
            picker.blocking_pick_files()
        };
        let Some(selected) = selected else {
            return Ok(Value::Null);
        };
        let paths: Result<Vec<String>, String> = selected
            .into_iter()
            .map(|p| {
                p.into_path()
                    .map(|p| p.to_string_lossy().to_string())
                    .map_err(|_| "Unsupported source path".to_string())
            })
            .collect();
        app.state::<AppState>().core.call(
            "knowledge.ingest",
            json!({"profileId":profile_id,"paths":paths?,"spaces":spaces.unwrap_or_default()}),
        )
    })
    .await
    .map_err(|_| "Knowledge selection failed")?
}
