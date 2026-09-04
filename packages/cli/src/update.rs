use anyhow::{Context, Result, bail};
use dialoguer::Confirm;
use semver::Version;
use serde::Deserialize;
use std::io::Write;
use std::process::Command;

const RELEASES_LATEST: &str = "https://api.github.com/repos/MySproutOS/SproutBiz/releases/latest";
const INSTALL_SCRIPT: &str = "https://sproutos.biz/install.sh";

#[derive(Deserialize)]
struct Release {
    tag_name: String,
}

async fn latest() -> Result<Option<Version>> {
    let response = reqwest::Client::new()
        .get(RELEASES_LATEST)
        .header("User-Agent", "sproutbiz-cli")
        .send()
        .await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let release = response.error_for_status()?.json::<Release>().await?;
    Ok(Some(Version::parse(
        release.tag_name.trim_start_matches("biz-v"),
    )?))
}

pub async fn check_and_prompt() -> Result<()> {
    let Some(latest) = latest().await? else {
        return Ok(());
    };
    let current = Version::parse(env!("CARGO_PKG_VERSION"))?;
    if latest > current
        && Confirm::new()
            .with_prompt(format!("SproutBiz CLI {latest} is available. Upgrade now?"))
            .default(true)
            .interact()?
    {
        upgrade().await?;
    }
    Ok(())
}

pub async fn upgrade() -> Result<()> {
    let script = reqwest::Client::new()
        .get(INSTALL_SCRIPT)
        .header("User-Agent", "sproutbiz-cli")
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    let mut file = tempfile::NamedTempFile::new().context("create temporary installer")?;
    file.write_all(&script)?;
    let status = Command::new("sh").arg(file.path()).status()?;
    if !status.success() {
        bail!("installer exited with {status}")
    }
    Ok(())
}
