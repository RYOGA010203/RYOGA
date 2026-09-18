#!/usr/bin/env node
/*
 * Builds self-contained single-file versions of the app (CSS, JS and the
 * icon inlined) so it can be shared as one HTML file or published as a
 * claude.ai artifact.
 *
 *   node scripts/build-single.js [outDir]   (default: dist/)
 *
 * Outputs:
 *   pockettuner.html           full standalone document
 *   pockettuner.artifact.html  body fragment (no doctype/html/head/body)
 *                              for hosts that wrap the page themselves
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'dist'));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const js = ['js/pitch.js', 'js/tunings.js', 'js/app.js'].map(read).join('\n')
  .replace(/\/\* sw:start \*\/[\s\S]*?\/\* sw:end \*\/\n?/, '');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'icons/apple-touch-icon.png')).toString('base64');

const body = /<body>([\s\S]*)<\/body>/.exec(html)[1]
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  .trim();

const metas = [
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Tuner">',
  '<meta name="theme-color" content="#101418">',
  `<link rel="apple-touch-icon" href="${icon}">`,
  `<link rel="icon" href="${icon}" type="image/png">`
].join('\n');

const fragmentCss = `
/* host-wrapped page: the host pads :root for the safe area, so fill it */
:root { color-scheme: dark; background: #101418; }
.app { height: 100%; min-height: 0; padding-top: 0; padding-bottom: 0; }`;

const fragment = `<title>PocketTuner</title>
${metas}
<style>
${css}
${fragmentCss}
</style>
${body}
<script>
${js}
</script>
`;

const full = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>PocketTuner</title>
${metas}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pockettuner.html'), full);
fs.writeFileSync(path.join(outDir, 'pockettuner.artifact.html'), fragment);
console.log('wrote', path.join(outDir, 'pockettuner.html'), `(${(full.length / 1024).toFixed(1)} KB)`);
console.log('wrote', path.join(outDir, 'pockettuner.artifact.html'), `(${(fragment.length / 1024).toFixed(1)} KB)`);
