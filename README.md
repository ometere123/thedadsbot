<h1 align="center">TheDadBot</h1>

<p align="center"><b>Multi-chain NFT mint execution without handing a hosted website your private keys.</b></p>

<p align="center">
  <a href="https://github.com/ometere123/thedadsbot/actions/workflows/ci.yml"><img src="https://github.com/ometere123/thedadsbot/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ometere123/thedadsbot/actions/workflows/codeql.yml"><img src="https://github.com/ometere123/thedadsbot/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" /></a>
  <img src="https://img.shields.io/badge/Node.js-22%2B-111111" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/EVM-multi--chain-111111" alt="Multi-chain EVM" />
  <img src="https://img.shields.io/badge/Foundry-tested-111111" alt="Foundry tested" />
  <img src="https://img.shields.io/badge/license-MIT-111111" alt="MIT license" />
</p>

<p align="center">
  <a href="#quick-start"><b>Quick start</b></a> ·
  <a href="#product-surfaces"><b>Product surfaces</b></a> ·
  <a href="#security-model"><b>Security model</b></a> ·
  <a href="#built-in-networks"><b>Networks</b></a> ·
  <a href="#documentation"><b>Docs</b></a>
</p>

---

**TheDadBot** combines a browser dashboard, local execution agent and CLI around one shared security core.

It is built for NFT mint operations where speed matters, but where **intent correctness matters more than blindly signing whatever an API, RPC or website returns**.

The hosted browser path uses an injected wallet. Advanced automation and encrypted wallet fleets stay local. API-generated transactions are classified before execution, spend is bounded before signing, state can be checked across independent RPCs, and a successful transaction receipt is not considered enough until the intended NFT mint is verified.

> **Core principle:** the fastest transaction is useless if it is not the transaction you intended to sign.

## Why TheDadBot

Most mint tooling optimises one part of the problem: discovery, signing, wallet fleets, RPC speed, automation or sponsored execution.

TheDadBot treats minting as one complete execution lifecycle:

```text
discover
   ↓
resolve live state
   ↓
verify transaction intent
   ↓
simulate
   ↓
enforce spend policy
   ↓
sign locally
   ↓
broadcast in parallel
   ↓
verify receipt
   ↓
prove the intended NFT was minted
```

That distinction drives the whole architecture.

| Problem | TheDadBot approach |
| --- | --- |
| Fast RPC returns bad or stale state | Security-sensitive reads can require independent RPC agreement |
| Mint API returns a different target | Target, selector, value and mint semantics are checked before execution |
| Simulation succeeds for the wrong call | Simulation and intent verification are separate gates |
| AUTO mode spends beyond expectation | Explicit mint, gas and total-exposure ceilings are required |
| Two jobs collide on the same nonce | Local nonce reservation prevents same-process collisions |
| One broadcaster is slow | The same signed raw transaction can be sent to multiple endpoints concurrently |
| Transaction succeeds but NFT is not received | ERC-721 / ERC-1155 postconditions are verified after inclusion |
| Hosted dashboard becomes a key vault | Browser mode uses injected wallets; advanced vault execution stays local |

## Product surfaces

The same execution model is exposed through three interfaces.

| Surface | Best for | Key custody |
| --- | --- | --- |
| **Web dashboard** | Interactive mint planning and injected-wallet execution | Browser wallet only |
| **Local agent** | Dashboard-controlled discovery, RPC services and scheduled automation | Encrypted vault unlocked locally |
| **CLI / VPS** | Direct execution, automation, diagnostics and wallet fleets | Encrypted local vault |

### Browser dashboard

The browser dashboard supports the deterministic public SeaDrop path with:

- injected EVM wallet connection;
- local calldata construction;
- mint-state resolution;
- preflight simulation;
- exact intent review;
- spend visibility;
- transaction submission;
- receipt and NFT postcondition verification.

There is no private-key or seed-phrase import flow in the hosted browser surface.

### Local agent

The local agent binds to loopback and provides services that should remain close to the user's machine:

- OpenSea discovery;
- RPC quorum and endpoint benchmarking;
- deterministic planning;
- policy validation;
- scheduled execution;
- encrypted-vault access after local terminal unlock.

The HTTP API rejects private-key, mnemonic, seed-phrase and password fields.

### CLI / VPS

The CLI exposes the same security model for terminal-first operation:

- encrypted wallet vaults;
- chain and RPC diagnostics;
- OpenSea discovery and eligibility;
- deterministic SeaDrop planning;
- confirmation and AUTO execution modes;
- launch waiting;
- local/VPS automation.

## Architecture

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
                         shared execution core
                                   │
     ┌───────────────┬─────────────┼──────────────┬───────────────┐
     │               │             │              │               │
 chain registry   RPC quorum   intent firewall  spend policy   nonce manager
     │               │             │              │               │
     └───────────────┴─────────────┼──────────────┴───────────────┘
                                   │
                    simulate → sign → broadcast
                                   │
                          receipt verification
                                   │
                         NFT postcondition proof
