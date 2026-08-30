# Contributing

1. Keep execution logic in `packages/core`; the dashboard, CLI and local agent must not implement competing safety rules.
2. Add a regression test for every security-sensitive fix.
3. Never add a path that accepts a browser-posted private key.
4. New mint adapters must define their verification level: `deterministic`, `verified`, or `opaque`.
5. `opaque` adapters may never opt into unattended AUTO execution.
6. Keep chain-specific details in the chain registry rather than scattering chain IDs or RPC URLs through the codebase.
7. Run `npm run check` before opening a pull request.
