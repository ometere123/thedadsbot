# Deployment

## Hosted dashboard

The dashboard is static. Import the repository into Vercel and deploy from the root; `vercel.json` routes the root page to `apps/dashboard`.

No private key or OpenSea API key should be configured in the hosted browser deployment.

## Local dashboard + agent

```bash
npm install
npm run dashboard
npm run agent
```

Both bind to loopback by default.

## VPS / CLI

Use a dedicated Linux user, encrypted disk where practical, firewall inbound ports, and restrict the wallet to the minimum mint funds required. The CLI does not need an inbound listener.

## Contracts

Compile and test:

```bash
forge test -vvv
forge build
```

Deploy the sponsored executor or EIP-7702 implementation only after reviewing the bytecode produced by the exact source commit. Record chain ID, deployer, address, transaction hash and runtime code hash in your release notes.
