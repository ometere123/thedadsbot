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

The local agent accepts browser requests only from exact origins listed in `THEDADBOT_DASHBOARD_ORIGINS`. Do not use wildcard origins. After deploying to Vercel, add only the exact production origin you intend to trust.

The hosted dashboard is served with restrictive security headers including a Content Security Policy, frame denial, referrer suppression and restricted browser permissions.

## Reporting

Do not publish an exploitable vulnerability before maintainers have had a reasonable chance to fix it. Open a private GitHub security advisory when available.
