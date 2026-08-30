# Race Mode

Race Mode is TheDadBot's latency-optimised execution path for deterministic FCFS public SeaDrop mints.

It is deliberately separate from the normal SAFE execution engine. SAFE mode refreshes and simulates immediately before signing. Race Mode moves every operation that can safely happen before launch out of the T=0 hot path.

## Hot-path objective

At the launch boundary, Race Mode should have already completed:

- deterministic SeaDrop calldata construction;
- target/NFT/fee-recipient/quantity/value binding;
- RPC health and head-lag ranking;
- wallet nonce lookup;
- balance and spend-envelope checks;
- fee selection;
- gas-limit selection;
- transaction signing;
- local transaction hashing;
- JSON-RPC body serialisation;
- DNS/TCP/TLS connection warming.

The launch boundary is therefore:

```text
T = 0
  -> write the already-signed, already-serialised raw transaction
     to every configured broadcast endpoint concurrently
```

No OpenSea request, ABI encoding, private-key operation, gas estimation, transaction hashing or JSON serialisation belongs on the T=0 path.

## Why the signature is not created hours early

A very old pre-signed transaction can become stale because of nonce changes, fee-market changes, wallet activity or a modified mint configuration.

TheDadBot therefore re-reads the deterministic drop inside a short arming window (3 seconds by default), signs there, and rejects a prepared Race transaction if it is held beyond its configured freshness window.

This is a deliberate compromise: retain a pre-signed T=0 broadcast without carrying an hours-old nonce into a competitive launch.

For the most predictable result, use a dedicated mint wallet that has no other pending transaction activity while armed.

## Persistent write sockets

Race Mode does not use the normal `fetch()` RPC path for launch broadcast.

It maintains explicit Node HTTP/HTTPS keep-alive agents. `warmRpcConnections()` sends an intentionally invalid raw transaction before launch so write-only RPC/sequencer endpoints can still establish DNS, TCP, TLS and HTTP state. The actual launch reuses those persistent agents.

A second warm pass is performed shortly before launch when enough time remains.

## RPC separation

Read RPCs and broadcast RPCs can be different.

Read/quorum endpoints use the normal local chain variable, for example:

```env
BASE_RPCS=https://read-one.example,https://read-two.example
```

Race-only write endpoints can be kept separately:

```env
BASE_BROADCAST_RPCS=https://fast-write-one.example,https://fast-write-two.example
```

Equivalent `*_BROADCAST_RPCS` variables exist for the built-in networks. The selection order is:

1. explicit `--broadcast-rpc` command option;
2. local `<CHAIN>_BROADCAST_RPCS`;
3. healthy benchmarked read RPCs as fallback.

`--rpc` controls the read/preflight set. A fast write endpoint does not become a state authority merely because it is in the broadcast set.

Paid/private/direct-sequencer endpoints often contain credentials. Prefer the local `*_BROADCAST_RPCS` variables rather than command-line arguments for those endpoints. Never commit the real values and never expose them in Vercel or any `VITE_*` variable.

Race reports and normal CLI output reduce recorded broadcast URLs to their origins so credential-bearing paths/query strings are not persisted in the report.

## Gas before an unopened stage

A public mint can revert before its configured start time, which means ordinary `eth_estimateGas` may not be usable while the race transaction is being prepared.

Race Mode therefore accepts `--gas-limit`. If it is omitted for an UPCOMING stage, TheDadBot uses a conservative quantity-aware envelope:

```text
1,000,000 + 300,000 × (quantity - 1)
```

capped at 6,000,000 gas.

A high gas limit is a ceiling, not the amount necessarily charged, but it increases the maximum network-fee exposure used by the spend policy. Operators who know the target collection's real gas profile should set an explicit tested gas limit.

If the stage is already OPEN and no explicit gas limit is supplied, the engine can estimate gas and add headroom.

## Fee policy

By default, Race Mode obtains current EIP-1559 fee data inside the arming window and applies a configurable multiplier (`12500` bps = 1.25x by default).

Operators can instead pin the transaction fee fields explicitly:

```text
--tx-max-fee-wei
--tx-priority-fee-wei
```

Regardless of fee strategy, Race Mode still requires three independent spend ceilings:

```text
--max-mint-wei
--max-gas-wei
--max-total-wei
```

The exact mint value can be used as the default `--max-mint-wei`, but maximum network and total exposure must be supplied explicitly.

## Precision trigger

The countdown converts the wall-clock launch time into a monotonic `performance.now()` target. Normal sleeps handle the long wait; only a bounded final few milliseconds use a spin to reduce timer jitter.

`--launch-offset-ms` defaults to `0` and only permits non-negative offsets. Race Mode does not intentionally fire before the published stage time because an early transaction can be included in a block whose timestamp still fails the mint condition.

## Command

```powershell
npm run cli -- race seadrop base 0xNFT 1 `
  --vault wallets.enc.json `
  --max-gas-wei 5000000000000000 `
  --max-total-wei 55000000000000000
```

Optional tuning:

```text
--gas-limit N
--fee-multiplier-bps 12500
--priority-multiplier-bps 12500
--tx-max-fee-wei N
--tx-priority-fee-wei N
--arm-ms 3000
--warm-lead-ms 600
--launch-offset-ms 0
--spin-ms 4
--rpc url1,url2
--broadcast-rpc url1,url2
--report .data/race-last.json
```

The encrypted vault password and private key never become command-line arguments.

## Telemetry

Every completed race report records:

- preparation time;
- stage start and target time;
- trigger drift;
- local fanout dispatch duration;
- first accepting RPC;
- first-RPC acceptance latency from T=0;
- per-endpoint acceptance/rejection and socket-reuse state;
- receipt observation time;
- inclusion block;
- transaction fingerprint, nonce, gas limit and fee fields;
- NFT postcondition result.

The default report is written to `.data/race-last.json`, which is gitignored. The raw signed transaction is not written to the report.

## Local regression benchmark

Run:

```bash
npm run race:bench
```

This exercises prepared multi-endpoint fanout over warmed loopback sockets and reports median/p95 local dispatch and first-accept latency.

It is a regression benchmark, not evidence that TheDadBot is faster than a competing tool on the public internet.

## Comparative benchmark required for a "fastest" claim

A valid comparison against another minter must use:

1. the same physical machine;
2. the same wallet count;
3. the same RPC endpoints in the same order/set;
4. the same chain and drop;
5. equivalent gas/priority-fee settings;
6. synchronised launch time;
7. multiple runs, not one lucky sample.

Record at minimum:

- T=0 to local dispatch completion;
- T=0 to first RPC acceptance;
- T=0 to inclusion;
- transaction index within the inclusion block;
- success/revert result.

TheDadBot should not claim to be faster than another implementation until those measurements exist.

## Remaining external limits

Race Mode can remove local software work from T=0, but cannot guarantee first inclusion. Results still depend on network distance, RPC routing, sequencer/builder policy, fee market, validator ordering, block timing and competing transactions.
