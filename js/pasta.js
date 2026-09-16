/* =====================================================================
   Pasta — a mesma tela serve aos dois papéis:

   CANDIDATO (dono da pasta): preenche data, descrição e foto de cada
     parte, e marca o requisito como "Concluído" quando todas estiverem
     completas. Requisito aprovado fica travado (o banco também recusa).

   REVISOR / ADMINISTRADOR: não altera nada do conteúdo. Só aprova,
     devolve para pendente e escreve a correção.

   Decisão 9: a quantidade de partes é FIXA. As N partes já nascem com a
   resposta, então o candidato vê desde o início quantas faltam — não há
   "adicionar parte", há "preencher a parte 3 de 5".
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, dataBR, $, $$ } from './ui.js';
import { comprimir, previa, ErroImagem } from './imagem.js';

const estado = {
  eu: null, pasta: null, secoes: [], respostas: new Map(),
  souDono: false, podeAvaliar: false, urlsFoto: new Map(), pendentesFoto: new Map()
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

const ROTULO = { pendente: 'Pendente', concluido: 'Concluído', aprovado: 'Aprovado' };

/* =============================================================== CARGA */

async function carregar() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('inicio.html'); return; }

  const { data: pasta, error } = await sb
    .from('pastas')
    .select('*, formulario:formularios(*), candidato:perfis!pastas_candidato_id_fkey(id, nome, turma:turmas(nome))')
    .eq('id', id)
    .single();

  if (error || !pasta) {
    $('#conteudo-pasta').innerHTML =
      `<div class="vazio"><span class="simbolo">🔒</span>
       Pasta não encontrada ou você não tem acesso a ela.</div>`;
    return;
  }

  estado.pasta = pasta;
  estado.souDono = pasta.candidato_id === estado.eu.id;
  estado.podeAvaliar = !estado.souDono &&
    ['administrador', 'revisor'].includes(estado.eu.tipo);

  $('#titulo-pasta').textContent = pasta.formulario.nome;
  $('#sub-pasta').textContent = estado.souDono
    ? 'Seu cartão de liderança'
    : `${pasta.candidato.nome}${pasta.candidato.turma ? ' · ' + pasta.candidato.turma.nome : ''}`;

  if (estado.podeAvaliar) {
    $('#aviso-papel').innerHTML = `
      <div class="aviso-revisor">
        <span>👁️</span>
        <span>Você está avaliando. O conteúdo não pode ser alterado por você —
        apenas aprovar, devolver para correção ou reabrir.</span>
      </div>`;
  }

  if (pasta.status === 'solicitada') {
    $('#conteudo-pasta').innerHTML =
      `<div class="vazio"><span class="simbolo">⏳</span>
       Esta pasta ainda não foi liberada.<br>
       Seu pedido de inscrição está aguardando aprovação.</div>`;
    return;
  }

  await carregarConteudo();
}

async function carregarConteudo() {
  const [sec, res] = await Promise.all([
    sb.from('secoes')
      .select('*, requisitos(*)')
      .eq('formulario_id', estado.pasta.formulario_id)
      .eq('ativo', true).order('ordem'),

    sb.from('respostas')
      .select('*, partes(*)')
      .eq('pasta_id', estado.pasta.id)
  ]);

  if (sec.error) { toast(traduzErro(sec.error), 'erro'); return; }

  estado.secoes = (sec.data ?? []).map(s => ({
    ...s,
    requisitos: (s.requisitos ?? []).filter(r => r.ativo).sort((a, b) => a.ordem - b.ordem)
  })).filter(s => s.requisitos.length);

  estado.respostas = new Map();
  for (const r of res.data ?? []) {
    r.partes = (r.partes ?? []).sort((a, b) => a.ordem - b.ordem);
    estado.respostas.set(r.requisito_id, r);
  }

  await assinarFotos();
  desenhar();
}

