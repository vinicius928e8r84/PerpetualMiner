'use strict';

const { NAS_DUAS, SO_NO_MEDIDOR, SO_NO_QLTY } = require('./categorias');

const SEM_MEDICAO = { achados: [], linhasDasFuncoes: new Set() };

const FUNCAO_QUE_O_MEDIDOR_JUNTA = 'o medidor, como o CodeScene, não mede essa função à parte (um `def` aninhado no Python, um callback ou uma seta sem nome próprio no JavaScript): '
  + 'soma o que ela tem à função de fora, e o Qlty a mede sozinha';

const POR_QUE_CODESCENE = {
  medidorLimpo: 'o CodeScene acusa o que o medidor não mede ou não calibrou (duplicação, asserções grandes, condicionais globais)',
  medidorAcusa: 'o CodeScene dá 10 e o medidor conta pontos: a contagem dele difere da do CodeScene aqui (o medidor só foi conferido em 12 arquivos)',
  qltyLimpo: 'o Qlty não acusa nada do que o CodeScene vê',
  qltyAcusa: 'o CodeScene dá 10 e o Qlty acusa, com outra régua',
};

const daCategoria = (achados, categoria) => achados.filter(achado => achado.categoria === categoria);
const linhasDe = achados => new Set(achados.map(achado => achado.linha));
const foraDe = (achados, linhas) => achados.filter(achado => !linhas.has(achado.linha));

function motivo(categoria, quem, achados, porque) {
  return { categoria: categoria.id, nome: categoria.nome, quem, onde: achados.map(achado => achado.rotulo), porque };
}

const temFuncaoDentro = (achado, linhasDasFuncoes) => [...linhasDasFuncoes].some(linha => linha > achado.linha && linha <= achado.fim);

function porqueDoSoQlty(categoria, achado, linhasDasFuncoes) {
  if (!linhasDasFuncoes.has(achado.linha)) return FUNCAO_QUE_O_MEDIDOR_JUNTA;
  if (categoria.soQltyComFuncoesDentro && temFuncaoDentro(achado, linhasDasFuncoes)) return categoria.soQltyComFuncoesDentro;
  return categoria.soQlty;
}

function motivosDoSoQlty(categoria, soQlty, linhasDasFuncoes) {
  const porPorque = new Map();
  for (const achado of soQlty) {
    const porque = porqueDoSoQlty(categoria, achado, linhasDasFuncoes);
    porPorque.set(porque, [...(porPorque.get(porque) || []), achado]);
  }
  return [...porPorque].map(([porque, achados]) => motivo(categoria, 'qlty', achados, porque));
}

function divergenciaPorFuncao(categoria, doMedidor, doQlty, linhasDasFuncoes) {
  const soMedidor = foraDe(doMedidor, linhasDe(doQlty));
  const soQlty = foraDe(doQlty, linhasDe(doMedidor));
  return {
    contagem: { ambos: doMedidor.length - soMedidor.length, soMedidor: soMedidor.length, soQlty: soQlty.length },
    motivos: [
      ...(soMedidor.length ? [motivo(categoria, 'medidor', soMedidor, categoria.soMedidor)] : []),
      ...motivosDoSoQlty(categoria, soQlty, linhasDasFuncoes),
    ],
  };
}

function divergenciaNoArquivo(categoria, doMedidor, doQlty) {
  const medidorAcusa = doMedidor.length > 0;
  const qltyAcusa = doQlty.length > 0;
  const contagem = { ambos: Number(medidorAcusa && qltyAcusa), soMedidor: Number(medidorAcusa && !qltyAcusa), soQlty: Number(qltyAcusa && !medidorAcusa) };
  const motivos = [];
  if (contagem.soMedidor) motivos.push(motivo(categoria, 'medidor', doMedidor, categoria.soMedidor));
  if (contagem.soQlty) motivos.push(motivo(categoria, 'qlty', doQlty, categoria.soQlty));
  return { contagem, motivos };
}

function divergenciaNaCategoria(categoria, medicao, doQltyNoArquivo) {
  const doMedidor = daCategoria(medicao.achados, categoria.id);
  const doQlty = daCategoria(doQltyNoArquivo, categoria.id);
  if (categoria.porFuncao) return divergenciaPorFuncao(categoria, doMedidor, doQlty, medicao.linhasDasFuncoes);
  return divergenciaNoArquivo(categoria, doMedidor, doQlty);
}

