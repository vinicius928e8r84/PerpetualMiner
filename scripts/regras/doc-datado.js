'use strict';

// Um texto que ensina como o repositório funciona não pode falar de "esta PR" nem de "nesta
// rodada": quem lê meses depois não sabe qual era. O mesmo vale para a contagem fixa de testes
// ("41 specs", "cerca de 700 tests"), que o primeiro teste novo desmente (a SKILL.md da skill de
// verificação carregou um 41 muito depois de a suíte passar dele). Esta regra acusa as duas coisas
// nos textos de docs/ (menos docs/superpowers/, as notas datadas de junho), complemento/, CLAUDE.md e
// .agents/skills/. Não há exceção na linha: o Markdown não tem comentário de código; um texto que
// precisa ficar entra na linha de base.

const id = 'doc-datado';

const conserto = 'Escreva o que vale sempre, sem dizer de qual PR ou rodada fala (o número do PR está no `git log`, '
  + 'a decisão no ADR ou na spec) e sem contar testes: mande o leitor ao comando que conta '
  + '(`node scripts/testar.mjs --listar`, `playwright test --list`).';

const seAplica = arquivo => arquivo.endsWith('.md') && (
  arquivo === 'CLAUDE.md'
  || /^docs\/(?!superpowers\/)/.test(arquivo)
  || /^complemento\/.+/.test(arquivo)
  || /^\.agents\/skills\/.+/.test(arquivo)
);

const DE_ESTA_PR = /\b(?:nesta|desta|nessa|dessa|esta|essa)\s+(?:PR|rodada)\b|\bthis\s+PR\b/gi;
// Um número, no máximo uma palavra (e2e, Playwright, Node) e então "testes", "tests" ou "specs".
const CONTAGEM_DE_TESTES = /(?<![=\w.,])\d[\d.,]*\+?\s+(?:[\w-]+\s+)?(?:tests?|testes|specs?)\b/gi;

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

module.exports = { id, conserto, seAplica, verificar };
