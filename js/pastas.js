/* =====================================================================
   Gerenciador de Pastas — administrador e revisor.

   O RLS já faz o recorte sozinho: o administrador enxerga todas as
   pastas, o revisor só as dos candidatos atribuídos a ele. Esta tela não
   precisa filtrar nada por perfil — se o banco devolveu, é porque pode ver.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, dataBR, quandoFoi, $, $$ } from './ui.js';

const estado = {
  eu: null, vista: 'avaliar',
  pastas: [], candidatos: [], contagens: new Map()
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
  caixa.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharModal));
  return caixa;
}
function fecharModal() { $('#fundo-modal').classList.remove('aberto'); }

$('#fundo-modal').addEventListener('click', e => {
  if (e.target.id === 'fundo-modal') fecharModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function vazio(simbolo, texto) {
  return `<div class="vazio" style="background:var(--branco);border:1px solid var(--borda);
                                    border-radius:var(--raio)">
    <span class="simbolo">${simbolo}</span>${texto}</div>`;
}

/* =============================================================== CARGA */

async function carregar() {
  const [pa, ca, re] = await Promise.all([
    sb.from('pastas')
      .select(`*,
               formulario:formularios(nome, categoria),
               candidato:perfis!pastas_candidato_id_fkey(id, nome, turma:turmas(nome))`)
      .order('criado_em', { ascending: false }),

    sb.from('perfis')
      .select('*, turma:turmas(nome)')
      .eq('tipo', 'candidato')
      .order('nome'),

    sb.from('respostas').select('pasta_id, status')
  ]);

  if (pa.error) { $('#area').innerHTML = vazio('⚠️', esc(traduzErro(pa.error))); return; }

  estado.pastas     = pa.data ?? [];
  estado.candidatos = ca.data ?? [];

  // quantos requisitos aguardando avaliação em cada pasta
  estado.contagens = new Map();
  for (const r of re.data ?? []) {
    const c = estado.contagens.get(r.pasta_id) ??
              { concluidos: 0, aprovados: 0, total: 0 };
    c.total++;
    if (r.status === 'concluido') c.concluidos++;
    if (r.status === 'aprovado')  c.aprovados++;
    estado.contagens.set(r.pasta_id, c);
  }

  atualizarContadores();
  desenhar();
}

const paraAvaliar   = () => estado.pastas.filter(p =>
  p.status === 'ativa' && (estado.contagens.get(p.id)?.concluidos ?? 0) > 0);
const solicitacoes  = () => estado.pastas.filter(p => p.status === 'solicitada');
const aprovadas     = () => estado.pastas.filter(p => p.status === 'aprovada');

function atualizarContadores() {
  const põe = (id, n) => { $(id).textContent = n || ''; };
  põe('#c-avaliar', paraAvaliar().length);
  põe('#c-solicitacoes', solicitacoes().length);
  põe('#c-candidatos', estado.candidatos.length);
  põe('#c-aprovados', aprovadas().length);
}

/* ============================================================= DESENHO */

function linhaPessoa(candidato) {
  return `
  <div class="pessoa-linha">
    <span class="mini-avatar">${esc(iniciais(candidato?.nome))}</span>
    <div>
      <strong>${esc(candidato?.nome ?? '—')}</strong>
      <small>${candidato?.turma ? esc(candidato.turma.nome) : 'sem turma informada'}</small>
    </div>
  </div>`;
}

