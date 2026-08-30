# Deployment

## Hosted dashboard

The browser dashboard is a Vite + React static application. Import the repository into Vercel and keep the **repository root** as the Vercel Root Directory.

The repository-level `vercel.json` runs:

```bash
npm run dashboard:build
```

and publishes:

```text
apps/dashboard/dist
```

Do not configure private keys, seed phrases, vault passwords, `OPENSEA_API_KEY`, wallet JWTs, or private RPC credentials in the hosted Vercel frontend.

The hosted browser can perform injected-wallet deterministic SeaDrop execution without the local agent. Discovery, local encrypted wallet fleets, RPC services and scheduled AUTO execution use the loopback local agent.

## Hosted dashboard + local agent

A browser loaded from Vercel has a different origin from the local development dashboard. The local agent therefore requires the exact hosted origin to be explicitly allowlisted on the user's machine.

After deployment, set locally:

```env
THEDADBOT_DASHBOARD_ORIGINS=http://127.0.0.1:4173,http://localhost:4173,https://YOUR-PROJECT.vercel.app
```

Then restart the local agent.

The agent supports the browser Private Network Access preflight used when an HTTPS site talks to loopback, but it does not wildcard Vercel origins. This is deliberate: only origins explicitly trusted by the user may call the local agent.

The dashboard's default agent endpoint is:

```text
http://127.0.0.1:47831
```

`VITE_AGENT_URL` is optional and public. The dashboard accepts it only when it points to loopback HTTP. Never put a secret in a `VITE_*` variable because Vite embeds those variables in client-side JavaScript.

## Local dashboard + agent

```bash
npm install
npm run dashboard
npm run agent
```

Both bind to loopback by default.

For a production-style local preview:

```bash
npm run dashboard:build
npm run dashboard:preview
```

## VPS / CLI

Use a dedicated Linux user, encrypted disk where practical, firewall inbound ports, and restrict the wallet to the minimum mint funds required. The CLI does not need an inbound listener.

## Contracts

Compile and test:

```bash
forge test -vvv
forge build
```

Deploy the sponsored executor or EIP-7702 implementation only after reviewing the bytecode produced by the exact source commit. Record chain ID, deployer, address, transaction hash and runtime code hash in your release notes.
