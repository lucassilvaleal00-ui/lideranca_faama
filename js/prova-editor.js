/* =====================================================================
   Editor da Prova PDL — só administrador.

   A prova fica ao lado da pasta de Líder de Jovens, sempre aberta. Ela
   não tranca nada: o candidato faz quando quiser e repete quantas vezes
   precisar até alcançar a nota mínima.

   Uma coisa importante sobre o gabarito: a alternativa correta fica
   guardada numa tabela que só o administrador enxerga. O candidato lê as
   alternativas por uma vista que não tem essa coluna, e a correção é
   feita no banco. Nem abrindo o código-fonte dá para ver a resposta.

   Salvamento automático, como no editor de requisitos.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, $, $$ } from './ui.js';
import { criarAutoSalvar } from './autosalvar.js';

const estado = { prova: null, questoes: [] };

const letra = n => String.fromCharCode(96 + n);

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

/* ------------------------------------------------- salvamento automático */

const auto = criarAutoSalvar({
  painel: $('#auto-salvar'),
  salvar: async chave => {
    if (chave === 'prova') return gravarProva();
    const [, id] = chave.split(':');
    return gravarQuestao(id);
  }
});

async function recarregar() {
  await auto.agora();
  await carregar();
}

/* =============================================================== CARGA */

async function carregar() {
  const { data, error } = await sb
    .from('provas')
    .select('*, formulario:formularios(id, nome, chave), questoes(*, alternativas(*))')
    .limit(1)
    .maybeSingle();

  if (error) { toast(traduzErro(error), 'erro'); return; }

  if (!data) {
    $('#lista-questoes').innerHTML =
      `<div class="vazio"><span class="simbolo">⚠️</span>
       A prova ainda não foi criada no banco.<br>
       Rode o arquivo <strong>08_prova_pdl.sql</strong> no Supabase.</div>`;
    return;
  }

  estado.prova = data;
  estado.questoes = (data.questoes ?? [])
    .filter(q => q.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map(q => ({ ...q, alternativas: (q.alternativas ?? []).sort((a, b) => a.ordem - b.ordem) }));

  $('#sub-prova').textContent = `Pasta de ${data.formulario?.nome ?? '—'}`;
  $('#p-texto').value = data.texto_topo ?? '';
  $('#p-nota').value  = data.nota_minima ?? 7;

  desenharQuestoes();
  resumir();
}

function resumir() {
  const semGabarito = estado.questoes.filter(q => !q.alternativas.some(a => a.correta)).length;
  const curtas = estado.questoes.filter(q => q.alternativas.length < 2).length;

  const problemas = [];
  if (!estado.questoes.length) problemas.push('a prova ainda não tem questões');
  if (semGabarito) problemas.push(`${semGabarito} questão(ões) sem alternativa correta marcada`);
  if (curtas) problemas.push(`${curtas} questão(ões) com menos de duas alternativas`);

  const caixa = $('#resumo-prova');

  if (problemas.length) {
    caixa.className = 'aviso visivel erro';
    caixa.innerHTML = `<strong>A prova ainda não pode ser feita:</strong> ` +
      esc(problemas.join('; ')) + '.';
    return;
  }

  caixa.className = 'aviso visivel info';
  caixa.innerHTML =
    `${estado.questoes.length} questão(ões), disponíveis para todos os
     candidatos inscritos na pasta. Aprovação com nota
     <strong>${esc(String(estado.prova.nota_minima))}</strong> ou mais, em
     quantas tentativas forem necessárias.`;
}

/* ============================================================= DESENHO */

function desenharQuestoes() {
  const alvo = $('#lista-questoes');

  if (!estado.questoes.length) {
    alvo.innerHTML = `
      <div class="vazio" style="background:var(--branco);border:1px solid var(--borda);
                                border-radius:var(--raio);margin-bottom:16px">
        <span class="simbolo">❓</span>
        Nenhuma questão ainda.<br>Comece criando a primeira abaixo.
      </div>`;
    return;
  }

  alvo.innerHTML = estado.questoes.map((q, i) => cartaoQuestao(q, i)).join('');
}

function cartaoQuestao(q, i) {
  const total = estado.questoes.length;

  return `
  <section class="questao" data-questao="${q.id}">
    <div class="questao-topo">
      <span class="ordem">${i + 1}</span>
      <textarea data-campo="enunciado" rows="2"
                placeholder="Escreva a pergunta">${esc(q.enunciado ?? '')}</textarea>
      <button class="botao-icone" data-subir="${q.id}" ${i === 0 ? 'disabled' : ''}
              title="Subir">↑</button>
      <button class="botao-icone" data-descer="${q.id}" ${i === total - 1 ? 'disabled' : ''}
              title="Descer">↓</button>
      <button class="botao-icone perigo" data-excluir="${q.id}" title="Excluir questão">🗑️</button>
    </div>

    <div class="alternativas">
      ${q.alternativas.map((a, k) => `
        <div class="alternativa ${a.correta ? 'certa' : ''}" data-alternativa="${a.id}">
          <label class="marca-certa" title="Marcar como alternativa correta">
            <input type="radio" name="certa-${q.id}" data-campo="correta"
                   ${a.correta ? 'checked' : ''}>
            <span class="letra">${letra(k + 1)}</span>
          </label>
          <input type="text" data-campo="texto" value="${esc(a.texto ?? '')}"
                 placeholder="Texto da alternativa ${letra(k + 1)})">
          <button class="botao-icone perigo" data-tirar-alt="${a.id}"
                  title="Remover alternativa">×</button>
        </div>`).join('')}
    </div>

    ${q.alternativas.some(a => a.correta) ? '' : `
      <div class="aviso-uso">
        <span>⚠️</span>
        <span>Nenhuma alternativa foi marcada como correta. Clique na letra
        da alternativa certa.</span>
      </div>`}

    <div class="questao-rodape">
      <span class="estado" data-estado>Salvo</span>
      <button class="botao-alinea" data-nova-alt="${q.id}">
        + Adicionar alternativa ${letra(q.alternativas.length + 1)})
      </button>
    </div>
  </section>`;
}

/* ============================================================== GRAVAR */

function pintar(cartao, texto, classe = '') {
  if (!cartao) return;
  cartao.classList.remove('sujo', 'salvando', 'com-erro');
  if (classe) cartao.classList.add(classe);
  const el = cartao.querySelector('[data-estado]');
  if (el) el.textContent = texto;
}

async function gravarProva() {
  const texto = $('#p-texto').value.trim() || null;
  const nota  = Number($('#p-nota').value);

  if (!(nota > 0 && nota <= 10)) throw new Error('a nota mínima precisa ficar entre 1 e 10');

  const mudanca = { texto_topo: texto, nota_minima: nota };

  const { error } = await sb.from('provas').update(mudanca).eq('id', estado.prova.id);
  if (error) throw new Error(traduzErro(error));

  Object.assign(estado.prova, mudanca);
  resumir();
}

async function gravarQuestao(id) {
  const cartao = $(`[data-questao="${id}"]`);
  const questao = estado.questoes.find(q => q.id === id);
  if (!cartao || !questao) return;

  pintar(cartao, 'Salvando…', 'salvando');

  const enunciado = cartao.querySelector('[data-campo="enunciado"]').value.trim();

  if (!enunciado) {
    pintar(cartao, 'Falta a pergunta', 'com-erro');
    throw new Error('uma questão está sem enunciado');
  }

  const { error } = await sb.from('questoes').update({ enunciado }).eq('id', id);
  if (error) { pintar(cartao, 'Não salvou', 'com-erro'); throw new Error(traduzErro(error)); }
  questao.enunciado = enunciado;

  // alternativas: texto e qual é a correta
  for (const linha of $$('.alternativa', cartao)) {
    const altId = linha.dataset.alternativa;
    const alt = questao.alternativas.find(a => a.id === altId);
    if (!alt) continue;

    const mudanca = {
      texto: linha.querySelector('[data-campo="texto"]').value.trim(),
      correta: linha.querySelector('[data-campo="correta"]').checked
    };

    if (mudanca.texto === alt.texto && mudanca.correta === alt.correta) continue;

    const { error: erroAlt } = await sb.from('alternativas').update(mudanca).eq('id', altId);
    if (erroAlt) { pintar(cartao, 'Não salvou', 'com-erro'); throw new Error(traduzErro(erroAlt)); }

    Object.assign(alt, mudanca);
  }

  pintar(cartao, 'Salvo');
  resumir();
}

/* ============================================================== EVENTOS */

$$('[data-prova]').forEach(campo => {
  campo.addEventListener('input', () => auto.agendar('prova'));
  campo.addEventListener('change', () => auto.agendar('prova'));
});

$('#lista-questoes').addEventListener('input', e => {
  const cartao = e.target.closest('[data-questao]');
  if (!cartao || !e.target.dataset.campo) return;
  pintar(cartao, 'Alterações não salvas', 'sujo');
  auto.agendar(`q:${cartao.dataset.questao}`);
});

$('#lista-questoes').addEventListener('change', e => {
  const cartao = e.target.closest('[data-questao]');
  if (!cartao || !e.target.dataset.campo) return;

  if (e.target.dataset.campo === 'correta') {
    $$('.alternativa', cartao).forEach(l =>
      l.classList.toggle('certa', l.querySelector('[data-campo="correta"]').checked));
  }

  pintar(cartao, 'Alterações não salvas', 'sujo');
  auto.agendar(`q:${cartao.dataset.questao}`);
});

$('#lista-questoes').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;

  if (d.novaAlt)    return novaAlternativa(d.novaAlt, b);
  if (d.tirarAlt)   return removerAlternativa(d.tirarAlt);
  if (d.excluir)    return excluirQuestao(d.excluir);
  if (d.subir)      return mover(d.subir, -1);
  if (d.descer)     return mover(d.descer, +1);
});

