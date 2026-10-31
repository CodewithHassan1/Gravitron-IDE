$ErrorActionPreference = 'Continue'
$root = 'D:\Personal Agent'
$log = Join-Path $root 'scratch\e2e-logs'
New-Item -ItemType Directory -Force -Path $log | Out-Null
Get-ChildItem "$log\*.log" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

$env:GOROOT = 'C:\Users\HASSAN~1\AppData\Local\Temp\opencode\go'
$env:Path = "$env:GOROOT\bin;" + $env:Path

$procs = @()
function Launch($name, $file, $argList, $workdir) {
  $stdout = "$log\$name.out.log"
  $stderr = "$log\$name.err.log"
  if ($argList -and $argList.Count -gt 0) {
    $p = Start-Process -FilePath $file -ArgumentList $argList -WorkingDirectory $workdir -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
  } else {
    $p = Start-Process -FilePath $file -WorkingDirectory $workdir -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
  }
  $script:procs += $p
  Write-Host "started $name pid=$($p.Id)"
}

# --- start stack -----------------------------------------------------------
Launch 'gateway'      'node' @('--env-file=.env','dist/index.js')                "$root\services\gateway"
$env:PORT = '3004'
Launch 'orchestrator' 'node' @('--env-file=../../.env','dist/index.js')          "$root\services\orchestrator"
$env:PORT = '3005'
Launch 'worker'       'node' @('--env-file=../../.env','dist/index.js')          "$root\services\worker-ai"
Remove-Item Env:\PORT -ErrorAction SilentlyContinue

# JWKS stand-in (real auth service cannot boot here: missing `nodemailer` + stale dist)
Launch 'jwks' 'node' @('e2e-jwks-server.mjs') "$root\scratch"

# Go execution-service
$lines = Get-Content -LiteralPath "$root\.env"
$envLine = $lines | Where-Object { $_ -like 'INTERNAL_PUBLIC_KEY=*' } | Select-Object -First 1
$v = ($envLine -split '=',2)[1].Trim().Trim('"')
$env:INTERNAL_PUBLIC_KEY = $v.Replace('\n', "`n")
Write-Host "internal key parsed: length=$($env:INTERNAL_PUBLIC_KEY.Length)"
Launch 'execution' "$log\execution-server.exe" @() "$root\services\execution"

# --- wait for readiness ----------------------------------------------------
$ports = @(3001,8080,3004,3005,8083)
$deadline = (Get-Date).AddSeconds(90)
foreach ($port in $ports) {
  while ($true) {
    $ok = $false
    try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $ok = $c.Connected; $c.Close() } catch {}
    if ($ok) { Write-Host "port $port ready"; break }
    if ((Get-Date) -gt $deadline) { Write-Host "TIMEOUT waiting for port $port"; break }
    Start-Sleep -Milliseconds 500
  }
}

# --- run the harness -------------------------------------------------------
Write-Host "`n########## HARNESS ##########"
& "$root\node_modules\.bin\tsx.cmd" "$root\scratch\test-delegation-flow.ts" 2>&1 | Tee-Object -FilePath "$log\harness.log"
$harnessExit = $LASTEXITCODE
Write-Host "########## HARNESS EXIT=$harnessExit ##########"

# --- dump service logs -----------------------------------------------------
foreach ($n in @('gateway','orchestrator','worker','jwks','execution')) {
  Write-Host "`n===== $n.out.log ====="
  Get-Content "$log\$n.out.log" -ErrorAction SilentlyContinue | Select-Object -Last 40
  $err = Get-Content "$log\$n.err.log" -ErrorAction SilentlyContinue | Select-Object -Last 10
  if ($err) { Write-Host "--- $n.err.log ---"; $err }
}

# --- teardown --------------------------------------------------------------
$procs | Where-Object { $null -ne $_ } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Get-Process execution-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "`nteardown complete; harness exit=$harnessExit"
exit $harnessExit
