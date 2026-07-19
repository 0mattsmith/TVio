#!/usr/bin/env pwsh
<#
  TVio deploy helper.

  Usage:
    ./run.ps1                 # commit + push using the default upgrade notes below
    ./run.ps1 "my message"    # commit + push using "my message" as the upgrade notes
    ./run.ps1 "notes" -Tag v0.1.0   # also create + push a version tag → builds
                                    # the Windows installer + Android APKs and
                                    # attaches them to the GitHub Release.

  Behaviour:
    - Requires GitHub CLI (gh) and git. Logs you in via `gh auth login` if needed.
    - If the "TVio" repo doesn't exist on your account, it is created and pushed.
    - If it already exists, your changes are committed and pushed.
    - The commit message is the override argument if you pass one, otherwise the
      $DefaultUpgradeNotes string below (bump it each release).
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$UpgradeNotes,
  [string]$Tag,
  [switch]$Bump
)

$ErrorActionPreference = "Stop"
$RepoName = "TVio"

# ------------------------------------------------------------------------------
# Default "upgrade notes" — used as the commit message when no override is given.
# Update this each release.
# ------------------------------------------------------------------------------
$DefaultUpgradeNotes = "TVio update: Live TV performance, adaptive TV filters, addon streams & playback engines"

$Notes = if ([string]::IsNullOrWhiteSpace($UpgradeNotes)) { $DefaultUpgradeNotes } else { $UpgradeNotes }

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "==> $m" -ForegroundColor Green }
function Warn($m) { Write-Host "==> $m" -ForegroundColor Yellow }

# --- Version helpers ----------------------------------------------------------
function Get-HighestTag {
  $tags = git tag --list "v*" | Where-Object { $_ -match '^v\d+\.\d+\.\d+$' }
  if (-not $tags) { return $null }
  return ($tags | Sort-Object { [version]($_ -replace '^v', '') } | Select-Object -Last 1)
}

function Get-NextTag {
  $highest = Get-HighestTag
  if (-not $highest) { return "v0.1.0" }
  $v = [version]($highest -replace '^v', '')
  return "v{0}.{1}.{2}" -f $v.Major, $v.Minor, ($v.Build + 1)
}

Info "TVio deploy"
Write-Host "    Upgrade notes: $Notes"

# --- Preconditions ------------------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found. Install Git first." }
if (-not (Get-Command gh  -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) not found. Install from https://cli.github.com/" }

# Ensure authenticated with GitHub
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Warn "Not logged in to GitHub — starting 'gh auth login'"
  gh auth login
}

$User = (gh api user --jq ".login").Trim()
if ([string]::IsNullOrWhiteSpace($User)) { throw "Could not determine your GitHub username." }
$Slug = "$User/$RepoName"

# --- Ensure a local git repo --------------------------------------------------
if (-not (Test-Path ".git")) {
  Info "Initializing local git repository"
  git init | Out-Null
  git branch -M main
}

# --- Commit any changes -------------------------------------------------------
git rev-parse --verify HEAD 2>$null | Out-Null
$hasHead = ($LASTEXITCODE -eq 0)

# A stale .git/index.lock makes every index write fail while `git tag` and
# `git push` carry on working — which once produced three consecutive releases
# built from the same commit, with no error shown anywhere.
if (Test-Path ".git/index.lock") {
  Warn "Removing a stale .git/index.lock (left behind by an interrupted git command)"
  Remove-Item ".git/index.lock" -Force
}

$before = if ($hasHead) { git rev-parse HEAD } else { "" }

git add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed — nothing would be committed. Aborting before a release is cut from stale code." }

$pending = git status --porcelain
if ($pending -or -not $hasHead) {
  if ($hasHead) { git commit -m $Notes | Out-Null }
  else          { git commit --allow-empty -m $Notes | Out-Null }
  if ($LASTEXITCODE -ne 0) { throw "git commit failed — your changes are NOT in this release." }

  $after = git rev-parse HEAD
  if ($hasHead -and $after -eq $before) {
    throw "HEAD didn't move after committing. Refusing to tag a release that wouldn't contain your changes."
  }
  Ok "Committed: $Notes  ($($after.Substring(0, 7)))"
} else {
  Info "No changes to commit"
}

# --- Ensure the remote repo exists --------------------------------------------
gh repo view $Slug 1>$null 2>$null
$repoExists = ($LASTEXITCODE -eq 0)

if (-not $repoExists) {
  Warn "Repo '$Slug' not found — creating it (public, for GitHub Pages)"
  # Creates the repo from the current directory, adds 'origin', and pushes.
  gh repo create $RepoName --public --source=. --remote=origin --push
  Ok "Created and pushed to https://github.com/$Slug"
}
else {
  if (-not ((git remote) -contains "origin")) {
    Info "Adding 'origin' remote"
    git remote add origin "https://github.com/$Slug.git"
  }
  Info "Pushing to $Slug"
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw "git push failed — a release would be built from whatever is already on the remote." }
  Ok "Pushed to https://github.com/$Slug"
}

# --- Optional: cut a release by pushing a version tag ------------------------
$ReleaseRequested = [bool]$Tag -or [bool]$Bump

if ($Bump -and -not $Tag) {
  $Tag = Get-NextTag
  Info "Next version: $Tag"
}

if ($Tag) {
  # Reusing a tag name is the easiest way to believe you've shipped when you
  # haven't: `git tag` refuses, pushing the existing tag is a no-op GitHub
  # accepts silently, and the release workflow never fires. Fail loudly instead.
  git rev-parse -q --verify "refs/tags/$Tag" 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    $on = git rev-list -n1 $Tag
    if ($on -eq (git rev-parse HEAD)) {
      Warn "Tag $Tag already points at HEAD — nothing new to release."
      $Tag = $null
    } else {
      throw "Tag $Tag already exists (on $($on.Substring(0,7))), so no release would be built. Use -Bump for $(Get-NextTag), or pass a free version."
    }
  }
}

if ($Tag) {
  Info "Tagging release $Tag"
  git tag -a $Tag -m $Notes
  if ($LASTEXITCODE -ne 0) { throw "Could not create tag $Tag." }
  git push origin $Tag
  if ($LASTEXITCODE -ne 0) { throw "Could not push tag $Tag — no release will be built." }
  Ok "Pushed tag $Tag — building the Windows installer + Android APKs and attaching them to the Release."
  Info "Watch it: https://github.com/$Slug/actions"
}
elseif (-not $ReleaseRequested) {
  Warn "No -Tag given: main was updated (so GitHub Pages will redeploy) but NO release was built."
  Warn "To cut one:  ./run.ps1 `"$Notes`" -Bump    → $(Get-NextTag)"
}

Info "Done. https://github.com/$Slug"
