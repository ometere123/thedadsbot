# Performance benchmarking

TheDadBot does not publish fake "fastest bot" numbers. Performance must be measured on the user's actual network path.

## RPC health

`npm run cli -- rpc benchmark <chain>` measures:

- request latency;
- chain ID;
- observed head;
- head lag relative to the freshest configured endpoint.

Race Mode ranks healthy read endpoints before arming. Dedicated write endpoints can be supplied separately with `--broadcast-rpc`.

## Hot-path regression benchmark

`npm run race:bench` runs the prepared Race Mode broadcaster against warmed local loopback endpoints and reports:

- median / p95 local dispatch duration;
- median / p95 first-accept latency;
- persistent-socket reuse rate.

This is useful for catching software regressions. It is not a public-network benchmark and must not be used to claim superiority over another minter.

## Real FCFS launch telemetry

Race Mode writes `.data/race-last.json` by default. For a real launch, record separately:

1. plan-preparation time;
2. signature preparation time;
3. trigger drift;
4. T=0 to local fanout dispatch completion;
5. T=0 to first RPC acceptance;
6. per-RPC acceptance latency;
7. transaction inclusion block/time;
8. transaction position/index in the inclusion block;
9. receipt-to-NFT-proof time.

## Comparative benchmark protocol

A claim such as "faster than X" requires an apples-to-apples test. Run both tools using:

- the same physical machine and operating system;
- the same network connection;
- the same chain and mint;
- the same RPC and sequencer endpoints;
- the same wallet count;
- equivalent transaction fee settings;
- the same launch timestamp;
- enough repeated runs to report a distribution rather than one sample.

Primary metrics are T=0 → first RPC acceptance and T=0 → inclusion. Local dispatch time is useful but does not by itself prove blockchain inclusion advantage.

Do not optimise one measurement by weakening another invariant. For example, choosing the lowest-latency RPC as the sole source of mint price is not an acceptable speed optimisation, and an hours-old pre-signed nonce is not equivalent to a freshly armed transaction.

See [race-mode.md](race-mode.md) for the FCFS execution model.
