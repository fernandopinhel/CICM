// Gera as capturas do README em docs/screenshots.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8642/';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });

async function session(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  await page.goto(BASE + 'login.html');
  await page.click('#demo');
  await page.waitForURL(/painel/);
  await page.waitForTimeout(400);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 84 });

/* Login */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(BASE + 'login.html');
  await page.waitForTimeout(1200);
  await shot(page, 'login');
  await ctx.close();
}

const page = await session();
await shot(page, 'painel');

await page.goto(BASE + 'erros.html');
await page.locator('table.data tbody input[type="checkbox"]:not([disabled])').nth(0).check();
await page.locator('table.data tbody input[type="checkbox"]:not([disabled])').nth(2).check();
await page.locator('table.data tbody input[type="checkbox"]:not([disabled])').nth(3).check();
await page.evaluate(() => window.scrollTo(0, 690));
await shot(page, 'erros');

const guid = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cicm:db')).movs.find((m) => m.status === 'rejeitado' && m.erros.length === 1 && m.erros[0].cod === 'E205').guid);
await page.goto(BASE + `movimento.html?guid=${guid}`);
await page.fill('#fix-perc', '40');
await page.getByRole('button', { name: 'Salvar correções' }).click();
await page.fill('#fix-perc', '22,5');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot(page, 'caso-correcao');

await page.goto(BASE + 'reenvio.html');
await page.check('input[name="modo"][value="sintetica"]');
await page.uncheck('#s-so');
await page.getByRole('button', { name: 'Conferir' }).click();
await page.evaluate(() => window.scrollTo(0, document.querySelector('#conferencia').offsetTop - 120));
await page.waitForTimeout(300);
await shot(page, 'reenvio-conferencia');

await page.click('#confirmar');
await page.waitForTimeout(400);
await shot(page, 'reenvio-confirmacao');
await page.locator('dialog').getByRole('button', { name: /Reenviar/ }).click();
await page.waitForURL(/reenviados/);
await page.waitForTimeout(1800);
await shot(page, 'reenviados-processando');
await page.waitForTimeout(14000);
await shot(page, 'reenviados-resultado');
await page.keyboard.press('Escape');

await page.goto(BASE + 'remessas.html?remessa=1278');
await page.waitForTimeout(500);
await shot(page, 'remessa-rejeitada');
await page.keyboard.press('Escape');

await page.goto(BASE + 'relatorio.html');
await page.evaluate(() => window.scrollTo(0, 390));
await shot(page, 'relatorio');

await page.goto(BASE + 'painel.html');
await page.keyboard.press('Control+k');
await page.keyboard.type('F20');
await page.waitForTimeout(300);
await shot(page, 'paleta');
await page.context().close();

/* Tema escuro */
{
  const p = await session({ colorScheme: 'dark' });
  await shot(p, 'painel-escuro');
  const g = await p.evaluate(() => JSON.parse(sessionStorage.getItem('cicm:db')).movs.find((m) => m.status === 'rejeitado' && m.erros.some((e) => e.cod === 'E101')).guid);
  await p.goto(BASE + `movimento.html?guid=${g}`);
  await p.waitForTimeout(300);
  await shot(p, 'caso-escuro');
  await p.context().close();
}

/* Celular */
{
  const p = await session({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await shot(p, 'mobile-painel');
  await p.getByRole('button', { name: 'Abrir menu' }).click();
  await p.waitForTimeout(300);
  await shot(p, 'mobile-menu');
  await p.keyboard.press('Escape');
  await p.goto(BASE + 'erros.html');
  await p.evaluate(() => window.scrollTo(0, 980));
  await shot(p, 'mobile-erros');
  await p.context().close();
}

await browser.close();
console.log('ok');
