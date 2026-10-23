// Metro do Expo, mais o `.html` como asset: o renderer das telas inteligentes (assets/ui) entra
// no APK e no OTA como arquivo, não como string no bundle.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('html');

module.exports = config;
