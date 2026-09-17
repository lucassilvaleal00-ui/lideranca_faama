/* =====================================================================
   Peças de interface usadas por todas as telas internas:
   barra superior, menu do usuário, notificações, toast e instalação do app.
   ===================================================================== */

import { sb, sair } from './cliente.js';

export const $  = (s, raiz = document) => raiz.querySelector(s);
export const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];

/* Escapa texto antes de jogar no HTML. Nomes e descrições vêm de usuários:
   sem isso, alguém poderia injetar script no nome e atingir o revisor. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ toast */

let toastAtual;

export function toast(texto, tipo = '') {
  clearTimeout(toastAtual);
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  requestAnimationFrame(() => el.classList.add('visivel'));
  toastAtual = setTimeout(() => el.classList.remove('visivel'), 3800);
}

/* ----------------------------------------------------------------- datas */

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function quandoFoi(iso) {
  const seg = (Date.now() - new Date(iso)) / 1000;
  if (seg < 60)     return 'agora há pouco';
  if (seg < 3600)   return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400)  return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ontem';
  return dataBR(iso);
}

/* ---------------------------------------------------------------- avatar */

const cacheAvatar = new Map();

export async function urlAvatar(perfil) {
  if (!perfil?.foto_url) return null;
  if (cacheAvatar.has(perfil.id)) return cacheAvatar.get(perfil.id);

  const { data } = await sb.storage
    .from('fotos-perfil')
    .createSignedUrl(perfil.foto_url, 3600);

  const url = data?.signedUrl ?? null;
  cacheAvatar.set(perfil.id, url);
  return url;
}

function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/* ---------------------------------------------------- instalação do app */

let promptInstalacao = null;

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  promptInstalacao = e;
  const botao = $('#btn-instalar');
  if (botao) botao.hidden = false;
});

/* ----------------------------------------------------------- barra superior */

export async function montarBarra(perfil) {
  const barra = document.createElement('header');
  barra.className = 'barra';
  barra.innerHTML = `
    <a class="barra-marca" href="inicio.html" style="color:inherit;text-decoration:none">
      <img src="assets/logo.png" alt="">
      <span>App de Liderança</span>
    </a>

    <button class="icone-barra" id="btn-instalar" hidden
            title="Instalar no celular" aria-label="Instalar no celular">⬇</button>

    <button class="icone-barra" id="btn-notif" aria-label="Notificações">
      🔔<span class="selo" id="selo-notif" hidden></span>
    </button>

    <button class="avatar avatar-letra" id="btn-usuario" aria-label="Sua conta"
            style="border:2px solid rgba(255,255,255,.55)">${esc(iniciais(perfil.nome))}</button>
  `;
  document.body.prepend(barra);

  /* foto no lugar das iniciais, se houver */
  const url = await urlAvatar(perfil);
  if (url) {
    const img = document.createElement('img');
    img.className = 'avatar';
    img.id = 'btn-usuario';
    img.src = url;
    img.alt = 'Sua conta';
    $('#btn-usuario').replaceWith(img);
  }

  montarMenuUsuario(perfil);
  montarPainelNotificacoes();

  $('#btn-instalar')?.addEventListener('click', async () => {
    if (!promptInstalacao) return;
    promptInstalacao.prompt();
    await promptInstalacao.userChoice;
    promptInstalacao = null;
    $('#btn-instalar').hidden = true;
  });
}

/* ------------------------------------------------------- menu do usuário */

function montarMenuUsuario(perfil) {
  const menu = document.createElement('div');
  menu.className = 'menu-flutuante';
  menu.id = 'menu-usuario';

  const rotulo = { administrador: 'Administrador', revisor: 'Revisor', candidato: 'Candidato' };

  menu.innerHTML = `
    <div class="cabeca">
      <strong>${esc(perfil.nome)}</strong>
      <small>${esc(rotulo[perfil.tipo])}${perfil.turma ? ' · ' + esc(perfil.turma.nome) : ''}</small>
    </div>
    <button class="menu-item" data-vai="perfil.html">👤 Meu perfil</button>
    ${perfil.tipo === 'administrador'
      ? '<button class="menu-item" data-vai="admin.html">⚙️ Ver painel do Administrador</button>'
      : ''}
    <button class="menu-item perigo" id="btn-sair">↪ Sair</button>
  `;
  document.body.appendChild(menu);

  $('#btn-usuario').addEventListener('click', e => {
    e.stopPropagation();
    $('#painel-notif')?.classList.remove('aberto');
    menu.classList.toggle('aberto');
  });

  menu.addEventListener('click', e => {
    const item = e.target.closest('[data-vai]');
    if (item) location.href = item.dataset.vai;
  });

  $('#btn-sair').addEventListener('click', sair);
}

/* --------------------------------------------------------- notificações */

