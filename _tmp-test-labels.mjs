import { chromium } from 'playwright';
import path from 'path';

const outDir = 'C:\\Users\\LUCASA~1\\AppData\\Local\\Temp\\claude\\c--Git-Automacoes-CNM\\e3739ec3-20e1-41b1-a956-7f0a27b1b49e\\scratchpad';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

await page.goto('http://localhost:3000/glpi?apresentacao=1', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await page.waitForSelector('text=Tendência mensal', { timeout: 15000 }).catch(() => {});
await page.screenshot({ path: path.join(outDir, 'glpi-labels-tendencia.png') });

await page.waitForTimeout(11000);
await page.screenshot({ path: path.join(outDir, 'glpi-labels-grupo.png') });

console.log('Console errors:', JSON.stringify(consoleErrors));

// Aba Abertura por Equipe, modo normal, pra ver os pies com label também
await page.goto('http://localhost:3000/glpi', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('button:has-text("Abertura por Equipe")').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(outDir, 'glpi-labels-abertura-pies.png') });
console.log('Console errors 2:', JSON.stringify(consoleErrors));

await browser.close();
console.log('DONE');
