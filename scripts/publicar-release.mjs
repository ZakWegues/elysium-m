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

if (!fs.existsSync(apk)) falhar("não achei dist-apk/elysium-m.apk — rode npm run build:local antes");

// A versão de DENTRO do APK, não a do app.json: é ela que o celular vai comparar.
const aapt2 = path.join(process.env.ANDROID_HOME || path.join(os.homedir(), "Android", "Sdk"), "build-tools", "36.0.0", "aapt2.exe");
if (fs.existsSync(aapt2)) {
  const badging = sh(aapt2, ["dump", "badging", apk]).split(/\r?\n/)[0];
  const nome = /versionName='([^']+)'/.exec(badging)?.[1];
  const codigo = Number(/versionCode='(\d+)'/.exec(badging)?.[1]);
  if (nome !== versao || codigo !== versionCode) falhar(`o APK é ${nome} (${codigo}), mas o app.json diz ${versao} (${versionCode}) — gere o APK de novo`);
} else {
  console.warn("! aapt2 não encontrado; publicando sem conferir a versão de dentro do APK");
}

if (sh("git", ["status", "--porcelain"])) falhar("há mudança não commitada; a release tem de corresponder a um commit");
const head = sh("git", ["rev-parse", "HEAD"]);
sh("git", ["fetch", "origin", "--quiet"]);
if (!sh("git", ["branch", "-r", "--contains", head])) falhar("o commit atual não está no GitHub; faça push antes");

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
