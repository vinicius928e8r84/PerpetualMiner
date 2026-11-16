'use strict';

// O publicador do registro da PR (scripts/ci/registrar-na-pr.js): o registro do /code-review e a prova saem com o head
// lido do GitHub, passam pela função do check antes de ir para a PR, e o comentário roda o check de novo. Os casos são os
// erros reais das PRs abertas em 14/11: o registro CLEAN de um commit que já não era o head (#436), a PR de atenção ALTA
// que recebeu a revisão e ficou sem a prova, com o check sem nunca rodar (#441), e o check vermelho à espera do registro (#442).

const assert = require('assert');
const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { conferir } = require('./registro-da-pr.js');
const { corpoComAProva, planejar, secaoDaProva } = require('./registrar-na-pr.js');

const HEAD = '1d606d78aac180096ca7cc5df8279355f21ac729';
const ANTERIOR = '13cf9d9a6ec64ca5d07f1266fe8998323de16ef3';
const MODELO = ['## Summary', '', 'O que mudou.', '', 'Sem issue', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', ''];
const corpoCom = (...linhas) => [...MODELO, ...linhas].join('\n');
const MEDIA = corpoCom('**Atenção:** MÉDIA');
const ALTA = corpoCom('**Atenção:** ALTA', 'Muda o estado do Envio.');
const registro = (head, veredito = 'CLEAN') => ['Registro do /code-review', '', `Veredito: ${veredito}`, `Head: ${head}`, 'Autor: worker a', 'Revisor: worker b'].join('\n');
const pr = (estado = {}) => ({ corpo: MEDIA, rotulos: [], registros: [], head: HEAD, ...estado });
const revisao = (opcoes = {}) => ({ comando: 'revisao', veredito: 'CLEAN', head: HEAD, autor: 'worker a', revisor: 'worker b', ...opcoes });
const prova = (opcoes = {}) => ({ comando: 'prova', head: HEAD, ...opcoes });

// O plano, sem o GitHub. A revisão do head: o comentário é o registro que o check aceita.
{
  const plano = planejar(revisao(), pr(), 'Nenhum achado.');
  assert.strictEqual(plano.comentario, `${registro(HEAD)}\n\nNenhum achado.`);
  assert.strictEqual(plano.depois.ok, true, plano.depois.mensagem);
  assert.strictEqual(conferir({ ...pr(), registros: [plano.comentario] }).ok, true, 'o check de verdade aceita o que foi gerado');
}
// #436: a revisão foi do commit anterior e a PR ganhou um commit; publicar o registro deixaria o check vermelho.
assert.match(planejar(revisao({ head: ANTERIOR }), pr()).recusa, new RegExp(`a revisão é do commit ${ANTERIOR}, e o head da PR agora é ${HEAD}[^]*Revise o head novo`));
assert.match(planejar(prova({ head: ANTERIOR }), pr(), 'Rodei.').recusa, new RegExp(`a prova é do commit ${ANTERIOR}[^]*Prove o head novo`));
assert.match(planejar(revisao({ head: HEAD.slice(0, 8) }), pr()).recusa, /--head pede o SHA inteiro/, 'o SHA abreviado');
// O registro que o check recusaria não é publicado: o autor revisando a si mesmo, e uma nota que traz outro veredito.
assert.match(planejar(revisao({ revisor: 'Worker A' }), pr()).recusa, /o check não aceitaria este registro: o revisor[^]*é o próprio autor/);
assert.match(planejar(revisao(), pr(), 'Veredito: FINDINGS no eixo Spec').recusa, /é CLEAN e FINDINGS no eixo Spec, não CLEAN/);
// Os achados também são registro: vão para a PR, e o check continua vermelho.
{
  const plano = planejar(revisao({ veredito: 'NOT CLEAN' }), pr({ registros: [registro(HEAD)] }), 'S1: ...');
  assert(plano.comentario.includes('Veredito: NOT CLEAN'), 'o registro NOT CLEAN é publicado');
  assert.match(plano.depois.mensagem, /é NOT CLEAN, não CLEAN/, 'e derruba o CLEAN anterior do mesmo head');
}
// #441: atenção ALTA com a revisão limpa e sem a prova. O plano publica o registro e diz o que ainda falta.
{
  const plano = planejar(revisao(), pr({ corpo: ALTA }));
  assert.strictEqual(plano.depois.ok, false);
  assert.match(plano.depois.mensagem, /atenção ALTA: o corpo não tem a seção "Prova real"/);
  const comProva = planejar(prova(), pr({ corpo: ALTA, registros: [plano.comentario] }), 'Envio real no Anki 25.9, no Mac e no Windows.');
  assert.strictEqual(comProva.secao, `## Prova real\n\nPROVADO 100% REAL\nHead: ${HEAD}\n\nEnvio real no Anki 25.9, no Mac e no Windows.`);
  assert.strictEqual(comProva.corpo, `${ALTA}\n\n${comProva.secao}\n`, 'a seção entra no fim do corpo');
  assert.match(comProva.depois.mensagem, /atenção ALTA, \/code-review CLEAN, PROVADO 100% REAL$/);
}
// A prova de um head anterior é trocada no lugar; o que vem antes e depois da seção fica como está.
{
  const antigo = corpoCom('**Atenção:** ALTA', '', '## Prova real', '', 'NÃO 100%', `Head: ${ANTERIOR}`, '', '### Lacunas', '', 'O Mac caiu.', '', '## Known limits', '', 'Nenhum.');
  const novo = corpoComAProva(antigo, secaoDaProva(HEAD, 'Rodei de novo.'));
  assert.strictEqual(novo, corpoCom('**Atenção:** ALTA', '', '## Prova real', '', 'PROVADO 100% REAL', `Head: ${HEAD}`, '', 'Rodei de novo.', '', '## Known limits', '', 'Nenhum.'));
  assert.strictEqual(conferir({ ...pr(), corpo: novo, registros: [registro(HEAD)] }).ok, true);
  // O formato dentro do comentário do modelo e o título citado num bloco de código não são a seção.
  const comModelo = corpoCom('**Atenção:** ALTA', '', '<!--', '   ## Prova real', '   Head: <SHA>', '-->', '', '```', '## Prova real', '```');
  assert.strictEqual(corpoComAProva(comModelo, secaoDaProva(HEAD)), `${comModelo}\n\n## Prova real\n\nPROVADO 100% REAL\nHead: ${HEAD}\n`);
}

// Pelo comando, diante de um GitHub de teste.
(async () => {
  const github = {};
  const pedidos = [];
  const servidor = http.createServer((pedido, resposta) => {
    let recebido = '';
    pedido.on('data', pedaco => { recebido += pedaco; });
    pedido.on('end', () => {
      const url = new URL(pedido.url, 'http://github.test');
      pedidos.push({ metodo: pedido.method, caminho: `${url.pathname}${url.search}`, corpo: recebido ? JSON.parse(recebido) : null, token: pedido.headers.authorization });
      const rotas = {
        'GET /repos/dono/repo/pulls/7': () => ({ body: github.corpo, labels: [], head: { sha: HEAD } }),
        'GET /repos/dono/repo/issues/7/comments': () => github.comentarios.map((body, i) => ({ body, created_at: `2026-11-14T0${i}:00:00Z`, author_association: 'OWNER' })),
        'GET /repos/dono/repo/pulls/7/reviews': () => [],
        'POST /repos/dono/repo/issues/7/comments': () => ({ id: 1 }),
        'PATCH /repos/dono/repo/pulls/7': () => ({ number: 7 }),
        'GET /repos/dono/repo/actions/workflows/registro-da-pr.yml/runs': () => ({ workflow_runs: github.execucoes }),
        'POST /repos/dono/repo/actions/runs/43593107043/rerun': () => '',
      };
      const rota = rotas[`${pedido.method} ${url.pathname}`];
      const resultado = rota && github.status === 200 ? rota() : null;
      resposta.writeHead(resultado === null ? (github.status === 200 ? 404 : github.status) : resultado === '' ? 201 : 200, { 'content-type': 'application/json' });
      resposta.end(resultado ? JSON.stringify(resultado) : '');
    });
  });
  await new Promise(pronto => servidor.listen(0, '127.0.0.1', pronto));
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'registrar-na-pr-'));
  const nota = path.join(pasta, 'nota.md');
  fs.writeFileSync(nota, 'Envio real no Anki 25.9.\n');
  const VERMELHA = { id: 43593107043, status: 'completed', conclusion: 'failure', created_at: '2026-11-14T12:05:39Z', html_url: 'https://github.test/runs/43593107043' };
  const CANCELADA = { id: 43589465759, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-14T11:19:24Z' };
  const rodar = (args, estado = {}) => new Promise(pronto => {
    Object.assign(github, { status: 200, corpo: MEDIA, comentarios: [], execucoes: [CANCELADA, VERMELHA] }, estado);
    pedidos.length = 0;
    execFile('node', [path.join(__dirname, 'registrar-na-pr.js'), ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GITHUB_API_URL: `http://127.0.0.1:${servidor.address().port}`, GITHUB_REPOSITORY: 'dono/repo', GITHUB_TOKEN: 'segredo' },
    }, (erro, stdout) => pronto({ status: erro ? erro.code : 0, stdout, escritas: pedidos.filter(pedido => pedido.metodo !== 'GET') }));
  });
  const REVISAO = ['revisao', '--pr', '7', '--head', HEAD, '--autor', 'worker a', '--revisor', 'worker b'];
  const PROVA = ['prova', '--pr', '7', '--head', HEAD, '--nota', nota];
  try {
    // Sem --publicar é um ensaio: mostra o registro e o que o check diria, e não escreve nada.
    const ensaio = await rodar(REVISAO);
    assert.strictEqual(ensaio.status, 0, ensaio.stdout);
    assert.match(ensaio.stdout, /ensaio: nada foi publicado; repita com --publicar[^]*Veredito: CLEAN\n\s+Head: 1d606d78aac180096ca7cc5df8279355f21ac729[^]*registro da PR ok no head/);
    assert.deepStrictEqual(ensaio.escritas, [], 'o ensaio não escreve no GitHub');

    // #442: publica o comentário e roda de novo a execução mais recente do check neste head (a vermelha, não a cancelada).
    const publicada = await rodar([...REVISAO, '--publicar']);
    assert.strictEqual(publicada.status, 0, publicada.stdout);
    assert.deepStrictEqual(publicada.escritas.map(({ metodo, caminho, corpo, token }) => ({ metodo, caminho, corpo, token })), [
      { metodo: 'POST', caminho: '/repos/dono/repo/issues/7/comments', corpo: { body: registro(HEAD) }, token: 'Bearer segredo' },
      { metodo: 'POST', caminho: '/repos/dono/repo/actions/runs/43593107043/rerun', corpo: null, token: 'Bearer segredo' },
    ]);
    assert.match(publicada.stdout, /Registro publicado\.[^]*Check rodando de novo \(execução 43593107043\): https:\/\/github\.test\/runs\/43593107043/);
    assert(pedidos.some(pedido => pedido.caminho === `/repos/dono/repo/actions/workflows/registro-da-pr.yml/runs?head_sha=${HEAD}&per_page=20`), 'procura a execução do head');
    const rodando = await rodar([...REVISAO, '--publicar'], { execucoes: [{ ...VERMELHA, status: 'in_progress' }] });
    assert.match(rodando.stdout, /já está rodando neste head/);
    assert.strictEqual(rodando.escritas.length, 1, 'só o comentário: a execução em andamento lê o registro novo');

    // #436: o registro do commit anterior não é publicado.
    const atrasada = await rodar(['revisao', '--pr', '7', '--head', ANTERIOR, '--autor', 'a', '--revisor', 'b', '--publicar']);
    assert.strictEqual(atrasada.status, 1);
    assert.match(atrasada.stdout, new RegExp(`^✗ Nada foi publicado na PR 7: a revisão é do commit ${ANTERIOR}, e o head da PR agora é ${HEAD}`));
    assert.deepStrictEqual(atrasada.escritas, []);

    // #441: ALTA sem a prova, e o check nunca rodou no head (a PR é de antes de o workflow chegar à main).
    const semProva = await rodar([...REVISAO, '--publicar'], { corpo: ALTA, execucoes: [] });
    assert.strictEqual(semProva.status, 1, 'o registro é publicado, e a saída diz que o check ainda não passa');
    assert.strictEqual(semProva.escritas.length, 1);
    assert.match(semProva.stdout, /o corpo não tem a seção "Prova real"[^]*não tem execução neste head, e um comentário não cria uma[^]*gh pr close 7 -R dono\/repo && gh pr reopen 7 -R dono\/repo/);
    assert.match((await rodar(['conferir', '--pr', '7'], { execucoes: [] })).stdout, /não tem execução neste head/, 'conferir também avisa');

    // A prova: a seção entra no corpo (a edição dispara o check, não há o que rodar de novo).
    const provada = await rodar([...PROVA, '--publicar'], { corpo: ALTA, comentarios: [registro(HEAD)] });
    assert.strictEqual(provada.status, 0, provada.stdout);
    assert.deepStrictEqual(provada.escritas.map(({ metodo, caminho, corpo }) => ({ metodo, caminho, corpo })), [
      { metodo: 'PATCH', caminho: '/repos/dono/repo/pulls/7', corpo: { body: `${ALTA}\n\n## Prova real\n\nPROVADO 100% REAL\nHead: ${HEAD}\n\nEnvio real no Anki 25.9.\n` } },
    ]);
    assert.match(provada.stdout, /Corpo gravado[^]*atenção ALTA, \/code-review CLEAN, PROVADO 100% REAL/);
    assert.match((await rodar([...PROVA, '--publicar'], { corpo: ALTA, comentarios: [registro(HEAD)], execucoes: [] })).stdout, /PROVADO 100% REAL\n$/, 'a edição do corpo cria a execução: nada a avisar');

    // conferir: o que o check diz agora, sem escrever.
    const conferida = await rodar(['conferir', '--pr', '7'], { comentarios: [registro(ANTERIOR)] });
    assert.strictEqual(conferida.status, 1);
    assert.match(conferida.stdout, new RegExp(`mais recente é do commit ${ANTERIOR}`));
    assert.deepStrictEqual(conferida.escritas, []);

    // Erro de uso e GitHub fora do ar: código 2, nada publicado.
    for (const [args, padrao] of [
      [['revisao', '--pr', '7', '--head', HEAD], /revisao pede --autor, --revisor/], [['prova', '--pr', '7', '--head', HEAD], /prova pede --nota/],
      [['publicar', '--pr', '7'], /comando desconhecido: publicar/], [['conferir'], /--pr <número> é obrigatório/], [['conferir', '--pr', '7', '--forcar'], /opção desconhecida: --forcar/],
    ]) {
      const errado = await rodar(args);
      assert.strictEqual(errado.status, 2, args.join(' '));
      assert.match(errado.stdout, padrao);
      assert.match(errado.stdout, /uso: node scripts\/ci\/registrar-na-pr\.js/);
    }
    const foraDoAr = await rodar([...REVISAO, '--publicar'], { status: 500 });
    assert.strictEqual(foraDoAr.status, 2);
    assert.match(foraDoAr.stdout, /^✗ o GitHub respondeu 500/);
    assert.match((await rodar(['--help'])).stdout, /^uso: node scripts\/ci\/registrar-na-pr\.js/);
  } finally {
    servidor.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }

  // O check e o modelo da PR dizem onde está o publicador.
  assert(conferir({ ...pr(), corpo: '' }).mensagem.includes('node scripts/ci/registrar-na-pr.js --help'), 'a mensagem do check vermelho cita o publicador');
  assert(fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8').includes('scripts/ci/registrar-na-pr.js'), 'o modelo cita o publicador');
  console.log('test_registrar_na_pr: ok');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
