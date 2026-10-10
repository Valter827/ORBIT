use crate::{main_only, AppState};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Default)]
pub struct SenseState {
    epoch: AtomicU64,
    session: Mutex<Option<Value>>,
    choices: Mutex<Value>,
    snapshot: Mutex<Option<Value>>,
    analyzing: Mutex<bool>,
}
pub fn stop(app: &AppHandle) {
    let state = app.state::<SenseState>();
    let cancelled_epoch = state.epoch.fetch_add(1, Ordering::SeqCst);
    *state.session.lock().unwrap() = None;
    *state.snapshot.lock().unwrap() = None;
    if *state.analyzing.lock().unwrap() {
        let core = app.state::<AppState>().core.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _ = core.call("sense.cancel", json!({"epoch":cancelled_epoch}));
        });
    }
}
fn helper(app: &AppHandle, input: Value, epoch: u64) -> Result<Value, String> {
    let powershell =
        std::path::PathBuf::from(std::env::var("SystemRoot").unwrap_or("C:\\Windows".into()))
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            include_str!("sense-helper.ps1"),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Windows Sense helper is unavailable or blocked by policy.")?;
    if let Some(mut input_pipe) = child.stdin.take() {
        writeln!(input_pipe, "{input}").map_err(|_| "Sense input unavailable.")?;
    }
    let output = child.stdout.take().ok_or("Sense output unavailable.")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        output
            .take(3_000_000)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let start = Instant::now();
    let success = loop {
        if app.state::<SenseState>().epoch.load(Ordering::SeqCst) != epoch
            || app.get_webview_window("main").map_or(true, |w| {
                !w.is_visible().unwrap_or(false) || w.is_minimized().unwrap_or(true)
            })
            || start.elapsed() > Duration::from_secs(20)
        {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Err("Sense stopped or timed out. No new context was shared.".into());
        }
        if let Some(status) = child.try_wait().map_err(|_| "Sense helper failed.")? {
            break status.success();
        }
        std::thread::sleep(Duration::from_millis(40));
    };
    let bytes = reader
        .join()
        .map_err(|_| "Sense helper failed.")?
        .map_err(|_| "Sense output failed.")?;
    if !success {
        return Err("Sense could not read this scope or optional Windows component. Check access and try another visible window.".into());
    }
    let result: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Windows returned an unreadable Sense response.")?;
    if result.get("error").is_some() {
        return Err("Sense capture is unavailable for this scope.".into());
    }
    Ok(result)
}
fn session(app: &AppHandle, params: &Value) -> Result<Value, String> {
    let current = app
        .state::<SenseState>()
        .session
        .lock()
        .unwrap()
        .clone()
        .ok_or("Start sharing first.")?;
    if params["sessionId"] != current["sessionId"] {
        return Err("Sense session changed. Share again.".into());
    }
    Ok(current)
}
#[tauri::command]
pub async fn sense_command(
    app: AppHandle,
    window: WebviewWindow,
    action: String,
    params: Value,
) -> Result<Value, String> {
    main_only(&window)?;
    if action == "stop" {
        stop(&app);
        return Ok(json!({"stopped":true}));
    }
    if !window.is_visible().unwrap_or(false) || window.is_minimized().unwrap_or(true) {
        stop(&app);
        return Err("Open ORBIT to use Sense. Background capture is disabled.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SenseState>();
        let epoch = state.epoch.load(Ordering::SeqCst);
        match action.as_str() {
            "windows" => {
                let choices = helper(&app, json!({"action":"windows"}), epoch)?;
                *state.choices.lock().unwrap() = choices.clone();
                Ok(choices)
            }
            "start" => {
                stop(&app);
                let profile_id = params["profileId"].as_str().ok_or("Choose an AI.")?;
                let ai = app.state::<AppState>().core.call("ai.state", json!({}))?;
                let profile = ai["profiles"].as_array().and_then(|ps| ps.iter().find(|p| p["id"] == profile_id)).ok_or("AI unavailable.")?;
                if !profile["senseEnabled"].as_bool().unwrap_or(false) { return Err("Enable Sense for this AI first.".into()); }
                let scope = params["scope"].as_str().ok_or("Select a scope.")?;
                if !["current-window", "application", "display"].contains(&scope) { return Err("Invalid scope.".into()); }
                let choices = state.choices.lock().unwrap();
                let target = choices[if scope == "display" { "displays" } else { "windows" }]
                    .as_array().and_then(|ws| ws.iter().find(|w| w["id"] == params["targetId"])).cloned().ok_or("Refresh windows and select a visible target.")?;
                let current = json!({"sessionId":state.epoch.load(Ordering::SeqCst), "profileId":profile_id, "scope":scope, "target":target, "mode":"one-time"});
                *state.session.lock().unwrap() = Some(current.clone());
                Ok(current)
            }
            "capture" => {
                let current = session(&app, &params)?;
                *state.snapshot.lock().unwrap() = None;
                let raw = helper(&app, json!({"action":"capture", "scope":current["scope"], "target":current["target"], "snapshot":params["snapshot"].as_bool().unwrap_or(false)}), epoch)?;
                let cleaned = app.state::<AppState>().core.call("sense.sanitize", raw)?;
                if state.epoch.load(Ordering::SeqCst) != epoch { return Err("Sense stopped.".into()); }
                *state.snapshot.lock().unwrap() = Some(cleaned.clone());
                Ok(cleaned)
            }
            "ask" => {
                let current = session(&app, &params)?;
                let snapshot = state.snapshot.lock().unwrap().clone().ok_or("Capture the shared window first.")?;
                {
                    let mut busy = state.analyzing.lock().unwrap();
                    if *busy { return Err("Sense is already analyzing.".into()); }
                    *busy = true;
                }
                let result = app.state::<AppState>().core.call("sense.analyze", json!({"epoch":epoch,"input":{
                    "profileId":current["profileId"], "snapshot":snapshot, "question":params["question"],
                    "acknowledgedDestination":params["acknowledgedDestination"].as_str().unwrap_or(""),
                    "includeImage":params["includeImage"].as_bool().unwrap_or(false)
                }}));
                *state.analyzing.lock().unwrap() = false;
                if state.epoch.load(Ordering::SeqCst) != epoch { return Err("Sense stopped.".into()); }
                result
            }
            "voice" => { session(&app, &params)?; helper(&app, json!({"action":"voice"}), epoch).map_err(|_| "Microphone or offline Windows speech recognition is unavailable, stopped, or timed out. Type your question instead.".into()) },
            _ => Err("Unsupported Sense operation. Pilot is not enabled.".into()),
        }
    }).await.map_err(|_| "Sense worker failed.")?
}
