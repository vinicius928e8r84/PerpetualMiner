'use strict';

// O registro da PR (scripts/ci/registro-da-pr.js, workflow Registro da PR): só passa a PR com o corpo no modelo do /pr e a
// atenção preenchida, o registro do /code-review do head exato (CLEAN, revisor diferente do autor) e, na atenção ALTA, a prova real.

const assert = require('assert');
const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { FRASE, ROTULO_DE_RISCO_ALTO, conferir } = require('./registro-da-pr.js');
const { lerYaml, rodaNoPR, comandos } = require('../yaml-de-workflow');

const RAIZ = path.resolve(__dirname, '..', '..');
const HEAD = '96cfa870d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6';
const OUTRO = '091be854aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MODELO_DO_PR = ['## Summary', '', 'O que mudou.', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', ''];
const corpoCom = (...linhas) => [...MODELO_DO_PR, ...linhas].join('\n');
const provaCom = (...linhas) => ['', '## Prova real', '', ...linhas, '', '## Known limits', '', 'Nenhum.'];
const BAIXA = corpoCom('**Atenção:** BAIXA');
const ALTA = corpoCom('**Atenção:** ALTA', ...provaCom(FRASE, `Head: ${HEAD}`, 'Rodei o envio no Anki de verdade.'));
const altaCom = (...linhas) => corpoCom('**Atenção:** ALTA', ...provaCom(...linhas));
const revisao = ({ veredito = 'CLEAN', head = HEAD, autor = 'sessão do autor', revisor = 'sessão da revisão' } = {}) =>
  ['## Code review', '', `Veredito: ${veredito}`, `Head: ${head}`, `Autor: ${autor}`, `Revisor: ${revisor}`].join('\n');

const resultado = pr => conferir({ corpo: BAIXA, rotulos: [], registros: [revisao()], head: HEAD, ...pr });
const passa = (pr, caso) => {
  const { ok, mensagem } = resultado(pr);
  assert.strictEqual(ok, true, `${caso}: ${mensagem}`);
  return mensagem;
};
const recusa = (pr, padrao, caso) => {
  const { ok, mensagem } = resultado(pr);
  assert.strictEqual(ok, false, caso);
  assert.match(mensagem, padrao, caso);
  assert(mensagem.includes(HEAD) && mensagem.includes('.github/PULL_REQUEST_TEMPLATE.md'), `${caso}: a mensagem diz o head e onde está o formato`);
  return mensagem;
};

// 1. O corpo segue o modelo do /pr e tem a atenção preenchida.
assert.match(passa({}, 'atenção BAIXA com a revisão'), /atenção BAIXA, \/code-review CLEAN$/);
assert.match(passa({ corpo: corpoCom('Atencao: media') }, 'sem negrito, sem acento, em minúsculas'), /atenção MÉDIA/);
passa({ corpo: BAIXA.replace(/\n/g, '\r\n'), registros: [revisao().replace(/\n/g, '\r\n')] }, 'o que é escrito no site chega com CRLF');
recusa({ corpo: '' }, /não segue o modelo do \/pr: falta a seção Summary, a seção Evidence, a seção Merge Danger, o campo "Door:" preenchido, o campo "Blast Radius:" preenchido\n.*campo de atenção/, 'corpo vazio');
recusa({ corpo: null }, /falta a seção Summary/, 'PR sem corpo');
recusa({ corpo: BAIXA.replace('## Evidence', 'Evidence') }, /falta a seção Evidence\n/, 'uma seção do modelo que falta');
recusa({ corpo: BAIXA.replace('two-way', '').replace('**Blast Radius:** CI', '') }, /falta o campo "Door:" preenchido, o campo "Blast Radius:" preenchido\n/, 'os campos do Merge Danger vazios ou ausentes');
recusa({ corpo: `\`\`\`markdown\n${BAIXA}\n\`\`\`` }, /falta a seção Summary[^]*campo de atenção/, 'o modelo dentro de um bloco de código não é o corpo');
for (const [caso, ...linhas] of [
  ['sem o campo', ''], ['o campo vazio do modelo', '**Atenção:**'], ['o campo num comentário', '<!-- Atenção: BAIXA -->'],
  ['o campo num bloco de código', '```', 'Atenção: BAIXA', '```'], ['o campo numa citação', '> Atenção: BAIXA'],
]) recusa({ corpo: corpoCom(...linhas) }, /não tem o campo de atenção preenchido/, caso);
for (const [caso, valor] of [['as opções sem escolher', 'BAIXA | MÉDIA | ALTA'], ['um valor que não existe', 'URGENTE'], ['o porquê na mesma linha', 'MÉDIA — mexe no CI']]) {
  recusa({ corpo: corpoCom(`**Atenção:** ${valor}`) }, new RegExp(`a atenção "${valor.replace(/\|/g, '\\|')}" do corpo não é BAIXA nem MÉDIA nem ALTA \\(o valor sozinho na linha\\)`), caso);
}
recusa({ corpo: corpoCom('Atenção: BAIXA', 'Atenção: ALTA') }, /mais de uma atenção \(BAIXA e ALTA\)/, 'duas atenções');
recusa({ corpo: corpoCom('Atenção: BAIXA', 'Atenção: talvez ALTA') }, /mais de uma atenção \(BAIXA e talvez ALTA\)/, 'uma atenção certa e outra fora do formato');

