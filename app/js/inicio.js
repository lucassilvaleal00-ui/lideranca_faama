/* =====================================================================
   Tela inicial.

   Os cards mostram o progresso DO PRÓPRIO usuário logado — administrador
   e revisor também fazem suas pastas de liderança.

   Regra do progresso (decisão 7):
     x/y      = requisitos APROVADOS pelo revisor / total de requisitos
     a barra  = essa mesma proporção em porcentagem
   Está tudo em um lugar só: a função progresso() logo abaixo.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, $ } from './ui.js';

const CATEGORIAS = [
  { chave: 'aventureiros',  titulo: 'Aventureiros'      },
  { chave: 'desbravadores', titulo: 'Desbravadores'     },
  { chave: 'jovens',        titulo: 'Jovens Adventistas'}
];

/* ------------------------------------------------- a fórmula do progresso */

function progresso(linha) {
  return {
    feito: linha.aprovados,
    total: linha.total,
    pct:   Number(linha.percentual) || 0,
    emAnalise: linha.concluidos - linha.aprovados
  };
}

/* --------------------------------------------------------------- cards */

function cardClasse(categoria, linhas) {
  const classes = linhas.map(l => {
    const p = progresso(l);
    const temPasta = !!l.pasta_id;

    let etiqueta = '';
    let acao = '';

    if (!temPasta) {
      etiqueta = '<span class="etiqueta sem">Sem acesso</span>';
      acao = `<button class="botao botao-vazado" data-inscrever="${l.formulario_id}">
                Inscrever-me</button>`;
    } else if (l.pasta_status === 'solicitada') {
      etiqueta = '<span class="etiqueta aguardando">Aguardando liberação</span>';
    } else if (l.pasta_status === 'aprovada') {
      etiqueta = '<span class="etiqueta aprovada">Cartão aprovado</span>';
      acao = `<button class="botao botao-vazado" data-abrir="${l.pasta_id}">Ver pasta</button>`;
    } else {
      etiqueta = p.emAnalise > 0
        ? `<span class="etiqueta aguardando">${p.emAnalise} em análise</span>`
        : '<span class="etiqueta ativa">Em andamento</span>';
      acao = `<button class="botao botao-principal" data-abrir="${l.pasta_id}">Abrir pasta</button>`;
    }

    return `
      <div class="classe">
        <div class="classe-topo">
          <span class="classe-nome">${esc(l.formulario)}</span>
          ${temPasta && l.pasta_status !== 'solicitada'
            ? `<span class="classe-conta">${p.feito}/${p.total}</span>` : ''}
        </div>
        ${temPasta && l.pasta_status !== 'solicitada'
          ? `<div class="trilho"><i style="width:${p.pct}%"></i></div>` : ''}
        <div class="classe-rodape">${etiqueta}${acao}</div>
      </div>`;
  }).join('');

  return `
    <section class="card">
      <div class="card-topo ${categoria.chave}">${esc(categoria.titulo)}</div>
      <div class="card-corpo">${classes}</div>
    </section>`;
}

/* ---------------------------------------------------------- ferramentas */

const FERRAMENTAS = [
  { id: 'pastas', simbolo: '🗂️', titulo: 'Gerenciador de pastas',
    texto: 'Acompanhe seus candidatos e avalie os requisitos enviados.',
    destino: 'pastas.html', perfis: ['administrador', 'revisor'] },

  { id: 'graficos', simbolo: '📊', titulo: 'Gráficos gerais',
    texto: 'Total de candidatos e distribuição por pasta.',
    destino: 'graficos.html', perfis: ['administrador'] },

  { id: 'editor', simbolo: '📝', titulo: 'Editor de requisitos',
    texto: 'Crie e edite as seções e os requisitos dos 5 formulários.',
    destino: 'editor.html', perfis: ['administrador'] },

  { id: 'admin', simbolo: '⚙️', titulo: 'Painel do Administrador',
    texto: 'Cadastros, turmas, pedidos de acesso e atribuição de pastas.',
    destino: 'admin.html', perfis: ['administrador'] }
];

function montarFerramentas(tipo) {
  const disponiveis = FERRAMENTAS.filter(f => f.perfis.includes(tipo));
  if (!disponiveis.length) return;

  $('#grade-ferramentas').innerHTML = disponiveis.map(f => `
    <button class="ferramenta" data-destino="${f.destino}">
      <span class="simbolo">${f.simbolo}</span>
      <span>
        <h3>${esc(f.titulo)}</h3>
        <p>${esc(f.texto)}</p>
      </span>
    </button>
  `).join('');

  $('#bloco-ferramentas').hidden = false;

  $('#grade-ferramentas').addEventListener('click', e => {
    const b = e.target.closest('[data-destino]');
    if (b) location.href = b.dataset.destino;
  });
}

/* ------------------------------------------------------------ inscrição */

async function solicitarInscricao(formularioId, botao) {
  botao.disabled = true;
  const texto = botao.textContent;
  botao.innerHTML = '<span class="girando"></span>';

  const { data: { user } } = await sb.auth.getUser();

  const { error } = await sb.from('pastas').insert({
    candidato_id: user.id,
    formulario_id: formularioId,
    status: 'solicitada'
  });

  if (error) {
    botao.disabled = false;
    botao.textContent = texto;
    toast(traduzErro(error), 'erro');
    return;
  }

  toast('Solicitação enviada. Seu nome será avaliado para aprovação.', 'ok');
  carregar();
}

/* ---------------------------------------------------------------- carga */

async function carregar() {
  const { data, error } = await sb.rpc('meu_progresso');

  if (error) {
    $('#grade-classes').innerHTML =
      `<div class="vazio"><span class="simbolo">⚠️</span>${esc(traduzErro(error))}</div>`;
    return;
  }

  $('#grade-classes').innerHTML = CATEGORIAS.map(c =>
    cardClasse(c, data.filter(l => l.categoria === c.chave))
  ).join('');

  $('#grade-classes').addEventListener('click', e => {
    const inscrever = e.target.closest('[data-inscrever]');
    if (inscrever) { solicitarInscricao(inscrever.dataset.inscrever, inscrever); return; }

    const abrir = e.target.closest('[data-abrir]');
    if (abrir) location.href = `pasta.html?id=${abrir.dataset.abrir}`;
  });
}

/* ---------------------------------------------------------------- início */

(async function iniciar() {
  const perfil = await exigirSessao();
  if (!perfil) return;

  await montarBarra(perfil);

  const primeiroNome = perfil.nome.trim().split(/\s+/)[0];
  const hora = new Date().getHours();
  const cumprimento = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  $('#saudacao').textContent = `${cumprimento}, ${primeiroNome}`;
  $('#saudacao-sub').textContent = perfil.tipo === 'candidato'
    ? 'Acompanhe aqui o andamento dos seus cartões de liderança.'
    : 'Acompanhe seus cartões e use as ferramentas abaixo.';

  montarFerramentas(perfil.tipo);
  carregar();
})();
