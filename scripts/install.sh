#!/usr/bin/env sh
set -eu
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required" >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo "Node.js 22+ is required" >&2; exit 1; }
npm install --ignore-scripts
npm run check
printf '\nTheDadBot installed. Run: npm run dashboard\n'