// 2. O registro do /code-review do head exato: CLEAN, e o revisor não é o autor. Vale o mais recente com o "Head:" deste head.
const citado = registro => `Discordo, a primeira revisão já tinha dito:\n\n${registro.split('\n').map(linha => `> ${linha}`).join('\n')}`;
recusa({ registros: [] }, /nenhum comentário ou revisão da PR é o registro do \/code-review/, 'sem registro');
recusa({ registros: ['[vc]: deploy ok', `Olhei o ${HEAD} e está CLEAN.`] }, /nenhum comentário ou revisão/, 'um comentário sem a linha do veredito não é o registro');
recusa({ registros: [`\`\`\`\n${revisao()}\n\`\`\``] }, /nenhum comentário ou revisão/, 'o formato citado num bloco de código não é o registro');
recusa({ registros: [revisao({ head: OUTRO })] }, new RegExp(`mais recente é do commit ${OUTRO}[^]*o head mudou`), 'o registro de outro commit');
recusa({ registros: [revisao({ head: HEAD.slice(0, 7) })] }, /abreviado/, 'o SHA abreviado');
recusa({ registros: [revisao({ head: '' })] }, /não tem a linha "Head:" com o SHA do head/, 'o registro sem SHA');
recusa({ registros: [`${revisao({ head: OUTRO })}\nNota: falta revisar o ${HEAD}`] }, new RegExp(`mais recente é do commit ${OUTRO}`), 'o head citado fora da linha "Head:" não faz do registro o deste head');
recusa({ registros: [citado(revisao())] }, /nenhum comentário ou revisão/, 'a resposta que cita um registro não é um registro');
recusa({ registros: [revisao(), revisao({ veredito: 'FINDINGS' }), citado(revisao())] }, /é FINDINGS, não CLEAN/, 'citar a revisão CLEAN antiga não derruba a FINDINGS mais nova');
for (const veredito of ['FINDINGS', 'NOT CLEAN', 'CLEAN com ressalvas', 'clean']) recusa({ registros: [revisao({ veredito })] }, /não CLEAN/, `veredito ${veredito}`);
recusa({ registros: [revisao(), revisao({ veredito: 'FINDINGS' })] }, /é FINDINGS, não CLEAN/, 'uma revisão mais nova do mesmo head derruba a CLEAN');
passa({ registros: [revisao({ veredito: 'FINDINGS' }), revisao()] }, 'a revisão refeita no mesmo head');
passa({ registros: [revisao(), revisao({ veredito: 'FINDINGS', head: OUTRO })] }, 'a revisão de outro commit não fala por este head');
recusa({ registros: [`${revisao()}\nVeredito: FINDINGS`] }, /é CLEAN e FINDINGS, não CLEAN/, 'dois vereditos no mesmo registro');
recusa({ registros: [revisao().replace(/\nRevisor:.*/, '')] }, /não diz quem é o autor e quem é o revisor/, 'sem o revisor');
recusa({ registros: [revisao({ autor: '' })] }, /não diz quem é o autor e quem é o revisor/, 'sem o autor');
recusa({ registros: [revisao({ autor: 'Sessão A', revisor: '`sessao a`' })] }, /o revisor do registro do \/code-review é o próprio autor/, 'o autor revisando a si mesmo');

