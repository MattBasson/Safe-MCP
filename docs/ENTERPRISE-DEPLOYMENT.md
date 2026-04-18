# Enterprise deployment guide

This document walks an enterprise admin through approving and rolling out the
Safe-MCP `o365-graph-ts` server. It is written for a Microsoft Entra ID admin
and a security reviewer.

## 1. Register the application in Entra ID

Create a new app registration (Entra admin centre → **Applications** → **App
registrations** → **New registration**):

| Field                       | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| Name                        | `Safe-MCP - Office 365 Graph (read-only)`              |
| Supported account types     | **Accounts in this organizational directory only** (single-tenant) |
| Redirect URI                | *(leave empty - device code flow does not need one)*   |

After creation:

1. **Authentication** blade → enable **Allow public client flows** = **Yes**.
   This is what permits MSAL device code on a confidential-client-less app.
2. **Certificates & secrets** → leave empty. Do **not** create a client
   secret or certificate. There is nothing to leak or rotate.
3. **API permissions** → add the following **delegated** Microsoft Graph
   permissions, then **Grant admin consent for `<tenant>`**:

   - `User.Read`
   - `Mail.Read`
   - `Calendars.Read`
   - `Files.Read`
   - `Sites.Read.All`
   - `Chat.Read`
   - `offline_access`

4. Note the **Application (client) ID** and **Directory (tenant) ID** from
   the **Overview** blade. These will be passed to the container as
   `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`.

## 2. Conditional Access

Device code flow is fully Conditional-Access-aware: the interactive sign-in
happens in the user's browser on their managed device, so device-compliance
and MFA policies apply normally.

Recommended policies for this app:

- Require **MFA**.
- Require a **compliant device**.
- (Optional) Restrict by named location if you want to prevent the device
  code from being completed off-network.

You can target the policy specifically at this app via **Cloud apps or
actions** → select the new app registration.

## 3. Distribute the container image

Pull or mirror the signed image into your enterprise registry, then verify
the cosign signature:

```bash
cosign verify ghcr.io/<owner>/safe-mcp/o365-graph-ts:<tag> \
  --certificate-identity-regexp 'https://github.com/<owner>/safe-mcp/.+' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Optionally pull and review the SBOM before promoting the tag.

## 4. Provision the per-user cache passphrase (Podman secret)

Each user generates a one-off random passphrase that encrypts their local
MSAL token cache. The passphrase never leaves the user's machine.

```bash
openssl rand -base64 48 | podman secret create o365-cache-passphrase -
```

`podman secret ls` will show the secret. Removing the secret forces a fresh
device-code sign-in on next launch.

## 5. Wire it into the user's MCP host

Drop this snippet into `~/.config/Claude/claude_desktop_config.json`
(adjusting paths and the image tag):

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
        "ghcr.io/<owner>/safe-mcp/o365-graph-ts:<tag>"
      ],
      "env": {
        "AZURE_TENANT_ID": "00000000-0000-0000-0000-000000000000",
        "AZURE_CLIENT_ID": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

Notes:

- `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` are **non-secret** identifiers
  (they are visible in any sign-in URL); putting them in the config is fine.
- The cache passphrase is **never** in the config. It is only ever read from
  the Podman secret mount inside the container.

## 6. First-run user experience

On the first tool call, MSAL emits the device-code prompt to **stderr**
(visible in Claude Desktop's developer log pane) and also writes a sidecar
JSON file at
`${HOME}/.local/share/o365-graph-mcp/pending-device-code.json` with
`userCode` and `verificationUri`. The user signs in on
`https://microsoft.com/devicelogin`, after which the token cache is
encrypted and stored under the same volume; subsequent launches are silent.

## 7. Auditing

- All Graph calls are logged in Entra **Sign-in logs** under the app's
  display name.
- The MCP server emits structured JSON logs on stderr (level `info` by
  default). Forward these to your SIEM if desired.
- There are no client secrets to monitor for leaks.
