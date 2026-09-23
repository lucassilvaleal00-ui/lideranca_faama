/* =====================================================================
   Certificado da Prova PDL.

   O administrador envia o modelo pronto (PNG ou JPEG) — aquele com a
   moldura, as logos e a frase "Certificamos que". Aqui só desenhamos o
   nome do participante por cima, na altura que o administrador escolheu,
   e entregamos um PDF em A4 paisagem, pronto para imprimir.

   Nada de servidor: o modelo é baixado do Storage e o PDF é montado no
   próprio navegador de quem clicou.
   ===================================================================== */

import { sb } from './cliente.js';

const A4_PAISAGEM = [841.89, 595.28];

/** Baixa o modelo do bucket dos certificados. */
async function baixarModelo(caminho) {
  const { data, error } = await sb.storage.from('certificados').download(caminho);
  if (error || !data) throw new Error('não consegui baixar o modelo do certificado');
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * @param {object} o
 * @param {string} o.caminho   modelo no Storage (provas.certificado_path)
 * @param {string} o.nome      nome completo do participante
 * @param {number} o.y         0 = topo, 1 = base   (provas.cert_nome_y)
 * @param {number} o.tamanho   corpo da fonte       (provas.cert_nome_tamanho)
 */
export async function gerarCertificado({ caminho, nome, y = 0.42, tamanho = 30 }) {
  const { PDFDocument, StandardFonts, rgb } =
    await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');

  const bytes = await baixarModelo(caminho);
  const pdf = await PDFDocument.create();

  let imagem = null;
  try { imagem = await pdf.embedPng(bytes); }
  catch (_) { imagem = await pdf.embedJpg(bytes); }

  const [L, A] = A4_PAISAGEM;
  const pagina = pdf.addPage([L, A]);

  /* O modelo entra inteiro, sem distorcer: a escala é a menor entre as
     duas, e o que sobrar fica como margem branca. */
  const escala = Math.min(L / imagem.width, A / imagem.height);
  const w = imagem.width * escala;
  const h = imagem.height * escala;
  const x0 = (L - w) / 2;
  const y0 = (A - h) / 2;

  pagina.drawImage(imagem, { x: x0, y: y0, width: w, height: h });

  /* O nome vai centralizado na largura do modelo, na altura escolhida. */
  const fonte = await pdf.embedFont(StandardFonts.TimesRoman);
  const texto = String(nome ?? '').trim();

  let corpo = tamanho;
  while (corpo > 10 && fonte.widthOfTextAtSize(texto, corpo) > w * 0.8) corpo -= 1;

  const largura = fonte.widthOfTextAtSize(texto, corpo);

  pagina.drawText(texto, {
    x: x0 + (w - largura) / 2,
    y: y0 + h - (h * y) - corpo,
    size: corpo,
    font: fonte,
    color: rgb(0.05, 0.08, 0.17)
  });

  return {
    bytes: await pdf.save(),
    extensao: 'pdf',
    tipo: 'application/pdf'
  };
}

export function baixar({ bytes, tipo }, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));

  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function nomeArquivo(pedacos, extensao) {
  return pedacos
    .filter(Boolean)
    .join(' - ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 90) + '.' + extensao;
}