// 3. Atenção ALTA (ou o rótulo de risco alto): a seção "Prova real" com a frase e o SHA inteiro do head.
assert.match(passa({ corpo: ALTA }, 'a prova do head exato'), /atenção ALTA, \/code-review CLEAN, PROVADO 100% REAL$/);
passa({ corpo: altaCom(`**${FRASE}**`, '', `- Head: \`${HEAD}\``) }, 'a marcação do Markdown em volta não atrapalha');
passa({ corpo: altaCom(FRASE, `Head: https://github.com/dono/repo/commit/${HEAD.toUpperCase()}`) }, 'o SHA dentro de um endereço, em maiúsculas');
passa({ corpo: altaCom('### Como', '', '```sh', '# o comando', 'node x.js', '```', FRASE, `Head: ${HEAD}`) }, 'um subtítulo e um comentário de shell num bloco de código não fecham a seção');
recusa({ corpo: corpoCom('**Atenção:** ALTA') }, /atenção ALTA: o corpo não tem a seção "Prova real"/, 'ALTA sem a seção');
recusa({ rotulos: ['bug', 'Risco:Alto'] }, /atenção ALTA: o corpo não tem a seção "Prova real"/, `o rótulo ${ROTULO_DE_RISCO_ALTO} pede a prova mesmo com a atenção BAIXA`);
passa({ rotulos: ['bug', 'risco:baixo'] }, 'outro rótulo não pede a prova');
passa({ corpo: ALTA, rotulos: [ROTULO_DE_RISCO_ALTO] }, 'o rótulo e a atenção ALTA, com a prova');
recusa({ corpo: corpoCom('**Atenção:** ALTA', '', '## Prova real', '', 'Ainda não.', '', '## Depois', '', FRASE, `Head: ${HEAD}`) }, /não tem a linha PROVADO 100% REAL/, 'a seção acaba no título seguinte');
recusa({ corpo: altaCom(`Head: ${HEAD}`) }, /não tem a linha PROVADO 100% REAL/, 'a seção sem a frase');
recusa({ corpo: altaCom(`NÃO ${FRASE}`, `Head: ${HEAD}`) }, /não tem a linha PROVADO 100% REAL/, 'o veredito negado não é a frase');
recusa({ corpo: altaCom(`Falta pouco para ficar ${FRASE}.`, `Head: ${HEAD}`) }, /sozinha na linha/, 'a frase no meio de outra');
recusa({ corpo: altaCom(FRASE) }, /a seção "Prova real" não tem a linha "Head:" com o SHA do head/, 'a seção sem SHA');
recusa({ corpo: altaCom(FRASE, `Provei o ${HEAD}.`) }, /não tem a linha "Head:" com o SHA do head/, 'o SHA fora da linha "Head:"');
recusa({ corpo: altaCom(`> ${FRASE}`, `> Head: ${HEAD}`) }, /não tem a linha PROVADO 100% REAL/, 'a prova dentro de uma citação');
recusa({ corpo: altaCom(FRASE, `Head: ${HEAD.slice(0, 7)}`) }, /abreviado/, 'o SHA abreviado');
recusa({ corpo: altaCom(FRASE, `Head: ${HEAD}0`) }, /não tem a linha "Head:" com o SHA do head/, 'um texto maior que contém o SHA não é o SHA');
recusa({ corpo: altaCom('```', FRASE, `Head: ${HEAD}`, '```') }, /não tem a linha PROVADO 100% REAL/, 'a prova dentro de um bloco de código');

// O head mudou: a revisão e a prova do commit anterior deixam de valer, e a mensagem diz as duas faltas.
{
  const { ok, mensagem } = conferir({ corpo: ALTA, rotulos: [], registros: [revisao()], head: OUTRO });
  assert.strictEqual(ok, false, 'o mesmo corpo e o mesmo registro depois de um commit novo');
  assert.match(mensagem, new RegExp(`- o registro do /code-review mais recente é do commit ${HEAD}[^]*- atenção ALTA: a seção "Prova real" é do commit ${HEAD}`));
}

