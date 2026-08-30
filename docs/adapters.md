# Mint adapters

## SeaDrop V1 public

Verification: `deterministic`.

The adapter reads `getPublicDrop(nftContract)` and `getAllowedFeeRecipients(nftContract)` from the canonical SeaDrop contract, chooses a valid fee recipient, and locally encodes:

`mintPublic(address nftContract,address feeRecipient,address minterIfNotPayer,uint256 quantity)`

Selector: `0x161ac21f`.

The plan binds chain, canonical SeaDrop target, NFT contract, fee recipient, recipient/payer semantics, quantity and exact value.

## OpenSea Drops API

The official Drops API is used for discovery, details, wallet eligibility and generation of ready-to-sign mint transaction data.

An API-built transaction is then classified. A canonical SeaDrop public call can be upgraded to deterministic after decoding. A route that cannot be independently interpreted remains `opaque` and confirmation-only.

## Generic/custom contracts

The core intent firewall can secure user-specified targets/selectors, but this repository deliberately does not pretend that an arbitrary ABI call is an NFT mint. A future adapter should add a protocol-specific postcondition rather than simply labelling a generic successful call as safe.
