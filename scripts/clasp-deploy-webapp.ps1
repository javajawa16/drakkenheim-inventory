$ErrorActionPreference = 'Stop'

$nodePath = 'C:\Program Files\nodejs'
$claspEntry = Join-Path $PSScriptRoot '..\node_modules\@google\clasp\build\src\index.js'
$deploymentId = 'AKfycbx3D0qyi20ijwdCc7sFNnwfFqcAASNASfUaQD5fcA3PFujB9wAyXeaKDT3yqhfhUAN8'
$description = if ($args.Count -gt 0) { $args -join ' ' } else { 'Codex web app update' }

# Always push code first so the deployment captures the current source
Write-Host "Pushing source files..."
& (Join-Path $nodePath 'node.exe') $claspEntry push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying..."
& (Join-Path $nodePath 'node.exe') $claspEntry deploy --deploymentId $deploymentId --description $description

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