// O modelo da PR ensina o formato que o script aceita: vazio não passa; preenchido como ele diz, passa.
{
  const modelo = fs.readFileSync(path.join(RAIZ, '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
  recusa({ corpo: modelo, registros: [modelo] }, /campo de atenção preenchido[^]*nenhum comentário ou revisão/, 'o modelo sem preencher');
  const exemplo = /<!--([^]*?)-->/.exec(modelo)[1].replace(/<SHA[^>]*>/g, HEAD).replace(/<quem escreveu[^>]*>/, 'a').replace(/<quem revisou[^>]*>/, 'b');
  recusa({ corpo: modelo.replace('**Atenção:**', '**Atenção:** BAIXA'), registros: [exemplo] }, /falta o campo "Door:" preenchido, o campo "Blast Radius:" preenchido\n/, 'o modelo só com a atenção');
  const preenchido = modelo.replace('**Door:**', '**Door:** two-way').replace('**Blast Radius:**', '**Blast Radius:** CI').replace('**Atenção:**', '**Atenção:** ALTA');
  recusa({ corpo: preenchido, registros: [exemplo] }, /o corpo não tem a seção "Prova real"/, 'ALTA no modelo, ainda sem a prova');
  assert.match(passa({ corpo: preenchido + exemplo, registros: [exemplo] }, 'o modelo preenchido com os exemplos dele'), /PROVADO 100% REAL$/);
  assert(modelo.includes(ROTULO_DE_RISCO_ALTO), 'o modelo cita o rótulo');
}

// O workflow roda o script em toda PR e de novo quando muda o head (synchronize), o corpo (edited) ou os rótulos.
{
  const workflow = lerYaml(fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'registro-da-pr.yml'), 'utf8'));
  assert(rodaNoPR(workflow), 'roda em pull_request');
  const tipos = String(workflow.on.pull_request.types).replace(/[[\]\s]/g, '').split(',');
  for (const tipo of ['opened', 'reopened', 'synchronize', 'edited', 'labeled', 'unlabeled']) assert(tipos.includes(tipo), `o gatilho tem ${tipo}`);
  assert.strictEqual(workflow.permissions['pull-requests'], 'read', 'o token lê os comentários e as revisões da PR');
  const chamadas = comandos(workflow).filter(comando => /scripts\/ci\/registro-da-pr\.js/.test(comando.texto));
  assert.strictEqual(chamadas.length, 1, 'um passo chama o script');
  assert.strictEqual(chamadas[0].executa, true, `o passo executa de verdade (${chamadas[0].motivo})`);
  const passo = workflow.jobs['registro-da-pr'].steps.find(p => p.run === chamadas[0].texto);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(passo.env)), {
    GITHUB_TOKEN: '${{ github.token }}', PR: '${{ github.event.pull_request.number }}', HEAD: '${{ github.event.pull_request.head.sha }}',
  }, 'o head é o da PR (não o commit de merge do checkout), e nada da PR entra no comando');
}