/** URLs temporárias das fotos — o bucket é privado, não dá para linkar direto. */
async function assinarFotos() {
  const caminhos = [];
  for (const r of estado.respostas.values()) {
    for (const p of r.partes) if (p.foto_path) caminhos.push(p.foto_path);
  }
  if (!caminhos.length) return;

  const { data } = await sb.storage.from('evidencias').createSignedUrls(caminhos, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl) estado.urlsFoto.set(item.path, item.signedUrl);
  }
}

/* ============================================================= DESENHO */

function progressoSecao(secao) {
  const total = secao.requisitos.length;
  const aprovados = secao.requisitos
    .filter(r => estado.respostas.get(r.id)?.status === 'aprovado').length;
  return { total, aprovados, pct: total ? Math.round(100 * aprovados / total) : 0 };
}

function desenhar() {
  if (!estado.secoes.length) {
    $('#conteudo-pasta').innerHTML =
      `<div class="vazio"><span class="simbolo">📄</span>
       Este formulário ainda não tem requisitos cadastrados.<br>
       O administrador precisa montá-lo no Editor de Requisitos.</div>`;
    return;
  }

  const totalGeral = estado.secoes.reduce((n, s) => n + s.requisitos.length, 0);
  const aprovGeral = estado.secoes.reduce((n, s) => n + progressoSecao(s).aprovados, 0);
  const pctGeral = totalGeral ? Math.round(100 * aprovGeral / totalGeral) : 0;

  $('#conta-geral').textContent = `${aprovGeral}/${totalGeral}`;
  $('#barra-geral').style.width = `${pctGeral}%`;

  $('#conteudo-pasta').innerHTML = estado.secoes.map(s => {
    const p = progressoSecao(s);
    return `
    <section class="secao-pasta">
      <div class="secao-cabeca">
        <h2>${esc(s.titulo)}</h2>
        <div class="medidor">
          <div class="trilho"><i style="width:${p.pct}%"></i></div>
          <span>${p.pct}%</span>
        </div>
      </div>
      ${s.requisitos.map(r => cartaoRequisito(r)).join('')}
    </section>`;
  }).join('');
}

function cartaoRequisito(req) {
  const resposta = estado.respostas.get(req.id);
  const status = resposta?.status ?? 'pendente';
  const temCorrecao = !!resposta?.correcao;
  const partes = resposta?.partes ?? [];

  const prontas = partes.filter(p =>
    p.data_cumprimento && (p.descricao ?? '').trim() &&
    (!req.permitir_fotos || p.foto_path)).length;

  const classe = temCorrecao && status !== 'aprovado' ? 'corrigido' : status;

  return `
  <article class="req-cartao ${classe}" data-req="${req.id}">
    <div class="req-cabeca" data-abrir>
      <div>
        <h3>${esc(req.titulo)}</h3>
        <div class="meta">
          ${req.qtd_partes > 1
            ? `${prontas} de ${req.qtd_partes} partes preenchidas`
            : (prontas ? 'Preenchido' : 'Não preenchido')}
          ${temCorrecao && status !== 'aprovado' ? ' · <strong>tem correção</strong>' : ''}
        </div>
      </div>
      <div class="lado">
        <span class="selo-status ${status}">${ROTULO[status]}</span>
        <span class="seta">▾</span>
      </div>
    </div>

    <div class="req-corpo">
      ${temCorrecao && status !== 'aprovado' ? `
        <div class="caixa-correcao">
          <strong>Correção do revisor</strong>
          <p>${esc(resposta.correcao)}</p>
        </div>` : ''}

      ${Array.from({ length: req.qtd_partes }, (_, i) => {
        const parte = partes[i] ?? { ordem: i + 1 };
        return blocoParte(req, parte, i, status);
      }).join('')}

      ${rodapeRequisito(req, resposta, status, prontas)}
    </div>
  </article>`;
}

