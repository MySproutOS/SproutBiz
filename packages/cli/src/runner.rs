use crate::config::{self, AgentKind, Config};
use crate::plugins;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::process::{Command, Stdio};
use sysinfo::{Pid, ProcessesToUpdate, System};
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize)]
struct RunRecord {
    id: Uuid,
    module: String,
    provider: AgentKind,
    pid: u32,
    process_started_at: u64,
    started_at_unix: u64,
}

fn prompt(module: &str) -> &'static str {
    match module {
        "idea" => include_str!("../prompts/idea.md"),
        "code" => include_str!("../prompts/code.md"),
        "feedback" => include_str!("../prompts/feedback.md"),
        "validation" => include_str!("../prompts/validation.md"),
        _ => unreachable!(),
    }
}

pub fn cull_dead_runs() -> Result<()> {
    let runs = config::root_dir()?.join("runs");
    config::ensure_private_dir(&runs)?;
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    for entry in fs::read_dir(&runs)? {
        let path = entry?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let record: RunRecord = match serde_json::from_slice(&fs::read(&path)?) {
            Ok(record) => record,
            Err(_) => continue,
        };
        let alive = system
            .process(Pid::from_u32(record.pid))
            .is_some_and(|process| process.start_time() == record.process_started_at);
        if !alive {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

pub fn start(config: &Config, module: &str, token: &str) -> Result<Uuid> {
    let id = Uuid::now_v7();
    let runs = config::root_dir()?.join("runs");
    config::ensure_private_dir(&runs)?;
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(runs.join(format!("{id}.log")))?;
    let error_log = log.try_clone()?;

    let mut command = if let Some(plugin) = plugins::for_module(&config.plugins, module)? {
        let mut command = Command::new(&plugin.manifest.command[0]);
        command
            .args(&plugin.manifest.command[1..])
            .current_dir(plugin.directory);
        command.env("SPROUTBIZ_PLUGIN_MODULE", module);
        command.env("SPROUTBIZ_PLUGIN_PROTOCOL", "jsonl-v1");
        command
    } else {
        let mut command = Command::new(config.agent.command());
        match config.agent {
            AgentKind::Claude => {
                command.args(["-p", prompt(module)]);
            }
            AgentKind::Codex => {
                command.args(["exec", "--full-auto", prompt(module)]);
            }
        }
        command
    };
    command
        .env("SPROUTBIZ_API_URL", &config.api_url)
        .env("SPROUTBIZ_ACCESS_TOKEN", token)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(error_log));
    let child = command
        .spawn()
        .with_context(|| format!("start {} for the {module} module", config.agent.command()))?;
    let pid = child.id();
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    let process_started_at = system
        .process(Pid::from_u32(pid))
        .map_or(0, |p| p.start_time());
    let record = RunRecord {
        id,
        module: module.into(),
        provider: config.agent,
        pid,
        process_started_at,
        started_at_unix: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs(),
    };
    fs::write(
        runs.join(format!("{id}.json")),
        serde_json::to_vec_pretty(&record)?,
    )?;
    Ok(id)
}
