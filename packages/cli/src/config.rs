use anyhow::{Context, Result};
use directories::UserDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentKind {
    Claude,
    Codex,
}

impl AgentKind {
    pub fn command(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub agent: AgentKind,
    #[serde(default = "one")]
    pub claude_workers: usize,
    #[serde(default = "one")]
    pub codex_workers: usize,
    #[serde(default)]
    pub onboarding_complete: bool,
    #[serde(default = "default_api_url")]
    pub api_url: String,
    #[serde(default = "default_oauth_authorize_url")]
    pub oauth_authorize_url: String,
    #[serde(default = "default_oauth_token_url")]
    pub oauth_token_url: String,
    #[serde(default = "default_oauth_client_id")]
    pub oauth_client_id: String,
    #[serde(default)]
    pub plugins: Vec<PathBuf>,
}

fn one() -> usize {
    1
}

fn default_api_url() -> String {
    "https://sproutos.biz/api/v1".into()
}

fn default_oauth_authorize_url() -> String {
    "https://sproutos.me/oauth/authorize".into()
}

fn default_oauth_token_url() -> String {
    "https://api.sproutos.me/v1/oauth/token".into()
}

fn default_oauth_client_id() -> String {
    option_env!("SPROUTBIZ_OAUTH_CLIENT_ID")
        .filter(|client_id| !client_id.is_empty())
        .unwrap_or("sproutbiz-cli")
        .into()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            agent: AgentKind::Codex,
            claude_workers: 1,
            codex_workers: 1,
            onboarding_complete: false,
            api_url: default_api_url(),
            oauth_authorize_url: default_oauth_authorize_url(),
            oauth_token_url: default_oauth_token_url(),
            oauth_client_id: default_oauth_client_id(),
            plugins: Vec::new(),
        }
    }
}

pub fn root_dir() -> Result<PathBuf> {
    Ok(UserDirs::new()
        .context("could not locate your home directory")?
        .home_dir()
        .join(".sproutbiz"))
}

pub fn config_path() -> Result<PathBuf> {
    Ok(root_dir()?.join("config.toml"))
}

pub fn load() -> Result<Config> {
    ensure_private_dir(&root_dir()?)?;
    ensure_private_dir(&root_dir()?.join("plugins"))?;
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    toml::from_str(&fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?)
        .with_context(|| format!("parse {}", path.display()))
}

pub fn save(config: &Config) -> Result<()> {
    let path = config_path()?;
    ensure_private_dir(path.parent().context("configuration path has no parent")?)?;
    let body = toml::to_string_pretty(config)?;
    fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

pub fn ensure_private_dir(path: &Path) -> Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