/* --------------------------------------------------------- questões */

$('#btn-nova-questao').addEventListener('click', async e => {
  const texto = e.target.textContent;
  ocupado(e.target, true, texto);
  await auto.agora();

  const { data, error } = await sb.from('questoes').insert({
    prova_id: estado.prova.id,
    enunciado: '',
    ordem: estado.questoes.length + 1
  }).select('id').single();

  if (error) { ocupado(e.target, false, texto); toast(traduzErro(error), 'erro'); return; }

  // toda questão nasce com duas alternativas, que é o mínimo útil
  await sb.from('alternativas').insert([
    { questao_id: data.id, texto: '', ordem: 1 },
    { questao_id: data.id, texto: '', ordem: 2 }
  ]);

  ocupado(e.target, false, texto);
  await carregar();

  const novo = $(`[data-questao="${data.id}"]`);
  novo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  novo?.querySelector('[data-campo="enunciado"]')?.focus();
});

async function mover(id, passo) {
  const i = estado.questoes.findIndex(q => q.id === id);
  const j = i + passo;
  if (j < 0 || j >= estado.questoes.length) return;

  await auto.agora();

  const a = estado.questoes[i], b = estado.questoes[j];

  await Promise.all([
    sb.from('questoes').update({ ordem: b.ordem }).eq('id', a.id),
    sb.from('questoes').update({ ordem: a.ordem }).eq('id', b.id)
  ]);

  await carregar();
}

