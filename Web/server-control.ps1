param([ValidateSet('start','stop')][string]$Action='start')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$runDirectory=Join-Path $projectRoot '.run'
$stateFile=Join-Path $runDirectory 'server.json'
$scriptPath=Join-Path $projectRoot 'server.mjs'
if(Test-Path -LiteralPath $stateFile){
 $state=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
 $running=Get-CimInstance Win32_Process -Filter "ProcessId = $($state.pid)" -ErrorAction SilentlyContinue
 if($running -and $running.Name -eq 'node.exe' -and $running.CommandLine -like "*$scriptPath*"){
  if($Action -eq 'stop'){Stop-Process -Id $state.pid;Remove-Item -LiteralPath $stateFile;Write-Output 'VlandGenerator stopped.';exit 0}
  Write-Output "VlandGenerator: http://127.0.0.1:$($state.port)/";exit 0
 }
}
if($Action -eq 'stop'){Write-Output 'VlandGenerator is not running under this controller.';exit 0}
$nodePath=(Get-Command node.exe -ErrorAction Stop).Source
$portNumber=if($env:PORT){[int]$env:PORT}else{9670}
if(Get-NetTCPConnection -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue){throw "Port $portNumber is already in use. Set PORT to a free port."}
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$process=Start-Process -FilePath $nodePath -ArgumentList ('"'+$scriptPath+'"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDirectory 'server.log') -RedirectStandardError (Join-Path $runDirectory 'error.log')
@{pid=$process.Id;port=$portNumber} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
for($i=0;$i -lt 30;$i++){
 Start-Sleep -Milliseconds 150
 try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$portNumber/api/health" -TimeoutSec 1;if($health.name -eq 'VlandGenerator'){Write-Output "VlandGenerator: http://127.0.0.1:$portNumber/";exit 0}}catch{}
}
throw 'Server did not become ready. See .run/error.log.'
