export const dynamic = "force-static"

const SCRIPT =
  [
    "#!/bin/sh",
    "set -eu",
    "",
    'repo="MySproutOS/SproutBiz"',
    'install_dir="${SPROUTBIZ_INSTALL_DIR:-$HOME/.local/bin}"',
    "",
    'case "$(uname -s)-$(uname -m)" in',
    '  Darwin-arm64) target="aarch64-apple-darwin" ;;',
    '  Darwin-x86_64) target="x86_64-apple-darwin" ;;',
    '  Linux-aarch64|Linux-arm64) target="aarch64-unknown-linux-gnu" ;;',
    '  Linux-x86_64|Linux-amd64) target="x86_64-unknown-linux-gnu" ;;',
    '  *) echo "Unsupported platform: $(uname -s) $(uname -m)" >&2; exit 1 ;;',
    "esac",
    "",
    'archive="biz-${target}.tar.gz"',
    'base="https://github.com/${repo}/releases/latest/download"',
    'tmp_dir="$(mktemp -d)"',
    `trap 'rm -rf "$tmp_dir"' EXIT INT TERM`,
    "",
    'curl --fail --location --silent --show-error "$base/$archive" --output "$tmp_dir/$archive"',
    'curl --fail --location --silent --show-error "$base/$archive.sha256" --output "$tmp_dir/$archive.sha256"',
    "if command -v sha256sum >/dev/null 2>&1; then",
    '  (cd "$tmp_dir" && sha256sum -c "$archive.sha256")',
    "else",
    '  (cd "$tmp_dir" && shasum -a 256 -c "$archive.sha256")',
    "fi",
    'tar -xzf "$tmp_dir/$archive" -C "$tmp_dir"',
    'mkdir -p "$install_dir"',
    'install -m 755 "$tmp_dir/biz" "$install_dir/biz"',
    'ln -sf biz "$install_dir/sbiz"',
    'ln -sf biz "$install_dir/sproutbiz"',
    "",
    'echo "Installed biz, sbiz, and sproutbiz to $install_dir"',
    'case ":$PATH:" in',
    '  *":$install_dir:"*) ;;',
    '  *) echo "Add $install_dir to PATH to run biz." ;;',
    "esac",
  ].join("\n") + "\n"

export function GET(): Response {
  return new Response(SCRIPT, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  })
}
