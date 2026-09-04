# Checks the active `java` on PATH is major version 17, matching what this
# project's Gradle wrapper (8.10.2) requires. Exits 1 with a clear message on
# mismatch, exit 0 otherwise. Called from build-apk.cmd - kept as a real .ps1
# file rather than inlined into the .cmd via -Command, since cmd.exe's caret
# line-continuation plus nested double-quotes for an inline script is fragile
# and hard to verify without a live Windows box to test against.

$out = (& java -version 2>&1 | Out-String)
$m = [regex]::Match($out, '"([^"]+)"')

if (-not $m.Success) {
    Write-Host "Could not determine Java version from 'java -version' output - proceeding anyway."
    exit 0
}

$ver = $m.Groups[1].Value

if ($ver -match '^1\.(\d+)') {
    $major = $Matches[1]
} else {
    $major = ($ver -split '\.')[0]
}

if ($major -ne '17') {
    Write-Host ""
    Write-Host "ERROR: Detected JDK $ver (major version $major), but this project's Gradle wrapper (8.10.2) requires JDK 17."
    Write-Host "Install JDK 17 (https://adoptium.net/temurin/releases/?version=17) and make sure JAVA_HOME/PATH point at it, not JDK $major."
    exit 1
}

exit 0
