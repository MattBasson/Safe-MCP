# Build, run, and integrate `o365-graph-ts`

This guide walks an end user through building the `o365-graph-ts` MCP server,
running it locally as a rootless Podman container, and wiring it up to each
supported MCP host: **VS Code**, **GitHub Copilot Agent mode (Agents
Insiders)**, **Claude Code**, and **Claude Desktop**.

For the repo-wide safety story and the enterprise rollout plan, see
[SECURITY.md](../SECURITY.md) and
[ENTERPRISE-DEPLOYMENT.md](./ENTERPRISE-DEPLOYMENT.md). For the token cache
crypto design, see [TOKEN-CACHE.md](./TOKEN-CACHE.md).

---

## 1. Prerequisites

| Tool     | Minimum | Used for                                             |
| -------- | ------- | ---------------------------------------------------- |
| Podman   | 5.0+    | Rootless container runtime.                          |
| Node.js  | 22+     | Only needed for local (non-container) dev.           |
| pnpm     | 9+      | Workspace package manager. `corepack enable` works.  |
| git      | any     | Clone the repo.                                      |

An **Entra ID app registration** with the read-only delegated permissions
listed in [ENTERPRISE-DEPLOYMENT.md](./ENTERPRISE-DEPLOYMENT.md). You will
need its **Application (client) ID** and **Directory (tenant) ID** - both are
non-secret identifiers.

---

## 2. Build

### 2a. Local dev build (optional - only if you want to run without a container)

```bash
git clone https://github.com/mattbasson/safe-mcp.git
cd safe-mcp
pnpm install
pnpm --filter @safe-mcp/o365-graph-ts build
# artifacts land in servers/o365-graph-ts/dist/
```

You can then run the server directly against stdio for smoke testing:

```bash
AZURE_TENANT_ID=<tenant-guid> \
AZURE_CLIENT_ID=<client-guid> \
MCP_CACHE_DIR=$HOME/.local/share/o365-graph-mcp \
node servers/o365-graph-ts/dist/index.js
```

(Type `Ctrl-D` to exit. In this mode no cache passphrase is used, so the
server runs memory-only.)

### 2b. Container build (recommended for all hosts)

```bash
cd safe-mcp
podman build -t safe-mcp/o365-graph-ts:dev servers/o365-graph-ts
```

Quick sanity checks:

```bash
# Image runs as a non-root UID.
podman image inspect safe-mcp/o365-graph-ts:dev --format '{{ .Config.User }}'
# -> 65532:65532

# --version exits cleanly without auth.
podman run --rm safe-mcp/o365-graph-ts:dev --version
```

---

## 3. One-time runtime setup

### 3a. Create the token-cache passphrase as a Podman secret

This passphrase encrypts the MSAL token cache on disk. It never leaves your
machine. Generate a fresh random value and store it as a Podman secret -
**not** an environment variable.

```bash
openssl rand -base64 48 | podman secret create o365-cache-passphrase -
podman secret ls   # confirm it exists
```

Rotation is simple: `podman secret rm o365-cache-passphrase` and re-create
with a new random value. You will be prompted to sign in again on the next
tool call.

### 3b. Create the host-side cache directory

The token cache (and a short-lived `pending-device-code.json` sidecar)
lives on a bind-mounted host directory so it survives container restarts.

```bash
mkdir -p "$HOME/.local/share/o365-graph-mcp"
chmod 700 "$HOME/.local/share/o365-graph-mcp"
```

### 3c. The canonical `podman run` invocation

Every host integration below calls the same `podman run` line. Keep it in
one place mentally:

```bash
podman run --rm -i \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --userns=keep-id \
  --tmpfs /tmp:rw,size=16m,mode=1777 \
  -v "$HOME/.local/share/o365-graph-mcp:/home/nonroot/.cache/o365-graph-mcp:Z" \
  --secret o365-cache-passphrase,target=/run/secrets/cache-passphrase,mode=0400 \
  -e AZURE_TENANT_ID \
  -e AZURE_CLIENT_ID \
  safe-mcp/o365-graph-ts:dev
```

Flag-by-flag rationale:

| Flag                             | Why                                                                      |
| -------------------------------- | ------------------------------------------------------------------------ |
| `--rm`                           | Ephemeral per-session container.                                         |
| `-i`                             | Keep stdin open - MCP speaks JSON-RPC over stdio.                        |
| `--read-only`                    | Immutable root FS; only the bind mount + tmpfs are writable.             |
| `--cap-drop=ALL`                 | No Linux capabilities.                                                   |
| `--security-opt=no-new-privileges` | Blocks setuid/setgid escalation inside the container.                  |
| `--userns=keep-id`               | Maps container UID 65532 to *your* UID on the host so the bind mount works. |
| `--tmpfs /tmp`                   | The Node runtime occasionally writes to `/tmp`; give it a 16 MiB tmpfs.  |
| `-v ...cache:Z`                  | Persistent encrypted token cache. `:Z` relabels for SELinux hosts.       |
| `--secret ...`                   | Cache passphrase lives only at `/run/secrets/cache-passphrase`.          |
| `-e AZURE_...`                   | Forwards your shell's env vars into the container (non-secret GUIDs).    |

