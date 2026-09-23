/* =====================================================================
   Prova PDL — tela do candidato.

   Regras, todas garantidas pelo banco (esta tela só as explica):
     · a prova abre na data marcada pelo administrador;
     · vale uma tentativa — a segunda depende de um pedido aprovado;
     · a correção acontece no servidor, não aqui;
     · aprovado é quem tira a nota mínima ou mais;
     · quem passa baixa o certificado quantas vezes quiser.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, $, $$ } from './ui.js';

const estado = { eu: null, prova: null, situacao: null, questoes: [], formularioId: null };

const letra = n => String.fromCharCode(96 + n);

const quando = iso => iso
  ? new Date(iso).toLocaleString('pt-BR',
      { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const nota = n => Number(n).toFixed(1).replace('.', ',');

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

/* =============================================================== CARGA */

async function carregar() {
  const { data: form, error: erroForm } = await sb
    .from('formularios').select('id, nome').eq('chave', 'lider_jovens').single();

  if (erroForm) { falhar(traduzErro(erroForm)); return; }

  estado.formularioId = form.id;
  $('#sub-prova').textContent = `Pasta de ${form.nome}`;

  const { data: situacao, error } = await sb.rpc('estado_prova', { p_formulario: form.id });
  if (error) { falhar(traduzErro(error)); return; }

  estado.situacao = situacao;

  if (!situacao?.existe) { falhar('Esta pasta não tem prova cadastrada.'); return; }

  $('#titulo-prova').textContent = situacao.titulo ?? 'Prova PDL';

  // os dados do certificado ficam na própria prova
  const { data: prova } = await sb.from('provas')
    .select('id, certificado_path, cert_nome_y, cert_nome_tamanho')
    .eq('id', situacao.prova_id).single();

  estado.prova = prova ?? null;

  desenhar();
}

function falhar(texto) {
  $('#conteudo-prova').innerHTML =
    `<div class="vazio"><span class="simbolo">⚠️</span>${esc(texto)}</div>`;
}

async function carregarQuestoes() {
  const { data: questoes, error } = await sb.from('questoes')
    .select('id, enunciado, ordem')
    .eq('prova_id', estado.situacao.prova_id)
    .eq('ativo', true)
    .order('ordem');

  if (error) throw new Error(traduzErro(error));

  const ids = (questoes ?? []).map(q => q.id);
  if (!ids.length) { estado.questoes = []; return; }

  /* A vista alternativas_visiveis não traz a coluna do gabarito — é de
     propósito: a resposta certa nunca chega ao navegador. */
  const { data: alternativas, error: erroAlt } = await sb.from('alternativas_visiveis')
    .select('id, questao_id, texto, ordem')
    .in('questao_id', ids)
    .order('ordem');

  if (erroAlt) throw new Error(traduzErro(erroAlt));

  const porQuestao = new Map();
  for (const a of alternativas ?? []) {
    if (!porQuestao.has(a.questao_id)) porQuestao.set(a.questao_id, []);
    porQuestao.get(a.questao_id).push(a);
  }

  estado.questoes = questoes.map(q => ({ ...q, alternativas: porQuestao.get(q.id) ?? [] }));
}

/* ============================================================= DESENHO */

function desenhar() {
  const s = estado.situacao;
  const alvo = $('#conteudo-prova');

  if (s.aprovado)            return alvo.innerHTML = telaAprovado();
  if (!s.exigida)            return alvo.innerHTML = telaSemQuestoes();
  if (!s.liberada)           return alvo.innerHTML = telaAguardandoData();
  if (s.usadas < s.permitidas) return abrirProva();

  alvo.innerHTML = telaReprovado();
}

function telaSemQuestoes() {
  return `
  <section class="bloco">
    <h2>Prova ainda não montada</h2>
    <p class="dica-campo">
      O administrador ainda não cadastrou as questões. Enquanto isso, a
      pasta de Líder de Jovens continua liberada normalmente.
    </p>
    <button class="botao botao-vazado" id="ir-inicio" style="width:auto;padding:11px 20px">
      Voltar ao início</button>
  </section>`;
}

