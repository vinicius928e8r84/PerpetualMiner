'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const regra = require('./sem-dado-pessoal-novo');
const { achadosDaMudanca, juntar } = require('./apoio-teste-linhas-novas');
const { raizTemporaria } = require('./apoio-sem-comentario');

const BARRA = String.fromCharCode(92);
const EMAIL_PESSOAL = ['fulana', '@', 'provedor.com'].join('');
const IP_PRIVADO = ['10', '9', '8', '7'].join('.');
const IP_DO_TAILNET = ['100', '64', '1', '2'].join('.');
const IP_PUBLICO = ['198', '18', '0', '9'].join('.');
const CAMINHO_NO_WINDOWS = ['C:', 'Users', 'fulano'].join(BARRA);
const CAMINHO_NO_MAC = ['', 'Users', 'fulano'].join('/');
const LISTA_DE_NOMES = ['# nomes que não podem aparecer', '', 'Beltrano', 'Fulana da Silva', 'João', ''].join('\n');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-dado-pessoal-'));
const casa = path.join(pasta, 'casa');
const escrever = (caminho, texto) => {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, texto);
  return caminho;
};

function ambiente(variaveis = {}) {
  Object.assign(process.env, { HOME: casa, USERPROFILE: casa });
  delete process.env.FREIOS_NOMES;
  Object.assign(process.env, variaveis);
}
const comLista = (texto = LISTA_DE_NOMES) => ambiente({ FREIOS_NOMES: escrever(path.join(pasta, 'fora', 'lista.txt'), texto) });

const novo = (arquivo, texto) => ({ depois: { [arquivo]: texto }, arquivo });
const alterado = (arquivo, antes, depois) => ({ antes: { [arquivo]: antes }, depois: { [arquivo]: depois }, arquivo });
const achados = mudanca => achadosDaMudanca(regra, mudanca);
const linhas = mudanca => achados(mudanca).map(a => a.linha);
const noArquivo = (...texto) => linhas(novo('docs/a.md', juntar(...texto)));

ambiente();

assert.deepStrictEqual(linhas(alterado('lib/a.js', juntar('const a = 1;'), juntar('const a = 1;', `// fale com ${EMAIL_PESSOAL}`))), [2], 'o e-mail pessoal acrescentado barra, com a linha');
assert.deepStrictEqual(linhas(alterado('lib/a.js', juntar(EMAIL_PESSOAL), juntar(EMAIL_PESSOAL, 'const b = 2;'))), [], 'o que a base já tinha não é da mudança');
assert.deepStrictEqual(linhas(alterado('lib/a.js', juntar(EMAIL_PESSOAL), juntar('const b = 2;'))), [], 'tirar o dado passa');
const OUTRO_EMAIL = ['outra', '@', 'provedor.com'].join('');
assert.deepStrictEqual(linhas(alterado('a.md', juntar(EMAIL_PESSOAL), juntar('oi', `fale com ${EMAIL_PESSOAL}`))), [], 'o dado da base que só mudou de linha passa');
assert.deepStrictEqual(linhas(alterado('a.md', juntar(`fale com ${EMAIL_PESSOAL}`, 'fim'), juntar(`escreva a ${EMAIL_PESSOAL} hoje`, 'fim'))), [], 'a linha editada que guarda o dado da base passa');
assert.deepStrictEqual(linhas(alterado('a.md', juntar(EMAIL_PESSOAL), juntar(OUTRO_EMAIL))), [1], 'trocar o dado da base por outro barra');
assert.deepStrictEqual(linhas(alterado('a.md', juntar(EMAIL_PESSOAL), juntar(EMAIL_PESSOAL, `${EMAIL_PESSOAL} e ${OUTRO_EMAIL}`))), [2], 'o dado novo junto do velho barra');
assert.deepStrictEqual(linhas(alterado('a.md', juntar(IP_PRIVADO), juntar('x', EMAIL_PESSOAL))), [2], 'o dado da base de outro tipo não libera');
assert.deepStrictEqual(linhas(alterado('a.md', juntar(EMAIL_PESSOAL), juntar(`${EMAIL_PESSOAL}`))), [], 'a base do próprio arquivo é a que vale');
assert.deepStrictEqual(linhas({ antes: { 'outro.md': juntar(EMAIL_PESSOAL) }, depois: { 'a.md': juntar(EMAIL_PESSOAL) }, arquivo: 'a.md' }), [1], 'o dado de outro arquivo da base não libera');
assert.deepStrictEqual(noArquivo('oi', `fale com ${EMAIL_PESSOAL}`), [2], 'num arquivo novo vale qualquer linha');
assert.match(achados(novo('a.md', juntar(EMAIL_PESSOAL)))[0].detalhe, /^e-mail \(o valor não é mostrado\)$/);
assert(!JSON.stringify(achados(novo('a.md', juntar(EMAIL_PESSOAL, IP_PRIVADO, CAMINHO_NO_MAC)))).includes('fulan'), 'o achado nunca repete o valor');
assert(!JSON.stringify(achados(novo('a.md', juntar(IP_PRIVADO)))).includes(IP_PRIVADO), 'nem o IP');

