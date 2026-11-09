#!/usr/bin/env node
/**
 * Correção para `npx expo start --tunnel` (Expo Go fecha sozinho).
 *
 * Pelo túnel (ngrok), o cabeçalho `x-forwarded-proto` pode chegar repetido
 * ("https, https"). O Expo CLI usa esse valor direto no endereço do app e monta
 * "https, https://...". O Expo Go recebe um endereço inválido, carrega e fecha
 * (no terminal aparece "Unable to resolve manifest assets ... reading '0'").
 *
 * Aqui trocamos para usar só o primeiro valor ("https"). Roda sozinho depois do
 * `npm install` (script "postinstall"). Se o Expo já tiver corrigido, não faz nada.
 */
const fs = require('fs');
const path = require('path');

try {
  const expoDir = path.dirname(require.resolve('expo/package.json'));
  const cliDir = path.dirname(require.resolve('@expo/cli/package.json', { paths: [expoDir] }));
  const file = path.join(cliDir, 'build/src/start/server/middleware/ExpoGoManifestHandlerMiddleware.js');
  const src = fs.readFileSync(file, 'utf8');
  const before = "protocol: req.headers['x-forwarded-proto']";
  const after =
    "protocol: (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().match(/^https?$/) || [undefined])[0] /* gameplay: fix-expo-tunnel */";
  if (src.includes('gameplay: fix-expo-tunnel')) {
    console.log('fix-expo-tunnel: já aplicado.');
  } else if (src.includes(before)) {
    fs.writeFileSync(file, src.replace(before, after));
    console.log('fix-expo-tunnel: correção do túnel aplicada no Expo CLI.');
  } else {
    console.log('fix-expo-tunnel: nada para corrigir nesta versão do Expo.');
  }
} catch (e) {
  // Nunca quebra o npm install (nem o build na EAS).
  console.log('fix-expo-tunnel: ignorado (' + e.message + ').');
}
