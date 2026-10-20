import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = new URL('../apps/mobile/assets/brand/', import.meta.url);
const read = async name => readFile(new URL(name, directory), 'utf8');
const raster = async (name, svg, width) => sharp(Buffer.from(svg)).resize({ width }).png().toFile(fileURLToPath(new URL(name, directory)));
const symbol = await read('lukapp-symbol-inverse.svg');
const body = symbol.slice(symbol.indexOf('<path'), symbol.lastIndexOf('</svg>'));
const canvas = (size, background, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}${content}</svg>`;
await raster('icon.png', canvas(120, '#6d28d9', `<g transform="translate(10 10)">${body.replaceAll('#ffffff', '#f5f3ff')}</g>`), 1024);
await raster('adaptive-foreground.png', canvas(108, null, `<g transform="translate(18 18) scale(.72)">${body.replaceAll('#ffffff', '#f5f3ff')}</g>`), 1024);
await raster('adaptive-monochrome.png', canvas(108, null, `<g transform="translate(18 18) scale(.72)">${body}</g>`), 1024);
await raster('splash-symbol.png', symbol, 1024);
await raster('favicon.png', canvas(120, '#6d28d9', `<g transform="translate(10 10)">${body}</g>`), 64);
for (const kind of ['symbol', 'wordmark', 'lockup']) {
  for (const variant of ['color', 'inverse']) {
    const svg = await read(`lukapp-${kind}-${variant}.svg`);
    for (const scale of [1, 2, 3]) {
      const suffix = scale === 1 ? '' : `@${scale}x`;
      await raster(`${kind}-${variant}${suffix}.png`, svg, (kind === 'symbol' ? 144 : kind === 'wordmark' ? 176 : 224) * scale);
    }
  }
}
await writeFile(new URL('SOURCE.md', directory), `# Lukapp mobile branding\n\nCanonical SVGs copied unchanged from lukapp-marketing/assets/brand at commit 95b6df2868cbb4bd5ba2c099428788ca708af611. The approved mark is the curled L, firma, with its small gap. The custom wordmark remains vector lettering.\n\nIcon geometry and violet finish follow finance-tracker-v2/design/logo-portfolio/src/aire-study.tsx. Startup uses its violet and night presentations, stacked signature and original Spanish brand copy. Product color tokens remain unchanged.\n\nRun pnpm brand:generate from the repository root to regenerate PNG assets. Native launcher and splash resources come from Expo app.json and expo-splash-screen during prebuild. Android uses a centered symbol within the system splash mask; the startup screen supplies the stacked wordmark and copy.\n`);
console.log('Generated mobile launcher, adaptive, splash, favicon and density-specific brand assets.');
