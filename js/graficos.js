/* =====================================================================
   Gráficos Gerais — só administrador.

   Opção de forma: "total de candidatos" é um número único, não um
   gráfico. Um gráfico de uma fatia só não diz mais do que o número
   escrito grande — então o total virou um placar, e os gráficos ficaram
   para o que de fato compara grandezas: pastas, situação e turmas.

   Barras em uma cor só (azul-marinho da logo): quem compara é o
   comprimento, não o matiz. Cores diferentes por barra dariam a entender
   que cada uma é uma categoria distinta, o que aqui seria ruído.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, esc, $ } from './ui.js';

/* ------------------------------------------------------------- desenho */

function placar(valor, rotulo) {
  return `<div class="placar">
    <div class="valor">${valor}</div>
    <div class="rotulo">${esc(rotulo)}</div>
  </div>`;
}

/**
 * Barras horizontais. Horizontal porque os nomes são longos
 * ("Líder Master Avançado") — na vertical o rótulo viraria texto virado.
 */
function barras(itens, { unidade = '' } = {}) {
  if (!itens.length) {
    return '<div class="vazio" style="padding:26px">Nada para mostrar ainda.</div>';
  }

  const maior = Math.max(...itens.map(i => i.valor), 1);

  return itens.map(i => {
    const largura = Math.round(100 * i.valor / maior);
    return `
    <div class="barra-item">
      <div class="barra-topo">
        <span class="nome">${esc(i.nome)}</span>
        <span class="valor">${i.valor}${unidade}</span>
      </div>
      <div class="trilho" style="height:10px"
           role="img" aria-label="${esc(i.nome)}: ${i.valor}${unidade}">
        <i style="width:${i.valor ? Math.max(largura, 2) : 0}%;
                  background:${i.cor ?? 'var(--marinho-700)'}"></i>
      </div>
    </div>`;
  }).join('');
}

/* =============================================================== CARGA */

async function carregar() {
  const [pf, fo, pa, re, tu] = await Promise.all([
    sb.from('perfis').select('id, tipo, turma_id'),
    sb.from('formularios').select('id, nome').order('ordem'),
    sb.from('pastas').select('id, candidato_id, formulario_id, status'),
    sb.from('respostas').select('pasta_id, status'),
    sb.from('turmas').select('id, nome').order('nome')
  ]);

  if (pf.error) {
    $('#placares').innerHTML =
      `<div class="vazio" style="grid-column:1/-1">${esc(traduzErro(pf.error))}</div>`;
    return;
  }

  const perfis      = pf.data ?? [];
  const formularios = fo.data ?? [];
  const pastas      = pa.data ?? [];
  const respostas   = re.data ?? [];
  const turmas      = tu.data ?? [];

  const candidatos = perfis.filter(p => p.tipo === 'candidato');

  /* ------------------------------------------------------- placares */

  const aguardando = respostas.filter(r => r.status === 'concluido').length;

  $('#placares').innerHTML = [
    placar(candidatos.length, 'candidatos cadastrados'),
    placar(pastas.filter(p => p.status === 'ativa').length, 'cartões em andamento'),
    placar(pastas.filter(p => p.status === 'aprovada').length, 'cartões concluídos'),
    placar(aguardando, 'requisitos aguardando avaliação')
  ].join('');

  /* --------------------------------------------- candidatos por pasta */

  $('#grafico-pastas').innerHTML = barras(
    formularios.map(f => ({
      nome: f.nome,
      valor: pastas.filter(p => p.formulario_id === f.id && p.status !== 'solicitada').length
    }))
  );

  /* ------------------------------------------------ situação das pastas */

  /* Estes três são categorias, não grandezas — por isso levam cores
     distintas. O trio passou na verificação de daltonismo, e cada barra
     tem o nome e o número escritos ao lado: ninguém depende da cor. */
  const situacoes = [
    { nome: 'Aguardando liberação', chave: 'solicitada', cor: '#2f6fd0' },
    { nome: 'Em andamento',         chave: 'ativa',      cor: '#c8960a' },
    { nome: 'Concluídas',           chave: 'aprovada',   cor: '#16794a' }
  ];

  $('#grafico-situacao').innerHTML = barras(
    situacoes.map(s => ({
      nome: s.nome,
      cor: s.cor,
      valor: pastas.filter(p => p.status === s.chave).length
    }))
  );

  /* -------------------------------------------- candidatos por turma */

  const semTurma = candidatos.filter(c => !c.turma_id).length;

  const porTurma = turmas.map(t => ({
    nome: t.nome,
    valor: candidatos.filter(c => c.turma_id === t.id).length
  })).filter(t => t.valor > 0);

  if (semTurma) porTurma.push({ nome: 'Sem turma informada', valor: semTurma });

  $('#grafico-turmas').innerHTML = barras(porTurma);
}

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

  await montarBarra(perfil);
  carregar();
})();
