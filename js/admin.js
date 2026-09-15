/* =====================================================================
   Painel do Administrador.

   Tudo que exige a chave service_role (criar, redefinir senha, excluir,
   aprovar/recusar pedido) passa pela Edge Function "admin". Daqui nunca
   sai uma chave privilegiada.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, dataBR, $, $$ } from './ui.js';
import { comprimirAvatar, previa, formatarBytes, ErroImagem } from './imagem.js';

const POR_PAGINA = 15;

const estado = {
  usuarios: [], turmas: [], formularios: [], pastasPorPessoa: new Map(),
  pedidos: [], pagina: 1, busca: '', filtroTipo: '',
  selecionados: new Set(), fotoNova: null, eu: null
};

/* ------------------------------------------------ chamada à Edge Function */

async function chamarAdmin(acao, dados = {}) {
  const { data, error } = await sb.functions.invoke('admin', { body: { acao, ...dados } });

  if (error) {
    // a função devolve { erro: "..." } no corpo, mesmo quando o status não é 200
    let detalhe = '';
    try { detalhe = (await error.context?.json())?.erro ?? ''; } catch (_) {}
    throw new Error(detalhe || error.message || 'Falha ao falar com o servidor.');
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

/* ------------------------------------------------------------- utilidades */

const soDigitos = v => String(v ?? '').replace(/\D/g, '');

function formatarCPF(cpf) {
  const d = soDigitos(cpf);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (cpf || '—');
}

function cpfValido(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const corte of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += +cpf[i] * (corte + 1 - i);
    let d = (soma * 10) % 11;
    if (d === 10) d = 0;
    if (d !== +cpf[corte]) return false;
  }
  return true;
}

function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function avisar(alvo, texto, tipo = 'erro') {
  const el = $(alvo);
  el.textContent = texto;
  el.className = `aviso visivel ${tipo}`;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function limparAviso(alvo) { $(alvo).className = 'aviso'; }

function ocupado(botao, sim, texto) {
  botao.disabled = sim;
  botao.innerHTML = sim ? '<span class="girando"></span>' : texto;
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado.', 'ok');
  } catch (_) {
    toast('Não foi possível copiar. Anote manualmente.', 'erro');
  }
}

/* ------------------------------------------------------------------ modal */

function abrirModal(html, { largo = false } = {}) {
  const caixa = $('#caixa-modal');
  caixa.className = `modal ${largo ? 'largo' : ''}`;
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

/* ================================================================ CARGA */

async function carregarTudo() {
  const [us, tu, fo, pa, pe] = await Promise.all([
    sb.from('perfis').select('*, turma:turmas(id, nome)').order('nome'),
    sb.from('turmas').select('*').order('nome'),
    sb.from('formularios').select('*').order('ordem'),
    sb.from('pastas').select('candidato_id, status, formulario:formularios(nome)'),
    sb.from('pedidos_acesso').select('*, turma:turmas(nome)')
      .eq('status', 'pendente').order('criado_em')
  ]);

  if (us.error) { toast(traduzErro(us.error), 'erro'); return; }

  estado.usuarios    = us.data ?? [];
  estado.turmas      = tu.data ?? [];
  estado.formularios = fo.data ?? [];
  estado.pedidos     = pe.data ?? [];

  estado.pastasPorPessoa = new Map();
  for (const p of pa.data ?? []) {
    if (!estado.pastasPorPessoa.has(p.candidato_id)) estado.pastasPorPessoa.set(p.candidato_id, []);
    estado.pastasPorPessoa.get(p.candidato_id).push(p);
  }

  preencherTurmasSelect();
  preencherPastasNovo();
  desenharUsuarios();
  desenharTurmas();
  atualizarSeloPedidos();
  carregarArmazenamento();
}

async function carregarArmazenamento() {
  const { data, error } = await sb.rpc('uso_armazenamento');
  if (error || !data?.length) return;

  const { bytes, limite_bytes, percentual, fotos } = data[0];
  const caixa = $('#armazenamento');

  caixa.hidden = false;
  caixa.className = 'armazenamento' +
    (percentual >= 85 ? ' critico' : percentual >= 60 ? ' atencao' : '');

  $('#barra-armazenamento').style.width = `${Math.min(100, percentual)}%`;
  $('#medida-armazenamento').textContent =
    `${formatarBytes(bytes)} de ${formatarBytes(limite_bytes)} · ${fotos} foto(s) · ${percentual}%`;
}

/* ============================================================== USUÁRIOS */

function usuariosFiltrados() {
  const q = estado.busca.trim().toLowerCase();

  return estado.usuarios.filter(u => {
    if (estado.filtroTipo && u.tipo !== estado.filtroTipo) return false;
    if (!q) return true;
    return [u.nome, u.email, u.ra, u.cpf, u.turma?.nome]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

function desenharUsuarios() {
  const todos = usuariosFiltrados();
  const paginas = Math.max(1, Math.ceil(todos.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas);

  const fatia = todos.slice((estado.pagina - 1) * POR_PAGINA, estado.pagina * POR_PAGINA);
  const corpo = $('#corpo-usuarios');

  $('#conta-usuarios').textContent =
    `${todos.length}${todos.length !== estado.usuarios.length ? ` de ${estado.usuarios.length}` : ''}`;

  if (!fatia.length) {
    corpo.innerHTML = `<tr><td colspan="10" class="vazio">
      <span class="simbolo">🔍</span>Nenhuma pessoa encontrada.</td></tr>`;
    $('#paginacao-usuarios').innerHTML = '';
    return;
  }

  corpo.innerHTML = fatia.map(u => {
    const pastas = estado.pastasPorPessoa.get(u.id) ?? [];
    const souEu = u.id === estado.eu.id;

    return `
    <tr data-id="${u.id}">
      <td><input type="checkbox" class="marca-linha" data-id="${u.id}"
                 ${estado.selecionados.has(u.id) ? 'checked' : ''}></td>
      <td>
        <div class="nome-celula">
          <span class="mini-avatar">${esc(iniciais(u.nome))}</span>
          <span>${esc(u.nome)}${souEu ? ' <small style="color:var(--texto-suave)">(você)</small>' : ''}</span>
        </div>
      </td>
      <td>${dataBR(u.data_nascimento)}</td>
      <td>${u.turma ? esc(u.turma.nome) : '<span style="color:var(--texto-suave)">sem turma informada</span>'}</td>
      <td>${esc(u.ra)}</td>
      <td>${esc(formatarCPF(u.cpf))}</td>
      <td>${esc(u.email)}</td>
      <td><span class="tipo-selo ${u.tipo}">${u.tipo}</span></td>
      <td>
        ${pastas.length
          ? `<div class="chips">${pastas.map(p =>
              `<span class="chip">${esc(p.formulario?.nome ?? '?')}</span>`).join('')}</div>`
          : '<span style="color:var(--texto-suave)">—</span>'}
      </td>
      <td>
        <div class="acoes-celula">
          <button class="botao-icone" data-acao="editar"   data-id="${u.id}" title="Editar">✏️</button>
          <button class="botao-icone" data-acao="pasta"    data-id="${u.id}" title="Atribuir pasta">🗂️</button>
          <button class="botao-icone" data-acao="codigo"   data-id="${u.id}" title="Gerar e copiar código">🔑</button>
          <button class="botao-icone" data-acao="enviar"   data-id="${u.id}" title="Enviar acesso por e-mail">✉️</button>
          <button class="botao-icone" data-acao="redefinir" data-id="${u.id}" title="Redefinir senha">🔄</button>
          ${souEu ? '' :
            `<button class="botao-icone perigo" data-acao="excluir" data-id="${u.id}" title="Excluir">🗑️</button>`}
        </div>
      </td>
    </tr>`;
  }).join('');

  desenharPaginacao(paginas);
  atualizarAvisoSelecao();
}

function desenharPaginacao(paginas) {
  const cx = $('#paginacao-usuarios');
  if (paginas <= 1) { cx.innerHTML = ''; return; }

  const botoes = [];
  botoes.push(`<button class="pagina-botao" data-pag="${estado.pagina - 1}"
                ${estado.pagina === 1 ? 'disabled' : ''}>‹</button>`);

  for (let p = 1; p <= paginas; p++) {
    if (p === 1 || p === paginas || Math.abs(p - estado.pagina) <= 1) {
      botoes.push(`<button class="pagina-botao ${p === estado.pagina ? 'atual' : ''}"
                    data-pag="${p}">${p}</button>`);
    } else if (Math.abs(p - estado.pagina) === 2) {
      botoes.push('<span style="color:var(--texto-suave)">…</span>');
    }
  }

  botoes.push(`<button class="pagina-botao" data-pag="${estado.pagina + 1}"
                ${estado.pagina === paginas ? 'disabled' : ''}>›</button>`);

  cx.innerHTML = botoes.join('');
}

function atualizarAvisoSelecao() {
  const n = estado.selecionados.size;
  $('#aviso-selecao').classList.toggle('visivel', n > 0);
  $('#texto-selecao').textContent =
    `${n} pessoa${n === 1 ? '' : 's'} selecionada${n === 1 ? '' : 's'}.`;
}

/* -------------------------------------------------------- eventos tabela */

$('#busca-usuarios').addEventListener('input', e => {
  estado.busca = e.target.value; estado.pagina = 1; desenharUsuarios();
});

$('#filtro-tipo').addEventListener('change', e => {
  estado.filtroTipo = e.target.value; estado.pagina = 1; desenharUsuarios();
});

$('#marcar-todos').addEventListener('change', e => {
  const visiveis = usuariosFiltrados()
    .slice((estado.pagina - 1) * POR_PAGINA, estado.pagina * POR_PAGINA);

  visiveis.forEach(u => e.target.checked
    ? estado.selecionados.add(u.id)
    : estado.selecionados.delete(u.id));

  desenharUsuarios();
});

$('#paginacao-usuarios').addEventListener('click', e => {
  const b = e.target.closest('[data-pag]');
  if (b && !b.disabled) { estado.pagina = +b.dataset.pag; desenharUsuarios(); scrollTo({ top: 0, behavior: 'smooth' }); }
});

$('#corpo-usuarios').addEventListener('change', e => {
  if (!e.target.classList.contains('marca-linha')) return;
  const id = e.target.dataset.id;
  e.target.checked ? estado.selecionados.add(id) : estado.selecionados.delete(id);
  atualizarAvisoSelecao();
});

$('#corpo-usuarios').addEventListener('click', e => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;

  const usuario = estado.usuarios.find(u => u.id === b.dataset.id);
  if (!usuario) return;

  ({
    editar:    () => modalEditar(usuario),
    pasta:     () => modalPastas([usuario]),
    codigo:    () => gerarCodigo(usuario, true),
    enviar:    () => modalEnviarAcesso(usuario),
    redefinir: () => gerarCodigo(usuario, false),
    excluir:   () => modalExcluir(usuario)
  })[b.dataset.acao]?.();
});

$('#btn-atribuir-lote').addEventListener('click', () => {
  const pessoas = estado.usuarios.filter(u => estado.selecionados.has(u.id));
  if (pessoas.length) modalPastas(pessoas);
});

/* ======================================================= AÇÕES DE USUÁRIO */

async function gerarCodigo(usuario, copiarDireto) {
  const texto = copiarDireto
    ? `Gerar um código novo para <strong>${esc(usuario.nome)}</strong>?`
    : `Redefinir a senha de <strong>${esc(usuario.nome)}</strong>?`;

  abrirModal(`
    <div class="modal-topo">
      <h2>${copiarDireto ? 'Gerar código de acesso' : 'Redefinir senha'}</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">${texto}</p>
    <div class="aviso visivel info" style="margin-top:12px">
      A senha atual deixa de funcionar na hora. A pessoa vai entrar com o código
      novo e criar outra senha no primeiro acesso.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar-codigo">Gerar código</button>
    </div>`);

  $('#confirmar-codigo').addEventListener('click', async e => {
    ocupado(e.target, true, 'Gerar código');
    try {
      const r = await chamarAdmin('redefinir_senha', { user_id: usuario.id });
      if (copiarDireto) await copiar(r.codigo);
      mostrarCodigo(usuario, r.codigo);
      carregarTudo();
    } catch (erro) {
      ocupado(e.target, false, 'Gerar código');
      toast(erro.message, 'erro');
    }
  });
}

function mostrarCodigo(usuario, codigo) {
  abrirModal(`
    <div class="modal-topo">
      <h2>Código de ${esc(usuario.nome)}</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <div class="codigo-gerado">
      <div class="numero">${esc(codigo)}</div>
      <small>Senha provisória — só funciona no primeiro acesso</small>
    </div>
    <p style="font-size:.85rem;color:var(--texto-suave);line-height:1.55">
      Anote ou copie agora. Por segurança, este código não fica guardado em
      lugar nenhum: para vê-lo de novo você teria que gerar outro.
    </p>
    <div class="modal-acoes">
      <button class="botao botao-vazado" id="copiar-codigo">Copiar código</button>
      <button class="botao botao-principal" id="enviar-codigo">Enviar por e-mail</button>
    </div>`);

  $('#copiar-codigo').addEventListener('click', () => copiar(codigo));

  $('#enviar-codigo').addEventListener('click', async e => {
    ocupado(e.target, true, 'Enviar por e-mail');
    try {
      await chamarAdmin('enviar_acesso', { user_id: usuario.id, codigo });
      toast(`E-mail para ${usuario.email} colocado na fila de envio.`, 'ok');
      fecharModal();
    } catch (erro) {
      ocupado(e.target, false, 'Enviar por e-mail');
      toast(erro.message, 'erro');
    }
  });
}

function modalEnviarAcesso(usuario) {
  abrirModal(`
    <div class="modal-topo">
      <h2>Enviar acesso por e-mail</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Vamos gerar um código novo para <strong>${esc(usuario.nome)}</strong> e
      enviá-lo para <strong>${esc(usuario.email)}</strong>.
    </p>
    <div class="aviso visivel info" style="margin-top:12px">
      Um código só pode ser enviado no momento em que é criado — ele não fica
      guardado. Por isso este botão gera um novo, e a senha atual para de valer.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar-envio">Gerar e enviar</button>
    </div>`);

  $('#confirmar-envio').addEventListener('click', async e => {
    ocupado(e.target, true, 'Gerar e enviar');
    try {
      const r = await chamarAdmin('redefinir_senha', { user_id: usuario.id });
      await chamarAdmin('enviar_acesso', { user_id: usuario.id, codigo: r.codigo });
      toast(`E-mail para ${usuario.email} colocado na fila de envio.`, 'ok');
      fecharModal();
      carregarTudo();
    } catch (erro) {
      ocupado(e.target, false, 'Gerar e enviar');
      toast(erro.message, 'erro');
    }
  });
}

function modalExcluir(usuario) {
  const pastas = estado.pastasPorPessoa.get(usuario.id) ?? [];

  abrirModal(`
    <div class="modal-topo">
      <h2 style="color:var(--vermelho)">Excluir ${esc(usuario.nome)}</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <div class="aviso visivel erro">
      <strong>Isto não tem volta.</strong> Serão apagados de forma permanente:
      <ul style="margin:8px 0 0;padding-left:18px">
        <li>o cadastro e o acesso desta pessoa</li>
        <li>${pastas.length} pasta(s) de liderança</li>
        <li>todos os textos e datas dos requisitos</li>
        <li><strong>todas as fotos enviadas como evidência</strong></li>
      </ul>
    </div>
    <div class="campo" style="margin-top:16px">
      <label for="confirma-nome">Para confirmar, digite <strong>EXCLUIR</strong></label>
      <input type="text" id="confirma-nome" autocomplete="off" placeholder="EXCLUIR">
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar-exclusao"
              style="background:var(--vermelho)" disabled>Excluir tudo</button>
    </div>`);

  const campo = $('#confirma-nome');
  const botao = $('#confirmar-exclusao');

  campo.addEventListener('input', () => {
    botao.disabled = campo.value.trim().toUpperCase() !== 'EXCLUIR';
  });

  botao.addEventListener('click', async () => {
    ocupado(botao, true, 'Excluir tudo');
    try {
      await chamarAdmin('excluir_usuario', { user_id: usuario.id });
      toast(`${usuario.nome} foi excluído.`, 'ok');
      fecharModal();
      estado.selecionados.delete(usuario.id);
      carregarTudo();
    } catch (erro) {
      ocupado(botao, false, 'Excluir tudo');
      toast(erro.message, 'erro');
    }
  });
}

/* ----------------------------------------------------------- editar */

function modalEditar(usuario) {
  abrirModal(`
    <div class="modal-topo">
      <h2>Editar cadastro</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <div id="aviso-editar" class="aviso"></div>
    <div class="grade-2">
      <div class="campo largura-total">
        <label for="e-nome">Nome completo</label>
        <input type="text" id="e-nome" value="${esc(usuario.nome)}">
      </div>
      <div class="campo">
        <label for="e-nasc">Data de nascimento</label>
        <input type="date" id="e-nasc" value="${esc(usuario.data_nascimento)}">
      </div>
      <div class="campo">
        <label for="e-turma">Turma</label>
        <select id="e-turma">
          <option value="">Sem turma informada</option>
          ${estado.turmas.map(t => `<option value="${t.id}"
            ${t.id === usuario.turma_id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="e-ra">RA</label>
        <input type="text" id="e-ra" inputmode="numeric" value="${esc(usuario.ra)}">
      </div>
      <div class="campo">
        <label for="e-cpf">CPF</label>
        <input type="text" id="e-cpf" inputmode="numeric" value="${esc(usuario.cpf ?? '')}">
      </div>
      <div class="campo largura-total">
        <label for="e-tipo">Tipo de perfil</label>
        <select id="e-tipo">
          <option value="candidato"     ${usuario.tipo === 'candidato' ? 'selected' : ''}>Candidato</option>
          <option value="revisor"       ${usuario.tipo === 'revisor' ? 'selected' : ''}>Revisor</option>
          <option value="administrador" ${usuario.tipo === 'administrador' ? 'selected' : ''}>Administrador</option>
        </select>
        ${usuario.id === estado.eu.id
          ? '<div class="dica-campo">Você não pode rebaixar o seu próprio perfil.</div>' : ''}
      </div>
    </div>
    <div class="dica-campo" style="margin-bottom:8px">
      O e-mail (${esc(usuario.email)}) não é editável — ele é a identidade de acesso.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="salvar-edicao">Salvar</button>
    </div>`);

  if (usuario.id === estado.eu.id) $('#e-tipo').disabled = true;

  $('#salvar-edicao').addEventListener('click', async e => {
    const cpf = soDigitos($('#e-cpf').value);
    if (cpf && !cpfValido(cpf)) { avisar('#aviso-editar', 'CPF inválido.'); return; }

    ocupado(e.target, true, 'Salvar');

    const { error } = await sb.from('perfis').update({
      nome: $('#e-nome').value.trim(),
      data_nascimento: $('#e-nasc').value,
      turma_id: $('#e-turma').value || null,
      ra: soDigitos($('#e-ra').value),
      cpf: cpf || null,
      ...(usuario.id === estado.eu.id ? {} : { tipo: $('#e-tipo').value })
    }).eq('id', usuario.id);

    if (error) {
      ocupado(e.target, false, 'Salvar');
      avisar('#aviso-editar', traduzErro(error));
      return;
    }

    toast('Cadastro atualizado.', 'ok');
    fecharModal();
    carregarTudo();
  });
}

/* ------------------------------------------------------ atribuir pastas */

function modalPastas(pessoas) {
  const uma = pessoas.length === 1;
  const jaTem = uma
    ? new Set((estado.pastasPorPessoa.get(pessoas[0].id) ?? [])
        .map(p => p.formulario?.nome))
    : new Set();

  abrirModal(`
    <div class="modal-topo">
      <h2>Atribuir pastas</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.88rem;color:var(--texto-suave);margin:0 0 14px">
      ${uma ? `Para <strong>${esc(pessoas[0].nome)}</strong>.`
            : `Para <strong>${pessoas.length} pessoas</strong> selecionadas.`}
      Marcar uma pasta libera o formulário para a pessoa começar a preencher.
    </p>
    <div class="lista-selecao">
      ${estado.formularios.map(f => `
        <label class="item-selecao">
          <input type="checkbox" class="marca-pasta" value="${f.id}"
                 ${jaTem.has(f.nome) ? 'checked disabled' : ''}>
          <span>
            ${esc(f.nome)}
            ${jaTem.has(f.nome) ? '<div class="sub">já atribuída</div>' : ''}
          </span>
        </label>`).join('')}
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="salvar-pastas">Atribuir</button>
    </div>`);

  $('#salvar-pastas').addEventListener('click', async e => {
    const escolhidas = $$('.marca-pasta:checked:not(:disabled)').map(i => i.value);
    if (!escolhidas.length) { toast('Escolha ao menos uma pasta.', 'erro'); return; }

    ocupado(e.target, true, 'Atribuir');

    const linhas = [];
    for (const pessoa of pessoas) {
      for (const f of escolhidas) {
        linhas.push({
          candidato_id: pessoa.id, formulario_id: f,
          status: 'ativa', atribuida_por: estado.eu.id, atribuida_em: new Date()
        });
      }
    }

    const { error } = await sb.from('pastas')
      .upsert(linhas, { onConflict: 'candidato_id,formulario_id', ignoreDuplicates: false });

    if (error) {
      ocupado(e.target, false, 'Atribuir');
      toast(traduzErro(error), 'erro');
      return;
    }

    toast('Pastas atribuídas.', 'ok');
    fecharModal();
    estado.selecionados.clear();
    carregarTudo();
  });
}

/* ================================================== CADASTRO DE PESSOA */

function preencherTurmasSelect() {
  const opcoes = '<option value="">Selecione…</option>' +
    estado.turmas.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  $('#u-turma').innerHTML = estado.turmas.length ? opcoes
    : '<option value="">Cadastre uma turma primeiro</option>';
}

function preencherPastasNovo() {
  $('#lista-pastas-novo').innerHTML = estado.formularios.map(f => `
    <label class="item-selecao">
      <input type="checkbox" class="pasta-novo" value="${f.id}">
      <span>${esc(f.nome)}</span>
    </label>`).join('');
}

function preencherCandidatos(filtro = '') {
  const q = filtro.trim().toLowerCase();

  const lista = estado.usuarios
    .filter(u => u.tipo === 'candidato')
    .filter(u => !q || [u.nome, u.ra, u.turma?.nome]
      .some(v => String(v ?? '').toLowerCase().includes(q)));

  $('#lista-candidatos').innerHTML = lista.length
    ? lista.map(u => `
      <label class="item-selecao">
        <input type="checkbox" class="cand-novo" value="${u.id}">
        <span>${esc(u.nome)}
          <div class="sub">RA ${esc(u.ra)}${u.turma ? ' · ' + esc(u.turma.nome) : ''}</div>
        </span>
      </label>`).join('')
    : '<div class="vazio" style="padding:18px">Nenhum candidato encontrado.</div>';
}

$('#u-tipo').addEventListener('change', e => {
  const ehRevisor = e.target.value === 'revisor';
  $('#bloco-candidatos').hidden = !ehRevisor;
  if (ehRevisor) preencherCandidatos($('#busca-candidatos').value);
});

$('#busca-candidatos').addEventListener('input', e => preencherCandidatos(e.target.value));

$('#u-ra').addEventListener('input', e => { e.target.value = soDigitos(e.target.value); });

$('#u-cpf').addEventListener('input', e => {
  const d = soDigitos(e.target.value).slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
});

/* foto — o <label> já abre o seletor sozinho; o evento é delegado porque
   o conteúdo do círculo é trocado depois que a prévia aparece */
$('#alvo-foto').addEventListener('change', async e => {
  if (e.target.id !== 'arquivo-foto') return;

  const arquivo = e.target.files?.[0];
  if (!arquivo) return;

  try {
    const { blob } = await comprimirAvatar(arquivo);
    estado.fotoNova = blob;
    $('#alvo-foto').innerHTML =
      `<img src="${await previa(blob)}" alt="">` +
      '<input type="file" id="arquivo-foto" accept="image/jpeg,image/png" hidden>';
  } catch (erro) {
    e.target.value = '';
    toast(erro instanceof ErroImagem ? erro.message : 'Falha ao ler a imagem.', 'erro');
  }
});

function limparFoto() {
  estado.fotoNova = null;
  $('#alvo-foto').innerHTML =
    '<span id="placeholder-foto">👤</span>' +
    '<input type="file" id="arquivo-foto" accept="image/jpeg,image/png" hidden>';
}

$('#form-usuario').addEventListener('submit', async e => {
  e.preventDefault();
  limparAviso('#aviso-cadastro');

  const dados = {
    nome: $('#u-nome').value.trim(),
    data_nascimento: $('#u-nascimento').value,
    turma_id: $('#u-turma').value || null,
    ra: soDigitos($('#u-ra').value),
    cpf: soDigitos($('#u-cpf').value),
    email: $('#u-email').value.trim().toLowerCase(),
    tipo: $('#u-tipo').value,
    candidatos: $$('.cand-novo:checked').map(i => i.value),
    pastas: $$('.pasta-novo:checked').map(i => i.value)
  };

  if (!dados.nome || !dados.data_nascimento || !dados.ra || !dados.email) {
    avisar('#aviso-cadastro', 'Preencha todos os campos obrigatórios.'); return;
  }
  if (!dados.turma_id) {
    avisar('#aviso-cadastro', 'Escolha a turma. Se não houver nenhuma, cadastre na aba ao lado.'); return;
  }
  if (dados.cpf && !cpfValido(dados.cpf)) {
    avisar('#aviso-cadastro', 'CPF inválido. Confira os números ou deixe em branco.'); return;
  }

  const botao = $('#btn-cadastrar');
  ocupado(botao, true, 'Cadastrar e gerar código');

  try {
    const r = await chamarAdmin('criar_usuario', dados);

    // foto: só depois que o usuário existe, porque o caminho leva o id dele
    if (estado.fotoNova) {
      const caminho = `${r.id}/perfil.jpg`;
      const up = await sb.storage.from('fotos-perfil')
        .upload(caminho, estado.fotoNova, { upsert: true, contentType: 'image/jpeg' });

      if (!up.error) await sb.from('perfis').update({ foto_url: caminho }).eq('id', r.id);
    }

    $('#form-usuario').reset();
    limparFoto();
    $('#bloco-candidatos').hidden = true;

    ocupado(botao, false, 'Cadastrar e gerar código');
    await carregarTudo();
    mostrarCodigo({ nome: dados.nome, email: dados.email, id: r.id }, r.codigo);

  } catch (erro) {
    ocupado(botao, false, 'Cadastrar e gerar código');
    avisar('#aviso-cadastro', erro.message);
  }
});

/* ============================================= PEDIDOS DE ACESSO */

function atualizarSeloPedidos() {
  const selo = $('#selo-pedidos');
  selo.textContent = String(estado.pedidos.length);
  selo.hidden = !estado.pedidos.length;
}

$('#btn-pedidos').addEventListener('click', () => {
  if (!estado.pedidos.length) {
    abrirModal(`
      <div class="modal-topo">
        <h2>Pedidos de acesso</h2>
        <button class="fechar" data-fechar>×</button>
      </div>
      <div class="vazio"><span class="simbolo">📭</span>
        Nenhum pedido aguardando avaliação.</div>`);
    return;
  }

  abrirModal(`
    <div class="modal-topo">
      <h2>Pedidos de acesso <span class="conta">${estado.pedidos.length}</span></h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${estado.pedidos.map(p => `
        <div class="bloco" style="margin:0;padding:14px" data-pedido="${p.id}">
          <strong style="font-size:.95rem">${esc(p.nome)}</strong>
          <div style="font-size:.82rem;color:var(--texto-suave);margin:6px 0 12px;line-height:1.6">
            ${p.turma ? esc(p.turma.nome) : 'sem turma informada'}<br>
            RA ${esc(p.ra)} · CPF ${esc(formatarCPF(p.cpf))}<br>
            ${esc(p.email)}
          </div>
          <div style="display:flex;gap:8px">
            <button class="botao botao-vazado" data-recusar="${p.id}"
                    style="padding:8px 14px;font-size:.84rem">Recusar</button>
            <button class="botao botao-principal" data-aprovar="${p.id}"
                    style="padding:8px 14px;font-size:.84rem">Aprovar</button>
          </div>
        </div>`).join('')}
    </div>`, { largo: true });
});

$('#caixa-modal').addEventListener('click', e => {
  const aprovar = e.target.closest('[data-aprovar]');
  const recusar = e.target.closest('[data-recusar]');

  if (aprovar) modalAprovar(estado.pedidos.find(p => p.id === aprovar.dataset.aprovar));
  if (recusar) modalRecusar(estado.pedidos.find(p => p.id === recusar.dataset.recusar));
});

function modalAprovar(pedido) {
  abrirModal(`
    <div class="modal-topo">
      <h2>Aprovar ${esc(pedido.nome)}</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.88rem;color:var(--texto-suave);margin:0 0 14px">
      Escolha quais pastas esta pessoa já pode começar. Dá para atribuir
      mais depois, pela tabela de usuários.
    </p>
    <div class="lista-selecao">
      ${estado.formularios.map(f => `
        <label class="item-selecao">
          <input type="checkbox" class="pasta-aprovar" value="${f.id}">
          <span>${esc(f.nome)}</span>
        </label>`).join('')}
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar-aprovacao">Aprovar e gerar código</button>
    </div>`);

  $('#confirmar-aprovacao').addEventListener('click', async e => {
    ocupado(e.target, true, 'Aprovar e gerar código');
    try {
      const r = await chamarAdmin('aprovar_pedido', {
        pedido_id: pedido.id,
        pastas: $$('.pasta-aprovar:checked').map(i => i.value)
      });
      await carregarTudo();
      mostrarCodigo({ nome: pedido.nome, email: pedido.email, id: r.id }, r.codigo);
    } catch (erro) {
      ocupado(e.target, false, 'Aprovar e gerar código');
      toast(erro.message, 'erro');
    }
  });
}

function modalRecusar(pedido) {
  abrirModal(`
    <div class="modal-topo">
      <h2>Recusar ${esc(pedido.nome)}</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.88rem;line-height:1.55">
      Um e-mail será enviado para <strong>${esc(pedido.email)}</strong> avisando
      que o pedido não foi aprovado, e o nome sai desta lista.
    </p>
    <div class="campo" style="margin-top:14px">
      <label for="motivo">Observação para a pessoa (opcional)</label>
      <textarea id="motivo" placeholder="Ex.: o RA informado não confere com o cadastro da turma."
                style="min-height:80px"></textarea>
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar-recusa"
              style="background:var(--vermelho)">Recusar pedido</button>
    </div>`);

  $('#confirmar-recusa').addEventListener('click', async e => {
    ocupado(e.target, true, 'Recusar pedido');
    try {
      await chamarAdmin('recusar_pedido', {
        pedido_id: pedido.id, motivo: $('#motivo').value.trim()
      });
      toast('Pedido recusado e e-mail na fila de envio.', 'ok');
      fecharModal();
      carregarTudo();
    } catch (erro) {
      ocupado(e.target, false, 'Recusar pedido');
      toast(erro.message, 'erro');
    }
  });
}

/* ==================================================== CADASTRO DE TURMA */

function desenharTurmas() {
  const corpo = $('#corpo-turmas');
  $('#conta-turmas').textContent = String(estado.turmas.length);

  if (!estado.turmas.length) {
    corpo.innerHTML = `<tr><td colspan="3" class="vazio">
      <span class="simbolo">🎓</span>Nenhuma turma cadastrada ainda.</td></tr>`;
    return;
  }

  corpo.innerHTML = estado.turmas.map(t => {
    const quantos = estado.usuarios.filter(u => u.turma_id === t.id).length;
    return `
    <tr>
      <td><strong>${esc(t.nome)}</strong></td>
      <td>${quantos}</td>
      <td>
        <div class="acoes-celula">
          <button class="botao-icone" data-turma-editar="${t.id}" title="Editar">✏️</button>
          <button class="botao-icone perigo" data-turma-excluir="${t.id}" title="Excluir">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

$('#form-turma').addEventListener('submit', async e => {
  e.preventDefault();
  limparAviso('#aviso-turma');

  const nome = $('#t-nome').value.trim();
  if (!nome) { avisar('#aviso-turma', 'Informe o nome da turma.'); return; }

  const botao = $('#btn-turma');
  ocupado(botao, true, 'Salvar turma');

  const { error } = await sb.from('turmas').insert({ nome });
  ocupado(botao, false, 'Salvar turma');

  if (error) {
    avisar('#aviso-turma', /duplicate|unique/i.test(error.message)
      ? `Já existe uma turma chamada "${nome}".`
      : traduzErro(error));
    return;
  }

  $('#form-turma').reset();
  avisar('#aviso-turma', 'Turma cadastrada.', 'ok');
  carregarTudo();
});

$('#corpo-turmas').addEventListener('click', async e => {
  const editar  = e.target.closest('[data-turma-editar]');
  const excluir = e.target.closest('[data-turma-excluir]');

  if (editar) {
    const turma = estado.turmas.find(t => t.id === editar.dataset.turmaEditar);
    abrirModal(`
      <div class="modal-topo">
        <h2>Editar turma</h2><button class="fechar" data-fechar>×</button>
      </div>
      <div id="aviso-editar-turma" class="aviso"></div>
      <div class="campo">
        <label for="et-nome">Nome da turma</label>
        <input type="text" id="et-nome" value="${esc(turma.nome)}">
      </div>
      <div class="modal-acoes">
        <button class="botao botao-vazado" data-fechar>Cancelar</button>
        <button class="botao botao-principal" id="salvar-turma">Salvar</button>
      </div>`);

    $('#salvar-turma').addEventListener('click', async ev => {
      ocupado(ev.target, true, 'Salvar');
      const { error } = await sb.from('turmas')
        .update({ nome: $('#et-nome').value.trim() }).eq('id', turma.id);

      if (error) {
        ocupado(ev.target, false, 'Salvar');
        avisar('#aviso-editar-turma', /duplicate|unique/i.test(error.message)
          ? 'Já existe outra turma com este nome.' : traduzErro(error));
        return;
      }
      toast('Turma atualizada.', 'ok'); fecharModal(); carregarTudo();
    });
  }

  if (excluir) {
    const turma = estado.turmas.find(t => t.id === excluir.dataset.turmaExcluir);
    const quantos = estado.usuarios.filter(u => u.turma_id === turma.id).length;

    abrirModal(`
      <div class="modal-topo">
        <h2>Excluir turma</h2><button class="fechar" data-fechar>×</button>
      </div>
      <p style="font-size:.9rem;line-height:1.55">
        Excluir a turma <strong>${esc(turma.nome)}</strong>?
      </p>
      ${quantos ? `<div class="aviso visivel info" style="margin-top:12px">
        ${quantos} pessoa(s) estão nesta turma. Elas não serão apagadas — vão
        aparecer como <em>sem turma informada</em>.</div>` : ''}
      <div class="modal-acoes">
        <button class="botao botao-vazado" data-fechar>Cancelar</button>
        <button class="botao botao-principal" id="confirmar-turma"
                style="background:var(--vermelho)">Excluir</button>
      </div>`);

    $('#confirmar-turma').addEventListener('click', async ev => {
      ocupado(ev.target, true, 'Excluir');
      const { error } = await sb.from('turmas').delete().eq('id', turma.id);
      if (error) { ocupado(ev.target, false, 'Excluir'); toast(traduzErro(error), 'erro'); return; }
      toast('Turma excluída.', 'ok'); fecharModal(); carregarTudo();
    });
  }
});

/* ------------------------------------------------------------------ abas */

$$('.aba').forEach(aba => {
  aba.addEventListener('click', () => {
    $$('.aba').forEach(a => a.classList.toggle('ativa', a === aba));
    $$('.painel-aba').forEach(p =>
      p.classList.toggle('ativa', p.id === `painel-${aba.dataset.aba}`));
  });
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

  estado.eu = perfil;
  await montarBarra(perfil);
  carregarTudo();
})();
