# Safe-MCP

A monorepo of **enterprise-safe** Model Context Protocol (MCP) servers.

Every server in this repo is built to the same bar:

- **Stdio transport** - the host (Claude Desktop, Claude Code, etc.) spawns
  the server as a child process. No long-running network listener.
- **Rootless containers** - shipped as OCI images that run as a non-root UID
  in Podman with a read-only root filesystem and `--cap-drop=ALL`.
- **No baked-in secrets** - tenant IDs, client IDs, and similar non-secret
  identifiers come from environment variables; actual secrets (passphrases,
  certificates) come from Podman secrets, never from `-e` flags or the image.
- **Least privilege upstream** - each server uses the smallest possible
  upstream API scope by default. Read-only first; write capabilities are
  opt-in.
- **Auditable** - every tool input is validated with `zod`; every log line
  goes to stderr (so it never collides with the JSON-RPC stream on stdout)
  and passes through a redactor that strips bearer tokens and credentials.

## Servers

| Server                                            | Runtime  | Status      | Description                                |
| ------------------------------------------------- | -------- | ----------- | ------------------------------------------ |
| [`o365-graph-ts`](servers/o365-graph-ts)          | Node 22  | initial     | Read-only Microsoft Graph (Mail, Calendar, OneDrive, Teams, Profile) via device-code auth. |

Future servers (.NET, Python, etc.) live as siblings under `servers/`.

## Repository layout

```
.
├── servers/<name>/        # one MCP server per directory; self-contained
├── docs/                  # cross-cutting deployment + security docs
├── .github/workflows/     # CI: lint, typecheck, test, container build/scan
├── pnpm-workspace.yaml    # workspace root (TS servers)
└── tsconfig.base.json     # shared TS settings
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add a new server while
keeping the same safety bar, and [SECURITY.md](./SECURITY.md) for the threat
model and disclosure policy.

## Quickstart

Each server has its own README. For the first one:

- [`servers/o365-graph-ts/README.md`](servers/o365-graph-ts/README.md)

## License

MIT - see [LICENSE](./LICENSE).
