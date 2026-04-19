# Security policy

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository
(`Security` tab → `Report a vulnerability`). Do **not** file a public issue
for vulnerability reports.

We aim to acknowledge reports within 5 business days and to ship a fix or
mitigation within 30 days for high-severity issues.

## Threat model summary

The MCP servers in this repo are designed to be spawned by an AI host (e.g.
Claude Desktop) as short-lived stdio subprocesses. The threat model assumes:

| Trust boundary             | Assumption                                                                |
| -------------------------- | ------------------------------------------------------------------------- |
| Host (the LLM client)      | Trusted to invoke tools the user authorized.                              |
| User                       | Authenticates interactively (e.g. device code) when the server asks.      |
| Upstream API (Graph, etc.) | Trusted - all access is delegated, scoped, and audited by the provider.  |
| Container runtime (Podman) | Trusted; rootless mode + namespaces isolate the server from the host.    |
| Image registry             | Pulled images are signed (cosign keyless) and SBOM-attested.             |

Defenses that every server in this repo MUST adhere to:

1. **No credentials in source** - no client secrets, PATs, or passwords. CI
   greps for these patterns on every PR.
2. **No credentials in env vars** - environment variables hold non-secret
   identifiers only (tenant ID, client ID). Real secrets come from Podman
   secrets mounted at `/run/secrets/...`.
3. **stdout is JSON-RPC only** - all logging goes to stderr, all logs pass
   through a redactor.
4. **Inputs are validated** - every tool input is parsed with `zod`. Every
   tool has a server-enforced result cap.
5. **Read-only by default** - tools that mutate upstream state require an
   explicit opt-in flag and a per-call confirmation in the tool description.
6. **Containers run non-root** - every Containerfile has `USER` set to a
   non-zero UID and is exercised in CI with `--read-only`, `--cap-drop=ALL`,
   `--security-opt=no-new-privileges`.

## Supply chain

- Dependencies are pinned via `pnpm-lock.yaml`.
- CI runs `pnpm audit` and a container vulnerability scan (Trivy/Grype) on
  every push; HIGH/CRITICAL findings fail the build.
- Release images are signed with cosign keyless (GitHub OIDC) and shipped
  with an SBOM (syft).