function excluirQuestao(id) {
  const q = estado.questoes.find(x => x.id === id);
  const numero = estado.questoes.indexOf(q) + 1;

  abrirModal(`
    <div class="modal-topo">
      <h2>Excluir questão</h2><button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Excluir a questão <strong>${numero}</strong>?
    </p>
    <div class="aviso visivel info" style="margin-top:12px">
      As provas que já foram feitas continuam guardadas com a nota que
      tiraram. A questão só deixa de aparecer daqui em diante.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar"
              style="background:var(--vermelho)">Excluir</button>
    </div>`);

  $('#confirmar').addEventListener('click', async e => {
    ocupado(e.target, true, 'Excluir');
    auto.descartar(`q:${id}`);

    const { error } = await sb.from('questoes').update({ ativo: false }).eq('id', id);
    if (error) { ocupado(e.target, false, 'Excluir'); toast(traduzErro(error), 'erro'); return; }

    toast('Questão excluída.', 'ok');
    fecharModal();
    await recarregar();
  });
}

/* ----------------------------------------------------- alternativas */

async function novaAlternativa(questaoId, botao) {
  const q = estado.questoes.find(x => x.id === questaoId);
  if (q.alternativas.length >= 8) {
    toast('Oito alternativas já é bastante para uma questão.', 'erro');
    return;
  }

  const texto = botao.textContent;
  ocupado(botao, true, texto);
  await auto.agora();

  const { error } = await sb.from('alternativas').insert({
    questao_id: questaoId, texto: '', ordem: q.alternativas.length + 1
  });

  ocupado(botao, false, texto);
  if (error) { toast(traduzErro(error), 'erro'); return; }

  await carregar();
}

async function removerAlternativa(id) {
  const q = estado.questoes.find(x => x.alternativas.some(a => a.id === id));
  if (q.alternativas.length <= 2) {
    toast('Uma questão precisa de pelo menos duas alternativas.', 'erro');
    return;
  }

  await auto.agora();

  const { error } = await sb.from('alternativas').delete().eq('id', id);
  if (error) { toast(traduzErro(error), 'erro'); return; }

  // renumera as que sobraram, para as letras não pularem
  const restantes = q.alternativas.filter(a => a.id !== id);
  await Promise.all(restantes.map((a, k) =>
    sb.from('alternativas').update({ ordem: k + 1 }).eq('id', a.id)));

  await carregar();
}

/* ------------------------------------------------------ fechar */

addEventListener('beforeunload', e => {
  if (auto.temPendencia()) { e.preventDefault(); e.returnValue = ''; }
});

$('#btn-fechar-prova').addEventListener('click', async e => {
  const texto = e.target.textContent;
  ocupado(e.target, true, texto);

  const tudoCerto = await auto.agora();

  ocupado(e.target, false, texto);

  if (!tudoCerto) {
    toast('Ainda há algo que não foi salvo. Veja o aviso em vermelho no topo.', 'erro');
    $('#auto-salvar').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  toast('Prova salva.', 'ok');
  location.href = 'inicio.html';
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
  auto.iniciar();
  carregar();
})();
