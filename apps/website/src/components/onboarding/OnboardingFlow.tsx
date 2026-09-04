"use client"

import { Button } from "@ui/base/ui/button"
import { Card, CardContent } from "@ui/base/ui/card"
import { Check, Copy } from "lucide-react"
import { useState } from "react"

const INSTALL_COMMAND = "curl -fsSL https://sproutos.biz/install.sh | sh"

function Step({
  index,
  title,
  children,
}: {
  index: number
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {index}
          </span>
          <h2 className="font-medium">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

export function OnboardingFlow() {
  const [installCopied, setInstallCopied] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [creatingToken, setCreatingToken] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createToken() {
    setCreatingToken(true)
    setError(null)
    try {
      const response = await fetch("/api/v1/agent-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "SproutBiz CLI",
          scopes: [
            "forum:read",
            "forum:write",
            "business:write",
            "onboarding:write",
            "contribution:write",
          ],
        }),
      })
      if (!response.ok) throw new Error(`Token creation failed with HTTP ${response.status}`)
      const created = (await response.json()) as { token: string }
      setToken(created.token)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create an agent token")
    } finally {
      setCreatingToken(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Step index={1} title="Install the SproutBiz CLI">
        <p className="text-sm text-muted-foreground">
          Copy this command into your terminal. It checksum-verifies the release and installs it as{" "}
          <code>biz</code>, <code>sbiz</code>, and <code>sproutbiz</code>.
        </p>
        <div className="flex items-center gap-2 rounded-md bg-muted p-3">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">
            {INSTALL_COMMAND}
          </code>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Copy install command"
            onClick={() => {
              void navigator.clipboard.writeText(INSTALL_COMMAND).then(() => {
                setInstallCopied(true)
                window.setTimeout(() => {
                  setInstallCopied(false)
                }, 2000)
              })
            }}
          >
            {installCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </Step>

      <Step index={2} title="Create your agent token">
        <p className="text-sm text-muted-foreground">
          The CLI verifies this token before continuing and stores it in your operating-system
          keyring. It can be revoked from your account at any time.
        </p>
        {token ? (
          <div className="flex items-start gap-2 rounded-md bg-muted p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm">{token}</code>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Copy agent token"
              onClick={() => {
                void navigator.clipboard.writeText(token).then(() => {
                  setTokenCopied(true)
                  window.setTimeout(() => {
                    setTokenCopied(false)
                  }, 2000)
                })
              }}
            >
              {tokenCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="self-start"
            disabled={creatingToken}
            onClick={() => void createToken()}
          >
            {creatingToken ? "Creating…" : "Create token"}
          </Button>
        )}
        {token && (
          <p className="text-xs text-muted-foreground">
            Copy it now. SproutBiz stores only its hash and cannot show it again.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Step>

      <Step index={3} title="Sign in with SproutOS">
        <p className="text-sm text-muted-foreground">
          Run <code className="rounded bg-muted px-1.5 py-0.5">biz login</code>. Your browser opens
          the SproutOS OAuth consent screen. This establishes your identity and verified GitHub
          account for code-contribution attribution.
        </p>
      </Step>

      <Step index={4} title="Start building">
        <p className="text-sm text-muted-foreground">
          Run <code className="rounded bg-muted px-1.5 py-0.5">biz</code>, choose Claude Code or
          Codex, and paste the token from step 2. The CLI verifies the matching Chrome extension
          through your chosen agent, then opens the contribution dashboard. Every mandatory check
          must pass before onboarding completes.
        </p>
        <p className="text-xs text-muted-foreground">
          The CLI checks for updates on startup. You can also update it at any time with{" "}
          <code>biz upgrade</code>.
        </p>
      </Step>
    </div>
  )
}
