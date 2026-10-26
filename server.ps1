# MILLIYBIZ - local server (Windows PowerShell 5.1, no installs needed)
# Run:  powershell -ExecutionPolicy Bypass -File server.ps1  [-Port 8080]
# Same API as server.js (Node) used for hosting.
param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Public  = [IO.Path]::GetFullPath((Join-Path $Root 'public'))
$DataDir = Join-Path $Root 'data'
$DbFile  = Join-Path $DataDir 'db.json'
$CfgFile = Join-Path $DataDir 'config.json'
$Utf8    = New-Object Text.UTF8Encoding $false
$Json    = New-Object Web.Script.Serialization.JavaScriptSerializer
$Json.MaxJsonLength = [int]::MaxValue
$Json.RecursionLimit = 512

function Read-JsonFile($path) { return ,($Json.DeserializeObject([IO.File]::ReadAllText($path, $Utf8))) }
function Write-JsonFile($path, $obj) {
  $tmp = "$path.tmp"
  [IO.File]::WriteAllText($tmp, $Json.Serialize($obj), $Utf8)
  Move-Item -Force $tmp $path
}

if (-not (Test-Path $CfgFile)) { Write-JsonFile $CfgFile @{ password = 'milliybiz2026' } }
$Db = Read-JsonFile $DbFile
$Tokens = @{}

$Mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.webp'='image/webp'; '.gif'='image/gif'; '.ico'='image/x-icon'; '.ttf'='font/ttf'; '.woff'='font/woff'; '.woff2'='font/woff2'; '.txt'='text/plain; charset=utf-8'
}

function Send($ctx, [int]$code, $body, [string]$type = 'application/json; charset=utf-8') {
  $res = $ctx.Response
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.Headers['X-Content-Type-Options'] = 'nosniff'
  if ($body -is [byte[]]) { $bytes = $body } else { $bytes = $Utf8.GetBytes([string]$body) }
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.OutputStream.Close()
}
function SendJson($ctx, $obj, [int]$code = 200) { Send $ctx $code ($Json.Serialize($obj)) }
function ReadBody($ctx) {
  $sr = New-Object IO.StreamReader($ctx.Request.InputStream, $Utf8)
  $txt = $sr.ReadToEnd(); $sr.Close()
  if ([string]::IsNullOrWhiteSpace($txt)) { return @{} }
  # leading comma keeps arrays from being unrolled by the pipeline
  return ,($Json.DeserializeObject($txt))
}
function NewId([int]$bytes = 8) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}
function IsAuthed($ctx) {
  $h = $ctx.Request.Headers['Authorization']
  if (-not $h -or -not $h.StartsWith('Bearer ')) { return $false }
  $t = $h.Substring(7)
  if ($Tokens.ContainsKey($t) -and $Tokens[$t] -gt (Get-Date)) { $Tokens[$t] = (Get-Date).AddHours(12); return $true }
  return $false
}
function SaveDb { Write-JsonFile $DbFile $script:Db; $script:DbStamp = (Get-Item $DbFile).LastWriteTimeUtc }
# pick up manual edits of data/db.json without restart
$script:DbStamp = (Get-Item $DbFile).LastWriteTimeUtc
function SyncDb { $t = (Get-Item $DbFile).LastWriteTimeUtc; if ($t -ne $script:DbStamp) { $script:Db = Read-JsonFile $DbFile; $script:DbStamp = $t } }
function Str($v, [int]$max = 200) { $s = [string]$v; if ($s.Length -gt $max) { $s = $s.Substring(0, $max) }; return $s.Trim() }

function PublicData {
  $now = (Get-Date).ToString('yyyy-MM-ddTHH:mm')
  $posts = @()
  foreach ($p in $script:Db['posts']) {
    if ($p['status'] -ne 'published') { continue }
    $key = "$($p['date'])T$($p['time'])"
    if ($p['date'] -and ([string]::CompareOrdinal($key, $now) -gt 0)) { continue }  # scheduled
    $posts += ,$p
  }
  $videos = @(); foreach ($v in $script:Db['videos']) { if ($v['url']) { $videos += ,$v } }
  return @{ posts = $posts; videos = $videos; layout = $script:Db['layout']; ads = $script:Db['ads']; settings = $script:Db['settings'] }
}

