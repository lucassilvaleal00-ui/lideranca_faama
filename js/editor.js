/* =====================================================================
   Editor de Requisitos — só administrador.

   Os 5 formulários são fixos (o banco recusa renomear ou excluir).
   O que se edita são as seções e, dentro delas, os requisitos.

   Exclusão é LÓGICA (ativo = false): o requisito some para quem ainda não
   usou, mas tudo que candidatos já escreveram e fotografaram continua lá.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, $, $$ } from './ui.js';

const estado = {
  formularios: [], atual: null, secoes: [],
  usoPorRequisito: new Map(), usoPorAlinea: new Map()
};

/* ------------------------------------------------------------ utilidades */

function ocupado(botao, sim, texto) {
  botao.disabled = sim;
  botao.innerHTML = sim ? '<span class="girando"></span>' : texto;
}

function abrirModal(html) {
  const caixa = $('#caixa-modal');
  caixa.className = 'modal';
  caixa.innerHTML = html;
  $('#fundo-modal').classList.add('aberto');
  caixa.querySelector('[data-fechar]')?.addEventListener('click', fecharModal);
  return caixa;
}
function fecharModal() { $('#fundo-modal').classList.remove('aberto'); }

$('#fundo-modal').addEventListener('click', e => {
  if (e.target.id === 'fundo-modal') fecharModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

function irPara(id) {
  $$('.tela').forEach(t => t.classList.toggle('ativa', t.id === id));
  scrollTo({ top: 0 });
}

/* =============================================== LISTA DOS FORMULÁRIOS */

async function carregarFormularios() {
  const { data, error } = await sb.from('formularios').select('*').order('ordem');
  if (error) { toast(traduzErro(error), 'erro'); return; }

  estado.formularios = data ?? [];

  // quantos requisitos ativos cada formulário tem
  const { data: contagem } = await sb
    .from('requisitos')
    .select('id, secao:secoes!inner(formulario_id)')
    .eq('ativo', true);

  const porForm = new Map();
  for (const r of contagem ?? []) {
    const f = r.secao.formulario_id;
    porForm.set(f, (porForm.get(f) ?? 0) + 1);
  }

  $('#grade-formularios').innerHTML = estado.formularios.map(f => `
    <button class="cartao-formulario" data-form="${f.id}">
      <span class="faixa ${f.categoria}"></span>
      <span>
        <h3>${esc(f.nome)}</h3>
        <p>${porForm.get(f.id) ?? 0} requisito(s)</p>
      </span>
    </button>`).join('');
}

$('#grade-formularios').addEventListener('click', e => {
  const b = e.target.closest('[data-form]');
  if (b) abrirFormulario(b.dataset.form);
});

$('#voltar-lista').addEventListener('click', () => {
  irPara('tela-lista');
  carregarFormularios();
});

/* ==================================================== EDIÇÃO DE UM FORM */

async function abrirFormulario(id) {
  estado.atual = estado.formularios.find(f => f.id === id);
  $('#titulo-formulario').textContent = estado.atual.nome;
  irPara('tela-editor');
  await carregarSecoes();
}

async function carregarSecoes() {
  const { data, error } = await sb
    .from('secoes')
    .select('*, requisitos(*, alineas(*))')
    .eq('formulario_id', estado.atual.id)
    .eq('ativo', true)
    .order('ordem');

  if (error) { toast(traduzErro(error), 'erro'); return; }

  estado.secoes = (data ?? []).map(s => ({
    ...s,
    requisitos: (s.requisitos ?? [])
      .filter(r => r.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map(r => ({
        ...r,
        alineas: (r.alineas ?? []).filter(a => a.ativo).sort((a, b) => a.ordem - b.ordem)
      }))
  }));

  await medirUso();
  desenharSecoes();
}

/** a, b, c, … a partir da ordem 1, 2, 3 */
const letra = n => String.fromCharCode(96 + n);

/** Quantos candidatos já responderam cada requisito/alínea — muda o aviso de exclusão. */
async function medirUso() {
  const ids = estado.secoes.flatMap(s => s.requisitos.map(r => r.id));
  estado.usoPorRequisito = new Map();
  estado.usoPorAlinea = new Map();
  if (!ids.length) return;

  const { data } = await sb.from('respostas')
    .select('requisito_id, alinea_id').in('requisito_id', ids);

  for (const r of data ?? []) {
    estado.usoPorRequisito.set(r.requisito_id, (estado.usoPorRequisito.get(r.requisito_id) ?? 0) + 1);
    if (r.alinea_id) {
      estado.usoPorAlinea.set(r.alinea_id, (estado.usoPorAlinea.get(r.alinea_id) ?? 0) + 1);
    }
  }
}

function desenharSecoes() {
  const alvo = $('#lista-secoes');

  if (!estado.secoes.length) {
    alvo.innerHTML = `
      <div class="vazio" style="background:var(--branco);border:1px solid var(--borda);
                                border-radius:var(--raio);margin-bottom:16px">
        <span class="simbolo">📄</span>
        Este formulário ainda está limpo.<br>
        Comece criando a primeira seção abaixo.
      </div>`;
    return;
  }

  alvo.innerHTML = estado.secoes.map((s, iSecao) => `
    <section class="secao" data-secao="${s.id}">
      <div class="secao-topo">
        <input type="text" value="${esc(s.titulo)}" data-titulo-secao="${s.id}"
               aria-label="Título da seção">
        <span class="conta-req">${s.requisitos.length} req.</span>
        <button class="botao-icone" data-subir-secao="${s.id}"
                ${iSecao === 0 ? 'disabled' : ''} title="Subir">↑</button>
        <button class="botao-icone" data-descer-secao="${s.id}"
                ${iSecao === estado.secoes.length - 1 ? 'disabled' : ''} title="Descer">↓</button>
        <button class="botao-icone perigo" data-excluir-secao="${s.id}" title="Excluir seção">🗑️</button>
      </div>

      <div class="secao-corpo">
        ${s.requisitos.map((r, i) => cartaoRequisito(r, i, s.requisitos.length)).join('')}
        <button class="botao-adicionar ${s.requisitos.length ? '' : 'destaque'}"
                data-novo-requisito="${s.id}">+ Adicionar requisito</button>
      </div>
    </section>`).join('');
}

/** Bloco de campos — o mesmo para um requisito sem alínea e para uma alínea. */
function camposEditaveis(o) {
  const simNao = (campo, ligado) => `
    <select data-campo="${campo}">
      <option value="true"  ${ligado  ? 'selected' : ''}>Sim</option>
      <option value="false" ${!ligado ? 'selected' : ''}>Não</option>
    </select>`;

  return `
    <div class="requisito-grade">
      <div class="largura-total">
        <div class="campo-fixo">
          🧩 <span>O candidato precisa preencher o que estiver marcado como
          <strong>Sim</strong> abaixo. Pelo menos um dos três.</span>
        </div>
      </div>

      <div>
        <label>Quantidade de partes</label>
        <select data-campo="qtd_partes">
          ${Array.from({ length: 12 }, (_, k) => k + 1).map(n =>
            `<option value="${n}" ${n === o.qtd_partes ? 'selected' : ''}>
               ${n}${n === 1 ? ' parte' : ' partes'}</option>`).join('')}
        </select>
      </div>

      <div>
        <label>Pedir data?</label>
        ${simNao('exigir_data', o.exigir_data !== false)}
      </div>

      <div>
        <label>Pedir descrição?</label>
        ${simNao('exigir_descricao', o.exigir_descricao !== false)}
      </div>

      <div>
        <label>Pedir foto?</label>
        ${simNao('permitir_fotos', o.permitir_fotos)}
      </div>

      <div class="largura-total" data-bloco-descricao
           ${o.exigir_descricao !== false ? '' : 'hidden'}>
        <label>Dica de cumprimento <span style="font-weight:400">(vira "Orientação da descrição")</span></label>
        <textarea data-campo="dica_cumprimento"
                  placeholder="Ex.: descreva o local, a data e quantas pessoas participaram."
                  >${esc(o.dica_cumprimento ?? '')}</textarea>
      </div>

      <div class="largura-total" data-bloco-foto ${o.permitir_fotos ? '' : 'hidden'}>
        <label>Dica de foto <span style="font-weight:400">(vira "Orientação da foto")</span></label>
        <textarea data-campo="dica_foto"
                  placeholder="Ex.: a foto precisa mostrar você junto com o grupo."
                  >${esc(o.dica_foto ?? '')}</textarea>
      </div>
    </div>`;
}

function cartaoAlinea(a, i, total) {
  const usos = estado.usoPorAlinea.get(a.id) ?? 0;

  return `
  <div class="alinea" data-alinea="${a.id}">
    <div class="alinea-topo">
      <span class="letra">${letra(i + 1)}</span>
      <input type="text" value="${esc(a.titulo)}" data-campo="titulo"
             placeholder="Texto da alínea" aria-label="Texto da alínea">
      <button class="botao-icone" data-subir-alinea="${a.id}"
              ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
      <button class="botao-icone" data-descer-alinea="${a.id}"
              ${i === total - 1 ? 'disabled' : ''} title="Descer">↓</button>
    </div>

    ${usos ? `<div class="aviso-uso">
        <span>⚠️</span>
        <span>${usos} candidato(s) já responderam esta alínea.</span>
      </div>` : ''}

    ${camposEditaveis(a)}

    <div class="alinea-rodape">
      <span class="estado" data-estado>Salvo</span>
      <button class="botao-icone perigo" data-excluir-alinea="${a.id}"
              title="Excluir alínea">🗑️</button>
      <button class="botao botao-principal" data-salvar-alinea="${a.id}">Salvar</button>
    </div>
  </div>`;
}

function cartaoRequisito(r, i, total) {
  const usos = estado.usoPorRequisito.get(r.id) ?? 0;
  const temAlineas = r.alineas.length > 0;

  return `
  <div class="requisito ${temAlineas ? 'com-alineas' : ''}" data-requisito="${r.id}">
    <div class="requisito-topo">
      <span class="ordem">${i + 1}</span>
      <input type="text" value="${esc(r.titulo)}" data-campo="titulo"
             placeholder="Título do requisito" aria-label="Título do requisito">
      <button class="botao-icone" data-subir-req="${r.id}"
              ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
      <button class="botao-icone" data-descer-req="${r.id}"
              ${i === total - 1 ? 'disabled' : ''} title="Descer">↓</button>
    </div>

    ${usos && !temAlineas ? `<div class="aviso-uso">
        <span>⚠️</span>
        <span>${usos} candidato(s) já responderam este requisito. Mudar a
        quantidade de partes ou excluí-lo afeta o que eles já enviaram.</span>
      </div>` : ''}

    ${temAlineas ? `
      <div class="enunciado">
        Este requisito é só o enunciado — quem o candidato preenche são as
        alíneas abaixo, cada uma com os próprios campos.
      </div>
      <div class="lista-alineas">
        ${r.alineas.map((a, k) => cartaoAlinea(a, k, r.alineas.length)).join('')}
      </div>`
    : camposEditaveis(r)}

    <button class="botao-alinea" data-nova-alinea="${r.id}">
      + Adicionar alínea ${temAlineas ? letra(r.alineas.length + 1) : 'a'})
    </button>

    <div class="requisito-rodape" style="margin-top:10px">
      <span class="estado" data-estado>Salvo</span>
      <button class="botao botao-icone perigo" data-excluir-req="${r.id}"
              style="width:32px;height:32px" title="Excluir requisito">🗑️</button>
      <button class="botao botao-principal" data-salvar-req="${r.id}">Salvar</button>
    </div>
  </div>`;
}

/* ----------------------------------------------------- marcar alterações */

/** A alínea é o dono mais próximo; sem ela, o requisito. */
function donoDoCampo(el) {
  return el.closest('.alinea') ?? el.closest('.requisito');
}

function marcarSujo(el) {
  const dono = donoDoCampo(el);
  if (!dono) return;
  dono.classList.add('sujo');
  const estadoEl = dono.querySelector(':scope > .alinea-rodape [data-estado]')
                ?? dono.querySelector(':scope > .requisito-rodape [data-estado]');
  if (estadoEl) estadoEl.textContent = 'Alterações não salvas';
}

/** A dica só faz sentido quando o campo correspondente é pedido. */
const BLOCO_DA_CHAVE = {
  permitir_fotos:   '[data-bloco-foto]',
  exigir_descricao: '[data-bloco-descricao]'
};

function alternarBloco(el) {
  const seletor = BLOCO_DA_CHAVE[el.dataset.campo];
  if (!seletor) return;

  const dono = donoDoCampo(el);
  const bloco = dono?.querySelector(`:scope > .requisito-grade ${seletor}`);
  if (bloco) bloco.hidden = el.value !== 'true';
}

$('#lista-secoes').addEventListener('input', e => {
  if (!e.target.dataset.campo) return;
  marcarSujo(e.target);
});

$('#lista-secoes').addEventListener('change', e => {
  if (!e.target.dataset.campo) return;
  alternarBloco(e.target);
  marcarSujo(e.target);
});

/* título da seção salva ao sair do campo */
$('#lista-secoes').addEventListener('focusout', async e => {
  const id = e.target.dataset?.tituloSecao;
  if (!id) return;

  const titulo = e.target.value.trim();
  const secao = estado.secoes.find(s => s.id === id);
  if (!titulo || titulo === secao.titulo) { e.target.value = secao.titulo; return; }

  const { error } = await sb.from('secoes').update({ titulo }).eq('id', id);
  if (error) { toast(traduzErro(error), 'erro'); e.target.value = secao.titulo; return; }

  secao.titulo = titulo;
  toast('Título da seção salvo.', 'ok');
});

/* =========================================================== AÇÕES */

$('#lista-secoes').addEventListener('click', async e => {
  const alvo = e.target.closest('button');
  if (!alvo) return;
  const d = alvo.dataset;

  if (d.novoRequisito)  return novoRequisito(d.novoRequisito, alvo);
  if (d.salvarReq)      return salvarRequisito(d.salvarReq, alvo);
  if (d.excluirReq)     return excluirRequisito(d.excluirReq);
  if (d.excluirSecao)   return excluirSecao(d.excluirSecao);
  if (d.subirSecao)     return moverSecao(d.subirSecao, -1);
  if (d.descerSecao)    return moverSecao(d.descerSecao, +1);
  if (d.subirReq)       return moverRequisito(d.subirReq, -1);
  if (d.descerReq)      return moverRequisito(d.descerReq, +1);
  if (d.novaAlinea)     return novaAlinea(d.novaAlinea, alvo);
  if (d.salvarAlinea)   return salvarAlinea(d.salvarAlinea, alvo);
  if (d.excluirAlinea)  return excluirAlinea(d.excluirAlinea);
  if (d.subirAlinea)    return moverAlinea(d.subirAlinea, -1);
  if (d.descerAlinea)   return moverAlinea(d.descerAlinea, +1);
});

/* --------------------------------------------------------- seções */

$('#btn-nova-secao').addEventListener('click', async e => {
  ocupado(e.target, true, '+ Adicionar nova seção');

  const romanos = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII',
                   'XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
  const n = estado.secoes.length;

  const { error } = await sb.from('secoes').insert({
    formulario_id: estado.atual.id,
    titulo: `Seção ${romanos[n] ?? n + 1}`,
    ordem: n + 1
  });

  ocupado(e.target, false, '+ Adicionar nova seção');
  if (error) { toast(traduzErro(error), 'erro'); return; }

  await carregarSecoes();
  $('#lista-secoes').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

async function moverSecao(id, passo) {
  const i = estado.secoes.findIndex(s => s.id === id);
  const j = i + passo;
  if (j < 0 || j >= estado.secoes.length) return;

  const a = estado.secoes[i], b = estado.secoes[j];

  await Promise.all([
    sb.from('secoes').update({ ordem: b.ordem }).eq('id', a.id),
    sb.from('secoes').update({ ordem: a.ordem }).eq('id', b.id)
  ]);

  await carregarSecoes();
}

async function excluirSecao(id) {
  const secao = estado.secoes.find(s => s.id === id);
  const respondidos = secao.requisitos
    .reduce((n, r) => n + (estado.usoPorRequisito.get(r.id) ?? 0), 0);

  abrirModal(`
    <div class="modal-topo">
      <h2>Excluir seção</h2><button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Excluir <strong>${esc(secao.titulo)}</strong> e os
      ${secao.requisitos.length} requisito(s) dentro dela?
    </p>
    ${respondidos
      ? `<div class="aviso visivel info" style="margin-top:12px">
           <strong>${respondidos} resposta(s)</strong> de candidatos já existem nesta seção.
           Elas <strong>não serão apagadas</strong> — a seção apenas deixa de aparecer
           para quem ainda não começou. O histórico de quem já preencheu fica guardado.
         </div>`
      : '<div class="aviso visivel info" style="margin-top:12px">Ninguém respondeu nada nesta seção ainda.</div>'}
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar"
              style="background:var(--vermelho)">Excluir seção</button>
    </div>`);

  $('#confirmar').addEventListener('click', async e => {
    ocupado(e.target, true, 'Excluir seção');

    await sb.from('requisitos').update({ ativo: false })
      .in('id', secao.requisitos.map(r => r.id));

    const { error } = await sb.from('secoes').update({ ativo: false }).eq('id', id);

    if (error) { ocupado(e.target, false, 'Excluir seção'); toast(traduzErro(error), 'erro'); return; }

    toast('Seção excluída.', 'ok');
    fecharModal();
    carregarSecoes();
  });
}

/* ------------------------------------------------------ requisitos */

async function novoRequisito(secaoId, botao) {
  ocupado(botao, true, '+ Adicionar requisito');

  const secao = estado.secoes.find(s => s.id === secaoId);

  const { error } = await sb.from('requisitos').insert({
    secao_id: secaoId,
    titulo: 'Novo requisito',
    qtd_partes: 1,
    permitir_fotos: true,
    ordem: secao.requisitos.length + 1
  });

  ocupado(botao, false, '+ Adicionar requisito');
  if (error) { toast(traduzErro(error), 'erro'); return; }

  await carregarSecoes();

  const cartoes = $$(`[data-secao="${secaoId}"] .requisito`);
  const ultimo = cartoes[cartoes.length - 1];
  ultimo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ultimo?.querySelector('[data-campo="titulo"]')?.select();
}

/** Lê só os campos próprios do bloco, ignorando os das alíneas de dentro. */
function lerCampos(cartao, seletorGrade) {
  const ler = campo =>
    cartao.querySelector(`:scope > ${seletorGrade} [data-campo="${campo}"]`)?.value ?? '';

  return {
    qtd_partes: Number(ler('qtd_partes')) || 1,
    exigir_data: ler('exigir_data') === 'true',
    exigir_descricao: ler('exigir_descricao') === 'true',
    permitir_fotos: ler('permitir_fotos') === 'true',
    dica_cumprimento: ler('dica_cumprimento').trim() || null,
    dica_foto: ler('dica_foto').trim() || null
  };
}

/** Pelo menos um dos três campos precisa ser pedido. */
function pedeAlgumCampo(c) {
  return c.exigir_data || c.exigir_descricao || c.permitir_fotos;
}

const AVISO_VAZIO =
  'Marque "Sim" em pelo menos um dos três: data, descrição ou foto. ' +
  'Senão não sobra nada para o candidato preencher.';

async function salvarRequisito(id, botao) {
  const cartao = botao.closest('.requisito');
  const req = estado.secoes.flatMap(s => s.requisitos).find(r => r.id === id);

  const titulo = cartao
    .querySelector(':scope > .requisito-topo [data-campo="titulo"]').value.trim();

  if (!titulo) { toast('O título do requisito é obrigatório.', 'erro'); return; }

  // com alíneas, o requisito guarda apenas o enunciado
  const mudanca = req.alineas.length
    ? { titulo }
    : { titulo, ...lerCampos(cartao, '.requisito-grade') };

  if (!req.alineas.length && !pedeAlgumCampo(mudanca)) {
    toast(AVISO_VAZIO, 'erro');
    return;
  }

  ocupado(botao, true, 'Salvar');

  const { error } = await sb.from('requisitos').update(mudanca).eq('id', id);

  ocupado(botao, false, 'Salvar');
  if (error) { toast(traduzErro(error), 'erro'); return; }

  cartao.classList.remove('sujo');
  cartao.querySelector(':scope > .requisito-rodape [data-estado]').textContent = 'Salvo';
  toast('Requisito salvo.', 'ok');
  Object.assign(req, mudanca);
}

/* ------------------------------------------------------------ alíneas */

async function novaAlinea(requisitoId, botao) {
  const req = estado.secoes.flatMap(s => s.requisitos).find(r => r.id === requisitoId);
  const primeira = req.alineas.length === 0;

  ocupado(botao, true, botao.textContent);

  // Na primeira alínea, os campos que estavam no requisito descem para ela —
  // é o que o administrador acabou de configurar, não se perde.
  const nova = primeira
    ? {
        requisito_id: requisitoId,
        titulo: 'Nova alínea',
        qtd_partes: req.qtd_partes,
        exigir_data: req.exigir_data,
        exigir_descricao: req.exigir_descricao,
        permitir_fotos: req.permitir_fotos,
        dica_cumprimento: req.dica_cumprimento,
        dica_foto: req.dica_foto,
        ordem: 1
      }
    : {
        requisito_id: requisitoId,
        titulo: 'Nova alínea',
        qtd_partes: 1,
        exigir_data: true,
        exigir_descricao: true,
        permitir_fotos: true,
        ordem: req.alineas.length + 1
      };

  const { error } = await sb.from('alineas').insert(nova);

  if (error) { ocupado(botao, false, '+ Adicionar alínea'); toast(traduzErro(error), 'erro'); return; }

  await carregarSecoes();

  const cartoes = $$(`[data-requisito="${requisitoId}"] .alinea`);
  const ultima = cartoes[cartoes.length - 1];
  ultima?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ultima?.querySelector('[data-campo="titulo"]')?.select();

  if (primeira) {
    toast('Alínea a) criada com os campos que estavam no requisito.', 'ok');
  }
}

async function salvarAlinea(id, botao) {
  const cartao = botao.closest('.alinea');
  const titulo = cartao
    .querySelector(':scope > .alinea-topo [data-campo="titulo"]').value.trim();

  if (!titulo) { toast('O texto da alínea é obrigatório.', 'erro'); return; }

  const mudanca = { titulo, ...lerCampos(cartao, '.requisito-grade') };

  if (!pedeAlgumCampo(mudanca)) { toast(AVISO_VAZIO, 'erro'); return; }

  ocupado(botao, true, 'Salvar');

  const { error } = await sb.from('alineas').update(mudanca).eq('id', id);

  ocupado(botao, false, 'Salvar');
  if (error) { toast(traduzErro(error), 'erro'); return; }

  cartao.classList.remove('sujo');
  cartao.querySelector(':scope > .alinea-rodape [data-estado]').textContent = 'Salvo';
  toast('Alínea salva.', 'ok');

  const alinea = estado.secoes.flatMap(s => s.requisitos)
    .flatMap(r => r.alineas).find(a => a.id === id);
  if (alinea) Object.assign(alinea, mudanca);
}

async function excluirAlinea(id) {
  const req = estado.secoes.flatMap(s => s.requisitos)
    .find(r => r.alineas.some(a => a.id === id));
  const alinea = req.alineas.find(a => a.id === id);
  const usos = estado.usoPorAlinea.get(id) ?? 0;

  abrirModal(`
    <div class="modal-topo">
      <h2>Excluir alínea</h2><button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Excluir <strong>${esc(alinea.titulo)}</strong>?
    </p>
    ${usos
      ? `<div class="aviso visivel info" style="margin-top:12px">
           <strong>${usos} candidato(s)</strong> já responderam esta alínea.
           O que enviaram <strong>não será apagado</strong> — ela só deixa de
           aparecer para quem ainda não começou.</div>`
      : '<div class="aviso visivel info" style="margin-top:12px">Ninguém respondeu esta alínea ainda.</div>'}
    ${req.alineas.length === 1
      ? `<div class="aviso visivel info">Era a única alínea. O requisito volta a
         ser preenchido direto, com os campos próprios dele.</div>` : ''}
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar"
              style="background:var(--vermelho)">Excluir</button>
    </div>`);

  $('#confirmar').addEventListener('click', async e => {
    ocupado(e.target, true, 'Excluir');
    const { error } = await sb.from('alineas').update({ ativo: false }).eq('id', id);
    if (error) { ocupado(e.target, false, 'Excluir'); toast(traduzErro(error), 'erro'); return; }
    toast('Alínea excluída.', 'ok');
    fecharModal();
    carregarSecoes();
  });
}

async function moverAlinea(id, passo) {
  const req = estado.secoes.flatMap(s => s.requisitos)
    .find(r => r.alineas.some(a => a.id === id));
  const i = req.alineas.findIndex(a => a.id === id);
  const j = i + passo;
  if (j < 0 || j >= req.alineas.length) return;

  const a = req.alineas[i], b = req.alineas[j];

  await Promise.all([
    sb.from('alineas').update({ ordem: b.ordem }).eq('id', a.id),
    sb.from('alineas').update({ ordem: a.ordem }).eq('id', b.id)
  ]);

  await carregarSecoes();
}

async function excluirRequisito(id) {
  const secao = estado.secoes.find(s => s.requisitos.some(r => r.id === id));
  const req = secao.requisitos.find(r => r.id === id);
  const usos = estado.usoPorRequisito.get(id) ?? 0;

  abrirModal(`
    <div class="modal-topo">
      <h2>Excluir requisito</h2><button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Excluir <strong>${esc(req.titulo)}</strong>?
    </p>
    ${usos
      ? `<div class="aviso visivel info" style="margin-top:12px">
           <strong>${usos} candidato(s)</strong> já responderam este requisito.
           O texto e as fotos deles <strong>não serão apagados</strong>: o requisito
           apenas deixa de aparecer para quem ainda não começou.
         </div>`
      : '<div class="aviso visivel info" style="margin-top:12px">Ninguém respondeu este requisito ainda.</div>'}
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar"
              style="background:var(--vermelho)">Excluir</button>
    </div>`);

  $('#confirmar').addEventListener('click', async e => {
    ocupado(e.target, true, 'Excluir');
    const { error } = await sb.from('requisitos').update({ ativo: false }).eq('id', id);
    if (error) { ocupado(e.target, false, 'Excluir'); toast(traduzErro(error), 'erro'); return; }
    toast('Requisito excluído.', 'ok');
    fecharModal();
    carregarSecoes();
  });
}

async function moverRequisito(id, passo) {
  const secao = estado.secoes.find(s => s.requisitos.some(r => r.id === id));
  const i = secao.requisitos.findIndex(r => r.id === id);
  const j = i + passo;
  if (j < 0 || j >= secao.requisitos.length) return;

  const a = secao.requisitos[i], b = secao.requisitos[j];

  await Promise.all([
    sb.from('requisitos').update({ ordem: b.ordem }).eq('id', a.id),
    sb.from('requisitos').update({ ordem: a.ordem }).eq('id', b.id)
  ]);

  await carregarSecoes();
}

/* --------------------------------- aviso ao sair com coisa não salva */

addEventListener('beforeunload', e => {
  if ($('.requisito.sujo') || $('.alinea.sujo')) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------------------------------------------------------------- início */

(async function iniciar() {
  const perfil = await exigirSessao();
  if (!perfil) return;

  if (perfil.tipo !== 'administrador') {
    document.body.innerHTML =
      '<div class="vazio" style="padding:80px 20px"><span class="simbolo">🔒</span>' +
      'Esta área é exclusiva do administrador.<br>' +
      '<a href="inicio.html" class="link">Voltar ao início</a></div>';
    return;
  }

  await montarBarra(perfil);
  carregarFormularios();
})();
