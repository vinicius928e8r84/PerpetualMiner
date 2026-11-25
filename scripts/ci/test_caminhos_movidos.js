'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { arquivosDoPacote, PASTAS_DA_EXTENSAO } = require('../arquivos-do-pacote.js');

const RAIZ = path.resolve(__dirname, '..', '..');

const MOVIDOS = Object.fromEntries([
  'painel-abrir-anki.js',
  'painel-ajustes.js',
  'painel-anki-baralhos.js',
  'painel-anki-continuar.js',
  'painel-anki-estilo.js',
  'painel-anki-plano.js',
  'painel-anki-previa.js',
  'painel-anki-primeira-conexao-estado.js',
  'painel-anki-primeira-conexao.js',
  'painel-anki-tipo-proprio.js',
  'painel-anki.js',
  'painel-atalhos.js',
  'painel-boas-vindas-envio.js',
  'painel-boas-vindas-festa.js',
  'painel-boas-vindas-minerar.js',
  'painel-boas-vindas-nivel.js',
  'painel-boas-vindas-quiz.js',
  'painel-boas-vindas-ranking.js',
  'painel-boas-vindas.js',
  'painel-chave.js',
  'painel-conexao-arraste.css',
  'painel-conexao-arraste.js',
  'painel-conexao-passos.js',
  'painel-conexao-versao-estado.js',
  'painel-conexao-versao.js',
  'painel-conta.js',
  'painel-envio-anki-fechado.js',
  'painel-envio-apagar.js',
  'painel-envio-cartao.js',
  'painel-envio-estado.js',
  'painel-envio-limite.js',
  'painel-envio-parado.js',
  'painel-envio.js',
  'painel-ia-chatgpt.js',
  'painel-ia-modelo.css',
  'painel-ia-modelo.js',
  'painel-ia.js',
  'painel-lembrete.js',
  'painel-perigo.js',
  'painel-previa.css',
  'painel-quiz.css',
  'painel-shell.js',
  'painel-teto.css',
  'painel-teto.js',
  'painel.css',
  'painel.html',
  'painel.js',
].map(nome => [nome, `painel/${nome}`]));
Object.assign(MOVIDOS, { 'popup.js': 'popup/popup.js', 'popup.css': 'popup/popup.css', 'popup.html': 'popup/popup.html' });