function HandleApi($ctx, [string]$path, [string]$method) {
  # --- public ---
  if ($path -eq '/api/public' -and $method -eq 'GET') { return SendJson $ctx (PublicData) }

  if ($path -match '^/api/view/([\w-]+)$' -and $method -eq 'POST') {
    foreach ($p in $script:Db['posts']) { if ($p['id'] -eq $Matches[1]) { $p['views'] = [int]$p['views'] + 1; SaveDb; break } }
    return SendJson $ctx @{ ok = $true }
  }

  if ($path -eq '/api/leads' -and $method -eq 'POST') {
    $b = ReadBody $ctx
    if ($b['website']) { return SendJson $ctx @{ ok = $true } }   # honeypot
    $name = Str $b['name'] 120; $phone = Str $b['phone'] 40
    if ($name.Length -lt 2 -or ($phone -replace '\D', '').Length -lt 9) { return SendJson $ctx @{ error = 'invalid' } 400 }
    $lead = @{ id = (NewId 6); name = $name; phone = $phone; region = (Str $b['region'] 80); lang = (Str $b['lang'] 4); note = ''; status = 'new'; created = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss') }
    $list = New-Object Collections.ArrayList
    $list.Add($lead) | Out-Null
    foreach ($l in $script:Db['leads']) { $list.Add($l) | Out-Null }
    $script:Db['leads'] = $list.ToArray(); SaveDb
    return SendJson $ctx @{ ok = $true }
  }

  if ($path -eq '/api/login' -and $method -eq 'POST') {
    $b = ReadBody $ctx
    $cfg = Read-JsonFile $CfgFile
    if ([string]$b['password'] -ceq [string]$cfg['password']) {
      $t = NewId 24; $Tokens[$t] = (Get-Date).AddHours(12)
      return SendJson $ctx @{ token = $t }
    }
    Start-Sleep -Milliseconds 700
    return SendJson $ctx @{ error = 'wrong password' } 401
  }

  # --- admin ---
  if (-not $path.StartsWith('/api/admin/')) { return SendJson $ctx @{ error = 'not found' } 404 }
  if (-not (IsAuthed $ctx)) { return SendJson $ctx @{ error = 'unauthorized' } 401 }

  if ($path -eq '/api/admin/db' -and $method -eq 'GET') { return SendJson $ctx $script:Db }

  if ($path -match '^/api/admin/db/(posts|videos|ads|layout|settings|leads)$' -and $method -eq 'PUT') {
    $script:Db[$Matches[1]] = ReadBody $ctx
    SaveDb
    return SendJson $ctx @{ ok = $true }
  }

  if ($path -eq '/api/admin/password' -and $method -eq 'PUT') {
    $b = ReadBody $ctx
    $cfg = Read-JsonFile $CfgFile
    if ([string]$b['current'] -cne [string]$cfg['password']) { return SendJson $ctx @{ error = 'wrong password' } 400 }
    if (([string]$b['next']).Length -lt 6) { return SendJson $ctx @{ error = 'too short' } 400 }
    $cfg['password'] = [string]$b['next']; Write-JsonFile $CfgFile $cfg
    return SendJson $ctx @{ ok = $true }
  }

  if ($path -eq '/api/admin/upload' -and $method -eq 'POST') {
    $b = ReadBody $ctx
    $data = [string]$b['data']
    if ($data -notmatch '^data:image/(jpeg|png|webp|gif);base64,(.+)$') { return SendJson $ctx @{ error = 'only jpg/png/webp/gif' } 400 }
    $ext = @{ jpeg = 'jpg'; png = 'png'; webp = 'webp'; gif = 'gif' }[$Matches[1]]
    $bytes = [Convert]::FromBase64String($Matches[2])
    if ($bytes.Length -gt 15MB) { return SendJson $ctx @{ error = 'file too large' } 400 }
    $sub = (Get-Date).ToString('yyyyMM')
    $dir = Join-Path $Public "uploads\$sub"
    New-Item -ItemType Directory -Force $dir | Out-Null
    $name = "$(NewId 8).$ext"
    [IO.File]::WriteAllBytes((Join-Path $dir $name), $bytes)
    return SendJson $ctx @{ url = "/uploads/$sub/$name" }
  }

  return SendJson $ctx @{ error = 'not found' } 404
}

function HandleStatic($ctx, [string]$path) {
  if ($path.EndsWith('/')) { $path += 'index.html' }
  $rel = [Uri]::UnescapeDataString($path).TrimStart('/').Replace('/', '\')
  $full = [IO.Path]::GetFullPath((Join-Path $Public $rel))
  if (-not $full.StartsWith($Public, [StringComparison]::OrdinalIgnoreCase)) { return Send $ctx 403 'Forbidden' 'text/plain' }
  if ((Test-Path $full -PathType Container)) { $ctx.Response.Redirect($path + '/'); $ctx.Response.Close(); return }
  if (-not (Test-Path $full -PathType Leaf)) {
    $nf = Join-Path $Public '404.html'
    if (Test-Path $nf) { return Send $ctx 404 ([IO.File]::ReadAllBytes($nf)) $Mime['.html'] }
    return Send $ctx 404 'Not found' 'text/plain'
  }
  $ext = [IO.Path]::GetExtension($full).ToLower()
  $type = $Mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
  if ('.html', '.js', '.css' -contains $ext) { $ctx.Response.Headers['Cache-Control'] = 'no-cache' } else { $ctx.Response.Headers['Cache-Control'] = 'public, max-age=3600' }
  Send $ctx 200 ([IO.File]::ReadAllBytes($full)) $type
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host ''
Write-Host "  MILLIYBIZ is running" -ForegroundColor Red
Write-Host "  Site:  http://localhost:$Port/"
Write-Host "  CRM:   http://localhost:$Port/admin/"
Write-Host "  Stop:  Ctrl+C"
Write-Host ''

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
    $ctx = $task.GetAwaiter().GetResult()
    $path = $ctx.Request.Url.AbsolutePath
    $method = $ctx.Request.HttpMethod
    try {
      if ($path.StartsWith('/api/')) { SyncDb; HandleApi $ctx $path $method } else { HandleStatic $ctx $path }
    } catch {
      Write-Host "ERR $method $path : $($_.Exception.Message)" -ForegroundColor Yellow
      try { SendJson $ctx @{ error = 'server error' } 500 } catch { }
    }
  }
} finally {
  $listener.Stop()
}