Once you've confirmed that the raw command runs and emits the device-code
prompt on stderr, the remaining sections wire the same command into each
host.

---

## 4. Integrate with hosts

Below, `<tenant-guid>` and `<client-guid>` are your Entra app registration's
Directory and Application IDs. Both are non-secret.

### 4a. VS Code (native MCP)

VS Code 1.102+ ships native MCP support. Configure the server in
`.vscode/mcp.json` (workspace-scoped, recommended - commit it to your repo
so your team shares the same configuration) or via your user profile.

Create `.vscode/mcp.json`:

```json
{
  "inputs": [
    {
      "id": "tenantId",
      "type": "promptString",
      "description": "Entra ID tenant (directory) ID"
    },
    {
      "id": "clientId",
      "type": "promptString",
      "description": "App registration (client) ID"
    }
  ],
  "servers": {
    "o365-graph": {
      "type": "stdio",
      "command": "podman",
      "args": [
        "run", "--rm", "-i",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--userns=keep-id",
        "--tmpfs", "/tmp:rw,size=16m,mode=1777",
        "-v", "${env:HOME}/.local/share/o365-graph-mcp:/home/nonroot/.cache/o365-graph-mcp:Z",
        "--secret", "o365-cache-passphrase,target=/run/secrets/cache-passphrase,mode=0400",
        "-e", "AZURE_TENANT_ID",
        "-e", "AZURE_CLIENT_ID",
        "safe-mcp/o365-graph-ts:dev"
      ],
      "env": {
        "AZURE_TENANT_ID": "${input:tenantId}",
        "AZURE_CLIENT_ID": "${input:clientId}"
      }
    }
  }
}
```

Starting it:

1. Open `.vscode/mcp.json` - a **Start** CodeLens appears above the
   `"o365-graph"` entry. Click it.
2. VS Code prompts for `tenantId` and `clientId` (defined in the `inputs`
   array). Enter the GUIDs.
3. Open the Chat view, select **Agent** mode, click the 🛠 tools icon;
   `o365-graph` should be listed with its 8 tools.
4. First tool call triggers the device-code prompt in the MCP server's
   output pane (**Output** → **MCP: o365-graph**).

### 4b. GitHub Copilot Agent mode (Agents Insiders)

"Agents Insiders" is GitHub Copilot's agent mode inside VS Code. It
discovers MCP servers from the **same** `.vscode/mcp.json` as native VS Code
MCP - there is no separate config.

1. Install the latest VS Code **Insiders** and the **GitHub Copilot Chat
   (Insiders)** extension.
2. Ensure the agent mode preview is enabled: `Preferences: Open Settings (UI)`
   → search for `chat.agent.enabled` and turn it on.
3. Put the `.vscode/mcp.json` from section 4a in your workspace.
4. Start the server (CodeLens **Start** button as above).
5. In Copilot Chat, switch the mode selector from **Ask** to **Agent**;
   the 🛠 tools icon lists the `o365-graph` tools.

From the user's perspective it's identical to 4a - the `mcp.json` is the
single source of truth for the VS Code + Copilot Agent stack.

### 4c. Claude Code (CLI)

Claude Code stores MCP servers in `~/.claude.json` under the `mcpServers`
key. Use the CLI helper to add ours - `--` separates Claude Code's own
flags from the command+args passed to Podman:

```bash
claude mcp add --scope user --transport stdio o365-graph \
  --env AZURE_TENANT_ID=<tenant-guid> \
  --env AZURE_CLIENT_ID=<client-guid> \
  -- \
  podman run --rm -i \
    --read-only \
    --cap-drop=ALL \
    --security-opt=no-new-privileges \
    --userns=keep-id \
    --tmpfs /tmp:rw,size=16m,mode=1777 \
    -v "$HOME/.local/share/o365-graph-mcp:/home/nonroot/.cache/o365-graph-mcp:Z" \
    --secret o365-cache-passphrase,target=/run/secrets/cache-passphrase,mode=0400 \
    -e AZURE_TENANT_ID \
    -e AZURE_CLIENT_ID \
    safe-mcp/o365-graph-ts:dev
```

Verify:

```bash
claude mcp list           # o365-graph should be listed
claude mcp get o365-graph # shows the command and args as JSON
```

Inside Claude Code, invoke any tool (e.g. `whoami`). On first use, watch
the MCP server's stderr output for the device-code instructions; sign in
once and subsequent launches are silent.

If you prefer to hand-edit `~/.claude.json`, the equivalent fragment is:

```json
{
  "mcpServers": {
    "o365-graph": {
      "type": "stdio",
      "command": "podman",
      "args": [
        "run", "--rm", "-i",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--userns=keep-id",
        "--tmpfs", "/tmp:rw,size=16m,mode=1777",
        "-v", "/home/<you>/.local/share/o365-graph-mcp:/home/nonroot/.cache/o365-graph-mcp:Z",
        "--secret", "o365-cache-passphrase,target=/run/secrets/cache-passphrase,mode=0400",
        "-e", "AZURE_TENANT_ID",
        "-e", "AZURE_CLIENT_ID",
        "safe-mcp/o365-graph-ts:dev"
      ],
      "env": {
        "AZURE_TENANT_ID": "<tenant-guid>",
        "AZURE_CLIENT_ID": "<client-guid>"
      }
    }
  }
}
```

