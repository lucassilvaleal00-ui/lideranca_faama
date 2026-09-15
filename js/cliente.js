/* =====================================================================
   Cliente do Supabase, compartilhado por todas as telas.

   "Manter-me conectado": quando marcado, a sessão fica no localStorage e
   sobrevive a fechar o navegador. Quando não, vai para o sessionStorage e
   morre junto com a aba — importante para quem usa computador emprestado.
   ===================================================================== */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CHAVE_LEMBRAR = 'lideranca.lembrar';

export function definirLembrar(lembrar) {
  try { localStorage.setItem(CHAVE_LEMBRAR, lembrar ? '1' : '0'); } catch (_) {}
}

function querLembrar() {
  try { return localStorage.getItem(CHAVE_LEMBRAR) !== '0'; } catch (_) { return true; }
}

/* Adaptador que decide, a cada chamada, em qual storage gravar.
   Precisa ser assim porque o cliente nasce antes de o usuário marcar a caixa. */
const armazenamento = {
  getItem(chave) {
    try { return localStorage.getItem(chave) ?? sessionStorage.getItem(chave); }
    catch (_) { return null; }
  },
  setItem(chave, valor) {
    try {
      if (querLembrar()) { localStorage.setItem(chave, valor); sessionStorage.removeItem(chave); }
      else { sessionStorage.setItem(chave, valor); localStorage.removeItem(chave); }
    } catch (_) {}
  },
  removeItem(chave) {
    try { localStorage.removeItem(chave); sessionStorage.removeItem(chave); } catch (_) {}
  }
};

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: armazenamento,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

/* ------------------------------------------------------------------ perfil */

let perfilCache = null;

export async function meuPerfil({ recarregar = false } = {}) {
  if (perfilCache && !recarregar) return perfilCache;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from('perfis')
    .select('*, turma:turmas(id, nome)')
    .eq('id', user.id)
    .single();

  if (error) return null;
  perfilCache = data;
  return data;
}

export function limparPerfil() { perfilCache = null; }

/* Protege as páginas internas: sem sessão, volta para o login. */
export async function exigirSessao() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('index.html'); return null; }

  const perfil = await meuPerfil();
  if (!perfil) { await sb.auth.signOut(); location.replace('index.html'); return null; }

  if (perfil.senha_provisoria) { location.replace('index.html?trocar=1'); return null; }
  return perfil;
}

export async function sair() {
  limparPerfil();
  await sb.auth.signOut();
  location.replace('index.html');
}

/* ------------------------------------------------- mensagens de erro em PT */

const TRADUCOES = [
  [/invalid login credentials/i,        'E-mail ou senha incorretos.'],
  [/email not confirmed/i,              'Este e-mail ainda não foi confirmado.'],
  [/token has expired|expired/i,        'O código expirou. Peça um novo.'],
  [/invalid.*(otp|token)/i,             'Código inválido. Confira os 6 dígitos.'],
  [/password should be at least/i,      'A senha precisa ter pelo menos 8 caracteres.'],
  [/same as the old password/i,         'A nova senha precisa ser diferente da atual.'],
  [/rate limit|too many requests/i,     'Muitas tentativas seguidas. Espere alguns minutos.'],
  [/duplicate key|already exists/i,     'Já existe um registro com esses dados.'],
  [/row-level security|permission/i,    'Você não tem permissão para esta ação.'],
  [/failed to fetch|networkerror/i,     'Sem conexão com o servidor. Verifique a internet.']
];

export function traduzErro(erro) {
  const msg = (erro?.message || String(erro || '')).trim();
  for (const [padrao, texto] of TRADUCOES) if (padrao.test(msg)) return texto;
  return msg || 'Não foi possível concluir. Tente novamente.';
}