async function montarPainelNotificacoes() {
  const painel = document.createElement('div');
  painel.className = 'menu-flutuante';
  painel.id = 'painel-notif';
  painel.style.minWidth = '310px';
  painel.innerHTML = `
    <div class="cabeca" style="display:flex;align-items:center;gap:10px">
      <strong style="margin-right:auto">Notificações</strong>
    </div>

    <div class="barra-notif" id="barra-notif" hidden>
      <label class="checkbox">
        <input type="checkbox" id="marcar-todas-notif">
        Selecionar todas
      </label>
      <button class="acao" id="acao-lida" disabled>Marcar como lida</button>
      <button class="acao perigo" id="acao-apagar" disabled>Apagar</button>
    </div>

    <div class="lista-notificacoes" id="lista-notif">
      <div class="vazio">Carregando…</div>
    </div>
  `;
  document.body.appendChild(painel);

  /* clicar dentro do painel não deve fechá-lo */
  painel.addEventListener('click', e => e.stopPropagation());

  $('#btn-notif').addEventListener('click', e => {
    e.stopPropagation();
    $('#menu-usuario')?.classList.remove('aberto');
    painel.classList.toggle('aberto');
    if (painel.classList.contains('aberto')) carregarNotificacoes();
  });

  $('#marcar-todas-notif').addEventListener('change', e => {
    $$('.marca-notif').forEach(c => { c.checked = e.target.checked; });
    atualizarAcoesNotif();
  });

  $('#acao-lida').addEventListener('click', async () => {
    const ids = selecionadasNotif();
    if (!ids.length) return;
    await sb.from('notificacoes').update({ lida: true }).in('id', ids);
    await carregarNotificacoes();
    atualizarSelo();
  });

  $('#acao-apagar').addEventListener('click', async () => {
    const ids = selecionadasNotif();
    if (!ids.length) return;
    await sb.from('notificacoes').delete().in('id', ids);
    await carregarNotificacoes();
    atualizarSelo();
  });

  atualizarSelo();
  setInterval(atualizarSelo, 60000);
}

const selecionadasNotif = () => $$('.marca-notif:checked').map(c => c.dataset.id);

function atualizarAcoesNotif() {
  const n = selecionadasNotif().length;
  $('#acao-lida').disabled = !n;
  $('#acao-apagar').disabled = !n;
  $('#acao-lida').textContent   = n ? `Marcar ${n} como lida` : 'Marcar como lida';
  $('#acao-apagar').textContent = n ? `Apagar ${n}` : 'Apagar';

  const total = $$('.marca-notif').length;
  const todas = $('#marcar-todas-notif');
  if (todas) {
    todas.checked = total > 0 && n === total;
    todas.indeterminate = n > 0 && n < total;
  }
}

async function atualizarSelo() {
  const { count } = await sb
    .from('notificacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lida', false);

  const selo = $('#selo-notif');
  if (!selo) return;
  selo.textContent = count > 99 ? '99+' : String(count ?? 0);
  selo.hidden = !count;
}

async function carregarNotificacoes() {
  const lista = $('#lista-notif');

  const { data, error } = await sb
    .from('notificacoes')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) {
    lista.innerHTML = '<div class="vazio">Não foi possível carregar.</div>';
    $('#barra-notif').hidden = true;
    return;
  }

  if (!data?.length) {
    lista.innerHTML = '<div class="vazio"><span class="simbolo">🔕</span>Nenhuma notificação por aqui.</div>';
    $('#barra-notif').hidden = true;
    return;
  }

  $('#barra-notif').hidden = false;

  lista.innerHTML = data.map(n => `
    <div class="notificacao ${n.lida ? '' : 'nao-lida'}">
      <input type="checkbox" class="marca-notif" data-id="${n.id}"
             aria-label="Selecionar notificação">
      <div class="texto" data-id="${n.id}" ${n.link ? `data-link="${esc(n.link)}"` : ''}>
        <strong>${esc(n.titulo)}</strong>
        <span>${esc(n.mensagem || '')}</span>
        <time>${quandoFoi(n.criado_em)}</time>
      </div>
    </div>
  `).join('');

  $$('.marca-notif', lista).forEach(c =>
    c.addEventListener('change', atualizarAcoesNotif));

  $$('.texto', lista).forEach(el => {
    el.addEventListener('click', async () => {
      await sb.from('notificacoes').update({ lida: true }).eq('id', el.dataset.id);
      atualizarSelo();
      if (el.dataset.link) location.href = el.dataset.link;
      else el.closest('.notificacao').classList.remove('nao-lida');
    });
  });

  atualizarAcoesNotif();
}

/* fecha os menus ao clicar fora */
document.addEventListener('click', () => {
  $('#menu-usuario')?.classList.remove('aberto');
  $('#painel-notif')?.classList.remove('aberto');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    $('#menu-usuario')?.classList.remove('aberto');
    $('#painel-notif')?.classList.remove('aberto');
  }
});