function blocoParte(req, parte, i, status) {
  const travado = status === 'aprovado' || !estado.souDono;
  const completa = parte.data_cumprimento && (parte.descricao ?? '').trim() &&
                   (!req.permitir_fotos || parte.foto_path);

  const urlFoto = parte.foto_path ? estado.urlsFoto.get(parte.foto_path) : null;

  return `
  <div class="parte" data-parte="${parte.id ?? ''}" data-ordem="${i + 1}">
    ${req.qtd_partes > 1 ? `
      <div class="parte-cabeca">
        <span class="rotulo">Parte ${i + 1} de ${req.qtd_partes}</span>
        <span class="completa ${completa ? 'sim' : 'nao'}">
          ${completa ? '✓ completa' : 'incompleta'}
        </span>
      </div>` : ''}

    <div style="margin-bottom:12px">
      <label>Data do cumprimento</label>
      <input type="date" data-campo="data" value="${esc(parte.data_cumprimento ?? '')}"
             ${travado ? 'disabled' : ''}>
    </div>

    <div class="parte-grade ${req.permitir_fotos ? 'com-foto' : ''}">
      <div>
        <label>Descrição</label>
        <textarea data-campo="descricao" ${travado ? 'disabled' : ''}
          placeholder="Descreva o que foi feito…">${esc(parte.descricao ?? '')}</textarea>
        ${req.dica_cumprimento
          ? `<div class="orientacao">${esc(req.dica_cumprimento)}</div>` : ''}
      </div>

      ${req.permitir_fotos ? `
        <div>
          <label>Foto</label>
          <div class="caixa-foto ${travado ? 'somente-leitura' : ''}" data-caixa-foto>
            ${urlFoto
              ? `<img src="${urlFoto}" alt="Evidência">
                 ${travado ? '' : '<button type="button" class="trocar-foto">Trocar</button>'}`
              : `<div class="instrucao">
                   <span class="icone">📷</span>
                   ${travado ? 'Sem foto enviada' : 'Toque para escolher<br>JPEG ou PNG'}
                 </div>`}
            ${travado ? '' :
              '<input type="file" accept="image/jpeg,image/png" hidden data-arquivo>'}
          </div>
          ${req.dica_foto ? `<div class="orientacao">${esc(req.dica_foto)}</div>` : ''}
        </div>` : ''}
    </div>
  </div>`;
}

function rodapeRequisito(req, resposta, status, prontas) {
  const completo = prontas >= req.qtd_partes;

  if (estado.podeAvaliar) {
    return `
    <div class="req-rodape">
      <span class="estado">
        ${status === 'aprovado'
          ? 'Aprovado' + (resposta?.aprovado_em ? ' em ' + dataBR(resposta.aprovado_em) : '')
          : status === 'concluido' ? 'Enviado para avaliação'
          : 'O candidato ainda não enviou'}
      </span>
      ${status === 'aprovado'
        ? `<button class="botao botao-vazado" data-reabrir="${req.id}">Reabrir</button>`
        : `<button class="botao botao-vazado" data-corrigir="${req.id}">Devolver com correção</button>
           <button class="botao botao-principal" data-aprovar="${req.id}"
                   style="background:var(--verde)">Aprovar</button>`}
    </div>`;
  }

  if (status === 'aprovado') {
    return `<div class="req-rodape">
      <span class="estado">✓ Aprovado pelo revisor — não pode mais ser alterado.</span>
    </div>`;
  }

  return `
  <div class="req-rodape">
    <span class="estado" data-estado>
      ${completo ? 'Tudo preenchido' : `Faltam ${req.qtd_partes - prontas} parte(s)`}
    </span>
    <button class="botao botao-vazado" data-salvar="${req.id}">Salvar</button>
    <button class="botao botao-dourado" data-concluir="${req.id}"
            ${completo ? '' : 'disabled'}
            title="${completo ? '' : 'Preencha todas as partes primeiro'}">
      ${status === 'concluido' ? 'Reenviar para avaliação' : 'Marcar como concluído'}
    </button>
  </div>`;
}

/* ============================================================== EVENTOS */

