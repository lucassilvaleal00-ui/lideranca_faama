/* =====================================================================
   Compressor de imagens — roda no navegador, antes do envio.

   É o que faz as fotos caberem no 1 GB do plano gratuito: uma foto de
   celular tem 3 a 5 MB; depois daqui fica em torno de 150 KB. Também é
   o que permite ao líder enviar pelo 4G no campo sem travar.

   Só aceita JPEG e PNG, e sempre devolve JPEG.
   ===================================================================== */

import { FOTO, AVATAR } from './config.js';

export class ErroImagem extends Error {}

function carregar(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ErroImagem('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}

/**
 * @param {File} arquivo
 * @param {{ladoMaximo:number, qualidade:number}} opcoes
 * @returns {Promise<{blob:Blob, largura:number, altura:number, bytes:number}>}
 */
export async function comprimir(arquivo, opcoes = FOTO) {
  if (!arquivo) throw new ErroImagem('Nenhum arquivo escolhido.');

  if (!['image/jpeg', 'image/png'].includes(arquivo.type)) {
    throw new ErroImagem('Só são aceitas imagens JPEG ou PNG.');
  }

  const img = await carregar(arquivo);

  const maior = Math.max(img.naturalWidth, img.naturalHeight);
  const escala = maior > opcoes.ladoMaximo ? opcoes.ladoMaximo / maior : 1;

  const largura = Math.round(img.naturalWidth  * escala);
  const altura  = Math.round(img.naturalHeight * escala);

  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;

  const ctx = tela.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // fundo branco: PNG com transparência viraria preto no JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(img, 0, 0, largura, altura);

  const blob = await new Promise(r => tela.toBlob(r, 'image/jpeg', opcoes.qualidade));
  if (!blob) throw new ErroImagem('Não foi possível processar a imagem.');

  if (blob.size > opcoes.bytesMaximos) {
    // segunda tentativa, mais apertada, antes de desistir
    const menor = await new Promise(r =>
      tela.toBlob(r, 'image/jpeg', Math.max(0.4, opcoes.qualidade - 0.2)));

    if (!menor || menor.size > opcoes.bytesMaximos) {
      throw new ErroImagem('A imagem continua grande demais mesmo comprimida. ' +
                           'Tente uma foto com menos detalhe.');
    }
    return { blob: menor, largura, altura, bytes: menor.size };
  }

  return { blob, largura, altura, bytes: blob.size };
}

export const comprimirAvatar = arquivo => comprimir(arquivo, AVATAR);

/** Miniatura em data: URL, só para mostrar na tela antes de enviar. */
export function previa(blob) {
  return new Promise(resolve => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.readAsDataURL(blob);
  });
}

export function formatarBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
