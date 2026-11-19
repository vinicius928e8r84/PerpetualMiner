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
const FORA = [/(^|\/)test_[^/]*$/, /^scripts\/ci\/test_caminhos_movidos\.js$/, /^e2e\/tests\/.*\.png$/, /\.png$/];

const rastreados = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
const existe = arquivo => fs.existsSync(path.join(RAIZ, arquivo));

for (const [antigo, novo] of Object.entries(MOVIDOS)) {
  assert.ok(!existe(antigo), `${antigo} voltou para a raiz`);
  assert.ok(existe(novo), `${novo} não existe`);
}

const pacote = arquivosDoPacote(RAIZ);
for (const [antigo, novo] of Object.entries(MOVIDOS)) {
  assert.ok(!pacote.includes(antigo), `o pacote da loja ainda leva ${antigo}`);
  assert.ok(pacote.includes(novo), `o pacote da loja não leva ${novo}`);
}

function referenciasDoHtml(html) {
  return [...html.matchAll(/\b(?:src|href)="([^"#?]+)"/g)].map(m => m[1]).filter(v => !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v));
}
const PASTAS_DE_PAGINAS = new Set(PASTAS_DA_EXTENSAO);
const paginas = rastreados.filter(a => a.endsWith('.html') && (!a.includes('/') || PASTAS_DE_PAGINAS.has(a.split('/')[0])));
assert.ok(paginas.includes('painel/painel.html') && paginas.includes('popup/popup.html'), 'as páginas das subpastas entram na conferência');
for (const html of paginas) {
  for (const ref of referenciasDoHtml(fs.readFileSync(path.join(RAIZ, html), 'utf8'))) {
    const alvo = ref.startsWith('/') ? ref.slice(1) : path.posix.join(path.posix.dirname(html), ref);
    assert.ok(existe(alvo), `${html} referencia ${ref}, que não existe`);
  }
}

const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
const doManifesto = [
  manifesto.action?.default_popup, manifesto.background?.service_worker,
  ...(manifesto.content_scripts ?? []).flatMap(s => [...(s.js ?? []), ...(s.css ?? [])]),
  ...(manifesto.web_accessible_resources ?? []).flatMap(g => g.resources),
].filter(Boolean).filter(c => !c.includes('*'));
for (const caminho of doManifesto) assert.ok(existe(caminho), `manifest.json cita ${caminho}, que não existe`);

const SKILL_CITA_O_ENDERECO_E_O_FRONTMATTER = /^\.agents\/skills\/(?!verify-perpetualminer\/(SKILL|mapa-de-features)\.md$).*\.md$/;
const velhos = Object.keys(MOVIDOS).map(antigo => ({ antigo, regra: new RegExp(`(?<![\\w./-])${antigo.replace(/\./g, '\\.')}(?![\\w])`) }));
for (const arquivo of rastreados.filter(a => CONTEUDO_VIVO.some(r => r.test(a)) && !FORA.some(r => r.test(a)))) {
  if (!fs.statSync(path.join(RAIZ, arquivo), { throwIfNoEntry: false })?.isFile()) continue;
  const linhas = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    if (/extensao\.url\(/.test(linha)) return;
    if (/\.(js|mjs)$/.test(arquivo) && /^\s*(\/\/|\*|\/\*)/.test(linha)) return;
    const soEndereco = SKILL_CITA_O_ENDERECO_E_O_FRONTMATTER.test(arquivo) && !/^description:|git diff/.test(linha);
    for (const { antigo, regra } of velhos) if (!soEndereco || antigo.endsWith('.html')) assert.ok(!regra.test(linha), `${arquivo}:${i + 1} ainda cita o caminho antigo ${antigo}: use ${MOVIDOS[antigo]}`);
  });
}

console.log('ok: nenhum caminho antigo ficou referenciado e o pacote da loja leva os caminhos novos');