function telaAguardandoData() {
  const s = estado.situacao;
  return `
  <section class="bloco">
    <h2>A prova ainda não abriu</h2>
    <p class="dica-campo" style="margin-bottom:14px">
      ${s.disponivel_em
        ? `Ela fica disponível a partir de <strong>${esc(quando(s.disponivel_em))}</strong>.`
        : 'A data de abertura ainda não foi definida pelo administrador.'}
    </p>
    <div class="aviso visivel info">
      São ${s.questoes} questão(ões) de múltipla escolha. É preciso tirar
      <strong>${esc(nota(s.nota_minima))}</strong> ou mais para liberar os
      requisitos da pasta de Líder de Jovens.
    </div>
  </section>`;
}

function telaAprovado() {
  const s = estado.situacao;
  const u = s.ultima;

  return `
  <section class="bloco resultado aprovado">
    <div class="selo-resultado">🎓</div>
    <h2 style="justify-content:center">Aprovado na prova PDL</h2>
    ${u ? `<p class="nota-grande">${esc(nota(u.nota))}</p>
           <p class="dica-campo" style="text-align:center">
             ${u.acertos} de ${u.total} questões · ${esc(quando(u.enviada_em))}</p>` : ''}

    <div class="aviso visivel info" style="margin-top:14px">
      A pasta de <strong>Líder de Jovens</strong> está liberada. Você já pode
      preencher os requisitos.
    </div>

    <div class="acoes-resultado">
      ${s.tem_certificado
        ? '<button class="botao botao-dourado" id="btn-certificado">🎓 Baixar certificado</button>'
        : `<div class="dica-campo">O modelo do certificado ainda não foi enviado
             pelo administrador. Assim que for, o botão de download aparece aqui.</div>`}
      <button class="botao botao-principal" id="ir-pasta">Ir para a pasta</button>
    </div>
  </section>`;
}

function telaReprovado() {
  const s = estado.situacao;
  const u = s.ultima;
  const pedidoPendente = s.pedido?.status === 'pendente';

  return `
  <section class="bloco resultado reprovado">
    <div class="selo-resultado">📄</div>
    <h2 style="justify-content:center">Prova não alcançou a nota mínima</h2>
    ${u ? `<p class="nota-grande">${esc(nota(u.nota))}</p>
           <p class="dica-campo" style="text-align:center">
             ${u.acertos} de ${u.total} questões · mínimo ${esc(nota(s.nota_minima))}
             · ${esc(quando(u.enviada_em))}</p>` : ''}

    ${pedidoPendente
      ? `<div class="aviso visivel info" style="margin-top:14px">
           <strong>Pedido enviado.</strong> Um revisor ou o administrador
           precisa liberar a nova tentativa. Você recebe um aviso aqui no
           aplicativo assim que isso acontecer.
         </div>`
      : `<div class="aviso visivel info" style="margin-top:14px">
           Você usou a tentativa desta prova. Para refazer, peça uma nova
           tentativa — quem acompanha seus cartões decide.
         </div>
         <div class="acoes-resultado">
           <button class="botao botao-principal" id="btn-nova-tentativa">
             Tentar novamente</button>
         </div>`}
  </section>`;
}

/* ------------------------------------------------------- a prova em si */

async function abrirProva() {
  const alvo = $('#conteudo-prova');
  alvo.innerHTML = '<div class="esqueleto" style="height:200px"></div>';

  try {
    await carregarQuestoes();
  } catch (erro) {
    falhar(erro.message);
    return;
  }

  const s = estado.situacao;

  alvo.innerHTML = `
    <section class="bloco">
      ${s.texto_topo ? `<p class="texto-prova">${esc(s.texto_topo)}</p>` : ''}
      <div class="aviso visivel info">
        ${estado.questoes.length} questão(ões). Aprovação com
        <strong>${esc(nota(s.nota_minima))}</strong> ou mais.
        ${s.usadas === 0
          ? 'Você tem <strong>uma</strong> tentativa — responda com calma.'
          : 'Esta é a tentativa liberada pelo revisor.'}
      </div>
    </section>

    ${estado.questoes.map((q, i) => `
      <section class="questao-prova" data-questao="${q.id}">
        <h3><span class="ordem">${i + 1}</span>${esc(q.enunciado)}</h3>
        <div class="opcoes">
          ${q.alternativas.map((a, k) => `
            <label class="opcao">
              <input type="radio" name="q-${q.id}" value="${a.id}">
              <span class="letra">${letra(k + 1)}</span>
              <span class="texto">${esc(a.texto)}</span>
            </label>`).join('')}
        </div>
      </section>`).join('')}

    <div class="fecha-editor">
      <p id="contagem-prova">Responda todas as questões para poder entregar.</p>
      <button class="botao botao-dourado" id="btn-entregar" disabled>
        Entregar prova
      </button>
    </div>`;

  atualizarContagem();
}