$('#conteudo-pasta').addEventListener('click', async e => {
  const cabeca = e.target.closest('[data-abrir]');
  if (cabeca) { cabeca.closest('.req-cartao').classList.toggle('aberto'); return; }

  const caixa = e.target.closest('[data-caixa-foto]');
  if (caixa && !caixa.classList.contains('somente-leitura')) {
    caixa.querySelector('[data-arquivo]')?.click();
    return;
  }

  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;

  if (d.salvar)   return salvarRequisito(d.salvar, b, false);
  if (d.concluir) return salvarRequisito(d.concluir, b, true);
  if (d.aprovar)  return avaliar(d.aprovar, 'aprovado');
  if (d.reabrir)  return avaliar(d.reabrir, 'pendente');
  if (d.corrigir) return modalCorrecao(d.corrigir);
});

/* foto escolhida */
$('#conteudo-pasta').addEventListener('change', async e => {
  if (!e.target.matches('[data-arquivo]')) return;

  const arquivo = e.target.files?.[0];
  if (!arquivo) return;

  const bloco = e.target.closest('.parte');
  const caixa = e.target.closest('[data-caixa-foto]');

  try {
    const { blob } = await comprimir(arquivo);
    const chave = `${bloco.closest('.req-cartao').dataset.req}:${bloco.dataset.ordem}`;
    estado.pendentesFoto.set(chave, blob);

    caixa.innerHTML =
      `<img src="${await previa(blob)}" alt="">` +
      '<button type="button" class="trocar-foto">Trocar</button>' +
      '<input type="file" accept="image/jpeg,image/png" hidden data-arquivo>';

    marcarSujo(bloco);
  } catch (erro) {
    toast(erro instanceof ErroImagem ? erro.message : 'Falha ao ler a imagem.', 'erro');
  }
});

$('#conteudo-pasta').addEventListener('input', e => {
  if (e.target.dataset.campo) marcarSujo(e.target.closest('.parte'));
});

function marcarSujo(bloco) {
  const estadoEl = bloco.closest('.req-corpo')?.querySelector('[data-estado]');
  if (estadoEl) estadoEl.textContent = 'Alterações não salvas';
}

/* ============================================================== SALVAR */

async function salvarRequisito(requisitoId, botao, concluir) {
  const cartao = $(`.req-cartao[data-req="${requisitoId}"]`);
  const req = estado.secoes.flatMap(s => s.requisitos).find(r => r.id === requisitoId);
  const texto = botao.textContent.trim();

  ocupado(botao, true, texto);

  try {
    // 1. garante que a resposta existe (o gatilho cria as partes vazias)
    let resposta = estado.respostas.get(requisitoId);

    if (!resposta) {
      const { data: criada, error } = await sb.from('respostas')
        .insert({ pasta_id: estado.pasta.id, requisito_id: requisitoId, status: 'pendente' })
        .select('id').single();

      if (error) throw error;

      // as partes nascem por gatilho DEPOIS do insert, então precisam
      // de uma segunda leitura para virem junto
      const { data, error: erroLeitura } = await sb.from('respostas')
        .select('*, partes(*)').eq('id', criada.id).single();

      if (erroLeitura) throw erroLeitura;

      data.partes = (data.partes ?? []).sort((a, b) => a.ordem - b.ordem);
      resposta = data;
      estado.respostas.set(requisitoId, resposta);
    }

    // 2. grava cada parte
    const blocos = $$('.parte', cartao);

    for (const bloco of blocos) {
      const ordem = Number(bloco.dataset.ordem);
      const parte = resposta.partes.find(p => p.ordem === ordem);
      if (!parte) continue;

      const data = bloco.querySelector('[data-campo="data"]')?.value || null;
      const descricao = bloco.querySelector('[data-campo="descricao"]')?.value.trim() || null;

      const mudanca = { data_cumprimento: data, descricao };

      // foto nova, se houver
      const chave = `${requisitoId}:${ordem}`;
      const blob = estado.pendentesFoto.get(chave);

      if (blob) {
        const caminho = `${estado.pasta.id}/${resposta.id}/${parte.id}.jpg`;
        const { error: erroUp } = await sb.storage.from('evidencias')
          .upload(caminho, blob, { upsert: true, contentType: 'image/jpeg' });

        if (erroUp) throw erroUp;

        mudanca.foto_path = caminho;
        mudanca.foto_bytes = blob.size;
        estado.pendentesFoto.delete(chave);
      }

      const { error } = await sb.from('partes').update(mudanca).eq('id', parte.id);
      if (error) throw error;
    }

    // 3. status
    if (concluir) {
      const { error } = await sb.from('respostas')
        .update({ status: 'concluido' }).eq('id', resposta.id);
      if (error) throw error;
      toast('Requisito enviado para avaliação.', 'ok');
    } else {
      toast('Salvo.', 'ok');
    }

    await carregarConteudo();
    $(`.req-cartao[data-req="${requisitoId}"]`)?.classList.add('aberto');

  } catch (erro) {
    ocupado(botao, false, texto);
    toast(traduzErro(erro), 'erro');
  }
}

