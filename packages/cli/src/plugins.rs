use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PluginManifest {
    pub name: String,
    pub module: String,
    pub command: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Plugin {
    pub directory: PathBuf,
    pub manifest: PluginManifest,
}

pub fn load(directory: &Path) -> Result<Plugin> {
    let manifest_path = directory.join("plugin.toml");
    let manifest: PluginManifest = toml::from_str(
        &fs::read_to_string(&manifest_path)
            .with_context(|| format!("read {}", manifest_path.display()))?,
    )?;
    if !["idea", "code", "feedback", "validation"].contains(&manifest.module.as_str()) {
        bail!("plugin module must be idea, code, feedback, or validation")
    }
    if manifest.command.is_empty() {
        bail!("plugin command must not be empty")
    }
    Ok(Plugin {
        directory: directory.to_path_buf(),
        manifest,
    })
}

fn load_from_root(path: &Path) -> Result<Vec<Plugin>> {
    if path.join("plugin.toml").is_file() {
        return Ok(vec![load(path)?]);
    }
    if !path.is_dir() {
        bail!(
            "plugin path does not exist or is not a directory: {}",
            path.display()
        )
    }
    let mut directories = fs::read_dir(path)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|child| child.join("plugin.toml").is_file())
        .collect::<Vec<_>>();
    directories.sort();
    directories
        .into_iter()
        .map(|directory| load(&directory))
        .collect()
}

pub fn discover(configured_paths: &[PathBuf]) -> Result<Vec<Plugin>> {
    let default_root = crate::config::root_dir()?.join("plugins");
    crate::config::ensure_private_dir(&default_root)?;
    let mut by_module = BTreeMap::new();
    for plugin in load_from_root(&default_root)? {
        by_module.insert(plugin.manifest.module.clone(), plugin);
    }
    // Explicit paths are evaluated after ~/.sproutbiz/plugins and therefore intentionally
    // replace a default plugin for the same single module.
    for path in configured_paths {
        let plugins = load_from_root(path)?;
        if plugins.is_empty() {
            bail!(
                "{} contains no plugin.toml (directly or in a child directory)",
                path.display()
            )
        }
        for plugin in plugins {
            by_module.insert(plugin.manifest.module.clone(), plugin);
        }
    }
    Ok(by_module.into_values().collect())
}

pub fn for_module(paths: &[PathBuf], module: &str) -> Result<Option<Plugin>> {
    Ok(discover(paths)?
        .into_iter()
        .find(|plugin| plugin.manifest.module == module))
}

#[cfg(test)]
mod tests {
    use super::{load, load_from_root};
    use std::fs;

    #[test]
    fn loads_one_module_manifest() {
        let root = tempfile::tempdir().expect("temp directory");
        fs::write(
            root.path().join("plugin.toml"),
            "name = \"Researcher\"\nmodule = \"idea\"\ncommand = [\"./run\"]\n",
        )
        .expect("write manifest");
        let plugin = load(root.path()).expect("load plugin");
        assert_eq!(plugin.manifest.name, "Researcher");
        assert_eq!(plugin.manifest.module, "idea");
        assert_eq!(plugin.manifest.command, ["./run"]);
    }

    #[test]
    fn finds_plugin_folders_beneath_a_parent() {
        let root = tempfile::tempdir().expect("temp directory");
        let feedback = root.path().join("feedback-plugin");
        fs::create_dir(&feedback).expect("create child");
        fs::write(
            feedback.join("plugin.toml"),
            "name = \"Feedback\"\nmodule = \"feedback\"\ncommand = [\"node\", \"index.js\"]\n",
        )
        .expect("write manifest");
        fs::create_dir(root.path().join("not-a-plugin")).expect("create unrelated child");

        let plugins = load_from_root(root.path()).expect("discover plugins");
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].directory, feedback);
    }

    #[test]
    fn rejects_a_manifest_that_cannot_replace_one_module() {
        let root = tempfile::tempdir().expect("temp directory");
        fs::write(
            root.path().join("plugin.toml"),
            "name = \"Everything\"\nmodule = \"all\"\ncommand = [\"./run\"]\n",
        )
        .expect("write manifest");
        assert!(load(root.path()).is_err());
    }
}
