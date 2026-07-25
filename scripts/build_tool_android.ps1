param(
  [string]$SdkRoot = $env:ANDROID_SDK_ROOT,
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
New-Item -ItemType Directory -Force -Path $classesDir, $dexDir, $generatedDir, $downloadRoot | Out-Null

$sourceFile = Join-Path $androidRoot "src\com\tops123\video\MainActivity.java"
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

$finalApk = Join-Path $downloadRoot "123tops-video.apk"
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
Write-Host "Built $finalApk"
