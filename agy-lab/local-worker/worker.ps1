# Gmap Local Worker: turns this Windows PC into a gmap.scan worker for the hub.
#
# It asks the hub for a Google Maps job, sweeps Maps with gosom (headless
# Chromium on this PC's own internet line), and posts the businesses back. Only
# outbound requests: nothing to open on the router.
#
# The sweep is the hub's (maps-worker.ts): "<word> in <place>" for every word of
# the keyword's family, then for a Business scan "shop/company in <street>" for
# the streets the first pass found. The words come from the hub on every job.
# gosom runs once per pass and dedupes places across that pass's searches.
#
# Windows PowerShell 5.1, ASCII only (5.1 reads a BOM-less script as ANSI).
param([ValidateSet('on', 'off', '')][string]$Autostart = '')

$ErrorActionPreference = 'Stop'
# The progress bar makes Invoke-WebRequest downloads many times slower on 5.1.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path $PSScriptRoot -Parent
$Data = Join-Path $env:LOCALAPPDATA 'GmapWorker'
$Work = Join-Path $Data 'runs'
$LogFile = Join-Path $Data 'worker.log'
New-Item -ItemType Directory -Force $Data, $Work | Out-Null

function Log([string]$Message) {
  $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Message
  Write-Host $line
  try {
    if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 5MB) { Move-Item $LogFile "$LogFile.old" -Force }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
  } catch { }
}

# ---------------------------------------------------------------- autostart

if ($Autostart) {
  $startup = [Environment]::GetFolderPath('Startup')
  $link = Join-Path $startup 'Gmap Local Worker.lnk'
  if ($Autostart -eq 'on') {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($link)
    $shortcut.TargetPath = Join-Path $Root 'Start Gmap Worker.cmd'
    $shortcut.WorkingDirectory = $Root
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Gmap Local Worker'
    $shortcut.Save()
    Write-Host "Autostart is on: the worker starts, minimised, every time you sign in to Windows."
    Write-Host "Shortcut: $link"
  } else {
    if (Test-Path $link) { Remove-Item $link -Force }
    Write-Host 'Autostart is off.'
  }
  exit 0
}

# ------------------------------------------------------------------- config

function Read-EnvFile([string]$File) {
  $out = @{}
  if (-not (Test-Path $File)) { return $out }
  foreach ($line in Get-Content $File) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
    $i = $t.IndexOf('=')
    $out[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"')
  }
  return $out
}

$Cfg = Read-EnvFile (Join-Path $Root 'worker.env')
$Lab = ([string]$Cfg['LAB_URL']).TrimEnd('/')
$Key = [string]$Cfg['GMAP_WORKER_KEY']
if (-not $Lab -or -not $Key) {
  Log 'worker.env is missing LAB_URL or GMAP_WORKER_KEY. Download the package again from the hub Workers page.'
  exit 2
}
$Name = [string]$Cfg['WORKER_NAME']
if (-not $Name) { $Name = 'pc-' + ($env:COMPUTERNAME.ToLower() -replace '[^a-z0-9-]', '-') }
$Concurrency = 2
if ($Cfg['GMAP_CONCURRENCY']) { $Concurrency = [Math]::Max(1, [int]$Cfg['GMAP_CONCURRENCY']) }
$Types = 'gmap.scan'
# Time kept back from the hub's deadline to read the results and post them.
$PostMarginSec = 120

# One worker per PC: autostart and a double click must not run two.
$mutex = New-Object Threading.Mutex($false, 'Local\GmapLocalWorker')
if (-not $mutex.WaitOne(0)) {
  Write-Host 'The Gmap Local Worker is already running on this PC.'
  exit 2
}

Get-ChildItem $Root -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

# Keep the PC awake while a job runs; Windows sleeping mid-scan loses the job.
Add-Type -Namespace GmapWorker -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
function Stay-Awake([bool]$On) {
  if ($On) { [void][GmapWorker.Power]::SetThreadExecutionState([uint32]2147483649) }
  else { [void][GmapWorker.Power]::SetThreadExecutionState([uint32]2147483648) }
}

# --------------------------------------------------------------------- hub

