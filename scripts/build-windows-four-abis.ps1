#requires -Version 5.1
<#
  OpenWrt 状态 - Windows 本地 Release APK 构建脚本

  默认构建四个单 ABI APK：arm64-v8a、armeabi-v7a、x86、x86_64。
  加上 -Universal 时，额外构建一个由 Gradle 一次性生成的四 ABI 通用 APK。
  每个 APK 均以 16KB 页面边界 zipalign 后重新签名并验证。
#>

[CmdletBinding()]
param(
  [switch]$Universal,
  [ValidateSet('arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64', 'all')]
  [string]$Only = 'all'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $ProjectRoot 'android'
$OutputDir = Join-Path $ProjectRoot 'apk-output'
$GradleAppFile = Join-Path $AndroidDir 'app\build.gradle'
$Keystore = Join-Path $AndroidDir 'app\debug.keystore'

function Require-Path {
  param([string]$Path, [string]$Message)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Message`nMissing path: $Path"
  }
}

if (-not $env:ANDROID_SDK_ROOT) {
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
}
if (-not $env:ANDROID_SDK_ROOT) {
  $env:ANDROID_SDK_ROOT = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

Require-Path $ProjectRoot 'Please run this script from the project source tree.'
Require-Path (Join-Path $ProjectRoot 'package.json') 'package.json was not found.'
Require-Path $AndroidDir 'android directory was not found.'
Require-Path $GradleAppFile 'android\app\build.gradle was not found.'
Require-Path $Keystore 'debug.keystore was not found. Create it first using the command in WINDOWS_FOUR_ABI_BUILD.md.'
Require-Path (Join-Path $env:ANDROID_SDK_ROOT 'build-tools') 'Android SDK Build-Tools were not found. Install them from Android Studio SDK Manager.'

$BuildToolsDirectory = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_SDK_ROOT 'build-tools') -Directory |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1
if (-not $BuildToolsDirectory) {
  throw 'No Android SDK Build-Tools version was found.'
}

$ZipAlign = Join-Path $BuildToolsDirectory.FullName 'zipalign.exe'
$ApkSigner = Join-Path $BuildToolsDirectory.FullName 'apksigner.bat'
$Aapt = Join-Path $BuildToolsDirectory.FullName 'aapt.exe'
Require-Path $ZipAlign 'zipalign.exe was not found in Android SDK Build-Tools.'
Require-Path $ApkSigner 'apksigner.bat was not found in Android SDK Build-Tools.'
Require-Path $Aapt 'aapt.exe was not found in Android SDK Build-Tools.'

$GradleAppText = Get-Content -LiteralPath $GradleAppFile -Raw
$VersionNameMatch = [regex]::Match($GradleAppText, 'versionName\s+"([^"]+)"')
$VersionCodeMatch = [regex]::Match($GradleAppText, 'versionCode\s+(\d+)')
if (-not $VersionNameMatch.Success -or -not $VersionCodeMatch.Success) {
  throw 'Unable to read versionName/versionCode from android\app\build.gradle.'
}
$VersionName = $VersionNameMatch.Groups[1].Value
$VersionCode = $VersionCodeMatch.Groups[1].Value
Write-Host "Building source version: $VersionName (versionCode $VersionCode)" -ForegroundColor Yellow

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Get-ChildItem -LiteralPath $OutputDir -Filter 'openwrt-status-v*-*-16kb-signed.apk' -ErrorAction SilentlyContinue |
  Remove-Item -Force

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments, [string]$Description)
  Write-Host "`n==> $Description" -ForegroundColor Cyan
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Get-ApkVersion {
  param([string]$ApkPath)
  $Badging = & $Aapt dump badging $ApkPath
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect APK manifest: $ApkPath"
  }
  $BadgingText = $Badging -join "`n"
  $VersionNameMatch = [regex]::Match($BadgingText, "versionName='([^']+)'")
  $VersionCodeMatch = [regex]::Match($BadgingText, "versionCode='([^']+)'")
  if (-not $VersionNameMatch.Success -or -not $VersionCodeMatch.Success) {
    throw "APK manifest does not contain a readable version: $ApkPath"
  }
  return @{ Name = $VersionNameMatch.Groups[1].Value; Code = $VersionCodeMatch.Groups[1].Value }
}

Push-Location $AndroidDir
try {
  Invoke-Checked '.\gradlew.bat' @(':app:clean', '--no-daemon', '--max-workers=1') 'Clean previous Android build outputs'
}
finally {
  Pop-Location
}

function Build-And-Sign {
  param(
    [string]$Architectures,
    [string]$OutputLabel
  )

  $RawApk = Join-Path $AndroidDir 'app\build\outputs\apk\release\app-release.apk'
  Remove-Item -Force -ErrorAction SilentlyContinue $RawApk

  Push-Location $AndroidDir
  try {
    Invoke-Checked '.\gradlew.bat' @(
      ':app:assembleRelease',
      "-PreactNativeArchitectures=$Architectures",
      '--no-daemon',
      '--max-workers=1'
    ) "Gradle Release build ($OutputLabel)"
  }
  finally {
    Pop-Location
  }

  Require-Path $RawApk "Gradle did not produce app-release.apk for $OutputLabel."

  $AlignedApk = Join-Path $OutputDir "openwrt-status-v$VersionName-$OutputLabel-aligned-unsigned.apk"
  $SignedApk = Join-Path $OutputDir "openwrt-status-v$VersionName-$OutputLabel-16kb-signed.apk"
  Remove-Item -Force -ErrorAction SilentlyContinue $AlignedApk, $SignedApk

  Invoke-Checked $ZipAlign @('-P', '16', '-f', '-v', '4', $RawApk, $AlignedApk) "16KB zipalign ($OutputLabel)"
  Invoke-Checked $ApkSigner @(
    'sign',
    '--ks', $Keystore,
    '--ks-key-alias', 'androiddebugkey',
    '--ks-pass', 'pass:android',
    '--key-pass', 'pass:android',
    '--v1-signing-enabled', 'true',
    '--v2-signing-enabled', 'true',
    '--v3-signing-enabled', 'true',
    '--out', $SignedApk,
    $AlignedApk
  ) "APK signing ($OutputLabel)"
  Invoke-Checked $ApkSigner @('verify', '--verbose', '--print-certs', $SignedApk) "APK signature verification ($OutputLabel)"

  $ApkVersion = Get-ApkVersion $SignedApk
  if ($ApkVersion.Name -ne $VersionName -or $ApkVersion.Code -ne $VersionCode) {
    throw "Version check failed for $OutputLabel. Expected $VersionName ($VersionCode), got $($ApkVersion.Name) ($($ApkVersion.Code))."
  }

  Remove-Item -Force -ErrorAction SilentlyContinue $AlignedApk
  $Hash = Get-FileHash -LiteralPath $SignedApk -Algorithm SHA256
  Write-Host "Created: $SignedApk" -ForegroundColor Green
  Write-Host "Verified manifest: versionName $($ApkVersion.Name), versionCode $($ApkVersion.Code)" -ForegroundColor Green
  Write-Host "SHA-256: $($Hash.Hash)" -ForegroundColor Green
}

$AbiLabels = [ordered]@{
  'arm64-v8a' = 'arm64-v8a'
  'armeabi-v7a' = 'armeabi-v7a'
  'x86' = 'x86'
  'x86_64' = 'x86_64'
}

foreach ($Abi in $AbiLabels.Keys) {
  if ($Only -eq 'all' -or $Only -eq $Abi) {
    Build-And-Sign -Architectures $Abi -OutputLabel $AbiLabels[$Abi]
  }
}

if ($Universal) {
  Build-And-Sign -Architectures 'armeabi-v7a,arm64-v8a,x86,x86_64' -OutputLabel 'universal'
}

Write-Host "`nAll requested APKs are in: $OutputDir" -ForegroundColor Green
