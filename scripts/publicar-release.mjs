// Publica o APK da versão atual como release no GitHub (bloco 95).
//
//   npm run release -- "o que mudou nesta versão"
//   npm run release -- --notas-arquivo caminho.md
//
// O PC confere a release mais nova de ZakWegues/elysium-m, guarda o APK e o app do celular
// oferece a instalação sozinho. Por isso o script abre o APK e confere a versão DE DENTRO
// dele (aapt2) contra o app.json: publicar um APK velho com a tag nova faria todo celular
// "atualizar" para a mesma versão, em laço.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO = "ZakWegues/elysium-m";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const expo = JSON.parse(fs.readFileSync(path.join(raiz, "app.json"), "utf8")).expo;
const versao = expo.version;
const versionCode = expo.android?.versionCode;
const tag = `v${versao}`;
const apk = path.join(raiz, "dist-apk", "elysium-m.apk");

function sh(cmd, args, opts = {}) {
  // Com stdio herdado o execFileSync devolve null (a saída foi direto para o terminal).
  return String(execFileSync(cmd, args, { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }) ?? "").trim();
}
function falhar(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const args = process.argv.slice(2);
let notas = "";
const iArq = args.indexOf("--notas-arquivo");
if (iArq >= 0) notas = fs.readFileSync(args[iArq + 1], "utf8");
else notas = args.filter(a => !a.startsWith("--")).join(" ");
if (!notas.trim()) falhar("faltam as notas: npm run release -- \"o que mudou\"");
// Fase 18 (08/10): as notas alimentam o card ELYSIUM do Hoje — "## Novidades" vira "o que
// veio" e "## Para testar" vira o checklist. Sem as duas seções, o card fica pela metade.
if (!/^#{1,3}\s*novidades/im.test(notas) || !/^#{1,3}\s*para testar/im.test(notas)) {
  falhar('as notas precisam das seções "## Novidades" e "## Para testar" (o Hoje mostra as duas)');
}

if (!fs.existsSync(apk)) falhar("não achei dist-apk/elysium-m.apk — rode npm run build:local antes");

// A versão de DENTRO do APK, não a do app.json: é ela que o celular vai comparar.
// 07/10: procura em QUALQUER build-tools (era fixo no 36.0.0) e, sem a ferramenta, FALHA —
// antes só avisava e publicava, e um APK com a versão errada deixava o cartão "versão nova"
// em laço no celular.
function ferramenta(nome) {
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), "Android", "Sdk");
  const bt = path.join(sdk, "build-tools");
  const versoes = fs.existsSync(bt) ? fs.readdirSync(bt).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  for (const v of versoes) {
    const f = path.join(bt, v, nome);
    if (fs.existsSync(f)) return f;
  }
  return null;
}
const aapt2 = ferramenta("aapt2.exe");
if (!aapt2) falhar("aapt2 não encontrado no Android SDK; sem ele não dá para conferir a versão do APK");
{
  const badging = sh(aapt2, ["dump", "badging", apk]).split(/\r?\n/)[0];
  const nome = /versionName='([^']+)'/.exec(badging)?.[1];
  const codigo = Number(/versionCode='(\d+)'/.exec(badging)?.[1]);
  if (nome !== versao || codigo !== versionCode) falhar(`o APK é ${nome} (${codigo}), mas o app.json diz ${versao} (${versionCode}) — gere o APK de novo`);
  console.log(`✓ APK ${nome} (${codigo})`);
}

// O certificado (07/10): sem o arquivo de assinatura o build sai com a chave de DEBUG, e o
// Android recusa por cima do instalado ("app não instalado") sem dizer por quê. Só publica
// com a mesma chave de sempre.
const CERTIFICADO = "3b49374de7f46c17a50123e476318463b803826d562a3390405a31915be0e81c";
const apksigner = ferramenta("apksigner.bat");
if (!apksigner) falhar("apksigner não encontrado no Android SDK; sem ele não dá para conferir a assinatura");
{
  const saida = sh("cmd.exe", ["/c", apksigner, "verify", "--print-certs", apk]);
  const digest = /certificate SHA-256 digest: ([0-9a-f]+)/i.exec(saida)?.[1]?.toLowerCase();
  if (digest !== CERTIFICADO) falhar(`o APK foi assinado com outra chave (${digest ?? "nenhuma"}) — o celular recusaria por cima do instalado`);
  console.log("✓ assinatura de sempre");
}

