# Política de segurança

Este repositório é um **protótipo navegável estático** (HTML, CSS e JavaScript). Ele não
tem back-end, banco de dados nem autenticação real, e não deve ser usado com dados reais
de corretores, segurados ou companhias.

## Reportando uma vulnerabilidade

Se encontrar um problema de segurança, abra um
[security advisory privado](https://github.com/fernandopinhel/CICM/security/advisories/new)
em vez de uma issue pública.

## Medidas adotadas

- Content Security Policy via `<meta>` (`script-src 'self'` e `style-src` sem
  `'unsafe-inline'`, ou seja, sem scripts nem estilos inline). Não há nenhum
  `<script>`, `<style>`, `style=` ou `onclick=` escrito direto no HTML, e o CI bloqueia.
- Nenhuma biblioteca de terceiros no runtime: só HTML, CSS e JavaScript próprios.
- Todo texto entra na página como `textContent`, nunca como HTML. O CI recusa
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` e `eval`.
- Nada é enviado a servidor. A sessão e os dados ficam só no `sessionStorage` do
  navegador e somem ao fechar a aba, ao clicar em "Sair" (a sessão) ou em
  "Restaurar dados de exemplo" (os dados). Tema e densidade ficam no `localStorage`.
- O parâmetro `volta` do login só aceita páginas do próprio protótipo, evitando
  redirecionamento aberto.
- A exportação para CSV neutraliza valores que começam com `=`, `+`, `-`, `@`, tab ou
  retorno de carro, evitando injeção de fórmulas ao abrir o arquivo no Excel.
- Dependabot monitora as GitHub Actions, e os workflows usam permissões mínimas.
