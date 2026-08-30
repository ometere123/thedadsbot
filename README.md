# TheDadBot

**Open multi-chain NFT mint operations: dashboard + local agent + CLI, all using one security core.**

TheDadBot is built for people who want the convenience of a polished web dashboard and the speed/control of a local CLI without turning a hosted website into a private-key custodian.

## What ships in this repository

- **Browser dashboard** — injected-wallet public SeaDrop minting with local calldata construction, preflight simulation, exact intent review and receipt/NFT verification.
- **Local agent** — loopback-only API for OpenSea discovery, RPC quorum/benchmarking, deterministic planning and scheduled automation. It can unlock an encrypted vault from its own terminal; secrets are never accepted over HTTP.
- **CLI** — encrypted wallet vault, RPC diagnostics, OpenSea discovery/eligibility, deterministic SeaDrop planning and local/VPS execution.
- **Shared security core** — transaction-intent firewall, spend ceilings, RPC quorum, multi-RPC broadcast, nonce reservation, state machine and NFT postconditions.
- **OpenSea adapter** — official Drops API for upcoming/featured/recent drops, drop details, eligibility, and mint transaction generation. API-generated transactions are classified before they can be executed.
- **Sponsored executor** — wallet-signed, sponsor-funded on-chain executor with complete intent binding, replay protection, deadline and NFT balance postcondition.
- **EIP-7702 delegated wallet** — optional explicit delegation implementation for sponsored execution without giving the hosted dashboard custody. Treat delegation as advanced mode and audit bytecode before authorising it.
- **CI / Foundry / secret checks** — JavaScript tests, repository safety checks and Solidity tests.

## Why the architecture is different

A successful simulation is not proof that an API-generated transaction is the mint you intended. TheDadBot separates **execution success** from **intent correctness**.

```text
                                TheDadBot
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
        Web dashboard          Local agent             CLI / VPS
        injected wallet      encrypted vault        encrypted vault
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                           shared security core
                                   │
       discover → resolve → verify intent → simulate → limit spend
                                   │
                  local sign → parallel broadcast → receipt
                                   │
                         prove intended NFT mint
```

### Verification levels

| Level | Meaning | AUTO allowed? |
|---|---|---|
| `deterministic` | TheDadBot independently constructs/decodes the transaction from known protocol state. | Yes, with explicit caps |
| `verified` | Transaction is API-assisted but all material intent fields can be independently checked. | Only when adapter policy explicitly permits |
| `opaque` | Some material semantics cannot be independently established. | **Never** |

The current deterministic browser path is SeaDrop V1 public minting. Signed/allowlist and other OpenSea routes can be retrieved through the official Drops API, but an opaque route remains confirmation-only rather than being blindly promoted to AUTO.

## Built-in networks

Ethereum, Base, Robinhood Chain, Robinhood Chain Testnet, Arbitrum One, Optimism, Polygon and Zora are registered. Custom EVM networks can be added at the core layer without changing execution logic.

Robinhood mainnet uses chain ID `4663`; the official RPC is `https://rpc.mainnet.chain.robinhood.com`. The canonical SeaDrop address used by the deterministic adapter is `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5`.

## Quick start

Requires **Node.js 22+**.

```bash
npm install
npm run check
```

### Browser dashboard

```bash
npm run dashboard
```

Open `http://127.0.0.1:4173`.

The browser path never accepts a private key. Connect an injected EVM wallet, enter an NFT contract and quantity, build the plan, inspect it, then mint.

### CLI

```bash
npm run cli -- doctor
npm run cli -- chains
npm run cli -- rpc benchmark robinhood
```

Create an encrypted vault:

```bash
npm run cli -- vault create wallets.enc.json
```

The key is entered through a hidden terminal prompt. Do **not** put it in `.env` or a command argument.

Plan a public SeaDrop mint:

```bash
npm run cli -- plan seadrop base 0xYOUR_NFT 1 --recipient 0xYOUR_WALLET
```

Execute from the encrypted vault:

```bash
npm run cli -- mint seadrop base 0xYOUR_NFT 1 --vault wallets.enc.json
```

