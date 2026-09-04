use crate::config::Config;
use anyhow::{Context, Result, bail};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const KEYRING_SERVICE: &str = "sproutbiz-cli";
const ACCESS_TOKEN_ACCOUNT: &str = "oauth-access-token";
const REFRESH_TOKEN_ACCOUNT: &str = "oauth-refresh-token";
const AGENT_TOKEN_ACCOUNT: &str = "agent-token";
const LOOPBACK_REDIRECT: &str = "127.0.0.1:61337";

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthMeResponse {
    auth_method: String,
    scopes: Vec<String>,
}

const REQUIRED_AGENT_SCOPES: [&str; 5] = [
    "forum:read",
    "forum:write",
    "business:write",
    "onboarding:write",
    "contribution:write",
];

fn random_urlsafe(bytes: usize) -> String {
    let mut data = vec![0_u8; bytes];
    rand::rng().fill_bytes(&mut data);
    URL_SAFE_NO_PAD.encode(data)
}

fn store(account: &str, value: &str) -> Result<()> {
    keyring::Entry::new(KEYRING_SERVICE, account)?.set_password(value)?;
    Ok(())
}

fn stored_access_token() -> Result<String> {
    keyring::Entry::new(KEYRING_SERVICE, ACCESS_TOKEN_ACCOUNT)?
        .get_password()
        .context("not logged in; run `biz login`")
}

fn stored_agent_token() -> Result<String> {
    keyring::Entry::new(KEYRING_SERVICE, AGENT_TOKEN_ACCOUNT)?
        .get_password()
        .context(
            "no SproutBiz agent token configured; paste one from https://sproutos.biz/onboarding",
        )
}

async fn validate_agent_token(config: &Config, token: &str) -> Result<()> {
    let auth_me = reqwest::Client::new()
        .get(format!("{}/auth/me", config.api_url.trim_end_matches('/')))
        .bearer_auth(token)
        .send()
        .await?
        .error_for_status()
        .context("SproutBiz rejected the agent token")?
        .json::<AuthMeResponse>()
        .await?;
    anyhow::ensure!(
        auth_me.auth_method == "token",
        "SproutBiz did not recognize this as an agent token"
    );
    let missing = REQUIRED_AGENT_SCOPES
        .iter()
        .filter(|scope| !auth_me.scopes.iter().any(|granted| granted == **scope))
        .copied()
        .collect::<Vec<_>>();
    anyhow::ensure!(
        missing.is_empty(),
        "agent token is missing required scope(s): {}",
        missing.join(", ")
    );
    Ok(())
}

pub async fn configure_agent_token(config: &Config) -> Result<()> {
    let token = dialoguer::Password::new()
        .with_prompt("Paste the agent token from https://sproutos.biz/onboarding")
        .allow_empty_password(false)
        .interact()?;
    let token = token.trim();
    validate_agent_token(config, token).await?;
    store(AGENT_TOKEN_ACCOUNT, token)?;
    println!("Agent token verified and stored in your operating-system keyring.");
    Ok(())
}

pub async fn agent_token(config: &Config) -> Result<String> {
    let token = stored_agent_token()?;
    validate_agent_token(config, &token).await?;
    Ok(token)
}

pub async fn access_token(config: &Config) -> Result<String> {
    let access_token = stored_access_token()?;
    let response = reqwest::Client::new()
        .get(format!("{}/auth/me", config.api_url.trim_end_matches('/')))
        .bearer_auth(&access_token)
        .send()
        .await?;
    if response.status().is_success() {
        return Ok(access_token);
    }
    if response.status() != reqwest::StatusCode::UNAUTHORIZED
        && response.status() != reqwest::StatusCode::FORBIDDEN
    {
        response.error_for_status()?;
    }

    let refresh_token = keyring::Entry::new(KEYRING_SERVICE, REFRESH_TOKEN_ACCOUNT)?
        .get_password()
        .context("SproutOS login expired; run `biz login` again")?;
    let token = reqwest::Client::new()
        .post(&config.oauth_token_url)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", config.oauth_client_id.as_str()),
            ("refresh_token", refresh_token.as_str()),
        ])
        .send()
        .await?
        .error_for_status()
        .context("refresh SproutOS login")?
        .json::<TokenResponse>()
        .await?;
    store(ACCESS_TOKEN_ACCOUNT, &token.access_token)?;
    if let Some(refresh_token) = token.refresh_token {
        store(REFRESH_TOKEN_ACCOUNT, &refresh_token)?;
    }
    Ok(token.access_token)
}

pub fn logout() -> Result<()> {
    for account in [
        ACCESS_TOKEN_ACCOUNT,
        REFRESH_TOKEN_ACCOUNT,
        AGENT_TOKEN_ACCOUNT,
    ] {
        let entry = keyring::Entry::new(KEYRING_SERVICE, account)?;
        if entry.get_password().is_ok() {
            entry.delete_credential()?;
        }
    }
    Ok(())
}

pub async fn login(config: &Config) -> Result<()> {
    // OAuth redirect URIs are exact-match security boundaries. A stable high loopback port lets
    // SproutOS register one precise URI instead of accepting arbitrary local callbacks.
    let listener = TcpListener::bind(LOOPBACK_REDIRECT)
        .await
        .context("open the local OAuth callback on port 61337")?;
    let redirect_uri = format!("http://{LOOPBACK_REDIRECT}/callback");
    let state = random_urlsafe(24);
    let verifier = random_urlsafe(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut authorize = reqwest::Url::parse(&config.oauth_authorize_url)?;
    authorize.query_pairs_mut().extend_pairs([
        ("response_type", "code"),
        ("client_id", config.oauth_client_id.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("scope", "openid email profile github:identity"),
        ("state", state.as_str()),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
    ]);
    open::that(authorize.as_str()).context("open your browser for SproutOS login")?;
    println!("Complete the SproutOS authorization in your browser…");

    let (mut stream, _) = listener.accept().await?;
    let mut request = vec![0_u8; 8192];
    let read = stream.read(&mut request).await?;
    let request = String::from_utf8_lossy(&request[..read]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .context("invalid OAuth callback")?;
    let callback = reqwest::Url::parse(&format!("http://{LOOPBACK_REDIRECT}{target}"))?;
    let params: HashMap<_, _> = callback.query_pairs().into_owned().collect();
    if params.get("state") != Some(&state) {
        bail!("OAuth state did not match")
    }
    let code = params
        .get("code")
        .context("SproutOS did not return an authorization code")?;
    stream
        .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nSproutBiz login complete. You can close this tab.\n")
        .await?;

    let token = reqwest::Client::new()
        .post(&config.oauth_token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", config.oauth_client_id.as_str()),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await?
        .error_for_status()
        .context("SproutOS token exchange failed")?
        .json::<TokenResponse>()
        .await?;
    let auth_me = reqwest::Client::new()
        .get(format!("{}/auth/me", config.api_url.trim_end_matches('/')))
        .bearer_auth(&token.access_token)
        .send()
        .await?
        .error_for_status()
        .context("SproutBiz rejected the SproutOS access token")?
        .json::<AuthMeResponse>()
        .await?;
    anyhow::ensure!(
        auth_me.auth_method == "oauth",
        "SproutBiz did not recognize this as a SproutOS OAuth login"
    );
    store(ACCESS_TOKEN_ACCOUNT, &token.access_token)?;
    if let Some(refresh_token) = token.refresh_token {
        store(REFRESH_TOKEN_ACCOUNT, &refresh_token)?;
    }
    println!("Logged in. Credentials are stored in your operating-system keyring.");
    Ok(())
}
