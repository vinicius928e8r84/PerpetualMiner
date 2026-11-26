'use strict';

const id = 'doc-datado';

const guarda = 'a documentação não diz de qual PR ou rodada fala nem conta testes';

const conserto = 'Escreva o que vale sempre, sem dizer de qual PR ou rodada fala (o número do PR está no `git log`, '
  + 'a decisão no ADR ou na spec) e sem contar testes: mande o leitor ao comando que conta '
  + '(`node scripts/testar.mjs --listar`, `playwright test --list`).';

const seAplica = arquivo => arquivo.endsWith('.md') && (
  /^docs\//.test(arquivo)
  || /^complemento\/.+/.test(arquivo)
  || /^\.agents\/skills\/.+/.test(arquivo)
);

const DE_ESTA_PR = /\b(?:nest[ae]|dest[ae]|ness[ae]|dess[ae]|est[ae]|ess[ae])\s+(?:PR|rodada)\b|\bthis\s+PR\b/gi;
const DETERMINANTE = 'every|each|all|any|no|the|this|that|these|those|such|a|an|one|cada|todo|todos|todas|qualquer';
const CONTAGEM_DE_TESTES = new RegExp(
  String.raw`(?<![=\w.,])\d+(?:[.,]\d{3})*\+?(?![.,]?\d)\s+(?:(?!(?:${DETERMINANTE})\b)[\w-]+\s+)?(?:tests?|testes|specs?)\b`, 'gi');

function verificar(arquivo, fonte) {
  const achados = [];
  fonte.split('\n').forEach((texto, i) => {
    for (const m of texto.matchAll(DE_ESTA_PR)) {
      achados.push({ linha: i + 1, detalhe: `texto datado "${m[0]}"` });
    }
    for (const m of texto.matchAll(CONTAGEM_DE_TESTES)) {
      achados.push({ linha: i + 1, detalhe: `contagem fixa de testes "${m[0]}"` });
    }
  });
  return achados;
}

module.exports = { id, guarda, conserto, seAplica, verificar };
