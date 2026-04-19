# Token cache design

## Goal

Cache MSAL access + refresh tokens between MCP server invocations so that
users do not have to repeat the device-code flow on every container launch -
without ever writing tokens to disk in plaintext, and without depending on
host facilities (Keychain / libsecret / DPAPI) that are awkward to expose to
a rootless distroless container.

## Design

- Tokens are held in MSAL's in-memory cache during a session.
- On `beforeCacheAccess`, the server reads `${MCP_CACHE_DIR}/token-cache.bin`
  (if present) and decrypts it.
- On `afterCacheAccess` (when MSAL signals the cache changed), the server
  re-encrypts the cache and atomically writes it back.

### Crypto

- **Key derivation:** `scrypt(passphrase, salt = "safe-mcp/o365-graph-ts/v1",
  N=2^15, r=8, p=1, dkLen=32)`. The salt is a fixed string because the
  passphrase itself is a per-user 256-bit random value (see "Passphrase
  source").
- **Cipher:** AES-256-GCM, 96-bit random nonce per write, 128-bit auth tag.
- **File format:** `nonce (12 bytes) || ciphertext || tag (16 bytes)`.
- Writes go to `token-cache.bin.tmp` then `rename(2)` to ensure atomicity
  (`O_TRUNC` on the live file would risk corruption if the process is
  killed mid-write).

### Passphrase source

The passphrase is read **once at startup** from
`/run/secrets/cache-passphrase` (a Podman secret mount). It is never read
from an env var, never logged, and never written anywhere else.

If the secret is absent:

- The server logs a single `warn` line to stderr.
- The cache plugin operates in **memory-only** mode: tokens persist for the
  lifetime of the process but the file is never created.
- The server **never** falls back to writing an unencrypted cache file.

### Why not `msal-node-extensions`?

`@azure/msal-node-extensions` provides cross-platform persistence using
libsecret / Keychain / DPAPI. Inside a rootless distroless container these
backends are either unreachable or require mounting the host D-Bus socket -
both broaden the attack surface in ways that defeat the point of the
container. A passphrase + Podman secret keeps the trust boundary cleanly
inside the container.

## Threat model

- **Stolen cache file alone:** useless. AES-GCM means it cannot be decrypted
  without the passphrase.
- **Stolen passphrase alone:** useless. The cache file is on the host, not
  in the secret store.
- **Compromised container process:** the attacker can read the in-memory
  tokens for the duration of the process. This is unavoidable for any
  client that holds tokens in memory.
- **Lost passphrase:** delete `token-cache.bin`; the next tool call
  re-prompts via device code.