const CONTEUDO_VIVO = [/^docs\/(?!design\/)/, /^veio\//, /^lib\//, /^background\.js$/, /^glossary\.md$/, /^manifest\.json$/, /^\.agents\/.*\.(sh|js)$/, /^\.agents\/.*\.md$/, /^\.claude\//, /^\.github\//, /^scripts\//, /^e2e\/(?!tests\/|.*\.png$)/, /^preview\//, /^testes\//, /^complemento\/.*\.(py|js|md)$/, /^(AGENTS|CODING_STANDARDS|README)\.md$/, /^package\.json$/];
const FORA = [/(^|\/)test_[^/]*$/, /^scripts\/ci\/test_caminhos_movidos\.js$/, /^e2e\/tests\/.*\.png$/, /\.png$/, /^testes\/retrato-do-painel\//];
const SKILL_CITA_O_ENDERECO_E_O_FRONTMATTER = /^\.agents\/skills\/(?!verify-perpetualminer\/(SKILL|mapa-de-features)\.md$).*\.md$/;
const PASTAS_DE_PAGINAS = new Set(PASTAS_DA_EXTENSAO);

const rastreados = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
const existe = arquivo => fs.existsSync(path.join(RAIZ, arquivo));
const ler = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const ehArquivo = arquivo => Boolean(fs.statSync(path.join(RAIZ, arquivo), { throwIfNoEntry: false })?.isFile());

function conferirQueSaiuDaRaiz([antigo, novo]) {
  assert.ok(!existe(antigo), `${antigo} voltou para a raiz`);
  assert.ok(existe(novo), `${novo} não existe`);
}

function conferirOPacote(pacote, [antigo, novo]) {
  assert.ok(!pacote.includes(antigo), `o pacote da loja ainda leva ${antigo}`);
  assert.ok(pacote.includes(novo), `o pacote da loja não leva ${novo}`);
}

function referenciasDoHtml(html) {
  return [...html.matchAll(/\b(?:src|href)="([^"#?]+)"/g)].map(m => m[1]).filter(v => !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v));
}

const naRaizOuNumaPastaDaExtensao = arquivo => !arquivo.includes('/') || PASTAS_DE_PAGINAS.has(arquivo.split('/')[0]);
const ehPaginaDaExtensao = arquivo => arquivo.endsWith('.html') && naRaizOuNumaPastaDaExtensao(arquivo);
const alvoDaReferencia = (html, ref) => (ref.startsWith('/') ? ref.slice(1) : path.posix.join(path.posix.dirname(html), ref));

function conferirAsReferenciasDaPagina(html) {
  for (const ref of referenciasDoHtml(ler(html))) assert.ok(existe(alvoDaReferencia(html, ref)), `${html} referencia ${ref}, que não existe`);
}

const arquivosDoConteudoScript = script => [...(script.js ?? []), ...(script.css ?? [])];

function caminhosDoManifesto(manifesto) {
  return [
    manifesto.action?.default_popup, manifesto.background?.service_worker,
    ...(manifesto.content_scripts ?? []).flatMap(arquivosDoConteudoScript),
    ...(manifesto.web_accessible_resources ?? []).flatMap(g => g.resources),
  ].filter(Boolean).filter(c => !c.includes('*'));
}

const regraDoCaminhoAntigo = antigo => new RegExp(`(?<![\\w./-])${antigo.replace(/\./g, '\\.')}(?![\\w])`);
const velhos = Object.keys(MOVIDOS).map(antigo => ({ antigo, regra: regraDoCaminhoAntigo(antigo) }));
const velhosDePaginas = velhos.filter(({ antigo }) => antigo.endsWith('.html'));

const ehConteudoVivo = arquivo => CONTEUDO_VIVO.some(r => r.test(arquivo)) && !FORA.some(r => r.test(arquivo));
const ehComentarioDeCodigo = (arquivo, linha) => /\.(js|mjs)$/.test(arquivo) && /^\s*(\/\/|\*|\/\*)/.test(linha);
const linhaPulada = (arquivo, linha) => /extensao\.url\(/.test(linha) || ehComentarioDeCodigo(arquivo, linha);
const skillSoCitaOEndereco = (arquivo, linha) => SKILL_CITA_O_ENDERECO_E_O_FRONTMATTER.test(arquivo) && !/^description:|git diff/.test(linha);
const velhosQueContam = (arquivo, linha) => (skillSoCitaOEndereco(arquivo, linha) ? velhosDePaginas : velhos);

function conferirLinha(arquivo, linha, numero) {
  if (linhaPulada(arquivo, linha)) return;
  for (const { antigo, regra } of velhosQueContam(arquivo, linha)) {
    assert.ok(!regra.test(linha), `${arquivo}:${numero} ainda cita o caminho antigo ${antigo}: use ${MOVIDOS[antigo]}`);
  }
}

function conferirArquivoVivo(arquivo) {
  if (!ehArquivo(arquivo)) return;
  ler(arquivo).split('\n').forEach((linha, i) => conferirLinha(arquivo, linha, i + 1));
}

const movidos = Object.entries(MOVIDOS);
movidos.forEach(conferirQueSaiuDaRaiz);

const pacote = arquivosDoPacote(RAIZ);
movidos.forEach(par => conferirOPacote(pacote, par));

const paginas = rastreados.filter(ehPaginaDaExtensao);
assert.ok(paginas.includes('painel/painel.html'), 'as páginas das subpastas entram na conferência');
assert.ok(paginas.includes('popup/popup.html'), 'as páginas das subpastas entram na conferência');
paginas.forEach(conferirAsReferenciasDaPagina);

for (const caminho of caminhosDoManifesto(JSON.parse(ler('manifest.json')))) assert.ok(existe(caminho), `manifest.json cita ${caminho}, que não existe`);

rastreados.filter(ehConteudoVivo).forEach(conferirArquivoVivo);

console.log('ok: nenhum caminho antigo ficou referenciado e o pacote da loja leva os caminhos novos');
