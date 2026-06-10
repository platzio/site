---
sidebar_position: 1
---

# Rust SDK

The Rust SDK is published to crates.io as
[`platz-sdk`](https://crates.io/crates/platz-sdk), versioned to match the backend
release.

```bash
cargo add platz-sdk
```

## Creating a client

`PlatzClient::new()` discovers the server URL and credentials automatically, trying in
order:

1. **Environment variables** — `PLATZ_URL` plus either `PLATZ_API_TOKEN` (a user/bot
   token, sent via the `x-platz-token` header) or `PLATZ_USER_TOKEN` (a JWT, sent as
   `Authorization: Bearer`).
2. **A config file** — `<config dir>/platz/config.toml` (e.g.
   `~/.config/platz/config.toml` on Linux) with named profiles. Select one with the
   `PLATZ_PROFILE` environment variable, or mark one with `default_profile = true`:

   ```toml
   [profile.prod]
   url = "https://platz.example.com"
   user_token = "<token>"
   default_profile = true
   ```

3. **Mounted deployment credentials** — `/var/run/secrets/platz/` (`access_token`,
   `server_url`, `expires_at`), which is where the
   [`platz-creds` secret](/docs/guide/deployments/credentials) lands when mounted into a
   deployment's pod. The client re-reads the files when the token nears expiry, so
   rotation is handled for you.

## Usage

Typed helpers mirror the [API resources](/docs/api/) — deployments, envs, clusters,
bots, secrets, and so on. List helpers take a filters struct and fetch all pages,
returning a flat `Vec`:

```rust
use platz_sdk::{DeploymentFilters, PlatzClient};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let client = PlatzClient::new().await?;

    let deployments = client
        .deployments(DeploymentFilters {
            enabled: Some(true),
            ..Default::default()
        })
        .await?;
    for deployment in deployments {
        println!("{} ({})", deployment.name, deployment.status);
    }
    Ok(())
}
```

For endpoints or filters not covered by a typed helper, drop down to the raw request
builder, which handles auth, pagination, and JSON for you:

```rust
let charts: Vec<serde_json::Value> = client
    .request(reqwest::Method::GET, "/api/v2/helm-charts")
    .query("kind_id", kind_id.to_string())
    .paginated()
    .await?;
```
