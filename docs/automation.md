# Automation

## Modes

**WATCH** never signs.

**CONFIRM** prepares, validates and simulates but requires an explicit user action before signing.

**AUTO** is permitted only for independently verifiable plans. The current unattended job endpoint is restricted to deterministic SeaDrop public jobs.

## Local agent vault

Set `THEDADBOT_VAULT` before launching the agent. The password is read from the terminal and the vault stays in process memory. It is never sent through HTTP.

Scheduled job bodies contain a wallet index, chain, NFT contract, quantity, time and spend policy, not key material.

At firing time the agent re-reads live drop state and constructs a fresh plan. It does not reuse an API transaction captured hours earlier.

## Failure behaviour

A job fails closed when:

- the stage is not open
- RPC chain ID is wrong
- state quorum cannot be reached
- simulation fails
- spend caps are exceeded
- signing fails
- every broadcaster rejects the raw transaction
- receipt fails
- intended NFT postcondition cannot be proven
