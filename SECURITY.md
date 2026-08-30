# Security policy

TheDadBot handles software capable of signing and broadcasting blockchain transactions. Treat every release as security-sensitive.

## Non-negotiable rules

- Never paste a seed phrase into TheDadBot.
- The hosted dashboard never accepts raw private keys.
- The loopback local-agent HTTP API never accepts raw private keys or seed phrases.
- CLI wallet keys live only in an encrypted local vault and are decrypted in memory for the minimum required operation.
- API-built transactions are not trusted just because they simulate successfully.
- AUTO mode requires independently verifiable intent. Opaque plans are confirmation-only.
- A successful transaction receipt is not considered a successful mint until the expected NFT transfer/balance postcondition is observed.
- EIP-7702 delegation is opt-in and must only target audited bytecode. Delegation is persistent until explicitly revoked.

## Race Mode boundary

Race Mode is local CLI functionality for deterministic public SeaDrop FCFS launches. It is not exposed as an unattended hosted-browser signing path.

Race Mode intentionally signs shortly before a known launch time and holds the raw signed transaction in process memory so the T=0 path can be reduced to socket writes. The raw transaction is not written to the race report.

The following protections remain mandatory in Race Mode:

- deterministic SeaDrop target/calldata binding;
- exact NFT, quantity, recipient and mint-value binding;
- explicit maximum mint, network-fee and total-spend ceilings;
- a short prepared-signature freshness window;
- no private key in command arguments or `.env`;
- encrypted local vault custody;
- post-inclusion NFT verification.

For UPCOMING stages, ordinary simulation/gas estimation can revert before the configured start time. Race Mode therefore records simulation as skipped before opening and uses an explicit or conservative gas envelope. This is an intentional latency/safety trade-off and is why Race Mode is restricted to independently constructed deterministic public SeaDrop plans.

Use a dedicated minimally funded race wallet with no unrelated pending transactions while armed. A nonce change after signing can invalidate a prepared transaction.

Private or credential-bearing RPC URLs belong only in the local environment or local CLI flags. Never put them in Vercel `VITE_*` variables or commit them.

## Hosted dashboard boundary

The Vite + React dashboard is client-side code. Anything exposed through a `VITE_*` environment variable is embedded into the browser bundle and must be treated as public.

Do not place any of the following in Vercel frontend environment variables:

- private keys or seed phrases;
- vault passwords;
- `OPENSEA_API_KEY`;
- `OPENSEA_WALLET_JWT`;
- paid/private RPC credentials;
- any bearer token or service secret.

The hosted dashboard's local-agent URL is constrained to loopback HTTP. A configured `VITE_AGENT_URL` that points anywhere other than localhost/loopback is ignored.

The local agent accepts browser requests only from exact origins listed in `THEDADBOT_DASHBOARD_ORIGINS`. Do not use wildcard origins. Do not authorise a hosted origin to an unlocked write-capable local agent until an additional local authentication/approval boundary is enabled for write operations.

The hosted dashboard is served with restrictive security headers including a Content Security Policy, frame denial, referrer suppression and restricted browser permissions.

## Reporting

Do not publish an exploitable vulnerability before maintainers have had a reasonable chance to fix it. Open a private GitHub security advisory when available.