assert.deepStrictEqual(noArquivo(['12345+fulano', '@', 'users.noreply.github.com'].join(''), 'noreply@github.com', 'Co-Authored-By: Alguem <noreply@anthropic.com>', 'no-reply@servico.com.br'), [], 'noreply passa');
assert.deepStrictEqual(noArquivo('a@example.com', 'b@sub.example.org', 'c@exemplo.com', 'd@exemplo.com.br', 'e@host.test', 'f@x.example', 'git@github.com:dono/repo.git', 'A@EXAMPLE.COM'), [], 'endereços de exemplo passam');
assert.deepStrictEqual(noArquivo('npm i pacote@1.2.3', "import '@escopo/pacote'", 'foo@latest', 'imagem@sha256:abc', 'a @ b.com'), [], 'o que só parece e-mail passa');
assert.deepStrictEqual(noArquivo(EMAIL_PESSOAL.toUpperCase()), [1], 'o e-mail em maiúscula também barra');

for (const ip of [IP_PRIVADO, IP_PUBLICO, IP_DO_TAILNET]) {
  assert.deepStrictEqual(noArquivo(`servidor em ${ip}`), [1], 'o IP real barra');
  assert.deepStrictEqual(noArquivo(`http://${ip}:8080/x`), [1], 'o IP numa URL com porta barra');
  assert.deepStrictEqual(noArquivo(`o servidor é ${ip}.`), [1], 'o IP no fim da frase barra');
}
assert.match(achados(novo('a.md', juntar(`ssh ${IP_DO_TAILNET}`)))[0].detalhe, /^endereço IP \(o valor não é mostrado\)$/);
for (const ip of ['127.0.0.1', '127.1.2.3', '0.0.0.0', '192.0.2.7', '198.51.100.7', '203.0.113.250', '255.255.255.0']) {
  assert.deepStrictEqual(noArquivo(`host ${ip}`), [], `${ip} é neutro e passa`);
}
assert.deepStrictEqual(noArquivo('versao 1.2.3', `v${IP_PRIVADO}`, `${IP_PRIVADO}.4`, '300.1.1.1', '1.2.3.999', '2025.11.27.1'), [], 'o que só parece IP passa');
assert.deepStrictEqual(noArquivo('Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', 'Edg/126.0.0.0', 'Version/17.0.0.0'), [], 'a versão do navegador num user-agent passa');
assert.deepStrictEqual(noArquivo(`Servidor/${IP_PRIVADO}`), [1], 'o IP depois de outra barra continua barrando');

for (const caminho of [CAMINHO_NO_WINDOWS, `${CAMINHO_NO_MAC}/pasta`, CAMINHO_NO_WINDOWS.split(BARRA).join('/'), CAMINHO_NO_WINDOWS.split(BARRA).join(BARRA + BARRA)]) {
  assert.deepStrictEqual(noArquivo(`abra ${caminho}`), [1], 'o caminho com o nome do usuário barra');
}
assert.match(achados(novo('a.md', juntar(CAMINHO_NO_WINDOWS)))[0].detalhe, /^caminho com o nome de um usuário \(o valor não é mostrado\)$/);
for (const nome of ['<usuário>', '<nome>', '$USER', '${USER}', '%USERNAME%', '$env:USERNAME', '*', '...', '[nome]']) {
  assert.deepStrictEqual(noArquivo(`C:${BARRA}Users${BARRA}${nome} e /Users/${nome}/x`), [], `${nome} no lugar do nome passa`);
}
assert.deepStrictEqual(noArquivo(`C:${BARRA}Users${BARRA}Public e /Users/Shared e C:/Users/Default`), [], 'pasta genérica do sistema passa');
assert.deepStrictEqual(noArquivo('cd ~/worktrees', `%USERPROFILE%${BARRA}worktrees`), [], 'til e variável do perfil passam');
assert.deepStrictEqual(noArquivo('src/Users/Lista.tsx', 'fetch(`/users/${id}`)', "import x from './Users/lista'"), [], 'o que só parece caminho passa');

