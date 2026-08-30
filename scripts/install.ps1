$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22+ is required" }
$major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 22) { throw "Node.js 22+ is required" }
npm install --ignore-scripts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "`nTheDadBot installed. Run: npm run dashboard"
