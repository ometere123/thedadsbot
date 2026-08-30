# Threat model

## Protected assets

- wallet signing authority
- native token used for mint value and gas
- NFT recipient correctness
- automation intent
- OpenSea API/JWT credentials
- vault ciphertext and password

## Adversaries

### Malicious or compromised RPC
A fast RPC may lie about chain state. Mitigation: chain-ID checks, quorum reads, head-lag benchmarking and separation of read authority from broadcast endpoints.

### Compromised API response
An API may return a transaction that succeeds but does something other than the intended mint. Mitigation: intent firewall, known target/selector binding, SeaDrop calldata decoding, opaque classification and AUTO prohibition.

### Compromised hosted frontend
A malicious hosted page could try to request dangerous wallet actions. Mitigation: no private keys in browser, visible wallet confirmation, deterministic local planning and open-source/self-hosted UI. Users should still inspect wallet prompts.

### Local malware
No browser/CLI design can protect a private key after a hostile local machine can inspect process memory or terminal input. The encrypted vault protects data at rest, not a compromised operating system.

### Malicious sponsor / relayer
Sponsored and delegated contracts bind sponsor, target, calldata hash, value, recipient, NFT, deadline and nonce to the wallet signature. The sponsor cannot substitute those fields.

### EIP-7702 implementation compromise
Delegation grants persistent code authority. Mitigation: explicit opt-in, no silent delegation, verify implementation bytecode before signing, narrow signed operations and document revocation.

### Nonce races
Multiple simultaneous jobs can sign the same nonce. Mitigation: local nonce reservation plus a fresh pending nonce read before signing. Cross-process coordination still requires users to avoid running independent signers for the same wallet without shared state.

## Out of scope

- compromised browser extension/wallet software
- compromised OS/hardware
- validator/sequencer censorship
- creator rug-pulls or malicious NFT contracts that satisfy the user's explicitly authorised call
- guaranteed inclusion or winning competitive mints