comLista();
assert.deepStrictEqual(noArquivo('oi', 'obrigado, Beltrano!'), [2], 'o nome da lista barra');
assert.match(achados(novo('a.md', juntar('obrigado, Beltrano!')))[0].detalhe, /^nome da lista de nomes proibidos \(o valor não é mostrado\)$/);
assert(!JSON.stringify(achados(novo('a.md', juntar('obrigado, Beltrano!')))).includes('Beltrano'), 'o nome nunca aparece no achado');
assert.deepStrictEqual(noArquivo('fala do JOAO'), [1], 'ignora maiúscula e acento');
assert.deepStrictEqual(noArquivo('fala da fulana da silva'), [1], 'o nome com espaço também');
assert.deepStrictEqual(noArquivo('Beltranopolis e Joaozinho'), [], 'só a palavra inteira conta');
assert.deepStrictEqual(noArquivo('nomes que não podem aparecer, texto qualquer'), [], 'comentário e linha vazia da lista não viram nome');
assert.deepStrictEqual(regra.tiposDaLinha('fala do João e da JOÃO', regra.padraoDosNomes(['joao'])).map(([tipo]) => tipo), ['nome da lista de nomes proibidos'], 'o acento do texto também se dobra');
assert.deepStrictEqual(regra.tiposDaLinha('Beltrano, '.repeat(3), regra.padraoDosNomes(['Beltrano'])).length, 1, 'um achado por tipo e por linha');

const lista = escrever(path.join(pasta, 'fora', 'outra.txt'), 'Cicrano\n');
ambiente({ FREIOS_NOMES: lista });
assert.deepStrictEqual(noArquivo('oi Beltrano e Cicrano'), [1], 'a variável de ambiente vence a lista padrão');
assert.strictEqual(regra.aviso(), null, 'com a lista não há aviso');
escrever(path.join(casa, '.config', 'freios', 'nomes.txt'), 'Beltrano\n');
ambiente();
assert.deepStrictEqual(noArquivo('oi Beltrano'), [1], 'a lista padrão fica em ~/.config/freios/nomes.txt');
assert.strictEqual(regra.aviso(), null);
fs.rmSync(path.join(casa, '.config'), { recursive: true, force: true });

ambiente();
assert.deepStrictEqual(noArquivo(`oi Beltrano e ${EMAIL_PESSOAL}`), [1], 'sem lista, e-mail, IP e caminho continuam conferidos e o nome não');
assert.match(regra.aviso(), /FREIOS_NOMES/);
assert.match(regra.aviso(), /nomes\.txt/);
assert.doesNotMatch(regra.aviso(), /skip|pulad|ignorad/i, 'o aviso não se parece com teste pulado');
ambiente({ FREIOS_NOMES: path.join(pasta, 'nada.txt') });
assert.match(regra.aviso(), /FREIOS_NOMES/, 'a lista apontada que não existe também avisa');

ambiente();
assert.deepStrictEqual(linhas(novo('a.md', juntar([EMAIL_PESSOAL, IP_PRIVADO, CAMINHO_NO_MAC].join(' ')))), [1, 1, 1], 'tipos diferentes na mesma linha são achados separados');
assert.deepStrictEqual(linhas(novo('lib/c.js', `// exceção sem-dado-pessoal-novo até 2099-01-01, aprovada por alguém: fixture\nconst k = '${EMAIL_PESSOAL}';\n`)).length, 1, 'a exceção na linha é do verificar.js, não da regra');
assert.deepStrictEqual(achadosDaMudanca(regra, { depois: { 'lib/a.js': 'x\n' }, arquivo: 'lib/a.js' }), [], 'sem dado nenhum, nada');