// Pelo comando que o workflow roda, diante de um GitHub de teste: o corpo, os rótulos, os comentários e as revisões vêm de lá.
(async () => {
  const github = {};
  const pedidos = [];
  const servidor = http.createServer((pedido, resposta) => {
    const url = new URL(pedido.url, 'http://github.test');
    pedidos.push(`${pedido.headers.authorization} ${url.pathname}${url.search}`);
    const pagina = lista => lista.slice((url.searchParams.get('page') - 1) * 100, url.searchParams.get('page') * 100);
    const rotas = {
      '/repos/dono/repo/pulls/7': () => github.pr,
      '/repos/dono/repo/issues/7/comments': () => pagina(github.comentarios),
      '/repos/dono/repo/pulls/7/reviews': () => pagina(github.revisoes),
    };
    const rota = github.status === 200 && rotas[url.pathname];
    resposta.writeHead(rota ? 200 : github.status === 200 ? 404 : github.status, { 'content-type': 'application/json' });
    resposta.end(JSON.stringify(rota ? rota() : { message: 'erro' }));
  });
  await new Promise(pronto => servidor.listen(0, '127.0.0.1', pronto));
  const comentario = (body, created_at, author_association = 'OWNER') => ({ body, created_at, author_association });
  const revisaoDoSite = (body, submitted_at) => ({ body, submitted_at, author_association: 'COLLABORATOR', state: 'COMMENTED' });
  const rodar = (estado, env = {}) => new Promise(pronto => {
    Object.assign(github, { status: 200, pr: { body: BAIXA, labels: [] }, comentarios: [], revisoes: [] }, estado);
    pedidos.length = 0;
    execFile('node', [path.join(__dirname, 'registro-da-pr.js')], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GITHUB_API_URL: `http://127.0.0.1:${servidor.address().port}`, GITHUB_REPOSITORY: 'dono/repo', GITHUB_TOKEN: 'segredo', PR: '7', HEAD, ...env },
    }, (erro, stdout) => pronto({ status: erro ? erro.code : 0, stdout }));
  });
  try {
    const limpa = await rodar({ comentarios: [comentario('[vc]: deploy', '2026-01-01T00:00:00Z', 'NONE'), comentario(revisao(), '2026-01-02T00:00:00Z')] });
    assert.strictEqual(limpa.status, 0, `o registro num comentário do dono: ${limpa.stdout}`);
    assert(limpa.stdout.includes(`registro da PR ok no head ${HEAD}`), 'diz o head conferido');
    assert(pedidos.length === 3 && pedidos.every(pedido => pedido.startsWith('Bearer segredo /repos/dono/repo/')), `a PR, os comentários e as revisões, com o token: ${pedidos}`);

    assert.strictEqual((await rodar({ revisoes: [revisaoDoSite(revisao(), '2026-01-02T00:00:00Z')] })).status, 0, 'o registro numa revisão da PR');
    const deFora = await rodar({ comentarios: [comentario(revisao(), '2026-01-02T00:00:00Z', 'NONE')] });
    assert.strictEqual(deFora.status, 1, 'o registro de quem não pode escrever no repositório não vale');
    assert.match(deFora.stdout, /^✗[^]*nenhum comentário ou revisão/);
    assert(!deFora.stdout.includes('gh run rerun'), 'fora do CI não há execução para rodar de novo');

    const achados = revisaoDoSite(revisao({ veredito: 'FINDINGS' }), '2026-01-03T00:00:00Z');
    assert.strictEqual((await rodar({ comentarios: [comentario(revisao(), '2026-01-02T00:00:00Z')], revisoes: [achados] })).status, 1, 'a revisão mais nova derruba o comentário mais antigo');
    assert.strictEqual((await rodar({ comentarios: [comentario(revisao(), '2026-01-04T00:00:00Z')], revisoes: [achados] })).status, 0, 'a ordem é a da data, não a da lista');

    const muitos = Array.from({ length: 100 }, (_, i) => comentario(`comentário ${i}`, '2026-01-01T00:00:00Z'));
    assert.strictEqual((await rodar({ comentarios: [...muitos, comentario(revisao(), '2026-01-02T00:00:00Z')] })).status, 0, 'o registro na segunda página dos comentários');
    assert(pedidos.some(pedido => pedido.endsWith('/issues/7/comments?per_page=100&page=2')), 'pediu a segunda página');

    const comRotulo = await rodar({ pr: { body: BAIXA, labels: [{ name: 'bug' }, { name: ROTULO_DE_RISCO_ALTO }] }, comentarios: [comentario(revisao(), '2026-01-02T00:00:00Z')] }, { GITHUB_RUN_ID: '99' });
    assert.strictEqual(comRotulo.status, 1, 'o rótulo de risco alto vem do GitHub');
    assert.match(comRotulo.stdout, /não tem a seção "Prova real"[^]*gh run rerun 99 --failed -R dono\/repo/, 'no CI a mensagem dá o comando que roda o check de novo');
    assert.strictEqual((await rodar({ pr: { body: ALTA, labels: [] }, comentarios: [comentario(revisao(), '2026-01-02T00:00:00Z')] })).status, 0, 'ALTA com a prova e a revisão');
    assert.strictEqual((await rodar({ pr: { body: ALTA, labels: [] }, comentarios: [comentario(revisao(), '2026-01-02T00:00:00Z')] }, { HEAD: OUTRO })).status, 1, 'o head mudou');

    // Sem conseguir ler a PR, ou sem os dados dela, o passo falha: nunca vira "nada a conferir".
    const semGitHub = await rodar({ status: 500 });
    assert.strictEqual(semGitHub.status, 2, 'o GitHub fora do ar');
    assert.match(semGitHub.stdout, /^✗ Não consegui ler a PR 7 no GitHub: o GitHub respondeu 500/);
    for (const env of [{ PR: '' }, { HEAD: HEAD.slice(0, 7) }, { GITHUB_REPOSITORY: '' }]) {
      const semDados = await rodar({}, env);
      assert.strictEqual(semDados.status, 2, `falta de dados é erro de uso: ${JSON.stringify(env)}`);
      assert.match(semDados.stdout, /^uso: /);
    }
  } finally {
    servidor.close();
  }
  console.log('test_registro_da_pr: ok');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
