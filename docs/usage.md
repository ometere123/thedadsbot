# Usage reference

## Dashboard

1. Run `npm run dashboard`.
2. Connect an injected EVM wallet.
3. Open Mint console.
4. Enter the NFT contract and quantity.
5. Build plan.
6. Inspect target/value/time window and simulation.
7. Mint only when the plan is open and deterministic.

## CLI vault

`vault create` writes a new encrypted vault.

`vault add` decrypts an existing vault and adds another key.

`vault list` prints labels/addresses only. It never prints keys.

## OpenSea

`opensea key` requests an instant API key and stores it under `.data/`.

`opensea auth` uses a key from the encrypted vault to perform OpenSea SIWE through the official SDK and stores only the resulting wallet JWT.

`opensea drops`, `opensea drop`, and `opensea eligibility` query the official API.

`opensea mint-plan` obtains a ready-to-sign payload but does not sign it. The payload is classified before any future execution path can use it.

## Deterministic mint

`plan seadrop` reads public-drop state using the configured RPC set and builds calldata locally.

`mint seadrop` decrypts the selected local wallet, refreshes on-chain state, simulates, enforces spend caps, signs once, broadcasts the same raw transaction to all configured endpoints, then verifies the NFT transfer.
