# ELYSIUM-M

App companion do [ELYSIUM](https://github.com/ZakWegues/neuroaxis) para Android. Controla o PC, conversa com o assistente, espelha a tela, e funciona fora de casa pelo túnel Tailscale.

## Rodar em desenvolvimento

```
npm install
npm start
```

Abre o Metro. Leia o QR com o app do Expo Go — serve para a maior parte do trabalho de UI.

**O que não funciona no Expo Go:** notificações push, biometria e compartilhamento vindo de outros apps. Esses três precisam de um APK de verdade (as duas seções abaixo).

## Gerar o APK localmente (recomendado)

Sem fila, sem servidor. A build em si leva uns três minutos; a primeira leva uns dez porque o Gradle baixa as dependências uma vez.

```
npm run build:local
```

O APK sai em `dist-apk/elysium-m.apk`.

### Preparar a máquina (uma vez só)

**1. JDK 17**

```
winget install --id Microsoft.OpenJDK.17 --scope user
```

O JDK 8 que vem com muitos PCs não serve — o Gradle do React Native 0.86 exige 17.

**2. Android SDK**

Não precisa do Android Studio inteiro, só das ferramentas de linha de comando:

```powershell
$sdk = "$env:USERPROFILE\Android\Sdk"
New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
Invoke-WebRequest "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip" -OutFile "$env:TEMP\cmdline-tools.zip"
Expand-Archive "$env:TEMP\cmdline-tools.zip" "$sdk\cmdline-tools\_tmp" -Force
Move-Item "$sdk\cmdline-tools\_tmp\cmdline-tools" "$sdk\cmdline-tools\latest"
Remove-Item "$sdk\cmdline-tools\_tmp" -Recurse -Force

& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$sdk" --licenses
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$sdk" `
  "platform-tools" "platforms;android-36" "platforms;android-35" `
  "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
```

São uns 3 GB no total, quase tudo NDK.

**3. Chave de assinatura**

O modelo do Expo assina a build de release com a chave de *debug*, que é gerada por máquina. Um APK assinado com chave diferente da que está no aparelho não instala por cima — o Android recusa e a única saída é desinstalar, perdendo pareamento e histórico. Por isso a chave é criada uma vez e guardada **fora do repositório**:

```powershell
$ks = "$env:USERPROFILE\Android\elysium-release.keystore"
$pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore $ks -alias elysium `
  -keyalg RSA -keysize 2048 -validity 10950 -storepass $pw -keypass $pw `
  -dname "CN=ELYSIUM-M, OU=Pessoal, O=ELYSIUM, L=-, ST=-, C=BR"

@"
ELYSIUM_STORE_FILE=$ks
ELYSIUM_STORE_PASSWORD=$pw
ELYSIUM_KEY_ALIAS=elysium
ELYSIUM_KEY_PASSWORD=$pw
"@ | Set-Content "$env:USERPROFILE\Android\elysium-signing.properties" -Encoding ascii
```

> ⚠️ **Isto é a receita para uma máquina nova.** Numa máquina que já tem chave, **não rode
> isso** — gerar uma chave nova por cima quebra o caminho de atualização de vez. A chave que
> já existe continua válida com o nome antigo: o plugin aceita tanto
> `elysium-signing.properties` quanto `neuroaxis-signing.properties`, e tanto o prefixo
> `ELYSIUM_` quanto `NEUROAXIS_` nas chaves de dentro. Renomear os arquivos é opcional;
> **regenerar a chave, nunca.**

**Faça backup dessa pasta.** Perder a chave significa que nenhuma build futura instala por cima da atual.

`plugins/withReleaseSigning.js` lê esse arquivo durante o `prebuild` e injeta a assinatura no `build.gradle`. É um plugin e não uma edição manual de propósito: o `prebuild` regenera `/android` inteiro a cada build, e uma edição manual sumiria em silêncio — o APK sairia assinado com debug sem nenhum erro aparente. Quando o arquivo de credenciais não existe, o plugin não faz nada; dentro do EAS ele nunca roda, porque lá a assinatura é da conta.

### Instalar no aparelho

Por cabo, com depuração USB ligada:

```
adb install -r dist-apk\elysium-m.apk
```

Ou copie o `.apk` para o celular e abra pelo gerenciador de arquivos.

> **Primeira instalação vinda do EAS:** o APK que veio da nuvem está assinado com a chave da conta Expo, não com esta. Nessa única troca é preciso desinstalar o app antes. O pareamento se refaz com o QR e as conversas voltam pela sincronização com o desktop.

## Gerar o APK na nuvem (EAS)

```
npm run build:apk
```

Funciona sem preparar nada na máquina, mas o plano gratuito coloca a build numa fila que já passou de uma hora e meia — a build em si leva oito minutos. Serve como reserva.

## Atualizar sem gerar APK novo

Mudança que mexe só em JavaScript não precisa de build nenhuma:

```
npm run update "descrição da mudança"
```

Chega no aparelho em segundos, sem reinstalar. A versão de runtime usa política de impressão digital, então uma atualização só alcança aparelhos cujo lado nativo é compatível.

**Precisa de APK novo quando:** adicionar ou atualizar biblioteca nativa, mexer em permissões, ícone, nome, `package`, ou qualquer coisa do `app.json` que gere código nativo.

## Verificação

```
npm run typecheck
```

Não há testes automatizados nos dois repositórios — a validação é manual, contra o PC rodando.
