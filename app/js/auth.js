/* =====================================================================
   Telas de acesso: login, primeiro acesso, redefinição de senha e a
   troca obrigatória da senha provisória.
   ===================================================================== */

import { sb, definirLembrar, meuPerfil, limparPerfil, traduzErro } from './cliente.js';

const $  = (s, raiz = document) => raiz.querySelector(s);
const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];

const aviso = $('#aviso');
let emailEmRedefinicao = '';

/* ------------------------------------------------------------- utilidades */

function mostrar(texto, tipo = 'erro') {
  aviso.textContent = texto;
  aviso.className = `aviso visivel ${tipo}`;
  aviso.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function limparAviso() { aviso.className = 'aviso'; aviso.textContent = ''; }

function irPara(id, { manterAviso = false } = {}) {
  if (!manterAviso) limparAviso();
  $$('.tela').forEach(t => t.classList.toggle('ativa', t.id === id));
  const primeiro = $(`#${id} input:not([type=checkbox])`);
  if (primeiro && matchMedia('(min-width: 720px)').matches) primeiro.focus();
}

function ocupado(botao, sim, textoOriginal) {
  botao.disabled = sim;
  botao.innerHTML = sim ? '<span class="girando"></span>' : textoOriginal;
}

const soDigitos = v => (v || '').replace(/\D/g, '');

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

function marcarInvalido(campo, invalido) {
  campo.setAttribute('aria-invalid', invalido ? 'true' : 'false');
}

/* ------------------------------------------------------- navegação e olhos */

$$('[data-ir]').forEach(b => b.addEventListener('click', () => irPara(b.dataset.ir)));

$$('.olho').forEach(botao => {
  botao.addEventListener('click', () => {
    const campo = document.getElementById(botao.dataset.alvo);
    const vendo = campo.type === 'text';
    campo.type = vendo ? 'password' : 'text';
    botao.setAttribute('aria-label', vendo ? 'Mostrar senha' : 'Ocultar senha');
    campo.focus();
  });
});

/* máscaras leves: RA e CPF só aceitam número */
$('#c-ra').addEventListener('input', e => { e.target.value = soDigitos(e.target.value); });

$('#c-cpf').addEventListener('input', e => {
  const d = soDigitos(e.target.value).slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
});

/* ============================================================== 1. LOGIN */

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  limparAviso();

  const email  = $('#login-email').value.trim().toLowerCase();
  const senha  = $('#login-senha').value;
  const botao  = $('#btn-entrar');

  if (!email || !senha) { mostrar('Preencha e-mail e senha.'); return; }

  definirLembrar($('#lembrar').checked);
  ocupado(botao, true, 'Entrar');

  const { error } = await sb.auth.signInWithPassword({ email, password: senha });

  if (error) { ocupado(botao, false, 'Entrar'); mostrar(traduzErro(error)); return; }

  limparPerfil();
  const perfil = await meuPerfil({ recarregar: true });

  if (perfil?.senha_provisoria) {
    ocupado(botao, false, 'Entrar');
    irPara('tela-trocar');
    mostrar('Acesso confirmado. Agora crie a sua senha pessoal.', 'info');
    return;
  }

  location.replace('inicio.html');
});

/* ================================================= 2. PRIMEIRO ACESSO */

async function carregarTurmas() {
  const select = $('#c-turma');
  const { data, error } = await sb.from('turmas').select('id, nome').order('nome');

  if (error) {
    select.innerHTML = '<option value="">Não foi possível carregar</option>';
    return;
  }
  if (!data?.length) {
    select.innerHTML = '<option value="">Nenhuma turma cadastrada</option>';
    return;
  }
  select.innerHTML = '<option value="">Selecione…</option>' +
    data.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
}

$('#form-cadastro').addEventListener('submit', async e => {
  e.preventDefault();
  limparAviso();

  const nome       = $('#c-nome').value.trim();
  const nascimento = $('#c-nascimento').value;
  const turmaId    = $('#c-turma').value;
  const ra         = soDigitos($('#c-ra').value);
  const cpf        = soDigitos($('#c-cpf').value);
  const email      = $('#c-email').value.trim().toLowerCase();
  const botao      = $('#btn-solicitar');

  marcarInvalido($('#c-cpf'), false);
  marcarInvalido($('#c-ra'), false);

  if (!nome || !nascimento || !turmaId || !ra || !email) {
    mostrar('Preencha todos os campos obrigatórios.');
    return;
  }
  if (ra.length < 4) { marcarInvalido($('#c-ra'), true); mostrar('RA inválido.'); return; }
  if (cpf && !cpfValido(cpf)) {
    marcarInvalido($('#c-cpf'), true);
    mostrar('CPF inválido. Confira os números ou deixe o campo em branco.');
    return;
  }
  if (new Date(nascimento) > new Date()) {
    mostrar('A data de nascimento não pode estar no futuro.');
    return;
  }

  ocupado(botao, true, 'Solicitar acesso');

  const { error } = await sb.from('pedidos_acesso').insert({
    nome, data_nascimento: nascimento, turma_id: turmaId,
    ra, cpf: cpf || null, email, status: 'pendente'
  });

  ocupado(botao, false, 'Solicitar acesso');

  if (error) {
    mostrar(/duplicate|already exists/i.test(error.message)
      ? 'Já existe um pedido de acesso com este e-mail aguardando avaliação.'
      : traduzErro(error));
    return;
  }

  $('#form-cadastro').reset();
  irPara('tela-login', { manterAviso: true });
  mostrar('Pedido enviado. Um administrador vai avaliar o seu cadastro e ' +
          'você receberá a resposta no e-mail informado.', 'ok');
});