function atualizarContagem() {
  const total = estado.questoes.length;
  const feitas = estado.questoes
    .filter(q => $(`input[name="q-${q.id}"]:checked`)).length;

  $('#contagem-prova').innerHTML = feitas === total
    ? 'Tudo respondido. Confira antes de entregar — não dá para voltar atrás.'
    : `Respondidas <strong>${feitas}</strong> de ${total}.`;

  $('#btn-entregar').disabled = feitas < total;
}

$('#conteudo-prova').addEventListener('change', e => {
  if (e.target.type === 'radio') {
    const bloco = e.target.closest('.questao-prova');
    bloco?.classList.add('respondida');
    $$('.opcao', bloco).forEach(o =>
      o.classList.toggle('marcada', o.querySelector('input').checked));
    atualizarContagem();
  }
});

/* ============================================================== EVENTOS */

$('#conteudo-prova').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;

  if (b.id === 'btn-entregar')        return confirmarEntrega();
  if (b.id === 'btn-nova-tentativa')  return pedirNovaTentativa(b);
  if (b.id === 'btn-certificado')     return baixarCertificado(b);
  if (b.id === 'ir-pasta')            return irParaPasta();
  if (b.id === 'ir-inicio')           { location.href = 'inicio.html'; }
});

function confirmarEntrega() {
  abrirModal(`
    <div class="modal-topo">
      <h2>Entregar a prova</h2><button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      A correção é feita na hora e o resultado é definitivo. Se a nota não
      alcançar o mínimo, a próxima tentativa depende de liberação.
    </p>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Revisar de novo</button>
      <button class="botao botao-principal" id="confirmar">Entregar</button>
    </div>`);

  $('#confirmar').addEventListener('click', enviar);
}

async function enviar(e) {
  ocupado(e.target, true, 'Entregar');

  const escolhas = {};
  for (const q of estado.questoes) {
    const marcada = $(`input[name="q-${q.id}"]:checked`);
    if (marcada) escolhas[q.id] = marcada.value;
  }

  const { data, error } = await sb.rpc('corrigir_prova', {
    p_prova: estado.situacao.prova_id,
    p_escolhas: escolhas
  });

  if (error) {
    ocupado(e.target, false, 'Entregar');
    toast(traduzErro(error), 'erro');
    return;
  }

  fecharModal();
  toast(data.aprovada ? 'Aprovado!' : 'Prova corrigida.', data.aprovada ? 'ok' : 'erro');

  await carregar();
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function pedirNovaTentativa(botao) {
  const texto = botao.textContent;
  ocupado(botao, true, texto);

  const { error } = await sb.from('pedidos_tentativa').insert({
    prova_id: estado.situacao.prova_id,
    candidato_id: estado.eu.id,
    status: 'pendente'
  });

  ocupado(botao, false, texto);
  if (error) { toast(traduzErro(error), 'erro'); return; }

  toast('Pedido enviado. Você recebe um aviso quando for liberado.', 'ok');
  await carregar();
}

async function baixarCertificado(botao) {
  const texto = botao.innerHTML;
  ocupado(botao, true, texto);

  try {
    const C = await import('./certificado.js');

    const arquivo = await C.gerarCertificado({
      caminho: estado.prova.certificado_path,
      nome: estado.eu.nome,
      y: Number(estado.prova.cert_nome_y),
      tamanho: Number(estado.prova.cert_nome_tamanho)
    });

    C.baixar(arquivo, C.nomeArquivo(['Certificado PDL', estado.eu.nome], 'pdf'));
    toast('Certificado gerado.', 'ok');

  } catch (erro) {
    toast(erro?.message ?? 'Não consegui gerar o certificado.', 'erro');
  } finally {
    ocupado(botao, false, texto);
  }
}

async function irParaPasta() {
  const { data } = await sb.from('pastas').select('id')
    .eq('candidato_id', estado.eu.id)
    .eq('formulario_id', estado.formularioId)
    .maybeSingle();

  location.href = data ? `pasta.html?id=${data.id}` : 'inicio.html';
}

$('#btn-voltar').addEventListener('click', () => { location.href = 'inicio.html'; });

/* ---------------------------------------------------------------- início */

(async function iniciar() {
  const perfil = await exigirSessao();
  if (!perfil) return;

  estado.eu = perfil;
  await montarBarra(perfil);
  carregar();
})();
