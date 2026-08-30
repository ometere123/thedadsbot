# Architecture

## Surfaces

### Dashboard
The safest route for ordinary users. It uses an injected wallet and performs deterministic SeaDrop V1 public planning directly in the browser using `eth_call`. There is no raw-key form and no browser-side API secret.

### Local agent
Loopback-only service for functionality a static hosted page should not own: OpenSea API keys, RPC endpoint sets, encrypted local wallet fleets and unattended jobs. If a vault is configured, the agent asks for its password in the terminal during startup. The HTTP request parser rejects secret-bearing fields.

### CLI
Headless/VPS interface. It is the only surface that directly decrypts the local key vault for one-shot execution, plus the agent's terminal-unlock path.

## Shared core

All surfaces rely on the same concepts:

1. Chain registry
2. Discovery / drop resolution
3. Adapter-specific transaction planning
4. Intent firewall
5. Read-side quorum where multiple endpoints are available
6. Simulation
7. Maximum spend enforcement
8. Local signing
9. Same-raw-transaction multi-RPC broadcast
10. Receipt and NFT postcondition verification

## Adapter trust levels

`deterministic`: every material action can be independently derived or decoded. Public SeaDrop V1 is the first implementation.

`verified`: API assistance is accepted only after independent target/calldata/value/recipient checks.

`opaque`: the action may be useful, but TheDadBot cannot prove all semantics. It is confirmation-only and cannot run AUTO.

## Speed strategy

TheDadBot does not claim to defeat physical network latency. Instead it removes avoidable application latency while protecting correctness:

- prepare calldata before the stage opens
- benchmark RPCs and head lag
- keep state reads independent from broadcast ranking
- refresh nonce and fee data close to execution
- simulate immediately before signing
- sign once
- send the same raw transaction concurrently

This deliberately avoids making a stale pre-signed nonce the default just to win a benchmark.
