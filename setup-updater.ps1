#!/usr/bin/env pwsh
<#
  One-time setup for TVio's silent Windows auto-updater.

  Generates a Tauri signing keypair, writes the PUBLIC key into
  src-tauri/tauri.conf.json, and uploads the PRIVATE key + password to GitHub
  as Actions secrets so CI can sign each release.

  Usage:
    ./setup-updater.ps1                     # generate a key (prompts for a password)
    ./setup-updater.ps1 -Password "hunter2" # non-interactive
    ./setup-updater.ps1 -Force              # regenerate, replacing an existing key

  ⚠  Keep the private key + password safe. If you lose them you can still ship
     new builds, but already-installed copies will reject the updates (they
     verify against the old public key) and users would need to reinstall.
#>
[CmdletBinding()]
param(
  [string]$KeyPath = "$env:USERPROFILE\.tauri\tvio.key",
  [string]$Password,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Conf = "src-tauri/tauri.conf.json"

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "==> $m" -ForegroundColor Green }
function Warn($m) { Write-Host "==> $m" -ForegroundColor Yellow }

# --- Preconditions -----------------------------------------------------------
if (-not (Test-Path $Conf)) { throw "Run this from the TVio project root ($Conf not found)." }
if (-not (Get-Command gh   -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) not found: https://cli.github.com/" }
if (-not (Get-Command npx  -ErrorAction SilentlyContinue)) { throw "Node/npx not found." }

gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Warn "Not logged in to GitHub — launching 'gh auth login'"; gh auth login }

# --- Password ----------------------------------------------------------------
if (-not $Password) {
  $secure = Read-Host "Password to protect the signing key (press Enter to auto-generate)" -AsSecureString
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if (-not $Password) {
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Password = [Convert]::ToBase64String($bytes)
    $generated = $true
  }
}

# --- Key ---------------------------------------------------------------------
$PubPath = "$KeyPath.pub"
$keyDir = Split-Path $KeyPath -Parent
if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }

if ((Test-Path $KeyPath) -and -not $Force) {
  Info "Reusing the existing key at $KeyPath  (pass -Force to regenerate)"
  if (-not (Test-Path $PubPath)) { throw "Public key $PubPath is missing — rerun with -Force to regenerate the pair." }
} else {
  if (Test-Path $KeyPath) { Warn "Regenerating — existing installs will STOP accepting updates." }
  Info "Generating signing keypair…"
  npx --yes @tauri-apps/cli signer generate -w $KeyPath -p $Password -f | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Key generation failed." }
  Ok "Keypair written to $KeyPath (+ .pub)"
}

$PublicKey = (Get-Content $PubPath -Raw).Trim()
if (-not $PublicKey) { throw "Public key file was empty." }

# --- Patch tauri.conf.json ---------------------------------------------------
Info "Writing the public key into $Conf"
$json = Get-Content $Conf -Raw
if ($json -notmatch '"pubkey"\s*:') { throw "No 'pubkey' field found in $Conf." }
# MatchEvaluator avoids PowerShell's $-substitution mangling the base64 key.
$json = [regex]::Replace(
  $json,
  '("pubkey"\s*:\s*")[^"]*(")',
  { param($m) $m.Groups[1].Value + $PublicKey + $m.Groups[2].Value }
)
Set-Content -Path $Conf -Value $json -NoNewline
Ok "pubkey updated"

# --- GitHub secrets ----------------------------------------------------------
Info "Uploading secrets to GitHub…"
Get-Content $KeyPath -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY
if ($LASTEXITCODE -ne 0) { throw "Failed to set TAURI_SIGNING_PRIVATE_KEY." }
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body $Password
if ($LASTEXITCODE -ne 0) { throw "Failed to set TAURI_SIGNING_PRIVATE_KEY_PASSWORD." }
Ok "TAURI_SIGNING_PRIVATE_KEY + TAURI_SIGNING_PRIVATE_KEY_PASSWORD set"

# --- Summary -----------------------------------------------------------------
Write-Host ""
Ok "Updater ready."
Write-Host "    Private key : $KeyPath   (back this up — never commit it)"
Write-Host "    Public key  : embedded in $Conf (safe to commit)"
if ($generated) {
  Write-Host ""
  Warn "Auto-generated password — SAVE THIS in your password manager:"
  Write-Host "    $Password" -ForegroundColor White
}
Write-Host ""
Write-Host "Next:  ./run.ps1 `"enable auto-updater`" -Tag v0.1.1"
