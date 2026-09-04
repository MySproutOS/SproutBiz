use crate::auth;
use crate::config::{self, AgentKind, Config};
use crate::runner;
use anyhow::{Context, Result};
use dialoguer::{Input, MultiSelect, Select, theme::ColorfulTheme};
use std::path::PathBuf;
use std::process::Command;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyStart {
    verify_url: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingState {
    browser_verified_at: Option<String>,
}

const MODULES: [(&str, &str); 4] = [
    ("idea", "Research and post ideas (10 credits when accepted)"),
    ("code", "Contribute code (1–10 credits per monthly review)"),
    ("feedback", "Find bugs or product feedback (1–5 credits)"),
    ("validation", "Validate existing feedback (1 credit)"),
];

#[derive(serde::Deserialize)]
struct ContributionProfile {
    github: Option<GithubIdentity>,
}

#[derive(serde::Deserialize)]
struct GithubIdentity {}

async fn has_github_identity(config: &Config) -> Result<bool> {
    let response = reqwest::Client::new()
        .get(format!(
            "{}/contribution/me",
            config.api_url.trim_end_matches('/')
        ))
        .bearer_auth(auth::agent_token(config).await?)
        .send()
        .await?
        .error_for_status()
        .context("load contribution profile")?
        .json::<ContributionProfile>()
        .await?;
    Ok(response.github.is_some())
}

fn installed(command: &str) -> bool {
    Command::new(command)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn choose_agent(config: &mut Config) -> Result<()> {
    let available: Vec<AgentKind> = [AgentKind::Claude, AgentKind::Codex]
        .into_iter()
        .filter(|agent| installed(agent.command()))
        .collect();
    anyhow::ensure!(
        !available.is_empty(),
        "Install Claude Code or Codex CLI before continuing"
    );
    let labels: Vec<_> = available.iter().map(|agent| agent.command()).collect();
    config.agent = available[Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Which coding agent should SproutBiz use?")
        .items(&labels)
        .default(0)
        .interact()?];
    Ok(())
}

async fn onboarding(config: &mut Config) -> Result<()> {
    choose_agent(config)?;
    config::save(config)?;
    if auth::access_token(config).await.is_err() {
        println!("A verified SproutOS login is required before onboarding can continue.");
        auth::login(config).await?;
    }
    // Force one authenticated API request after OAuth so SproutBiz refreshes the numeric GitHub
    // identity granted by SproutOS before autonomous code-contribution work becomes available.
    auth::access_token(config).await?;
    auth::configure_agent_token(config).await?;
    let token = auth::agent_token(config).await?;
    let client = reqwest::Client::new();
    let start = client
        .post(format!(
            "{}/onboarding/verify/start",
            config.api_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .send()
        .await?
        .error_for_status()
        .context("start browser extension verification")?
        .json::<VerifyStart>()
        .await?;
    let prompt = format!(
        "Use your connected Chrome extension now. Open {}, read the verification nonce visible to this signed-in user, and POST it as JSON {{\"nonce\":\"...\"}} to {}/onboarding/verify/complete using the SPROUTBIZ_ACCESS_TOKEN environment variable as a Bearer token. Do the verification yourself; do not tell the user how to do it.",
        start.verify_url,
        config.api_url.trim_end_matches('/')
    );
    let status = match config.agent {
        AgentKind::Claude => Command::new("claude")
            .args(["-p", &prompt])
            .env("SPROUTBIZ_ACCESS_TOKEN", &token)
            .status()?,
        AgentKind::Codex => Command::new("codex")
            .args(["exec", "--full-auto", &prompt])
            .env("SPROUTBIZ_ACCESS_TOKEN", &token)
            .status()?,
    };
    anyhow::ensure!(
        status.success(),
        "browser extension verification did not complete"
    );
    let state = client
        .get(format!(
            "{}/onboarding",
            config.api_url.trim_end_matches('/')
        ))
        .bearer_auth(&token)
        .send()
        .await?
        .error_for_status()?
        .json::<OnboardingState>()
        .await?;
    anyhow::ensure!(
        state.browser_verified_at.is_some(),
        "the coding agent exited without verifying its browser extension"
    );
    config.onboarding_complete = true;
    config::save(config)?;
    Ok(())
}

async fn settings(config: &mut Config) -> Result<()> {
    let choice = Select::new()
        .with_prompt("Settings")
        .items([
            "Change coding agent",
            "Sign in with SproutOS again",
            "Replace agent token",
            "Set worker counts",
            "Add or replace a module plugin",
            "Log out",
            "Back",
        ])
        .default(6)
        .interact()?;
    match choice {
        0 => choose_agent(config)?,
        1 => auth::login(config).await?,
        2 => {
            auth::configure_agent_token(config).await?;
        }
        3 => {
            config.claude_workers = Input::new()
                .with_prompt("Claude workers per selected module")
                .default(config.claude_workers)
                .interact_text()?;
            config.codex_workers = Input::new()
                .with_prompt("Codex workers per selected module")
                .default(config.codex_workers)
                .interact_text()?;
        }
        4 => {
            let path = PathBuf::from(
                Input::<String>::new()
                    .with_prompt("Plugin directory, or parent containing plugin folders")
                    .interact_text()?,
            );
            let mut prospective = config.plugins.clone();
            prospective.retain(|existing| existing != &path);
            prospective.push(path);
            crate::plugins::discover(&prospective)?;
            config.plugins = prospective;
        }
        5 => {
            auth::logout()?;
            config.onboarding_complete = false;
        }
        _ => {}
    }
    config::save(config)
}

pub async fn run(mut config: Config) -> Result<()> {
    runner::cull_dead_runs()?;
    if !config.onboarding_complete {
        onboarding(&mut config).await?;
    } else {
        auth::access_token(&config).await?;
        auth::agent_token(&config).await?;
    }
    loop {
        println!("\nWhat would you like the agent to do?");
        let github_linked = has_github_identity(&config).await?;
        if !github_linked {
            println!(
                "Code contributions are unavailable until a GitHub account is linked in SproutOS."
            );
        }
        let available_modules: Vec<_> = MODULES
            .iter()
            .filter(|(module, _)| *module != "code" || github_linked)
            .collect();
        let mut labels: Vec<&str> = available_modules.iter().map(|(_, label)| *label).collect();
        labels.extend(["Settings", "Exit"]);
        let selection = MultiSelect::with_theme(&ColorfulTheme::default())
            .items(&labels)
            .interact()?;
        let settings_index = available_modules.len();
        let exit_index = settings_index + 1;
        if selection.contains(&exit_index) {
            return Ok(());
        }
        if selection.contains(&settings_index) {
            settings(&mut config).await?;
        }
        for index in selection
            .into_iter()
            .filter(|index| *index < available_modules.len())
        {
            let module = available_modules[index].0;
            let count = match config.agent {
                AgentKind::Claude => config.claude_workers,
                AgentKind::Codex => config.codex_workers,
            };
            for _ in 0..count {
                let token = auth::agent_token(&config).await?;
                let id = runner::start(&config, module, &token)
                    .with_context(|| format!("start the {module} module"))?;
                println!("Started {module} in the background ({id})");
            }
        }
        runner::cull_dead_runs()?;
    }
}
