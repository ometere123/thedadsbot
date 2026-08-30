# Performance benchmarking

TheDadBot does not publish fake "fastest bot" numbers. Performance must be measured on the user's actual network path.

`npm run cli -- rpc benchmark <chain>` measures:

- request latency
- chain ID
- observed head
- head lag relative to the freshest configured endpoint

For a real launch, record separately:

1. plan-preparation time
2. final simulation time
3. signing time
4. trigger-to-first-RPC-accept time
5. trigger-to-all-RPC-settled time
6. transaction inclusion block/time
7. receipt-to-NFT-proof time

Do not optimise one measurement by weakening another invariant. For example, choosing the lowest-latency RPC as the sole source of mint price is not an acceptable speed optimisation.
