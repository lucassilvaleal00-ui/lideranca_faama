/* =====================================================================
   Caixa de texto longo — a que o candidato usa para a descrição.

   Por que não é uma <textarea>: numa textarea o recuo de parágrafo só
   pode ser dado na PRIMEIRA linha, porque o navegador trata tudo como um
   bloco só. Aqui cada Enter cria um parágrafo de verdade, e o recuo de
   1,25 cm cai em todos — igual ao que sai depois no PDF e no Word.

   O valor continua sendo texto puro: parágrafos separados por \n. Nada
   de HTML entra no banco.
   ===================================================================== */

import { esc } from './ui.js';

/** Texto puro -> um parágrafo por linha. */
function paragrafos(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/);
  const corpo = linhas.map(l => `<p>${esc(l) || '<br>'}</p>`).join('');
  return corpo || '<p><br></p>';
}

/**
 * Markup da caixa. Use no lugar de uma <textarea>.
 *
 * @param {object} o
 * @param {string} o.campo        vira data-campo, como nos outros campos
 * @param {string} o.valor        texto atual
 * @param {boolean} o.travado     true = somente leitura
 * @param {string} o.placeholder  dica quando está vazia
 */
export function caixaTexto({ campo = 'descricao', valor = '', travado = false,
                             placeholder = '' } = {}) {
  const vazio = !String(valor ?? '').trim();

  return `<div class="texto-rico ${travado ? 'travado' : ''} ${vazio ? 'vazio' : ''}"
               data-campo="${esc(campo)}" data-rico
               data-vazio="${esc(placeholder)}"
               role="textbox" aria-multiline="true"
               ${travado ? '' : 'contenteditable="true"'}
          >${paragrafos(valor)}</div>`;
}

/** Lê o conteúdo como texto puro, um \n por parágrafo. */
export function lerTexto(el) {
  if (!el) return '';

  const blocos = [...el.children].filter(n => n.nodeType === 1);

  const linhas = blocos.length
    ? blocos.map(b => b.textContent.replace(/ /g, ' '))
    : [el.textContent.replace(/ /g, ' ')];

  return linhas
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Reescreve o conteúdo a partir de texto puro. */
export function escreverTexto(el, texto) {
  if (!el) return;
  el.innerHTML = paragrafos(texto);
  marcarVazio(el);
}

function marcarVazio(el) {
  el.classList.toggle('vazio', !el.textContent.trim());
}

/**
 * Liga o comportamento em tudo que estiver (ou vier a estar) dentro do
 * container. Chame uma vez por tela.
 */
export function ligarTextoRico(container) {
  /* Colar sempre entra como texto puro: negrito, cor e fonte de outro
     programa não vêm junto. */
  container.addEventListener('paste', e => {
    const caixa = e.target.closest?.('[data-rico]');
    if (!caixa || caixa.classList.contains('travado')) return;

    e.preventDefault();
    const texto = (e.clipboardData ?? window.clipboardData)?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, texto);
  });

  container.addEventListener('input', e => {
    const caixa = e.target.closest?.('[data-rico]');
    if (caixa) marcarVazio(caixa);
  });

  /* Um Enter solto pode deixar o navegador sem bloco nenhum; garantimos
     que sempre exista pelo menos um parágrafo. */
  container.addEventListener('focusin', e => {
    const caixa = e.target.closest?.('[data-rico]');
    if (caixa && !caixa.firstElementChild) caixa.innerHTML = '<p><br></p>';
  });
}
