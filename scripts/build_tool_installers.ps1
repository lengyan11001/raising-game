param(
  [string]$Channel = "",
  [string]$OutputName = "",
  [string]$BaseUrl = "https://123tops.com/",
  [int]$VersionCode = 1,
  [string]$VersionName = "1.0.0",
  [switch]$SkipAndroid
)

$ErrorActionPreference = "Stop"

function New-ChannelUrl {
  param([string]$Url, [string]$ChannelName)
  try {
    $builder = New-Object System.UriBuilder $Url
  } catch {
    throw "BaseUrl must be a valid absolute URL: $Url"
  }
  if ($builder.Scheme -notin @("http", "https") -or -not $builder.Host) {
    throw "BaseUrl must use http or https and include a host: $Url"
  }
  Add-Type -AssemblyName System.Web
  $query = [System.Web.HttpUtility]::ParseQueryString($builder.Query)
  $query.Set("channel", $ChannelName)
  $builder.Query = $query.ToString()
  return $builder.Uri.AbsoluteUri
}

if ($Channel -and $Channel -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$") {
  throw "Channel must be 1-64 characters using letters, digits, dot, underscore, or hyphen."
}
if (-not $OutputName) {
  $OutputName = if ($Channel) { "123tops-video-$Channel" } else { "123tops-video" }
}
if ($OutputName -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$") {
  throw "OutputName must be a safe file name without an extension."
}
$androidChannel = if ($Channel) { $Channel } else { "android-app" }
$iosChannel = if ($Channel) { $Channel } else { "ios-home-screen" }
$iosUrl = New-ChannelUrl -Url $BaseUrl -ChannelName $iosChannel
$iosUrlXml = [System.Security.SecurityElement]::Escape($iosUrl)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$downloadRoot = Join-Path $repoRoot "downloads"
$buildRoot = Join-Path $repoRoot "mobile\android\build"
New-Item -ItemType Directory -Force -Path $downloadRoot, $buildRoot | Out-Null

if (-not $SkipAndroid) {
  & (Join-Path $PSScriptRoot "build_tool_android.ps1") `
    -Channel $androidChannel `
    -OutputName $OutputName `
    -BaseUrl $BaseUrl `
    -VersionCode $VersionCode `
    -VersionName $VersionName
  if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE" }
}

Add-Type -AssemblyName System.Drawing
$iconPath = Join-Path $buildRoot "webclip-icon.png"
$bitmap = New-Object System.Drawing.Bitmap 180, 180
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(20, 16, 22))
  $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 45, 143)), 9
  $graphics.DrawRectangle($borderPen, 9, 9, 162, 162)
  $vPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 20
  $vPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $vPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLines($vPen, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 42, 48),
    (New-Object System.Drawing.Point 90, 143),
    (New-Object System.Drawing.Point 138, 48)
  ))
  $playBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 45, 143))
  $graphics.FillPolygon($playBrush, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 86, 66),
    (New-Object System.Drawing.Point 132, 90),
    (New-Object System.Drawing.Point 86, 114)
  ))
  $goldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 209, 102))
  $graphics.FillEllipse($goldBrush, 137, 30, 15, 15)
  $bitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

$iconData = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($iconPath))
$profile = @"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key><true/>
      <key>Icon</key><data>$iconData</data>
      <key>IsRemovable</key><true/>
      <key>Label</key><string>123Tops Video</string>
      <key>PayloadDescription</key><string>123Tops Video home screen app</string>
      <key>PayloadDisplayName</key><string>123Tops Video</string>
      <key>PayloadIdentifier</key><string>com.tops123.video.webclip</string>
      <key>PayloadType</key><string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key><string>94AB5109-AAD6-4D68-A87E-1D3EB322FEF7</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>Precomposed</key><true/>
      <key>URL</key><string>$iosUrlXml</string>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Installs 123Tops Video on the Home Screen.</string>
  <key>PayloadDisplayName</key><string>123Tops Video</string>
  <key>PayloadIdentifier</key><string>com.tops123.video.profile</string>
  <key>PayloadOrganization</key><string>123Tops</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>BE0E11DF-574F-4EC7-85D0-79C99DD0858A</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
"@

$profilePath = Join-Path $downloadRoot "$OutputName.mobileconfig"
[System.IO.File]::WriteAllText($profilePath, $profile, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Built $profilePath (channel=$iosChannel, url=$iosUrl)"