For a future stage, add `--wait`. TheDadBot warms/benchmarks endpoints before the launch and refreshes nonce, fees and simulation at execution time instead of trusting a stale pre-signed transaction.

AUTO requires a deterministic plan and should always be paired with explicit ceilings:

```bash
npm run cli -- mint seadrop base 0xYOUR_NFT 1 \
  --vault wallets.enc.json --auto --wait \
  --max-mint-wei 50000000000000000 \
  --max-gas-wei 5000000000000000 \
  --max-total-wei 55000000000000000
```

## OpenSea discovery and eligibility

OpenSea's current public Drops API requires an API key. TheDadBot can request an instant free-tier key and store it locally with restrictive permissions:

```bash
npm run cli -- opensea key
npm run cli -- opensea drops upcoming base
npm run cli -- opensea drop COLLECTION_SLUG
```

Wallet-specific eligibility also requires a wallet-scoped token. TheDadBot can authenticate a wallet from the encrypted vault using OpenSea's SDK/SIWE flow:

```bash
npm run cli -- opensea auth wallets.enc.json
npm run cli -- opensea eligibility COLLECTION_SLUG
```

The resulting short-lived wallet JWT is stored locally. The private key is not written to the OpenSea auth file.

## Local agent

Start browser-safe discovery/RPC services:

```bash
npm run agent
```

For scheduled local automation, unlock a vault **in the agent terminal**:

```bash
THEDADBOT_VAULT=wallets.enc.json npm run agent
```

Windows PowerShell:

```powershell
$env:THEDADBOT_VAULT="wallets.enc.json"
npm run agent
```

The agent binds to `127.0.0.1:47831` by default. It rejects request bodies containing private-key, mnemonic, seed-phrase or password fields.

## RPC model

Read trust and broadcast speed are separate concerns.

- **Quorum reads** group independent RPC observations and require agreement for security-sensitive state.
- **Benchmarking** records latency, chain ID, current head and head lag.
- **Broadcast** sends the exact same signed raw transaction to multiple endpoints concurrently and requires returned transaction hashes to agree.

Configure comma-separated endpoints in `.env` or the process environment. Do not commit paid RPC credentials.

## Sponsored and delegated execution

`contracts/src/SponsoredMintExecutor.sol` supports sponsor-funded execution using a wallet's EIP-712 signature.

`contracts/src/DelegatedMintWallet.sol` is an optional implementation for EIP-7702 delegation. EIP-7702 delegation changes the code associated with an EOA and remains in effect until explicitly replaced/revoked. Only use a deployment whose bytecode you have independently verified.

Both contracts bind the complete action and enforce ERC-721 or single-token ERC-1155 balance growth after the mint call.

Run Solidity tests with Foundry:

```bash
forge test -vvv
```

## Security invariants

1. No seed phrase input exists anywhere.
2. Hosted browser mode has no private-key import.
3. Local-agent HTTP has no key/password import.
4. API transaction targets do not become trusted merely because the API returned them.
5. AUTO rejects opaque plans.
6. Spend ceilings are checked against maximum fee exposure before signing.
7. Multi-RPC broadcast never means multi-signing; all endpoints receive the same raw transaction.
8. Receipt status alone is insufficient; NFT postconditions must pass.
9. EIP-7702 is never silently enabled.
10. Security-sensitive fixes require regression tests.

Read [SECURITY.md](./SECURITY.md) and [docs/threat-model.md](./docs/threat-model.md) before using real funds.

## Repository map

```text
apps/dashboard/                 dependency-light web UI
packages/core/                  shared execution/security core
packages/cli/                   terminal/VPS interface
packages/agent/                 loopback local service + scheduler
contracts/src/                  sponsored + EIP-7702 execution contracts
contracts/test/                 Foundry tests
test/                           Node security/regression tests
docs/                           architecture, usage and security docs
.github/workflows/              CI, CodeQL and release automation
```

## Development status

This repository is designed as one integrated release rather than a sequence of placeholder versions. However, blockchain conditions, third-party APIs, RPC behaviour and wallet implementations change. Passing repository tests is not a guarantee of profitable or successful mint inclusion. Use dedicated, minimally funded wallets for testing and verify live network/contract state before valuable transactions.

MIT licensed.
