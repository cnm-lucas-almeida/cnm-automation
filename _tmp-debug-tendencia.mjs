import { chromium } from 'playwright';
import path from 'path';

const outDir = 'C:\\Users\\LUCASA~1\\AppData\\Local\\Temp\\claude\\c--Git-Automacoes-CNM\\e3739ec3-20e1-41b1-a956-7f0a27b1b49e\\scratchpad';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto('http://localhost:3000/glpi?apresentacao=1', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('text=Tendência mensal', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, 'debug-tendencia-t0.png') });
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(outDir, 'debug-tendencia-t2.png') });

const rectCount = await page.locator('.recharts-bar-rectangle').count();
console.log('Quantidade de retângulos de barra renderizados:', rectCount);
const svgSize = await page.locator('.recharts-wrapper svg').first().boundingBox();
console.log('SVG bounding box:', JSON.stringify(svgSize));

await browser.close();
console.log('DONE');
