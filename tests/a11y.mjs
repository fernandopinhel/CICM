// Auditoria axe (WCAG 2.0/2.1/2.2 A e AA) em telas e estados, nos dois temas.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE || 'http://localhost:8642/';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
let total = 0;

async function audit(page, label) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  total += r.violations.length;
  const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`);
  console.log(`${v.length ? '✘' : '✔'} ${label}${v.length ? `\n   ${v.join('\n   ')}` : ''}`);
}

for (const scheme of ['light', 'dark']) {
  for (const vw of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    const tag = `[${scheme} ${vw}]`;
    await page.goto(BASE + 'login.html');
    await audit(page, `${tag} login`);
    await page.click('button[type="submit"]');
    await audit(page, `${tag} login com erros`);
    await page.click('#demo');
    await page.waitForURL(/painel/);

    const guid = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cicm:db')).movs.find((m) => m.status === 'rejeitado' && m.erros.some((e) => e.cod === 'E205')).guid);
    for (const p of ['painel.html', 'remessas.html', 'movimentos.html', `movimento.html?guid=${guid}`, 'movimento.html?guid=F000', 'erros.html', 'reenvio.html', 'reenviados.html', 'relatorio.html']) {
      await page.goto(BASE + p);
      await page.waitForTimeout(250);
      await audit(page, `${tag} ${p}`);
    }

    if (vw === 1440) {
      await page.goto(BASE + `movimento.html?guid=${guid}`);
      await page.getByRole('button', { name: 'Salvar correções' }).click();
      await audit(page, `${tag} correção com erro`);

      await page.goto(BASE + 'remessas.html?remessa=1278');
      await page.locator('dialog.drawer').waitFor();
      await audit(page, `${tag} gaveta da remessa`);

      await page.goto(BASE + 'reenviados.html');
      await page.locator('table.data tbody button').first().click();
      await audit(page, `${tag} gaveta do reenvio`);
      await page.keyboard.press('Escape');

      await page.goto(BASE + 'erros.html');
      await page.locator('table.data tbody input[type="checkbox"]:not([disabled])').first().check();
      await audit(page, `${tag} erros com seleção`);
      await page.getByRole('button', { name: /^Ver o erro/ }).first().click();
      await audit(page, `${tag} gaveta do erro`);
      await page.keyboard.press('Escape');

      await page.goto(BASE + 'reenvio.html');
      await page.check('input[name="modo"][value="sintetica"]');
      await page.getByRole('button', { name: 'Conferir' }).click();
      await audit(page, `${tag} conferência do reenvio`);
      await page.click('#confirmar');
      await audit(page, `${tag} confirmação`);
      await page.keyboard.press('Escape');

      await page.keyboard.press('Control+k');
      await page.keyboard.type('F1');
      await audit(page, `${tag} paleta`);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: /^Conta de/ }).click();
      await audit(page, `${tag} menu da conta`);
    } else {
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await audit(page, `${tag} menu no celular`);
    }
    await ctx.close();
  }
}
console.log(total ? `\n${total} violações` : '\nNenhuma violação');
process.exitCode = total ? 1 : 0;
await browser.close();
