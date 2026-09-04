mod auth;
mod config;
mod dashboard;
mod plugins;
mod runner;
mod update;

use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "biz",
    version,
    about = "Build businesses with SproutBiz agents"
)]
struct Cli {
    #[arg(long, global = true)]
    no_update_check: bool,
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    Login,
    Logout,
    Upgrade,
    Plugin {
        #[command(subcommand)]
        command: PluginCommand,
    },
}

#[derive(Subcommand)]
enum PluginCommand {
    Add { directory: PathBuf },
    List,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    if !cli.no_update_check
        && !matches!(cli.command, Some(Commands::Upgrade))
        && let Err(error) = update::check_and_prompt().await
    {
        eprintln!("Update check failed: {error}");
    }
    let mut config = config::load()?;
    match cli.command {
        Some(Commands::Login) => auth::login(&config).await,
        Some(Commands::Logout) => auth::logout(),
        Some(Commands::Upgrade) => update::upgrade().await,
        Some(Commands::Plugin { command }) => match command {
            PluginCommand::Add { directory } => {
                let mut prospective = config.plugins.clone();
                prospective.retain(|existing| existing != &directory);
                prospective.push(directory);
                plugins::discover(&prospective)?;
                config.plugins = prospective;
                config::save(&config)
            }
            PluginCommand::List => {
                for plugin in plugins::discover(&config.plugins)? {
                    println!(
                        "{}\t{}\t{}",
                        plugin.manifest.module,
                        plugin.manifest.name,
                        plugin.directory.display()
                    );
                }
                Ok(())
            }
        },
        None => dashboard::run(config).await,
    }
}