assert.strictEqual(regra.seAplica('lib/a.js'), true);
assert.strictEqual(regra.seAplica('docs/nota.md'), true);
assert.strictEqual(regra.seAplica('veio/icones/a.png'), false);
assert.strictEqual(regra.seAplica('e2e/package-lock.json'), false);
assert.match(regra.conserto, /example\.com/);
assert.match(regra.conserto, /192\.0\.2/);
assert.match(regra.conserto, /<usuário>/);
assert.match(regra.conserto, /FREIOS_NOMES/);
assert.match(regra.conserto, /nomes\.txt/);
assert.match(regra.conserto, /EXCECOES de scripts\/regras\/sem-dado-pessoal-novo\.js/);
assert.match(regra.conserto, /o arquivo, com o motivo/);

for (const excecao of regra.EXCECOES) {
  assert(excecao.arquivo instanceof RegExp, 'a exceção nomeia o arquivo');
  assert(typeof excecao.motivo === 'string' && excecao.motivo.trim(), 'toda exceção tem motivo');
}
regra.EXCECOES.push({ arquivo: /^complemento\/test_rede\.py$/, motivo: 'o teste confere a escolha da interface de rede privada' });
assert.deepStrictEqual(linhas(novo('complemento/test_rede.py', juntar(`ip = '${IP_PRIVADO}'`))), [], 'o arquivo da lista de exceções passa');
assert.deepStrictEqual(linhas(novo('complemento/test_outro.py', juntar(`ip = '${IP_PRIVADO}'`))), [1], 'a exceção vale só para o seu arquivo');
regra.EXCECOES.pop();
assert.match(regra.conserto, /publicado numa branch/);

function repositorioComUmaPr(depois) {
  const { raiz, git, gravar, commit } = raizTemporaria();
  gravar({ 'scripts/regras/linha-de-base.json': '{}\n', 'LEIAME.md': 'x\n' });
  commit('base');
  git('checkout', '-q', '-b', 'mudanca');
  gravar(depois);
  commit('mudanca');
  return raiz;
}
const rodarComando = (raiz, variaveis) => {
  ambiente(variaveis);
  const env = { ...process.env, REGRAS_BASE: 'main' };
  return spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', raiz], { cwd: raiz, encoding: 'utf8', env });
};

const comDado = repositorioComUmaPr({ 'docs/a.md': juntar('oi', `fale com ${EMAIL_PESSOAL}`) });
let rodado = rodarComando(comDado, {});
assert.strictEqual(rodado.status, 1, rodado.stdout + rodado.stderr);
assert.match(rodado.stdout, /✗ sem-dado-pessoal-novo — docs\/a\.md/);
assert.match(rodado.stdout, /docs\/a\.md:2: e-mail \(o valor não é mostrado\)/);
assert.match(rodado.stdout, /Conserto: Troque o dado por um exemplo/);
assert(!rodado.stdout.includes('fulana'), 'o relatório do comando não repete o valor');
assert.match(rodado.stdout, /aviso: sem-dado-pessoal-novo: sem lista de nomes/, 'sem a lista o comando avisa');

rodado = rodarComando(comDado, { FREIOS_NOMES: escrever(path.join(pasta, 'fora', 'lista.txt'), LISTA_DE_NOMES) });
assert.strictEqual(rodado.status, 1, rodado.stdout);
assert.doesNotMatch(rodado.stdout, /aviso: sem-dado-pessoal-novo/, 'com a lista o comando não avisa');

const limpa = repositorioComUmaPr({ 'docs/a.md': juntar('oi', 'fale com a@example.com') });
rodado = rodarComando(limpa, {});
assert.strictEqual(rodado.status, 0, rodado.stdout + rodado.stderr);
assert.match(rodado.stdout, /aviso: sem-dado-pessoal-novo: sem lista de nomes/, 'o aviso não derruba o comando');

ambiente();
for (const raiz of [comDado, limpa]) fs.rmSync(raiz, { recursive: true, force: true });
fs.rmSync(pasta, { recursive: true, force: true });

console.log('test_sem_dado_pessoal_novo: ok');
