'use strict';

const assert = require('assert');
const { conferir } = require('./registro-da-pr.js');

const HEAD = '96cfa870d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6';
const MODELO_DO_PR = ['## Summary', '', 'O que mudou.', '', 'Sem issue', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', '', '**Política:** sem mudança', ''];
const corpoCom = (...linhas) => [...MODELO_DO_PR, ...linhas].join('\n');
const REVISAO = ['## Code review', '', 'Veredito: CLEAN', `Head: ${HEAD}`, 'Autor: sessão do autor', 'Revisor: sessão da revisão', 'Risco: BAIXA'].join('\n');

const resultado = pr => conferir({ corpo: '', rotulos: [], registros: [REVISAO], head: HEAD, repositorio: 'dono/repo', ...pr });
const passa = (pr, caso) => {
  const { ok, mensagem } = resultado(pr);
  assert.strictEqual(ok, true, `${caso}: ${mensagem}`);
};
const recusa = (pr, padrao, caso) => {
  const { ok, mensagem } = resultado(pr);
  assert.strictEqual(ok, false, caso);
  assert.match(mensagem, padrao, caso);
};

const ISSUE = 'https://github.com/dono/repo/issues/12';
const OUTRA_ISSUE = 'https://github.com/dono/repo/issues/13';
const comIssue = (...linhas) => corpoCom('**Atenção:** BAIXA', '', ...linhas).replace('Sem issue\n\n', '');
const FALTA_A_ISSUE = /não diz a issue/;
const SEM_URL = /não tem a URL completa da issue/;
const SEM_A_PROVA = /"Refs" sem a linha "Prova que falta: <texto>"/;
passa({ corpo: comIssue(`Closes ${ISSUE}`) }, 'Closes com a URL completa');
passa({ corpo: comIssue(`Closes ${ISSUE}`, '', `Closes ${OUTRA_ISSUE}`) }, 'uma linha Closes por issue');
passa({ corpo: comIssue(`- **closes** ${ISSUE}.`) }, 'item de lista, negrito, minúsculas e ponto final');
passa({ corpo: comIssue(`Closes ${ISSUE}`).replace('O que mudou.', 'Mexe no CI.') }, 'o texto do Summary não importa');
passa({ corpo: comIssue(`Closes ${ISSUE}`, 'Prova que falta: a primeira execução de `Commit verde` na main depois do merge criar a tag `verde/...` num commit de verdade') }, 'Closes com a prova real pendente (o corpo da PR 526): a issue fecha no merge');
passa({ corpo: comIssue(`Refs ${ISSUE}`, 'Prova que falta: rodar o envio no Anki de verdade') }, 'Refs com a prova que falta');
passa({ corpo: comIssue(`Closes ${ISSUE}`, `Refs ${OUTRA_ISSUE}`, '**Prova que falta:** o envio real') }, 'uma issue fecha e a outra fica aberta com a prova que falta');
passa({ corpo: comIssue('**Sem issue**') }, 'Sem issue sozinha na linha');
recusa({ corpo: comIssue() }, FALTA_A_ISSUE, 'nada sobre issue');
recusa({ corpo: '' }, FALTA_A_ISSUE, 'corpo vazio sem issue');
recusa({ corpo: comIssue(`Refs ${ISSUE}`) }, SEM_A_PROVA, 'Refs sem a prova que falta');
recusa({ corpo: comIssue(`Refs ${ISSUE}`, 'Prova que falta:') }, SEM_A_PROVA, 'Refs com a prova que falta vazia');
recusa({ corpo: comIssue(`Refs ${ISSUE}`, 'Prova que falta: ') }, SEM_A_PROVA, 'Refs com a prova que falta só em branco');
recusa({ corpo: comIssue('Refs #12', 'Prova que falta: o envio real') }, SEM_URL, 'Refs com número solto');
recusa({ corpo: comIssue('Closes #12') }, SEM_URL, 'Closes com número solto');
recusa({ corpo: comIssue('Closes 12') }, SEM_URL, 'Closes só com o número');
recusa({ corpo: comIssue('Closes https://github.com/dono/repo/pull/12') }, SEM_URL, 'Closes de uma PR não é de uma issue');
recusa({ corpo: comIssue(`Closes ${ISSUE}`, 'Closes #13') }, SEM_URL, 'uma URL completa e um número solto');
recusa({ corpo: comIssue(`Closes ${ISSUE}/comments`) }, SEM_URL, 'Closes com o endereço de outra coisa');
recusa({ corpo: comIssue(`Closes ${ISSUE} e ${OUTRA_ISSUE}`) }, SEM_URL, 'duas issues na mesma linha');
recusa({ corpo: comIssue('Sem issue nenhuma por enquanto') }, FALTA_A_ISSUE, 'Sem issue no meio de outra frase');
recusa({ corpo: comIssue(`Fecha ${ISSUE}`) }, FALTA_A_ISSUE, 'a issue citada sem Closes nem Refs');
recusa({ corpo: comIssue(`Closes: ${ISSUE}`) }, FALTA_A_ISSUE, 'Closes com dois-pontos não é a linha de fechamento do GitHub');
recusa({ corpo: comIssue(`<!-- Closes ${ISSUE} -->`, '```', `Closes ${ISSUE}`, '```', `> Closes ${ISSUE}`, '> Sem issue') }, FALTA_A_ISSUE, 'a linha num comentário, num bloco de código ou numa citação');
passa({ corpo: comIssue('Closes https://github.com/DONO/Repo/issues/12') }, 'o repositório sem diferenciar maiúsculas');
recusa({ corpo: comIssue('Closes https://github.com/fulano/outro/issues/1') }, SEM_URL, 'Closes de uma issue de outro repositório');
recusa({ corpo: comIssue('Refs https://github.com/fulano/outro/issues/1', 'Prova que falta: o envio real') }, SEM_URL, 'Refs de uma issue de outro repositório');
recusa({ corpo: comIssue(`\`Closes ${ISSUE}\``) }, FALTA_A_ISSUE, 'Closes em código na linha: o GitHub não fecha');
recusa({ corpo: comIssue(`Closes ${ISSUE}`, '', `    Closes ${OUTRA_ISSUE}`).replace(`Closes ${ISSUE}\n\n`, '') }, FALTA_A_ISSUE, 'Closes num bloco de código indentado');
recusa({ corpo: comIssue(`\tCloses ${ISSUE}`) }, FALTA_A_ISSUE, 'Closes depois de um tab');
recusa({ corpo: comIssue('`Sem issue`') }, FALTA_A_ISSUE, 'Sem issue em código na linha');
passa({ corpo: comIssue(`   Closes ${ISSUE}`) }, 'até três espaços ainda é texto');

console.log('test_issue_da_pr: ok');
