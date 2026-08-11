const { withGradleProperties } = require('expo/config-plugins');

/**
 * Dá memória suficiente ao Gradle para compilar este projeto.
 *
 * O modelo do Expo vem com `-Xmx2048m -XX:MaxMetaspaceSize=512m`. Com o React Native
 * 0.86 e os vinte e poucos módulos nativos daqui, o daemon estoura o Metaspace no meio
 * da compilação e cospe `OutOfMemoryError: Metaspace` em laço até a build morrer.
 *
 * O valor precisa vir daqui e não de uma variável de ambiente: `org.gradle.jvmargs` do
 * gradle.properties é o que define os argumentos do daemon, e GRADLE_OPTS não sobrescreve
 * isso. E precisa ser plugin e não edição manual porque o `prebuild` regenera /android.
 *
 * Dimensionado para uma máquina de 16 GB. Em máquina menor, baixar o Xmx.
 */
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, cfg => {
    const props = cfg.modResults.filter(
      item => !(item.type === 'property' && item.key === 'org.gradle.jvmargs')
    );
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
};
