param(
  [string]$SdkRoot = $env:ANDROID_SDK_ROOT,
  [string]$Channel = "android-app",
  [string]$OutputName = "123tops-video",
  [string]$BaseUrl = "https://123tops.com/",
  [int]$VersionCode = 1,
  [string]$VersionName = "1.0.0"
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

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

if ($Channel -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$") {
  throw "Channel must be 1-64 characters using letters, digits, dot, underscore, or hyphen."
}
if ($OutputName -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$") {
  throw "OutputName must be a safe file name without an extension."
}
if ($VersionCode -lt 1) { throw "VersionCode must be at least 1." }
if ([string]::IsNullOrWhiteSpace($VersionName)) { throw "VersionName is required." }
$startUrl = New-ChannelUrl -Url $BaseUrl -ChannelName $Channel

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$androidRoot = Join-Path $repoRoot "mobile\android"
$buildRoot = Join-Path $androidRoot "build"
$downloadRoot = Join-Path $repoRoot "downloads"
if (-not $SdkRoot) { $SdkRoot = "D:\" }
$SdkRoot = (Resolve-Path $SdkRoot).Path

$buildToolsRoot = Join-Path $SdkRoot "build-tools"
$buildTools = Get-ChildItem -LiteralPath $buildToolsRoot -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $buildTools) { throw "Android build tools were not found under $buildToolsRoot" }
$platformRoot = Join-Path $SdkRoot "platforms"
$platform = Get-ChildItem -LiteralPath $platformRoot -Directory -Filter "android-*" | Sort-Object { [int]($_.Name -replace "android-", "") } -Descending | Select-Object -First 1
if (-not $platform) { throw "Android platform was not found under $platformRoot" }

$androidJar = Join-Path $platform.FullName "android.jar"
$aapt = Join-Path $buildTools.FullName "aapt.exe"
$aapt2 = Join-Path $buildTools.FullName "aapt2.exe"
$d8 = Join-Path $buildTools.FullName "d8.bat"
$zipalign = Join-Path $buildTools.FullName "zipalign.exe"
$apksigner = Join-Path $buildTools.FullName "apksigner.bat"
$javac = (Get-Command javac).Source
$javaBin = Split-Path $javac
$jar = Join-Path $javaBin "jar.exe"
$keytool = Join-Path $javaBin "keytool.exe"

if (Test-Path -LiteralPath $buildRoot) {
  $resolvedAndroidRoot = (Resolve-Path $androidRoot).Path.TrimEnd("\") + "\"
  $candidate = [System.IO.Path]::GetFullPath($buildRoot)
  if (-not $candidate.StartsWith($resolvedAndroidRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove build path outside the Android project: $candidate"
  }
  Remove-Item -LiteralPath $candidate -Recurse -Force
}

$classesDir = Join-Path $buildRoot "classes"
$dexDir = Join-Path $buildRoot "dex"
$generatedDir = Join-Path $buildRoot "generated"
$generatedSourceDir = Join-Path $buildRoot "source\com\tops123\video"
New-Item -ItemType Directory -Force -Path $classesDir, $dexDir, $generatedDir, $generatedSourceDir, $downloadRoot | Out-Null

$sourceTemplate = Join-Path $androidRoot "src\com\tops123\video\MainActivity.java"
$sourceFile = Join-Path $generatedSourceDir "MainActivity.java"
$sourceText = [System.IO.File]::ReadAllText($sourceTemplate)
$startUrlLiteral = $startUrl.Replace("\", "\\").Replace('"', '\"')
$sourcePattern = 'private static final String START_URL = "[^"]+";'
$generatedSource = [System.Text.RegularExpressions.Regex]::Replace(
  $sourceText,
  $sourcePattern,
  "private static final String START_URL = `"$startUrlLiteral`";",
  1
)
if ($generatedSource -eq $sourceText -and $sourceText -notmatch [System.Text.RegularExpressions.Regex]::Escape($startUrl)) {
  throw "Could not inject the channel URL into MainActivity.java."
}
[System.IO.File]::WriteAllText($sourceFile, $generatedSource, (New-Object System.Text.UTF8Encoding($false)))
Invoke-Checked $javac @(
  "-encoding", "UTF-8", "-source", "8", "-target", "8",
  "-bootclasspath", $androidJar,
  "-d", $classesDir,
  $sourceFile
)

$classesJar = Join-Path $buildRoot "classes.jar"
Push-Location $classesDir
try { Invoke-Checked $jar @("cf", $classesJar, "com") } finally { Pop-Location }
Invoke-Checked $d8 @("--lib", $androidJar, "--min-api", "24", "--output", $dexDir, $classesJar)

$compiledResources = Join-Path $buildRoot "resources.zip"
Invoke-Checked $aapt2 @("compile", "--dir", (Join-Path $androidRoot "res"), "-o", $compiledResources)

$unsignedApk = Join-Path $buildRoot "unsigned.apk"
Invoke-Checked $aapt2 @(
  "link", "-o", $unsignedApk,
  "-I", $androidJar,
  "--manifest", (Join-Path $androidRoot "AndroidManifest.xml"),
  "--java", $generatedDir,
  "--min-sdk-version", "24",
  "--target-sdk-version", "34",
  "--version-code", [string]$VersionCode,
  "--version-name", $VersionName,
  "--auto-add-overlay",
  "-R", $compiledResources
)

Push-Location $dexDir
try { Invoke-Checked $aapt @("add", $unsignedApk, "classes.dex") } finally { Pop-Location }

$alignedApk = Join-Path $buildRoot "aligned.apk"
Invoke-Checked $zipalign @("-p", "-f", "4", $unsignedApk, $alignedApk)

$signingRoot = Join-Path $env:USERPROFILE ".123tops"
$signingConfig = Join-Path $signingRoot "android-signing.json"
$keystorePath = Join-Path $signingRoot "123tops-video-release.jks"
New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
if (Test-Path -LiteralPath $signingConfig) {
  $signing = Get-Content -LiteralPath $signingConfig -Raw | ConvertFrom-Json
} else {
  $randomBytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($randomBytes)
  $password = ([System.BitConverter]::ToString($randomBytes) -replace "-", "").ToLowerInvariant()
  $signing = [pscustomobject]@{ alias = "tops123-video"; password = $password; keystore = $keystorePath }
  Invoke-Checked $keytool @(
    "-genkeypair", "-v", "-storetype", "JKS",
    "-keystore", $keystorePath,
    "-storepass", $password,
    "-keypass", $password,
    "-alias", $signing.alias,
    "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000",
    "-dname", "CN=123Tops Video, OU=Mobile, O=123Tops, L=Hong Kong, C=HK"
  )
  [System.IO.File]::WriteAllText($signingConfig, ($signing | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
}

$finalApk = Join-Path $downloadRoot "$OutputName.apk"
$env:APK_SIGNING_PASSWORD = [string]$signing.password
try {
  Invoke-Checked $apksigner @(
    "sign", "--ks", [string]$signing.keystore,
    "--ks-key-alias", [string]$signing.alias,
    "--ks-pass", "env:APK_SIGNING_PASSWORD",
    "--key-pass", "env:APK_SIGNING_PASSWORD",
    "--v4-signing-enabled", "false",
    "--out", $finalApk,
    $alignedApk
  )
} finally {
  Remove-Item Env:APK_SIGNING_PASSWORD -ErrorAction SilentlyContinue
}

Invoke-Checked $apksigner @("verify", "--verbose", "--print-certs", $finalApk)
Write-Host "Built $finalApk (channel=$Channel, url=$startUrl, versionCode=$VersionCode)"