To make the server **project-scoped** instead (checked into the repo for
teammates), use `claude mcp add --scope project ...` - Claude Code writes
`.mcp.json` at the project root with the same shape as `~/.claude.json`'s
`mcpServers` block.

### 4d. Claude Desktop

Edit `~/.config/Claude/claude_desktop_config.json` on Linux,
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
or `%APPDATA%\Claude\claude_desktop_config.json` on Windows:

```json
{
  "mcpServers": {
    "o365-graph": {
      "command": "podman",
      "args": [
        "run", "--rm", "-i",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--userns=keep-id",
        "--tmpfs", "/tmp:rw,size=16m,mode=1777",
        "-v", "/home/<you>/.local/share/o365-graph-mcp:/home/nonroot/.cache/o365-graph-mcp:Z",
        "--secret", "o365-cache-passphrase,target=/run/secrets/cache-passphrase,mode=0400",
        "-e", "AZURE_TENANT_ID",
        "-e", "AZURE_CLIENT_ID",
        "safe-mcp/o365-graph-ts:dev"
      ],
      "env": {
        "AZURE_TENANT_ID": "<tenant-guid>",
        "AZURE_CLIENT_ID": "<client-guid>"
      }
    }
  }
}
```

Restart Claude Desktop. The MCP server appears under the tools menu.

---

## 5. First-run UX (what the user sees)

1. User invokes a tool (e.g. `whoami`).
2. The host spawns the `podman run ...` subprocess and the MCP handshake
   completes.
3. MSAL sees no cached token and runs the device-code flow. The human
   instructions go to **stderr** (visible as the host's MCP log / output
   pane) and a sidecar file is written to
   `$HOME/.local/share/o365-graph-mcp/pending-device-code.json` containing
   `userCode`, `verificationUri`, and `expiresOn`.
4. User opens `https://microsoft.com/devicelogin`, enters the code,
   completes MFA/Conditional Access.
5. MSAL returns a token, encrypts the cache with AES-256-GCM under the
   scrypt-derived key, and writes it atomically to
   `~/.local/share/o365-graph-mcp/token-cache.bin`.
6. The tool call completes and returns JSON.
7. All subsequent launches acquire the token silently from cache.

To force a fresh device-code flow, delete the cache file:

```bash
rm "$HOME/.local/share/o365-graph-mcp/token-cache.bin"
```

---

## 6. Verification checklist

Run through this whenever you change the deployment (new image tag, new
tenant, new host):

- [ ] `podman image inspect safe-mcp/o365-graph-ts:<tag> --format '{{ .Config.User }}'` prints a non-zero UID.
- [ ] `podman run --rm safe-mcp/o365-graph-ts:<tag> --version` exits 0.
- [ ] `podman secret ls` lists `o365-cache-passphrase`.
- [ ] The bind-mount directory exists and is mode 700.
- [ ] The host's MCP listing shows the server and its 8 tools.
- [ ] `whoami` returns your UPN.
- [ ] A second `whoami` call after closing and reopening the host works
      without re-authenticating (persistent cache).
- [ ] Deleting `token-cache.bin` forces the device-code prompt again.
- [ ] No access/refresh tokens appear in the MCP server's stderr log.

---

## 7. Troubleshooting

| Symptom                                                            | Likely cause / fix                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Error: Dependencies lock file is not found` during `pnpm install` | Run `pnpm install` once at the **repo root** to create/refresh `pnpm-lock.yaml`.                                                  |
| `podman: command not found` in a host subprocess                   | Hosts launch with a GUI-session PATH, which often lacks Podman. Use an absolute path (`/usr/bin/podman`) in the `command` field. |
| `Error: no such secret: o365-cache-passphrase`                     | Run `podman secret create o365-cache-passphrase -` (section 3a).                                                                 |
| The device-code prompt never shows up                              | Check the host's MCP *stderr* output, not stdout. On VS Code: **Output** panel → **MCP: o365-graph**.                            |
| `whoami` returns `AADSTS50105` or similar consent errors           | An admin hasn't granted consent for the delegated scopes. See section 1 of [ENTERPRISE-DEPLOYMENT.md](./ENTERPRISE-DEPLOYMENT.md). |
| `permission denied` on the bind mount                              | Rootless Podman maps container UID 65532 to a *subuid* on the host. `--userns=keep-id` fixes it; ensure it is in the args list.  |
| Container starts but tool calls hang                               | Your firewall/proxy is blocking `login.microsoftonline.com` or `graph.microsoft.com`. The container uses the host's network.      |
| `RangeError: Invalid scrypt params` on `pnpm test`                  | Node's default `maxmem` for `scryptSync` is 32 MiB. The server explicitly passes `maxmem: 64 MiB`; make sure you're running the latest commit. |

For anything else, gather `LOG_LEVEL=info` stderr output (JSON lines, with
tokens automatically redacted) and open an issue.