```

The architecture deliberately separates **read trust**, **transaction intent**, **signing**, **broadcast speed** and **post-execution verification** instead of treating them as one opaque mint call.

## Verification levels

Every transaction plan has a verification class.

| Level | Meaning | AUTO |
| --- | --- | --- |
| `deterministic` | TheDadBot independently constructs or decodes the transaction from known protocol state | Allowed with explicit policy caps |
| `verified` | API-assisted transaction whose material intent fields can be independently checked | Only when the adapter policy permits it |
| `opaque` | One or more material semantics cannot be independently established | **Never allowed** |

The current deterministic browser path is **SeaDrop V1 public minting**.

Signed, allowlist and other API-assisted routes can still be discovered or prepared, but an opaque API response does not become trusted simply because it came from a recognised provider or simulated successfully.

## Security model

TheDadBot uses a transaction-intent firewall before signing.

Depending on the adapter and mode, it can bind or enforce:

```text
chain
mint target
function selector
NFT contract
recipient
quantity
mint value
maximum network fee
maximum total exposure
execution deadline
verification class
expected NFT postcondition
```

### Security invariants

1. **No seed-phrase input exists anywhere in the product.**
2. **Hosted browser mode has no private-key import.**
3. **Local-agent HTTP has no key or password import.**
4. API transaction targets do not become trusted merely because an API returned them.
5. AUTO rejects opaque plans.
6. AUTO requires explicit spend ceilings.
7. Multi-RPC broadcast uses one signed raw transaction, not multiple independently signed transactions.
8. Receipt status alone is insufficient; NFT postconditions must pass.
9. EIP-7702 is optional and never silently enabled.
10. Security-sensitive fixes require regression coverage.

Read [SECURITY.md](SECURITY.md) and [docs/threat-model.md](docs/threat-model.md) before using real funds.

## RPC model

TheDadBot treats **read authority** and **broadcast speed** as separate concerns.

### Quorum reads

Security-sensitive observations can be compared across independent RPC endpoints before the state is accepted.

### Endpoint benchmarking

The RPC layer records operational signals including:

- latency;
- chain ID;
- current head;
- head lag;
- endpoint health.

### Parallel broadcast

After local signing, the exact same raw transaction can be submitted to multiple configured endpoints concurrently.

Returned hashes are checked for agreement so a broadcaster cannot silently transform the signed payload.

## Built-in networks

| Network | Chain ID | Native currency | OpenSea mapping |
| --- | ---: | --- | --- |
| Ethereum | `1` | ETH | `ethereum` |
| Base | `8453` | ETH | `base` |
| Robinhood Chain | `4663` | ETH | `robinhood` |
| Robinhood Chain Testnet | `46630` | ETH | — |
| Arbitrum One | `42161` | ETH | `arbitrum` |
| Optimism | `10` | ETH | `optimism` |
| Polygon | `137` | POL | `matic` |
| Zora | `7777777` | ETH | `zora` |

Custom EVM networks can be added through the chain registry without changing the execution model.

The deterministic SeaDrop adapter uses the canonical SeaDrop address:

```text
0x00005EA00Ac477B1030CE78506496e8C2dE24bf5
```

## Execution modes

TheDadBot separates observation, approval and unattended execution.

| Mode | Behaviour |
| --- | --- |
| **WATCH** | Discover and analyse without signing |
| **CONFIRM** | Build the exact transaction and require user approval before signing |
| **AUTO** | Execute only inside an explicit deterministic policy envelope |

AUTO is not a generic "sign whatever is returned" switch.

A valid unattended policy should define the expected contract, quantity, permitted value, maximum gas exposure, maximum total exposure and execution scope before the signer is used.

## OpenSea integration

TheDadBot supports OpenSea discovery and wallet-specific eligibility while keeping execution authority separate from API discovery.

The OpenSea layer can provide:

- upcoming drops;
- featured or recent drops;
- collection/drop details;
- wallet eligibility;
- mint transaction candidates.

API-generated mint transactions are still passed through TheDadBot's own verification classification before execution.

## Sponsored and delegated execution

The repository includes two Solidity execution surfaces for advanced workflows.

### SponsoredMintExecutor

[`contracts/src/SponsoredMintExecutor.sol`](contracts/src/SponsoredMintExecutor.sol) supports sponsor-funded execution using a wallet-signed EIP-712 operation.

The signed operation binds the material execution intent and includes replay and deadline protection plus an NFT balance-growth postcondition.

### DelegatedMintWallet

[`contracts/src/DelegatedMintWallet.sol`](contracts/src/DelegatedMintWallet.sol) provides an optional EIP-7702 execution path.

EIP-7702 delegation changes the code associated with an EOA and can remain effective until replaced or revoked. Treat it as an advanced feature and independently verify the deployed bytecode before authorising delegation.

## Quick start

Requires **Node.js 22+**.

```bash
git clone https://github.com/ometere123/thedadsbot
cd thedadsbot
npm install
npm run check
```

### Start the dashboard

```bash
npm run dashboard
```

Open:

```text
http://127.0.0.1:4173
```

### Inspect the CLI

```bash
npm run cli -- doctor
npm run cli -- chains
npm run cli -- rpc benchmark robinhood
```

### Create an encrypted vault

```bash
npm run cli -- vault create wallets.enc.json
```

The private key is entered through a hidden terminal prompt. Do not place it in `.env` or in a command argument.

### Plan a deterministic public SeaDrop mint

```bash
npm run cli -- plan seadrop base 0xYOUR_NFT 1 --recipient 0xYOUR_WALLET
```

### Execute from the encrypted vault

```bash
npm run cli -- mint seadrop base 0xYOUR_NFT 1 --vault wallets.enc.json
```

For a future stage, add `--wait`. TheDadBot refreshes execution-time state instead of relying on an old pre-signed transaction.

### AUTO with explicit ceilings

```bash
npm run cli -- mint seadrop base 0xYOUR_NFT 1 \
  --vault wallets.enc.json --auto --wait \
  --max-mint-wei 50000000000000000 \
  --max-gas-wei 5000000000000000 \
  --max-total-wei 55000000000000000