/* ============================================================ AVALIAR */

async function avaliar(requisitoId, novoStatus) {
  const resposta = estado.respostas.get(requisitoId);
  if (!resposta) { toast('O candidato ainda não enviou nada neste requisito.', 'erro'); return; }

  const { error } = await sb.from('respostas')
    .update({ status: novoStatus }).eq('id', resposta.id);

  if (error) { toast(traduzErro(error), 'erro'); return; }

  toast(novoStatus === 'aprovado' ? 'Requisito aprovado.' : 'Requisito reaberto.', 'ok');
  await carregarConteudo();
  $(`.req-cartao[data-req="${requisitoId}"]`)?.classList.add('aberto');
}

function modalCorrecao(requisitoId) {
  const req = estado.secoes.flatMap(s => s.requisitos).find(r => r.id === requisitoId);
  const resposta = estado.respostas.get(requisitoId);

  if (!resposta) { toast('O candidato ainda não enviou nada neste requisito.', 'erro'); return; }

  abrirModal(`
    <div class="modal-topo">
      <h2>Devolver com correção</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.88rem;color:var(--texto-suave);margin:0 0 14px">
      Requisito: <strong>${esc(req.titulo)}</strong>
    </p>
    <div class="campo">
      <label for="texto-correcao">O que precisa ser ajustado</label>
      <textarea id="texto-correcao" style="min-height:120px"
        placeholder="Seja específico: o candidato vai ler isto para saber o que refazer."
        >${esc(resposta.correcao ?? '')}</textarea>
    </div>
    <div class="aviso visivel info">
      O requisito volta para <strong>pendente</strong>, o candidato recebe aviso
      no aplicativo e também por e-mail.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="enviar-correcao">Enviar correção</button>
    </div>`);

  $('#enviar-correcao').addEventListener('click', async e => {
    const texto = $('#texto-correcao').value.trim();
    if (!texto) { toast('Escreva a correção antes de enviar.', 'erro'); return; }

    ocupado(e.target, true, 'Enviar correção');

    const { error } = await sb.from('respostas')
      .update({ status: 'pendente', correcao: texto, corrigido_em: new Date() })
      .eq('id', resposta.id);

    if (error) { ocupado(e.target, false, 'Enviar correção'); toast(traduzErro(error), 'erro'); return; }

    toast('Correção enviada ao candidato.', 'ok');
    fecharModal();
    await carregarConteudo();
  });
}

/* ---------------------------------------------------------------- início */

$('#btn-voltar').addEventListener('click', () => {
  location.href = estado.podeAvaliar ? 'pastas.html' : 'inicio.html';
});

(async function iniciar() {
  const perfil = await exigirSessao();
  if (!perfil) return;

  estado.eu = perfil;
  await montarBarra(perfil);
  carregar();
})();
