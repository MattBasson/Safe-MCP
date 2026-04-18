# `o365-graph-ts` - Microsoft Graph MCP server

A read-only Microsoft Graph MCP server, written in TypeScript, intended to
run as a rootless Podman container that the host (Claude Desktop, Claude
Code, etc.) spawns over stdio.

- **Auth:** Entra ID device code flow (public client, no secret).
- **Scope:** read-only delegated permissions (Mail, Calendar, OneDrive,
  Teams chats, profile).
- **Tenant:** single-tenant (the tenant ID you pin via env var).
- **Transport:** stdio.
- **Container:** distroless `nodejs22-debian12:nonroot`, UID 65532,
  read-only root filesystem.
- **Secrets:** none baked into the image. The cache passphrase comes from a
  Podman secret; tokens are AES-256-GCM encrypted at rest.

See the repo-level [enterprise deployment guide](../../docs/ENTERPRISE-DEPLOYMENT.md)
and [token cache design](../../docs/TOKEN-CACHE.md).

## Tools

| Name                  | What it does                                 | Required scope    |
| --------------------- | -------------------------------------------- | ----------------- |
| `whoami`              | Current user's basic profile (`/me`)         | `User.Read`       |
| `mail_list`           | List inbox messages, paged                   | `Mail.Read`       |
| `mail_get`            | Single message by id (HTML stripped)         | `Mail.Read`       |
| `mail_search`         | Mailbox search via `$search`                 | `Mail.Read`       |
| `calendar_list`       | Events between two ISO-8601 timestamps       | `Calendars.Read`  |
| `files_list`          | OneDrive folder listing (root or by path)    | `Files.Read`      |
| `chats_list`          | Teams chats                                  | `Chat.Read`       |
| `chat_messages_list`  | Recent messages in one Teams chat            | `Chat.Read`       |

Every tool input is validated with `zod` and every result has a
server-enforced cap (≤50 items per call by default; ≤25 for `mail_get`,
`mail_search`, and `chat_messages_list`).

## Build & run locally

```bash
# from repo root
pnpm install
pnpm --filter @safe-mcp/o365-graph-ts build

# build the container
podman build -t safe-mcp/o365-graph-ts:dev servers/o365-graph-ts
```

Generate a per-user cache passphrase **once** and store it as a Podman
secret (the secret is local to your machine):

```bash
openssl rand -base64 48 | podman secret create o365-cache-passphrase -
```

Run it (the host you wire into - Claude Desktop, etc. - will run something
very similar):

```bash
podman run --rm -i \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --userns=keep-id \
  --tmpfs /tmp:rw,size=16m,mode=1777 \
  -v "$HOME/.local/share/o365-graph-mcp:/home/nonroot/.cache/o365-graph-mcp:Z" \
  --secret o365-cache-passphrase,target=/run/secrets/cache-passphrase,mode=0400 \
  -e AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000 \
  -e AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000 \
  safe-mcp/o365-graph-ts:dev
```

`AZURE_TENANT_ID` and `AZURE_CLIENT_ID` are non-secret identifiers (visible
in any sign-in URL); the cache passphrase is the only secret and it is
never passed via `-e`.

## Wiring into Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json`:

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
        "-v", "${HOME}/.local/share/o365-graph-mcp:/home/nonroot/.cache/o365-graph-mcp:Z",
        "--secret", "o365-cache-passphrase,target=/run/secrets/cache-passphrase,mode=0400",
        "-e", "AZURE_TENANT_ID",
        "-e", "AZURE_CLIENT_ID",
        "ghcr.io/mattbasson/safe-mcp/o365-graph-ts:latest"
      ],
      "env": {
        "AZURE_TENANT_ID": "00000000-0000-0000-0000-000000000000",
        "AZURE_CLIENT_ID": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

## Configuration reference

| Variable                | Required | Default                                              | Notes                                       |
| ----------------------- | -------- | ---------------------------------------------------- | ------------------------------------------- |
| `AZURE_TENANT_ID`       | yes      | -                                                    | GUID. Non-secret.                           |
| `AZURE_CLIENT_ID`       | yes      | -                                                    | GUID. Non-secret. Public client app.        |
| `GRAPH_SCOPES`          | no       | the read-only set above                              | Space-delimited.                            |
| `MCP_CACHE_DIR`         | no       | `/home/nonroot/.cache/o365-graph-mcp`                | Bind-mount this for persistence.            |
| `CACHE_PASSPHRASE_FILE` | no       | `/run/secrets/cache-passphrase`                      | Where to read the Podman-secret passphrase. |
| `LOG_LEVEL`             | no       | `info`                                               | `debug` requires `ALLOW_DEBUG_LOGS=1`.      |

## Known follow-ups

- A per-server `package-lock.json` should be generated and committed before
  the first signed release so the container build is bit-for-bit
  reproducible. The current `Containerfile` resolves dependencies with
  `npm install`; this is acceptable for development but should be tightened
  to `npm ci` against a committed lockfile for releases.

## Security properties (enforced)

- No client secret, no certificate, no PAT - the app registration is a
  public client and the device code flow needs neither.
- stdout is reserved for JSON-RPC; all logs go to stderr through a
  redactor that strips `Authorization`, access/refresh/id tokens,
  passphrases, and JWT-shaped strings.
- The MSAL token cache is encrypted with AES-256-GCM; the key is derived
  via scrypt from a Podman-secret passphrase. If the passphrase is absent,
  the server runs **memory-only** rather than ever writing tokens in
  plaintext.
- Container runs as UID 65532 with read-only root filesystem,
  `--cap-drop=ALL`, and `--security-opt=no-new-privileges`.
- All tool inputs are zod-validated; all results have server-side caps.
