# Contributing a new MCP server

Every server in this repo lives at `servers/<name>/`. To add one, copy the
shape of an existing server and keep the safety bar described in
[SECURITY.md](./SECURITY.md).

## Checklist for a new server

- [ ] Lives in its own directory under `servers/`.
- [ ] Has a `Containerfile` that:
  - uses a minimal, distroless or chiseled base image,
  - sets `USER` to a non-root, non-zero UID/GID,
  - copies in only the runtime artifacts (no toolchain, no shell needed),
  - is verified to start with `--read-only --cap-drop=ALL --security-opt=no-new-privileges`.
- [ ] Speaks MCP over stdio. **stdout is reserved for JSON-RPC.** All logs
      go to stderr.
- [ ] Validates every tool input with a schema library (`zod` for TS,
      `System.ComponentModel.DataAnnotations` or `FluentValidation` for .NET).
- [ ] Pulls every secret from a Podman secret mount under `/run/secrets/...`.
      Environment variables are for non-secret identifiers only.
- [ ] Default upstream scope is read-only. Write tools require an explicit
      opt-in env var and clear tool-description warnings.
- [ ] Has a per-server `README.md` with: required env vars, required Podman
      secrets, the exact `podman run` invocation, and the
      `claude_desktop_config.json` snippet to install it.
- [ ] Has unit tests for: config parsing, any cryptographic round-trip, and
      tool input validation.
- [ ] CI green: `pnpm -r run typecheck`, `pnpm -r run lint`,
      `pnpm -r run test`, `podman build` of the new server.

## Conventions

- TypeScript servers use the workspace's `pnpm` + `tsconfig.base.json`.
- .NET servers use `dotnet` 9 and live alongside TS servers under
  `servers/<name>/` (no shared `Directory.Build.props` is required for a
  first .NET server, but introduce one when there are two).
- Every server's tool names use `snake_case`.
- Every server's repo path matches its OCI image name segment, e.g.
  `servers/o365-graph-ts` ↔ `ghcr.io/<owner>/safe-mcp/o365-graph-ts`.