function Invoke-Hub([string]$Method, [string]$Path, $Body = $null, [int]$TimeoutSec = 60, [string]$OutFile = '') {
  $params = @{
    Uri = $Lab + $Path; Method = $Method; UseBasicParsing = $true; TimeoutSec = $TimeoutSec
    Headers = @{ authorization = 'Bearer ' + $Key }
  }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  if ($OutFile) { $params.OutFile = $OutFile }
  try {
    $r = Invoke-WebRequest @params
    if ($OutFile) { return @{ status = 200; body = '' } }
    return @{ status = [int]$r.StatusCode; body = [string]$r.Content }
  } catch [Net.WebException] {
    $resp = $_.Exception.Response
    if (-not $resp) { throw }
    # 5.1 has usually read the body already and keeps it in ErrorDetails.
    $text = if ($_.ErrorDetails) { [string]$_.ErrorDetails.Message } else { '' }
    if (-not $text) { try { $text = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch { } }
    return @{ status = [int]$resp.StatusCode; body = $text }
  }
}

$script:JobId = $null
$script:LastBeat = Get-Date
function Send-Beat {
  if (((Get-Date) - $script:LastBeat).TotalSeconds -lt 30) { return }
  $script:LastBeat = Get-Date
  try { [void](Invoke-Hub 'POST' '/api/jobs/heartbeat' @{ worker = $Name; types = @($Types); jobId = $script:JobId } 20) } catch { }
}

# ------------------------------------------------------------------ engine

# The engine is gosom (github.com/gosom/google-maps-scraper), built by the hub
# for Windows. It is fetched from the hub and checked against the hub's hash.
function Get-Engine {
  $r = Invoke-Hub 'GET' '/api/gmap-worker/engine-info'
  if ($r.status -ne 200) { throw "the hub has no engine to give (HTTP $($r.status)): $($r.body)" }
  $info = $r.body | ConvertFrom-Json
  $exe = Join-Path $Data ('gmaps-' + $info.sha256.Substring(0, 12) + '.exe')
  if ((Test-Path $exe) -and (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower() -eq $info.sha256) { return $exe }
  Log ('downloading the scraping engine (' + [Math]::Round($info.size / 1MB) + ' MB) from the hub')
  $part = "$exe.part"
  $d = Invoke-Hub 'GET' '/api/gmap-worker/engine' $null 900 $part
  if ($d.status -ne 200) { throw "engine download failed (HTTP $($d.status)): $($d.body)" }
  $hash = (Get-FileHash $part -Algorithm SHA256).Hash.ToLower()
  if ($hash -ne $info.sha256) { Remove-Item $part -Force; throw "engine download is corrupt (sha256 $hash, expected $($info.sha256))" }
  Move-Item $part $exe -Force
  Get-ChildItem $Data -Filter 'gmaps-*.exe' | Where-Object { $_.FullName -ne $exe } | Remove-Item -Force -ErrorAction SilentlyContinue
  Log 'engine ready. Its first run also downloads Chromium (about 150 MB), once.'
  return $exe
}

# -------------------------------------------------------------------- sweep

function Squash([string]$Text) { return ($Text.ToLower() -replace '[^a-z0-9]', '') }

# The names an address must carry to be in the place: the first comma segment,
# split on "/". Same rule as areaNames in maps-worker.ts.
function Get-AreaNames([string]$Place) {
  return @(($Place.Split(',')[0]).Split('/') | ForEach-Object { Squash $_ } | Where-Object { $_.Length -ge 3 })
}

function Test-InArea([string]$Address, $Names) {
  if (-not $Names.Count) { return $true }
  $a = Squash $Address
  foreach ($n in $Names) { if ($a.Contains($n)) { return $true } }
  return $false
}

# gosom keeps its results file open while it writes, so read it with shared access.
function Read-Lines([string]$File) {
  if (-not (Test-Path $File)) { return @() }
  $fs = New-Object IO.FileStream($File, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $reader = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)
    return @($reader.ReadToEnd() -split "`r?`n")
  } finally { $fs.Dispose() }
}

# Light read of a gosom JSON-lines file while it is still being written: place
# ids and addresses only, by regex, so it can run every few seconds.
function Count-InArea([string[]]$Files, $Names) {
  $seen = @{}
  foreach ($f in $Files) {
    if (-not (Test-Path $f)) { continue }
    foreach ($line in (Read-Lines $f)) {
      $id = [regex]::Match($line, '"place_id":"([^"]*)"').Groups[1].Value
      $addr = [regex]::Match($line, '"address":"((?:[^"\\]|\\.)*)"').Groups[1].Value
      if ($id -and (Test-InArea $addr $Names)) { $seen[$id] = $true }
    }
  }
  return $seen.Count
}

function Stop-Tree([System.Diagnostics.Process]$Proc) {
  if ($Proc -and -not $Proc.HasExited) { & taskkill.exe /PID $Proc.Id /T /F 2>&1 | Out-Null }
}

$script:Searches = 0
# One gosom run over these queries. Stops at the deadline, or once `max` in-area
# places are in hand; whatever gosom wrote by then is kept.
function Invoke-Gosom([string]$Exe, [string[]]$Queries, [string]$Out, [string]$Geo, [int]$Depth, [datetime]$Deadline, $Names, [int]$Max, [string[]]$Earlier) {
  if (-not $Queries.Count) { return }
  if ((Get-Date) -ge $Deadline) { return }
  $script:Searches += $Queries.Count
  $in = $Out -replace '\.json$', '.txt'
  [IO.File]::WriteAllLines($in, $Queries, (New-Object Text.UTF8Encoding $false))
  $gosomArgs = @('-input', $in, '-results', $Out, '-json', '-c', $Concurrency, '-depth', $Depth, '-lang', 'en')
  if ($Geo) { $gosomArgs += @('-geo', $Geo, '-zoom', '15') }
  $argLine = ($gosomArgs | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $proc = Start-Process -FilePath $Exe -ArgumentList $argLine -WorkingDirectory $Work -PassThru -NoNewWindow `
    -RedirectStandardError ($Out -replace '\.json$', '.log') -RedirectStandardOutput ($Out -replace '\.json$', '.out')
  $lastCheck = Get-Date
  while (-not $proc.HasExited) {
    Start-Sleep -Seconds 2
    Send-Beat
    if ((Get-Date) -ge $Deadline) { Log '  deadline reached: stopping this pass, keeping what it found'; Stop-Tree $proc; break }
    if (((Get-Date) - $lastCheck).TotalSeconds -ge 30) {
      $lastCheck = Get-Date
      if ((Count-InArea (@($Earlier) + $Out) $Names) -ge $Max) { Log "  $Max places found: stopping early"; Stop-Tree $proc; break }
    }
  }
}

# Every row gosom wrote, deduped on Google's place id, in the hub's business shape.
function Read-Businesses([string[]]$Files) {
  $byId = [ordered]@{}
  foreach ($f in $Files) {
    if (-not (Test-Path $f)) { continue }
    foreach ($line in (Read-Lines $f)) {
      if (-not $line.Trim()) { continue }
      # A pass stopped mid-write leaves a cut last line.
      try { $row = $line | ConvertFrom-Json } catch { continue }
      if (-not $row.title) { continue }
      if ([string]$row.status -match 'permanently closed') { continue }
      $id = if ($row.place_id) { [string]$row.place_id } else { [string]$row.title + '|' + [string]$row.address }
      if ($byId.Contains($id)) { continue }
      $text = { param($v) if ($null -ne $v -and [string]$v -ne '') { [string]$v } else { $null } }
      $byId[$id] = [ordered]@{
        name = [string]$row.title
        rating = if ($row.review_count -gt 0) { [double]$row.review_rating } else { $null }
        reviews = if ($null -ne $row.review_count) { [int]$row.review_count } else { $null }
        category = & $text $row.category
        address = & $text $row.address
        phone = & $text $row.phone
        website = & $text $row.web_site
        mapsUrl = & $text $row.link
        place_id = & $text $row.place_id
        latitude = $row.latitude
        longitude = $row.longitude
      }
    }
  }
  return @($byId.Values)
}

function Get-Median($Values) {
  $v = @($Values | Where-Object { $_ } | Sort-Object)
  if (-not $v.Count) { return $null }
  return $v[[int][Math]::Floor($v.Count / 2)]
}

# The streets named in these addresses, most businesses first. Same rule as
# streetsOf in maps-worker.ts.
function Get-Streets($Businesses) {
  $counts = @{}; $names = @{}
  foreach ($b in $Businesses) {
    foreach ($part in ([string]$b.address).Split(',')) {
      $m = [regex]::Match($part, '^\s*(?:jalan|jln\.?)\s+(.+?)\s*$', 'IgnoreCase')
      if (-not $m.Success) { continue }
      $s = $m.Groups[1].Value
      if ($s.Length -gt 40 -or $s -match '[^\x20-\x7e]|\b\d{5}\b|\bjalan\b|\bjln\b') { continue }
      $street = 'Jalan ' + ($s -replace '\s+', ' ')
      $k = Squash $street
      $counts[$k] = 1 + [int]$counts[$k]; $names[$k] = $street
    }
  }
  return @($counts.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { $names[$_.Key] })
}

function Invoke-Scan($Job, [string]$Exe, $Strategy) {
  $started = Get-Date
  $p = $Job.payload
  $locationOnly = $p.searchMode -eq 'location_only'
  $keyword = if ($locationOnly) { '' } else { ([string]$p.keyword).Trim() }
  $place = if ($locationOnly) { ([string]$(if ($p.originalPlace) { $p.originalPlace } elseif ($p.place) { $p.place } else { $p.keyword })).Trim() } else { ([string]$p.place).Trim() }
  if (-not $keyword -and -not $place) { throw 'gmap.scan needs a keyword or place' }
  $max = if ([int]$p.max -gt 0) { [int]$p.max } else { [int]$Strategy.defaultMax }
  $timeoutSec = [Math]::Max(120, [int]($Job.timeoutMs / 1000))
  $deadline = $started.AddSeconds([Math]::Max(60, $timeoutSec - $PostMarginSec))
  $script:Searches = 0

  $family = $null
  if ($place) {
    $fam = if ($keyword) { $Strategy.families.($keyword.ToLower()) } else { $Strategy.families.business }
    if ($fam) { $family = @($fam) }
  }
  $names = if ($family) { Get-AreaNames $place } else { @() }
  $dir = Join-Path $Work $Job.id
  New-Item -ItemType Directory -Force $dir | Out-Null
  $files = @()
  $streets = $null
  $geo = $null

  if ($family) {
    $query = if ($keyword) { "$keyword in $place" } else { $place }
    $queries = @($family | ForEach-Object { "$_ in $place" })
    # Pass 1: the first word alone, to learn where the place is on the map.
    $f1 = Join-Path $dir 'pass1.json'
    Log "  pass 1: '$($queries[0])'"
    Invoke-Gosom $Exe @($queries[0]) $f1 '' 50 $deadline $names $max @()
    $files += $f1
    $first = Read-Businesses @($f1)
    $inPlace = @($first | Where-Object { Test-InArea $_.address $names })
    $lat = Get-Median ($inPlace | ForEach-Object { $_.latitude })
    $lng = Get-Median ($inPlace | ForEach-Object { $_.longitude })
    if ($null -ne $lat -and $null -ne $lng) { $geo = [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0},{1}', [double]$lat, [double]$lng) }
    Log "  pass 1: $($first.Count) places, $($inPlace.Count) in $place; map centre $geo"
    # Pass 2: the rest of the family, pinned to the place.
    $f2 = Join-Path $dir 'pass2.json'
    if ((Count-InArea $files $names) -lt $max) {
      Log "  pass 2: $($queries.Count - 1) more searches"
      Invoke-Gosom $Exe @($queries | Select-Object -Skip 1) $f2 $geo 50 $deadline $names $max $files
      $files += $f2
    }
    # Pass 3, Business only: street by street, two searches a street.
    if ($keyword -eq '' -or $keyword.ToLower() -eq 'business') {
      $soFar = @(Read-Businesses $files | Where-Object { Test-InArea $_.address $names })
      if ($soFar.Count -lt $max -and (Get-Date) -lt $deadline) {
        $list = Get-Streets $soFar
        $streets = [ordered]@{ total = $list.Count; searched = 0; added = 0 }
        $streetQueries = @($list | ForEach-Object { $s = $_; $Strategy.streetForms | ForEach-Object { "$_ in $s, $place" } })
        $f3 = Join-Path $dir 'pass3.json'
        Log "  pass 3: $($list.Count) streets, $($streetQueries.Count) searches"
        Invoke-Gosom $Exe $streetQueries $f3 $geo 20 $deadline $names $max $files
        $files += $f3
        $streets.searched = $list.Count
        $streets.added = @(Read-Businesses $files | Where-Object { Test-InArea $_.address $names }).Count - $soFar.Count
      }
    }
  } else {
    $query = if ($place) { "$keyword in $place" } else { $keyword }
    $f1 = Join-Path $dir 'pass1.json'
    Invoke-Gosom $Exe @($query) $f1 '' ([Math]::Max(10, [Math]::Ceiling($max / 3))) $deadline $names $max @()
    $files += $f1
  }

  $all = Read-Businesses $files
  $kept = $all
  $outside = 0
  if ($family -and $names.Count) {
    $inside = @($all | Where-Object { Test-InArea $_.address $names })
    # Below this share the place name is not how addresses are written there: keep everything.
    if ($inside.Count -ge $all.Count * [double]$Strategy.areaMatchFloor) { $kept = $inside; $outside = $all.Count - $inside.Count }
  }
  $businesses = @($kept | Select-Object -First $max | ForEach-Object { $_.Remove('latitude'); $_.Remove('longitude'); $_ })
  if ($family -and -not $businesses.Count) {
    throw "gosom found no businesses for $query. Google may be throttling this PC's line; the hub will scan this place again."
  }
  return [ordered]@{
    query = $query; keyword = $keyword; place = $(if ($place) { $place } else { $null })
    businesses = $businesses; found = $businesses.Count; capped = ($businesses.Count -ge $max)
    blocked = $false; blockedReason = $null; limitedView = $false; categories = $null
    outsideArea = $outside; streets = $streets; skippedSearches = $null; scrolls = 0
    provider = 'gosom-local'; worker = $Name; mapCentre = $geo
    # Free: nothing here counts against the scraper.tech budget.
    requests = 0; searches = $script:Searches
    tookMs = [int]((Get-Date) - $started).TotalMilliseconds; at = (Get-Date).ToUniversalTime().ToString('o'); storage = 'hub'
  }
}

# Post a result, retrying the hub for a few minutes. If it never takes it, keep
# a copy on disk rather than lose the scan.
function Send-Result([string]$Id, [bool]$Ok, $Result, [string]$ErrorText) {
  $body = @{ worker = $Name; ok = $Ok; result = $Result; error = $(if ($ErrorText) { $ErrorText } else { $null }) }
  foreach ($wait in 0, 10, 30, 60, 120) {
    Start-Sleep -Seconds $wait
    try {
      $r = Invoke-Hub 'POST' "/api/jobs/$Id/result" $body 120
      if ($r.status -eq 200) { return }
      Log "  the hub answered HTTP $($r.status) to the result: $($r.body)"
      if ($r.status -in 400, 403, 404) { break }
    } catch { Log "  could not post the result: $($_.Exception.Message)" }
  }
  $dir = Join-Path $Data 'unsaved'
  New-Item -ItemType Directory -Force $dir | Out-Null
  [IO.File]::WriteAllText((Join-Path $dir "$Id.json"), ($body | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding $false))
  Log "  result kept at $dir\$Id.json"
}

# --------------------------------------------------------------------- main

Log "Gmap Local Worker '$Name' -> $Lab (gosom, $Concurrency parallel searches)"
$exe = $null
$backoff = 5
while ($true) {
  try {
    if (-not $exe) { $exe = Get-Engine }
    $r = Invoke-Hub 'GET' ("/api/jobs/next?worker=$([uri]::EscapeDataString($Name))&types=$Types&wait=25") $null 45
    if ($r.status -eq 204) { $backoff = 5; continue }
    if ($r.status -eq 401 -or $r.status -eq 403) {
      Log "the hub refused this worker's key (HTTP $($r.status)). The hub's LAB_TOKEN was probably rotated; download the package again from the Workers page. Retrying in 10 minutes."
      Start-Sleep -Seconds 600; continue
    }
    if ($r.status -ne 200) { throw "the hub answered HTTP $($r.status): $($r.body)" }
    $backoff = 5
    $job = ($r.body | ConvertFrom-Json).job
    $script:JobId = $job.id
    $script:LastBeat = (Get-Date).AddSeconds(-60)
    Log "job $($job.id): $($job.payload.keyword) in $($job.payload.place) (max $($job.payload.max))"
    Stay-Awake $true
    try {
      $sr = Invoke-Hub 'GET' '/api/gmap-worker/strategy'
      if ($sr.status -ne 200) { throw "the hub gave no sweep strategy (HTTP $($sr.status))" }
      $strategy = $sr.body | ConvertFrom-Json
      $result = Invoke-Scan $job $exe $strategy
      Log "job $($job.id): $($result.found) businesses from $($result.searches) searches in $([Math]::Round($result.tookMs / 60000, 1)) min"
      Send-Result $job.id $true $result ''
    } catch {
      Log "job $($job.id) failed: $($_.Exception.Message)"
      Send-Result $job.id $false $null ([string]$_.Exception.Message)
    } finally {
      Stay-Awake $false
      $script:JobId = $null
      Get-ChildItem $Work -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Log "hub unreachable or error: $($_.Exception.Message). Retrying in $backoff s."
    Start-Sleep -Seconds $backoff
    $backoff = [Math]::Min(60, $backoff * 2)
  }
}