function desenhar() {
  const area = $('#area');

  if (estado.vista === 'avaliar') {
    const lista = paraAvaliar();

    area.innerHTML = lista.length
      ? `<div class="grade-pastas">${lista.map(p => {
          const c = estado.contagens.get(p.id);
          return `
          <article class="cartao-pasta">
            <div class="nome-pasta">${esc(p.formulario.nome)}</div>
            ${linhaPessoa(p.candidato)}
            <div class="rodape">
              <span class="info">
                <span class="destaque">${c.concluidos}</span>
                requisito(s) aguardando você
              </span>
              <button class="botao botao-principal" data-abrir="${p.id}">Acessar pasta</button>
            </div>
          </article>`;
        }).join('')}</div>`
      : vazio('☕', 'Nada para avaliar agora.<br>Quando alguém marcar um requisito como concluído, ele aparece aqui.');
    return;
  }

  if (estado.vista === 'solicitacoes') {
    const lista = solicitacoes();

    area.innerHTML = lista.length
      ? `<div class="grade-pastas">${lista.map(p => `
          <article class="cartao-pasta solicitada">
            <div class="nome-pasta">${esc(p.formulario.nome)}</div>
            ${linhaPessoa(p.candidato)}
            <div class="rodape">
              <span class="info">Pediu inscrição ${quandoFoi(p.criado_em)}</span>
              <button class="botao botao-vazado" data-recusar="${p.id}">Recusar</button>
              <button class="botao botao-principal" data-liberar="${p.id}">Liberar</button>
            </div>
          </article>`).join('')}</div>`
      : vazio('✋', 'Nenhuma solicitação de pasta pendente.');
    return;
  }

  if (estado.vista === 'candidatos') {
    area.innerHTML = estado.candidatos.length
      ? `<div class="grade-pastas">${estado.candidatos.map(c => {
          const pastas = estado.pastas.filter(p => p.candidato_id === c.id);
          return `
          <article class="cartao-pasta" style="border-left-color:var(--borda)">
            ${linhaPessoa(c)}
            ${pastas.length
              ? pastas.map(p => {
                  const q = estado.contagens.get(p.id) ?? { aprovados: 0, total: 0 };
                  return `
                  <div class="rodape" style="border-top:1px solid var(--borda)">
                    <span class="info">
                      ${esc(p.formulario.nome)}
                      ${p.status === 'solicitada'
                        ? ' · <em>aguardando liberação</em>'
                        : ` · ${q.aprovados} aprovado(s)`}
                    </span>
                    ${p.status === 'solicitada' ? ''
                      : `<button class="botao botao-vazado" data-abrir="${p.id}">Abrir</button>`}
                  </div>`;
                }).join('')
              : '<div class="rodape"><span class="info">Nenhuma pasta atribuída ainda.</span></div>'}
          </article>`;
        }).join('')}</div>`
      : vazio('👥', estado.eu.tipo === 'revisor'
          ? 'Nenhum candidato foi atribuído a você ainda.<br>O administrador faz isso no painel dele.'
          : 'Nenhum candidato cadastrado ainda.');
    return;
  }

  if (estado.vista === 'aprovados') {
    const lista = aprovadas();

    area.innerHTML = lista.length
      ? `<div class="grade-pastas">${lista.map(p => `
          <article class="cartao-pasta aprovada">
            <div class="nome-pasta">${esc(p.formulario.nome)}</div>
            ${linhaPessoa(p.candidato)}
            <div class="rodape">
              <span class="info">Aprovado em ${dataBR(p.aprovada_em ?? p.criado_em)}</span>
              <button class="botao botao-vazado" data-abrir="${p.id}">Ver pasta</button>
            </div>
          </article>`).join('')}</div>`
      : vazio('🏅', 'Nenhum cartão aprovado por completo ainda.');
  }
}

/* ============================================================== EVENTOS */

$('#nav').addEventListener('click', e => {
  const b = e.target.closest('[data-vista]');
  if (!b) return;

  estado.vista = b.dataset.vista;
  $$('.nav-item').forEach(n => n.classList.toggle('ativo', n === b));
  desenhar();
});

$('#area').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;

  if (b.dataset.abrir)   { location.href = `pasta.html?id=${b.dataset.abrir}`; return; }
  if (b.dataset.liberar) return liberar(b.dataset.liberar, b);
  if (b.dataset.recusar) return modalRecusar(b.dataset.recusar);
});

async function liberar(pastaId, botao) {
  ocupado(botao, true, 'Liberar');

  const { error } = await sb.from('pastas')
    .update({ status: 'ativa', atribuida_por: estado.eu.id, atribuida_em: new Date() })
    .eq('id', pastaId);

  if (error) { ocupado(botao, false, 'Liberar'); toast(traduzErro(error), 'erro'); return; }

  toast('Pasta liberada. O candidato já pode começar.', 'ok');
  carregar();
}

function modalRecusar(pastaId) {
  const pasta = estado.pastas.find(p => p.id === pastaId);

  abrirModal(`
    <div class="modal-topo">
      <h2>Recusar solicitação</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Recusar o pedido de <strong>${esc(pasta.candidato.nome)}</strong> para
      a pasta <strong>${esc(pasta.formulario.nome)}</strong>?
    </p>
    <div class="aviso visivel info" style="margin-top:12px">
      O pedido some da lista. O candidato pode solicitar de novo pela tela
      inicial dele, então isto não bloqueia ninguém em definitivo.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar"
              style="background:var(--vermelho)">Recusar</button>
    </div>`);

  $('#confirmar').addEventListener('click', async e => {
    ocupado(e.target, true, 'Recusar');

    const { error } = await sb.from('pastas').delete().eq('id', pastaId);

    if (error) { ocupado(e.target, false, 'Recusar'); toast(traduzErro(error), 'erro'); return; }

    toast('Solicitação recusada.', 'ok');
    fecharModal();
    carregar();
  });
}

/* ---------------------------------------------------------------- início */

(async function iniciar() {
  const perfil = await exigirSessao();
  if (!perfil) return;

  if (!['administrador', 'revisor'].includes(perfil.tipo)) {
    document.body.innerHTML =
      '<div class="vazio" style="padding:80px 20px"><span class="simbolo">🔒</span>' +
      'Esta área é para administradores e revisores.<br>' +
      '<a href="inicio.html" class="link">Voltar ao início</a></div>';
    return;
  }

  estado.eu = perfil;
  await montarBarra(perfil);
  carregar();
})();