```

<details>
<summary><b>OpenSea discovery and eligibility commands</b></summary>

OpenSea's Drops API requires an API key.

```bash
npm run cli -- opensea key
npm run cli -- opensea drops upcoming base
npm run cli -- opensea drop COLLECTION_SLUG
```

Wallet-specific eligibility also requires wallet authentication:

```bash
npm run cli -- opensea auth wallets.enc.json
npm run cli -- opensea eligibility COLLECTION_SLUG
```

The resulting wallet token is stored locally. The private key is not written to the OpenSea auth file.

</details>

<details>
<summary><b>Local agent and scheduled automation</b></summary>

Start the local agent:

```bash
npm run agent
```

For vault-backed automation, unlock the vault in the agent's own terminal.

Linux/macOS shell:

```bash
THEDADBOT_VAULT=wallets.enc.json npm run agent
```

Windows PowerShell:

```powershell
$env:THEDADBOT_VAULT="wallets.enc.json"
npm run agent
```

The agent binds to `127.0.0.1:47831` by default.

</details>

## Validation

The permanent CI validates the JavaScript execution core, security regressions, repository structure and Solidity contracts.

Run the main repository checks locally:

```bash
npm run check
```

Run Solidity tests with Foundry:

```bash
forge test -vvv
```

The Node regression suite currently covers areas including:

- deterministic-stage execution gating;
- AUTO spend-ceiling enforcement;
- generic target substitution;
- opaque-plan rejection;
- SeaDrop calldata binding;
- maximum fee exposure;
- nonce collision prevention;
- API transaction classification;
- RPC quorum;
- endpoint benchmarking;
- scheduler behaviour;
- SeaDrop ABI construction and decoding;
- execution state transitions;
- encrypted-vault round trips.

CI also performs a repository secret scan and JavaScript syntax validation.

## Documentation

| Document | Purpose |
| --- | --- |
| [SECURITY.md](SECURITY.md) | Security boundaries and responsible handling |
| [docs/threat-model.md](docs/threat-model.md) | Threat model for malicious APIs, RPCs, calldata, keys and execution |
| [docs/architecture.md](docs/architecture.md) | System architecture and component responsibilities |
| [docs/usage.md](docs/usage.md) | Usage and execution guidance |
| [docs/adapters.md](docs/adapters.md) | Mint adapter model |
| [docs/automation.md](docs/automation.md) | Scheduler and unattended execution model |
| [docs/benchmarks.md](docs/benchmarks.md) | Benchmarking model and latency measurements |
| [docs/deployment.md](docs/deployment.md) | Deployment guidance |

## Repository layout

```text
.
├── apps/
│   └── dashboard/          # browser interface
├── packages/
│   ├── core/               # shared execution and security core
│   ├── cli/                # terminal / VPS interface
│   └── agent/              # loopback local service and scheduler
├── contracts/
│   ├── src/                # sponsored and EIP-7702 executors
│   └── test/               # Foundry tests
├── test/                   # Node security and regression tests
├── docs/                   # architecture, usage and security docs
├── scripts/                # repository validation utilities
└── .github/workflows/      # CI, CodeQL and release automation
```

## Design principles

TheDadBot follows six rules:

1. **Intent before execution** — a transaction must match an authorised mint intent, not merely be executable.
2. **Keys stay local** — the hosted dashboard should not become a wallet custodian.
3. **Read trust is not broadcast speed** — RPCs are evaluated according to the role they perform.
4. **Automation must be bounded** — unattended execution operates only inside an explicit policy envelope.
5. **Receipts need postconditions** — successful inclusion is not enough without proof of the expected NFT outcome.
6. **Advanced delegation stays explicit** — sponsored and EIP-7702 flows never silently expand wallet authority.

## Development status

TheDadBot is an integrated working repository with automated Node, security and Solidity validation.

That does **not** mean blockchain inclusion can be guaranteed. RPC conditions, gas markets, mint contracts, third-party APIs, sequencers and competing transactions remain external factors.

Use dedicated, minimally funded wallets when testing valuable execution paths, and independently verify live network and contract state before committing meaningful funds.

## License

MIT. See [LICENSE](LICENSE).
