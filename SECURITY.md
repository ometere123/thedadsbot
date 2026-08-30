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

## Reporting

Do not publish an exploitable vulnerability before maintainers have had a reasonable chance to fix it. Open a private GitHub security advisory when available.
