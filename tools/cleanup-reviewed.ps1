param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$planPath = Join-Path $projectRoot 'evidence\cleanup-current.json'
$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$targets = @()
foreach ($entry in $plan.files) {
    $target = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $entry.path))
    if (-not $target.StartsWith($projectRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside project.' }
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $item = Get-Item -LiteralPath $target -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Only regular project files are allowed.' }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw ('Changed since review: ' + $entry.path) }
    $targets += $target
}
$temporary = 'C:\Users\vaveMain\AppData\Local\Temp\Vland map UI QA bSRPeO'
if (Test-Path -LiteralPath $temporary) {
    $resolved = (Resolve-Path -LiteralPath $temporary).Path
    if ($resolved -ne $temporary) { throw 'Unexpected temporary path.' }
    if (Get-NetTCPConnection -LocalPort 11501 -State Listen -ErrorAction SilentlyContinue) { throw 'QA port 11501 is still in use.' }
    $tree = @(Get-Item -LiteralPath $resolved -Force) + @(Get-ChildItem -LiteralPath $resolved -Force -Recurse)
    if (@($tree | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }).Count) { throw 'Reparse point in QA copy.' }
}
if ($VerifyOnly) {
    Write-Output ('Verified project files pending deletion: ' + $targets.Count)
    Write-Output ('Temporary QA copy exists: ' + (Test-Path -LiteralPath $temporary))
    exit 0
}
foreach ($target in $targets) { Remove-Item -LiteralPath $target -Force }
if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
Write-Output ('Removed project files: ' + $targets.Count)
Write-Output 'Reviewed cleanup finished. Ask Codex to verify the result.'
