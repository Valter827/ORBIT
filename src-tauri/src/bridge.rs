use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
type Reply = mpsc::Sender<Result<Value, String>>;
pub struct Bridge {
    input: Mutex<ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, Reply>>>,
    sequence: AtomicU64,
    _child: Mutex<Child>,
}
impl Bridge {
    pub fn spawn(app: AppHandle, resources: &Path, data: &Path) -> Result<Self, String> {
        // Tauri can return Windows extended-length paths. Node entry-point resolution
        // requires the ordinary canonical form for paths that fit MAX_PATH.
        let resources = dunce::canonicalize(resources)
            .map_err(|_| "Bundled ORBIT resources are unavailable")?;
        let data = dunce::canonicalize(data).map_err(|_| "ORBIT data directory is unavailable")?;
        let runtime = resources.join("node");
        let mut command = Command::new(runtime.join("node.exe"));
        command
            .arg("--disable-warning=ExperimentalWarning")
            .arg(resources.join("core/host.mjs"))
            .current_dir(data)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .env(
                "PATH",
                format!(
                    "{};{}",
                    runtime.display(),
                    std::env::var("PATH").unwrap_or_default()
                ),
            )
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .env_remove("ANTHROPIC_API_KEY");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|_| "Unable to start the bundled ORBIT core. Reinstall the application.")?;
        let input = child.stdin.take().ok_or("Core input unavailable")?;
        let output = child.stdout.take().ok_or("Core output unavailable")?;
        let pending: Arc<Mutex<HashMap<u64, Reply>>> = Arc::new(Mutex::new(HashMap::new()));
        let replies = pending.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                let Ok(value) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(id) = value["id"].as_u64() {
                    if let Some(reply) = replies.lock().unwrap().remove(&id) {
                        let result = if let Some(error) = value["error"].as_str() {
                            Err(error.to_string())
                        } else {
                            Ok(value["result"].clone())
                        };
                        let _ = reply.send(result);
                    }
                } else if value["topic"].is_string() {
                    let _ = app.emit_to("main", "orbit-core", &value);
                    if let Some(state) = app.try_state::<crate::AppState>() {
                        if state.settings.lock().unwrap().notifications {
                            let kind = value["payload"]["type"].as_str().unwrap_or("");
                            let message = match kind {
                                "agent.completed" => {
                                    Some("Task completed and verification passed.")
                                }
                                "permission.required" => {
                                    Some("Permission required. Open ORBIT to review the action.")
                                }
                                "agent.failed" => Some("Task failed. Open ORBIT for details."),
                                _ => None,
                            };
                            if let Some(message) = message {
                                let _ = app
                                    .notification()
                                    .builder()
                                    .title("ORBIT")
                                    .body(message)
                                    .show();
                            }
                        }
                    }
                }
            }
            for (_, reply) in replies.lock().unwrap().drain() {
                let _=reply.send(Err("ORBIT core stopped. Restart ORBIT; unfinished tasks will be marked interrupted.".into()));
            }
            let _ = app.emit_to("main", "orbit-core", json!({"topic":"crash"}));
        });
        Ok(Self {
            input: Mutex::new(input),
            pending,
            sequence: AtomicU64::new(1),
            _child: Mutex::new(child),
        })
    }
    pub fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel();
        self.pending.lock().unwrap().insert(id, tx);
        let message = serde_json::to_vec(&json!({"id":id,"method":method,"params":params}))
            .map_err(|_| "Cannot encode request")?;
        let written = {
            let mut input = self.input.lock().unwrap();
            input
                .write_all(&message)
                .and_then(|_| input.write_all(b"\n"))
                .and_then(|_| input.flush())
        };
        if written.is_err() {
            self.pending.lock().unwrap().remove(&id);
            return Err("Core is unavailable".into());
        }
        let reply = rx.recv_timeout(Duration::from_secs(90));
        self.pending.lock().unwrap().remove(&id);
        reply.map_err(|_|"Core operation timed out. The task may still be running; check Agents before retrying.".to_string())?
    }
}
