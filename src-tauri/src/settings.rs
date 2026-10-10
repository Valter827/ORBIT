use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub providers: Vec<ProviderSettings>,
    pub projects: Vec<String>,
    pub workspace: Option<String>,
    pub model: String,
    pub verification_command: String,
    pub files_enabled: bool,
    pub terminal_enabled: bool,
    pub close_behavior: String,
    pub notifications: bool,
    pub shortcut: String,
    pub palette_shortcut: String,
    pub settings_shortcut: String,
    pub new_task_shortcut: String,
    pub onboarding: bool,
    pub tray_explained: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            providers: vec![ProviderSettings {
                id: "anthropic".into(),
                name: "Anthropic".into(),
                kind: "anthropic".into(),
                endpoint: String::new(),
                remote_acknowledged: false,
                local_inference_confirmed: false,
            }],
            projects: vec![],
            workspace: None,
            model: "claude-sonnet-4-6".into(),
            verification_command: "npm test".into(),
            files_enabled: true,
            terminal_enabled: true,
            close_behavior: "exit".into(),
            notifications: true,
            shortcut: "Ctrl+Space".into(),
            palette_shortcut: "Ctrl+K".into(),
            settings_shortcut: "Ctrl+,".into(),
            new_task_shortcut: "Ctrl+N".into(),
            onboarding: false,
            tray_explained: false,
        }
    }
}
pub fn load(data: &Path) -> Result<Settings, String> {
    let file = data.join("settings/settings.json");
    if !file.exists() {
        return Ok(Settings::default());
    }
    serde_json::from_slice(&fs::read(file).map_err(|_| "Cannot read settings")?)
        .map_err(|_| "Settings are invalid; preserve your AppData and contact support.".into())
}
pub fn save(data: &Path, settings: &Settings) -> Result<(), String> {
    fs::create_dir_all(data.join("settings")).map_err(|_| "Cannot create settings directory")?;
    let tmp = data.join("settings/settings.tmp");
    let mut file = fs::File::create(&tmp).map_err(|_| "Cannot save settings")?;
    file.write_all(&serde_json::to_vec_pretty(settings).map_err(|_| "Cannot encode settings")?)
        .map_err(|_| "Cannot save settings")?;
    file.sync_all().map_err(|_| "Cannot flush settings")?;
    drop(file);
    fs::rename(tmp, data.join("settings/settings.json"))
        .map_err(|_| "Cannot replace settings".into())
}
pub fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.orbit.personal-agent", "anthropic")
        .map_err(|_| "Windows Credential Manager is unavailable".into())
}
pub fn key() -> Result<String, String> {
    match entry()?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(_) => Err("Unable to read Windows Credential Manager".into()),
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderSettings {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub endpoint: String,
    pub remote_acknowledged: bool,
    pub local_inference_confirmed: bool,
}
pub fn provider_entry(id: &str) -> Result<keyring::Entry, String> {
    if id.is_empty()
        || id.len() > 64
        || !id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Invalid provider identity".into());
    }
    if id == "anthropic" {
        return entry();
    }
    keyring::Entry::new("app.orbit.personal-agent", &format!("provider:{id}"))
        .map_err(|_| "Windows Credential Manager is unavailable".into())
}
pub fn provider_key(id: &str) -> Result<String, String> {
    match provider_entry(id)?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(_) => Err("Cannot read provider credential".into()),
    }
}
