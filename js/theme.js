/*
 * Aplica tema e densidade antes da primeira pintura, para a página não piscar.
 * É o único script clássico (sem módulo) e roda no <head>.
 */
(function () {
  var root = document.documentElement;
  try {
    var tema = localStorage.getItem('cicm:tema');
    if (tema === 'claro') root.setAttribute('data-theme', 'light');
    if (tema === 'escuro') root.setAttribute('data-theme', 'dark');
    if (localStorage.getItem('cicm:densidade') === 'compacta') root.setAttribute('data-density', 'compact');
  } catch (e) {
    /* Sem armazenamento local: segue o tema do sistema. */
  }
})();