/* ============================================ 3. REDEFINIR SENHA (código) */

$('#form-esqueci').addEventListener('submit', async e => {
  e.preventDefault();
  limparAviso();

  const email = $('#e-email').value.trim().toLowerCase();
  const botao = $('#btn-codigo');
  if (!email) { mostrar('Informe o e-mail cadastrado.'); return; }

  ocupado(botao, true, 'Enviar código');

  /* shouldCreateUser: false — não cria conta nova para um e-mail desconhecido */
  const { error } = await sb.auth.signInWithOtp({
    email, options: { shouldCreateUser: false }
  });

  ocupado(botao, false, 'Enviar código');

  if (error) { mostrar(traduzErro(error)); return; }

  emailEmRedefinicao = email;
  $('#eco-email').textContent = email;
  irPara('tela-codigo');
  mostrar('Código enviado. Ele vale por poucos minutos.', 'info');
});

/* caixinhas do código: anda sozinho, aceita colar os 6 de uma vez */
const digitos = $$('#caixa-codigo input');

digitos.forEach((campo, i) => {
  campo.addEventListener('input', () => {
    campo.value = soDigitos(campo.value).slice(0, 1);
    if (campo.value && i < digitos.length - 1) digitos[i + 1].focus();
  });

  campo.addEventListener('keydown', ev => {
    if (ev.key === 'Backspace' && !campo.value && i > 0) digitos[i - 1].focus();
  });

  campo.addEventListener('paste', ev => {
    ev.preventDefault();
    const texto = soDigitos(ev.clipboardData.getData('text')).slice(0, 6);
    texto.split('').forEach((d, k) => { if (digitos[k]) digitos[k].value = d; });
    digitos[Math.min(texto.length, 5)].focus();
  });
});

$('#form-codigo').addEventListener('submit', async e => {
  e.preventDefault();
  limparAviso();

  const codigo = digitos.map(d => d.value).join('');
  const senha  = $('#nova-senha').value;
  const botao  = $('#btn-nova-senha');

  if (codigo.length !== 6) { mostrar('Digite os 6 dígitos do código.'); return; }
  if (senha.length < 8)    { mostrar('A senha precisa ter pelo menos 8 caracteres.'); return; }

  ocupado(botao, true, 'Salvar nova senha');

  const { error: erroCodigo } = await sb.auth.verifyOtp({
    email: emailEmRedefinicao, token: codigo, type: 'email'
  });

  if (erroCodigo) {
    ocupado(botao, false, 'Salvar nova senha');
    mostrar(traduzErro(erroCodigo));
    return;
  }

  const { error: erroSenha } = await sb.auth.updateUser({ password: senha });

  if (erroSenha) {
    ocupado(botao, false, 'Salvar nova senha');
    mostrar(traduzErro(erroSenha));
    return;
  }

  await sb.from('perfis')
    .update({ senha_provisoria: false })
    .eq('id', (await sb.auth.getUser()).data.user.id);

  location.replace('inicio.html');
});

/* ========================================= 4. TROCA DA SENHA PROVISÓRIA */

$('#form-trocar').addEventListener('submit', async e => {
  e.preventDefault();
  limparAviso();

  const senha  = $('#t-senha').value;
  const senha2 = $('#t-senha2').value;
  const botao  = $('#btn-trocar');

  if (senha.length < 8) { mostrar('A senha precisa ter pelo menos 8 caracteres.'); return; }
  if (senha !== senha2) { mostrar('As duas senhas não são iguais.'); return; }

  ocupado(botao, true, 'Salvar e continuar');

  const { error } = await sb.auth.updateUser({ password: senha });

  if (error) { ocupado(botao, false, 'Salvar e continuar'); mostrar(traduzErro(error)); return; }

  const { data: { user } } = await sb.auth.getUser();
  await sb.from('perfis').update({ senha_provisoria: false }).eq('id', user.id);

  location.replace('inicio.html');
});

/* ================================================================ início */

(async function iniciar() {
  carregarTurmas();

  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    const perfil = await meuPerfil({ recarregar: true });
    if (perfil?.senha_provisoria || new URLSearchParams(location.search).has('trocar')) {
      irPara('tela-trocar');
      return;
    }
    location.replace('inicio.html');
  }
})();
