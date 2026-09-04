# SproutBiz CLI

`biz` is the interactive contribution dashboard for SproutBiz. Released binaries also install
the `sbiz` and `sproutbiz` aliases.

```sh
curl -fsSL https://sproutos.biz/install.sh | sh
biz login
biz
```

`biz login` uses SproutOS OAuth with PKCE to establish the human identity and verified GitHub
connection. On first `biz`, the CLI also asks for the revocable `sof_…` agent token created at
`https://sproutos.biz/onboarding`; autonomous modules use that narrower credential. OAuth, refresh,
and agent tokens live in the operating-system keyring. Non-secret configuration, plugins, and
detached-run metadata live under `~/.sproutbiz`. Run `biz upgrade` to update immediately. Normal
starts also check for a newer release.

## Plugins

A plugin replaces exactly one built-in contribution module. Either paste one or more plugin
folders into `~/.sproutbiz/plugins`, or point the CLI at a plugin directory (or a parent directory
containing several plugins):

```sh
biz plugin add /absolute/path/to/my-plugin
```

That directory must contain `plugin.toml`:

```toml
name = "My feedback collector"
module = "feedback"
command = ["./run"]
```

`module` is one of `idea`, `code`, `feedback`, or `validation`. The command starts in the plugin
directory with `SPROUTBIZ_PLUGIN_MODULE`, `SPROUTBIZ_PLUGIN_PROTOCOL=jsonl-v1`,
`SPROUTBIZ_API_URL`, and `SPROUTBIZ_ACCESS_TOKEN` in its environment. Standard output and error
are captured in the run log beneath `~/.sproutbiz/runs`.