function soUmMede(categorias, quem, achados) {
  return categorias
    .map(categoria => motivo(categoria, quem, daCategoria(achados, categoria.id), categoria.porque))
    .filter(item => item.onde.length);
}

function veredito(medicao, doQlty, nota) {
  return {
    codescene: nota === null ? null : nota >= 10,
    medidor: medicao.achados.length === 0,
    qlty: doQlty.length === 0,
  };
}

const NOMES = { medidor: 'o medidor', qlty: 'o Qlty' };

function quemDiscorda(limpo) {
  if (limpo.codescene === null) {
    if (limpo.medidor === limpo.qlty) return 'ninguém';
    return limpo.medidor ? 'só o Qlty acusa' : 'só o medidor acusa';
  }
  const contra = ['medidor', 'qlty'].filter(ferramenta => limpo[ferramenta] !== limpo.codescene).map(ferramenta => NOMES[ferramenta]);
  return contra.length ? contra.join(' e ') : 'ninguém';
}

function motivoDoCodeScene(ferramenta, limpo) {
  if (limpo.codescene === null || limpo[ferramenta] === limpo.codescene) return [];
  const chave = `${ferramenta}${limpo[ferramenta] ? 'Limpo' : 'Acusa'}`;
  return [{ categoria: 'codescene', nome: 'nota do CodeScene', quem: ferramenta, onde: [], porque: POR_QUE_CODESCENE[chave] }];
}

function compararArquivo({ arquivo, medicao = SEM_MEDICAO, doQlty = [], nota = null }) {
  const porCategoria = NAS_DUAS.map(categoria => ({ id: categoria.id, ...divergenciaNaCategoria(categoria, medicao, doQlty) }));
  const limpo = veredito(medicao, doQlty, nota);
  const motivos = [
    ...porCategoria.flatMap(categoria => categoria.motivos),
    ...soUmMede(SO_NO_MEDIDOR, 'medidor', medicao.achados),
    ...soUmMede(SO_NO_QLTY, 'qlty', doQlty),
    ...motivoDoCodeScene('medidor', limpo),
    ...motivoDoCodeScene('qlty', limpo),
  ];
  return {
    arquivo,
    nota,
    pontos: medicao.achados.reduce((soma, achado) => soma + achado.pontos, 0),
    achadosDoQlty: doQlty.length,
    limpo,
    quemDiscorda: quemDiscorda(limpo),
    contagem: Object.fromEntries(porCategoria.map(categoria => [categoria.id, categoria.contagem])),
    motivos,
  };
}

function somarContagens(comparacoes) {
  const total = Object.fromEntries(NAS_DUAS.map(categoria => [categoria.id, { ambos: 0, soMedidor: 0, soQlty: 0 }]));
  for (const comparacao of comparacoes) {
    for (const [id, contagem] of Object.entries(comparacao.contagem)) {
      for (const lado of Object.keys(contagem)) total[id][lado] += contagem[lado];
    }
  }
  return total;
}

function somarVereditos(comparacoes) {
  const total = { ambos: 0, soMedidor: 0, soQlty: 0, nenhum: 0 };
  for (const { limpo } of comparacoes) {
    const chave = { 'false,false': 'ambos', 'false,true': 'soMedidor', 'true,false': 'soQlty', 'true,true': 'nenhum' }[`${limpo.medidor},${limpo.qlty}`];
    total[chave]++;
  }
  return total;
}

const pesoDaDivergencia = comparacao => comparacao.motivos
  .filter(item => NAS_DUAS.some(categoria => categoria.id === item.categoria))
  .reduce((soma, item) => soma + item.onde.length, 0);

function ondeMaisDiscordam(comparacoes, quantos) {
  return comparacoes
    .map(comparacao => ({ comparacao, peso: pesoDaDivergencia(comparacao) }))
    .filter(({ peso }) => peso > 0)
    .sort((a, b) => b.peso - a.peso || a.comparacao.arquivo.localeCompare(b.comparacao.arquivo))
    .slice(0, quantos)
    .map(({ comparacao }) => comparacao);
}

function compararRepositorio({ medicoes, doQlty, notas }) {
  const arquivos = [...new Set([...medicoes.keys(), ...doQlty.keys()])].sort();
  return arquivos.map(arquivo => compararArquivo({
    arquivo,
    medicao: medicoes.get(arquivo),
    doQlty: doQlty.get(arquivo),
    nota: notas.has(arquivo) ? notas.get(arquivo) : null,
  }));
}

module.exports = { compararArquivo, compararRepositorio, ondeMaisDiscordam, somarContagens, somarVereditos };
