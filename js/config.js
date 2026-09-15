/* =====================================================================
   Configuração do Supabase.

   A chave abaixo é a chave ANÔNIMA (anon). Ela é pública por natureza:
   vai dentro do JavaScript e qualquer pessoa consegue lê-la. Quem protege
   os dados é o RLS (Row Level Security) no banco, não o segredo da chave.

   NUNCA coloque aqui a chave "service_role". Ela ignora o RLS inteiro e
   daria acesso total a qualquer visitante. As operações que precisam dela
   (criar usuário, redefinir senha, excluir usuário, disparar e-mail) rodam
   em Edge Functions, do lado do servidor.
   ===================================================================== */

export const SUPABASE_URL = 'https://jcsumlwalptnurjttdmq.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjc3VtbHdhbHB0bnVyanR0ZG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0OTUyNTEsImV4cCI6MjEwNTA3MTI1MX0.NptH83Ygxl4XLLA4Is4bfqOsbknqzPOdQdy5JiwAXqI';

/* Compressão das fotos de evidência.
   Estes números são o que faz as fotos caberem no 1 GB do plano gratuito.
   1280px / 72% dá em média 150 KB por foto. Mexer aqui muda a conta toda. */
export const FOTO = {
  ladoMaximo: 1280,
  qualidade: 0.72,
  bytesMaximos: 2 * 1024 * 1024,   // limite que o próprio bucket impõe
  tiposAceitos: ['image/jpeg', 'image/png']
};

/* Avatar do perfil: menor ainda, é um círculo pequeno. */
export const AVATAR = {
  ladoMaximo: 400,
  qualidade: 0.8,
  bytesMaximos: 512 * 1024
};
