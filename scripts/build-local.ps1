# Gera o APK na própria máquina, sem fila de servidor.
#
# A build na nuvem leva cerca de oito minutos, mas o plano gratuito coloca ela numa
# fila que já passou de uma hora e meia. Aqui a fila não existe: a primeira execução
# leva uns dez minutos baixando dependências do Gradle, e as seguintes uns três.
#
# Pré-requisitos, instalados uma vez (veja o README):
#   - JDK 17
#   - Android SDK em ~\Android\Sdk
#   - chave de assinatura em ~\Android\neuroaxis-signing.properties

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Find-Jdk17 {
    foreach ($base in @(
        "$env:LOCALAPPDATA\Programs\Microsoft",
        "C:\Program Files\Microsoft",
        "C:\Program Files\Eclipse Adoptium",
        "C:\Program Files\Java"
    )) {
        $hit = Get-ChildItem "$base\jdk-17*" -Directory -ErrorAction SilentlyContinue |
               Sort-Object Name -Descending | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\javac.exe")) {
    $jdk = Find-Jdk17
    if (-not $jdk) { throw "JDK 17 nao encontrado. Instale com: winget install Microsoft.OpenJDK.17" }
    $env:JAVA_HOME = $jdk
}

if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:USERPROFILE\Android\Sdk" }
if (-not (Test-Path "$env:ANDROID_HOME\platform-tools")) {
    throw "Android SDK nao encontrado em $env:ANDROID_HOME. Veja a secao de build local no README."
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

Write-Host "JDK:  $env:JAVA_HOME"
Write-Host "SDK:  $env:ANDROID_HOME"

# O prebuild regenera /android inteiro a partir do app.json. É por isso que a
# assinatura mora num plugin (plugins/withReleaseSigning.js) e não numa edição manual
# do build.gradle: edição manual sumiria aqui, silenciosamente, e o APK sairia
# assinado com a chave de debug.
Write-Host "`n== gerando projeto nativo =="
npx expo prebuild --platform android --clean
if ($LASTEXITCODE -ne 0) { throw "prebuild falhou" }

Write-Host "`n== compilando =="
Push-Location "$root\android"
try {
    & .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "gradle falhou" }
} finally {
    Pop-Location
}

$apk = Get-ChildItem "$root\android\app\build\outputs\apk\release\*.apk" | Select-Object -First 1
if (-not $apk) { throw "build terminou mas nao achei o APK" }

New-Item -ItemType Directory -Force "$root\dist-apk" | Out-Null
$out = "$root\dist-apk\neuroaxis-portal.apk"
Copy-Item $apk.FullName $out -Force

Write-Host "`nAPK pronto: $out"
Write-Host ("tamanho: {0:N1} MB" -f ($apk.Length / 1MB))
Write-Host "`nInstalar por cabo:  adb install -r `"$out`""
