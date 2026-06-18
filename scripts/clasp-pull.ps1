$ErrorActionPreference = 'Stop'

$nodePath = 'C:\Program Files\nodejs'
if (Test-Path $nodePath) {
  $env:PATH = "$nodePath;$env:PATH"
}

$localClasp = Join-Path $PSScriptRoot '..\node_modules\.bin\clasp.cmd'

if (Test-Path $localClasp) {
  & $localClasp pull
} else {
  $env:npm_config_cache = Join-Path $PSScriptRoot '..\.npm-cache'
  npx -y @google/clasp pull
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
