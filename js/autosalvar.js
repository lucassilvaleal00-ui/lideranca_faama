/* =====================================================================
   Salvamento automático.

   A ideia: ninguém deveria precisar lembrar de apertar "Salvar". Cada
   alteração marca o item como pendente; passado um instante de silêncio,
   o que mudou vai para o banco sozinho.

   O painel de estado fica sempre à vista, para o administrador conferir
   que nada ficou para trás — e o botão do fim serve só para fechar com
   a certeza de que tudo foi gravado.
   ===================================================================== */

const ESPERA = 1100;   // ms de silêncio antes de gravar

const horaAgora = () => new Date().toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit' });

/**
 * @param {object} o
 * @param {Function} o.salvar     async (chave) => void   grava UM item
 * @param {Element}  o.painel     onde o estado é mostrado
 * @param {number}   [o.espera]
 */
export function criarAutoSalvar({ salvar, painel, espera = ESPERA }) {
  const pendentes = new Set();
  const relogios = new Map();

  let salvando = 0;
  let ultima = null;
  let falha = null;

  function pintar() {
    if (!painel) return;

    if (falha) {
      painel.className = 'auto-salvar erro';
      painel.innerHTML = `<span class="ponto"></span>
        <span>Não consegui salvar: ${falha}. Tente de novo.</span>`;
      return;
    }
    if (salvando > 0) {
      painel.className = 'auto-salvar salvando';
      painel.innerHTML = '<span class="girando"></span><span>Salvando…</span>';
      return;
    }
    if (pendentes.size) {
      painel.className = 'auto-salvar pendente';
      painel.innerHTML = `<span class="ponto"></span>
        <span>${pendentes.size} alteração(ões) esperando para salvar…</span>`;
      return;
    }
    painel.className = 'auto-salvar ok';
    painel.innerHTML = `<span class="ponto"></span>
      <span>Salvamento automático ativo${ultima ? ` · tudo salvo às ${ultima}` : ''}</span>`;
  }

  async function gravar(chave) {
    relogios.delete(chave);
    if (!pendentes.has(chave)) return;

    pendentes.delete(chave);
    salvando++;
    pintar();

    try {
      await salvar(chave);
      falha = null;
      ultima = horaAgora();
    } catch (erro) {
      falha = erro?.message ?? 'erro desconhecido';
      pendentes.add(chave);          // continua devendo; tenta de novo depois
    } finally {
      salvando--;
      pintar();
    }
  }

  return {
    /** Marca o item como alterado e agenda a gravação. */
    agendar(chave) {
      falha = null;
      pendentes.add(chave);
      clearTimeout(relogios.get(chave));
      relogios.set(chave, setTimeout(() => gravar(chave), espera));
      pintar();
    },

    /** Esquece um item (por exemplo, depois de excluí-lo). */
    descartar(chave) {
      clearTimeout(relogios.get(chave));
      relogios.delete(chave);
      pendentes.delete(chave);
      pintar();
    },

    /** Grava tudo que está pendente e espera terminar. */
    async agora() {
      for (const r of relogios.values()) clearTimeout(r);
      relogios.clear();
      await Promise.all([...pendentes].map(gravar));
      return !falha;
    },

    temPendencia: () => pendentes.size > 0 || salvando > 0,
    iniciar: pintar
  };
}
