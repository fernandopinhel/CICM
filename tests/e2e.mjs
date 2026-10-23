// Testes de fluxo de ponta a ponta do CICM.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:8642/';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
const ok = (msg) => console.log(`✔ ${msg}`);

/* Login: validação e acesso */
await page.goto(BASE + 'login.html');
await page.click('button[type="submit"]');
assert.equal(await page.locator('.error-summary li').count(), 2);
assert.equal(await page.evaluate(() => document.activeElement.className), 'error-summary');
await page.fill('#matricula', '123');
await page.fill('#senha', 'ab');
await page.click('button[type="submit"]');
assert.match(await page.locator('#matricula-erro').innerText(), /Faltam 4/);
assert.match(await page.locator('#senha-erro').innerText(), /4 caracteres/);
await page.fill('#matricula', '1234567');
assert.equal(await page.locator('#matricula-erro').count(), 0, 'erro some ao corrigir');
await page.fill('#senha', 'abcd');
await page.click('button[type="submit"]');
await page.waitForURL(/painel/);
ok('login valida e entra');

/* Sem sessão em outra aba: redireciona com retorno */
const p2 = await (await browser.newContext()).newPage();
await p2.goto(BASE + 'erros.html?codigo=E101');
await p2.waitForURL(/login\.html\?volta=/);
await p2.click('#demo');
await p2.waitForURL(/erros\.html\?codigo=E101/);
await p2.context().close();
ok('sem sessão vai ao login e volta para a página pedida');

/* Correção e reenvio de um caso */
const alvo = await page.evaluate(() => {
  const d = JSON.parse(sessionStorage.getItem('cicm:db'));
  const m = d.movs.find((x) => x.status === 'rejeitado' && x.erros.length === 1 && x.erros[0].cod === 'E233');
  return m.guid;
});
await page.goto(BASE + `movimento.html?guid=${alvo}`);
await page.getByRole('button', { name: 'Salvar correções' }).click();
assert.match(await page.locator('#fix-opcao-erro').innerText(), /Escolha a opção comercial/);
await page.selectOption('#fix-opcao', 'VD');
assert.equal(await page.locator('#fix-opcao-erro').count(), 0);
await page.getByRole('button', { name: 'Salvar correções' }).click();
await page.locator('#previsao').getByText('Pronto para reenviar').waitFor();
assert.equal(await page.evaluate(() => document.activeElement.id), 'previsao');
await page.getByRole('button', { name: 'Reenviar agora' }).click();
await page.locator('dialog').getByRole('button', { name: 'Reenviar', exact: true }).click();
await page.locator('.page-head .status', { hasText: 'Em reenvio' }).waitFor();
await page.locator('.page-head .status', { hasText: 'Integrado' }).waitFor({ timeout: 15000 });
await page.locator('.toast', { hasText: 'concluído' }).waitFor();
ok(`corrigir E233 → reenviar → integrado (${alvo})`);

/* Reenvio por lista: válido, inválido, já integrado, origem pendente */
const lista = await page.evaluate(() => {
  const d = JSON.parse(sessionStorage.getItem('cicm:db'));
  const pronto = d.movs.find((x) => x.status === 'rejeitado' && x.erros.every((e) => ['E901', 'E512'].includes(e.cod)));
  const origem = d.movs.find((x) => x.status === 'rejeitado' && x.erros.some((e) => e.cod === 'E402'));
  const integ = d.movs.find((x) => x.status === 'integrado');
  return { pronto: pronto.guid, origem: origem.guid, integ: integ.guid };
});
await page.goto(BASE + 'reenvio.html');
await page.check('input[name="modo"][value="lista"]');
await page.fill('#l-lista', `${lista.pronto}\n${lista.origem}, ${lista.integ} XYZ ${lista.pronto}`);
await page.getByRole('button', { name: 'Conferir' }).click();
await page.locator('#conferencia').waitFor();
const totais = await page.locator('#conf-totais dd').allInnerTexts();
assert.deepEqual(totais, ['4', '2', '1', '1', '2'], `totais da conferência: ${totais}`);
assert.match(await page.locator('#confirmar').innerText(), /Reenviar 2 movimentos/);
await page.getByRole('checkbox', { name: `Selecionar movimento ${lista.origem}` }).uncheck();
assert.match(await page.locator('#confirmar').innerText(), /Reenviar 1 movimento$/);
await page.click('#confirmar');
await page.locator('dialog').getByRole('button', { name: 'Reenviar', exact: true }).click();
await page.waitForURL(/reenviados\.html\?protocolo=RV-/);
await page.locator('dialog.drawer').waitFor();
await page.locator('dialog.drawer .status', { hasText: 'Concluído' }).first().waitFor({ timeout: 15000 });
ok('reenvio por lista: conferência, desmarcar, protocolo e resultado ao vivo');

/* Remessa rejeitada: reprocessar */
await page.goto(BASE + 'remessas.html?remessa=1278');
await page.locator('dialog.drawer').getByRole('button', { name: 'Reprocessar remessa' }).click();
await page.locator('dialog.modal').getByRole('button', { name: 'Reprocessar' }).click();
await page.locator('dialog.drawer .status', { hasText: 'Em processamento' }).waitFor();
await page.locator('dialog.drawer .status', { hasText: /Com pendências|Processada/ }).waitFor({ timeout: 15000 });
ok('remessa rejeitada reprocessada e com movimentos');
await page.keyboard.press('Escape');

/* Paleta de comandos */
await page.keyboard.press('Control+k');
await page.locator('dialog.palette').waitFor();
await page.keyboard.type('E10');
await page.locator('.palette-option', { hasText: 'E101' }).waitFor();
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForURL(/erros\.html\?codigo=E101/);
assert.equal(await page.inputValue('#s-codigo'), 'E101');
ok('paleta: busca código de erro e navega');

/* Movimentos por caso com exemplo */
await page.goto(BASE + 'movimentos.html');
await page.check('input[name="tipo"][value="caso"]');
await page.getByRole('button', { name: 'Preencher com um caso de exemplo' }).click();
await page.getByRole('button', { name: 'Consultar' }).click();
const n = Number(await page.locator('.count strong').innerText());
assert.ok(n >= 1, 'achou o caso');
ok(`consulta por caso de comissão (${n})`);

/* Período inválido */
await page.goto(BASE + 'relatorio.html');
await page.fill('#f-ini', '2026-10-20');
await page.fill('#f-fim', '2026-10-10');
await page.getByRole('button', { name: 'Gerar relatório' }).click();
assert.match(await page.locator('#f-fim-erro').innerText(), /depois da data de início/);
ok('regra de período');

/* Tema escuro e densidade persistem */
await page.getByRole('button', { name: 'Tema da interface' }).click();
await page.getByRole('button', { name: 'Escuro' }).click();
await page.reload();
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
ok('tema escuro lembrado');

assert.deepEqual(errors, [], `erros de console: ${errors.join(' | ')}`);
ok('sem erros de console');
await browser.close();
