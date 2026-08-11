const fs = require('fs');
const os = require('os');
const path = require('path');
const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Assina a build de release local com uma chave nossa, fixa.
 *
 * O modelo do Expo assina release com a chave de debug, que é gerada por máquina.
 * Um APK assinado com chave diferente do que já está no aparelho não instala por
 * cima — o Android recusa. Com uma chave própria guardada fora do repositório,
 * toda build local sai com a mesma assinatura e a atualização é direta.
 *
 * Não faz nada quando o arquivo de credenciais não existe, e nunca roda dentro do
 * EAS: lá a assinatura é da conta, e mexer nisso quebraria a build da nuvem.
 */

const DEFAULT_PROPS = path.join(os.homedir(), 'Android', 'neuroaxis-signing.properties');

function readProps() {
  if (process.env.EAS_BUILD) return null;

  const file = process.env.NEUROAXIS_SIGNING_PROPERTIES || DEFAULT_PROPS;
  if (!fs.existsSync(file)) return null;

  const props = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq === -1 || line.trim().startsWith('#')) continue;
    props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }

  const required = [
    'NEUROAXIS_STORE_FILE',
    'NEUROAXIS_STORE_PASSWORD',
    'NEUROAXIS_KEY_ALIAS',
    'NEUROAXIS_KEY_PASSWORD',
  ];
  const missing = required.filter(k => !props[k]);
  if (missing.length > 0) {
    throw new Error(`withReleaseSigning: faltam chaves em ${file}: ${missing.join(', ')}`);
  }

  return props;
}

function groovyString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    const props = readProps();
    if (!props) return cfg;

    let gradle = cfg.modResults.contents;

    if (gradle.includes('neuroaxisRelease')) return cfg;

    const block = [
      '        neuroaxisRelease {',
      `            storeFile file(${groovyString(props.NEUROAXIS_STORE_FILE)})`,
      `            storePassword ${groovyString(props.NEUROAXIS_STORE_PASSWORD)}`,
      `            keyAlias ${groovyString(props.NEUROAXIS_KEY_ALIAS)}`,
      `            keyPassword ${groovyString(props.NEUROAXIS_KEY_PASSWORD)}`,
      '        }',
      '',
    ].join('\n');

    const anchor = 'signingConfigs {';
    const at = gradle.indexOf(anchor);
    if (at === -1) throw new Error('withReleaseSigning: não achei signingConfigs no build.gradle');
    gradle = gradle.slice(0, at + anchor.length) + '\n' + block + gradle.slice(at + anchor.length);

    // A referência à chave de debug aparece duas vezes: no buildType debug e no
    // release. A última é a do release — trocar a primeira deixaria o release
    // assinado com debug do mesmo jeito, sem erro nenhum aparente.
    const needle = 'signingConfig signingConfigs.debug';
    const last = gradle.lastIndexOf(needle);
    const first = gradle.indexOf(needle);
    if (last === -1 || last === first) {
      throw new Error('withReleaseSigning: não achei a assinatura de release para trocar');
    }
    gradle = gradle.slice(0, last) + 'signingConfig signingConfigs.neuroaxisRelease' + gradle.slice(last + needle.length);

    cfg.modResults.contents = gradle;
    return cfg;
  });
};