if (sh("git", ["status", "--porcelain"])) falhar("há mudança não commitada; a release tem de corresponder a um commit");
const head = sh("git", ["rev-parse", "HEAD"]);
sh("git", ["fetch", "origin", "--quiet"]);
if (!sh("git", ["branch", "-r", "--contains", head])) falhar("o commit atual não está no GitHub; faça push antes");

// CI verde (bloco 114): a release instala sozinha em todo aparelho — de madrugada, no PC.
// Um commit cujo check falhou não sai. `--sem-ci` existe para emergência (CI fora do ar).
if (args.includes("--sem-ci")) {
  console.warn("! publicando sem conferir o CI (--sem-ci)");
} else {
  const runs = JSON.parse(sh("gh", ["run", "list", "--repo", REPO, "--commit", head, "--workflow", "check.yml", "--json", "status,conclusion", "--limit", "1"]) || "[]");
  if (!runs.length) falhar("o CI ainda não rodou neste commit (gh run list vazio)");
  if (runs[0].status !== "completed") falhar("o CI deste commit ainda está rodando — espere terminar");
  if (runs[0].conclusion !== "success") falhar(`o CI deste commit terminou em "${runs[0].conclusion}" — conserte antes de publicar`);
  console.log("✓ CI verde neste commit");
}

// O nome do asset leva a versão: é o que aparece no download do celular.
const copia = path.join(os.tmpdir(), `elysium-m-${versao}.apk`);
fs.copyFileSync(apk, copia);
try {
  // A tag primeiro: o GitHub só aceita alvo por SHA completo ou branch, e a tag deixa a
  // versão marcada no histórico do git também.
  try { sh("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]); } catch { sh("git", ["tag", tag, head]); }
  sh("git", ["push", "-q", "origin", tag]);

  let existe = true;
  try { sh("gh", ["release", "view", tag, "--repo", REPO]); } catch { existe = false; }
  if (existe) {
    console.log(`A release ${tag} já existe; substituindo o APK.`);
    sh("gh", ["release", "upload", tag, copia, "--clobber", "--repo", REPO], { stdio: "inherit" });
  } else {
    const arqNotas = path.join(os.tmpdir(), `notas-elysium-m-${versao}.md`);
    fs.writeFileSync(arqNotas, `${notas.trim()}\n\nversionCode ${versionCode}\n`);
    sh("gh", ["release", "create", tag, copia, "--repo", REPO, "--verify-tag", "--title", `ELYSIUM-M ${versao}`, "--notes-file", arqNotas], { stdio: "inherit" });
    fs.rmSync(arqNotas, { force: true });
  }
} finally {
  fs.rmSync(copia, { force: true });
}
console.log(`✓ ${tag} publicada em https://github.com/${REPO}/releases/tag/${tag}`);

// O PC só procura versão nova a cada 6 h: avisa o ELYSIUM desta máquina para buscar o APK já,
// e o celular oferece a instalação na próxima vez que abrir. Sem o PC de pé, só avisa.
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA ?? "", "ELYSIUM", "elysium-config.json"), "utf8"));
  const porta = cfg.overrides?.serverPort ?? 4200;
  const r = await fetch(`http://127.0.0.1:${porta}/api/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.serverToken}` },
    body: JSON.stringify({ method: "update.status", params: { verificar: true, aguardar: true } }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const cel = (await r.json()).result?.celular;
  if (cel?.versao === versao && cel.pronto) console.log(`✓ o PC já guardou o ${versao} para o celular`);
  else console.log(`! o PC respondeu, mas o ${versao} ainda não está pronto lá (${cel ? `${cel.versao}, pronto=${cel.pronto}` : "sem versão"})`);
} catch (e) {
  console.log(`! não consegui avisar o PC (${e instanceof Error ? e.message : e}) — ele busca sozinho em até 6 h`);
}
