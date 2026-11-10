'use strict';

// O preview monta o que as telas da extensão carregam a partir do manifest e das
// páginas, não de uma lista escrita à mão: toda página da extensão chega ao preview com
// cada script, estilo e imagem que ela pede. Roda `preview/montar.mjs` numa pasta
// temporária. `node test_preview.js`. Confere também as páginas públicas do app: `/sobre/` (a landing, com
// as capturas de `preview/site/capturas/`) e a política de privacidade em `/privacidade/` e `/privacy/`, que
// o consentimento OAuth do Google pede. E os protótipos da nova landing, em `/prototipos/pagina/` e `/prototipos/pagina-gsap/`.

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

require('./lib/arquivos-da-extensao.js');
const { arquivosDaExtensao } = globalThis.PerpetualMiner;

const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-preview-'));
execFileSync('node', ['preview/montar.mjs', '--saida', saida], { stdio: 'pipe' });
const extensao = path.join(saida, 'extensao');

(async () => {
  const arquivos = await arquivosDaExtensao(async caminho => fs.readFileSync(caminho, 'utf8'));

  const faltam = arquivos.filter(arquivo => !fs.existsSync(path.join(extensao, arquivo)));
  assert.deepStrictEqual(faltam, [], `o preview não copiou: ${faltam.join(', ')}`);

  const paginas = arquivos.filter(arquivo => arquivo.endsWith('.html'));
  assert(paginas.includes('painel.html'), 'a lista da extensão devia ter o painel');
  for (const pagina of paginas) {
    const html = fs.readFileSync(pagina, 'utf8');
    const pedidos = [...html.matchAll(/\b(?:src|href)="([^"#?:]+)"/g)].map(m => m[1]).filter(p => !p.startsWith('//'));
    // A ponte do abridor (lib/abridor.js) é vazia de propósito: um quadro escondido que só empresta o `chrome.runtime`.
    if (pagina !== 'abridor.html') assert(pedidos.length > 0, `${pagina}: não achei o que ela carrega`);
    for (const pedido of pedidos) {
      assert(fs.existsSync(path.join(extensao, pedido)), `${pagina} carrega ${pedido}, que não está no preview`);
    }
  }

  // O arquivo da Conexão não está no manifest: o painel o entrega num link.
  assert(fs.existsSync(path.join(extensao, 'conexao', 'perpetualminer.ankiaddon')), 'falta o .ankiaddon no preview');

  assert(fs.readFileSync(path.join(extensao, 'painel.html'), 'utf8').includes('/preview-chrome-simulado.js'));
  assert(!fs.readFileSync('painel.html', 'utf8').includes('preview-chrome-simulado'));

  // O vídeo simulado é uma página de fora da extensão: leva o simulador e os scripts de conteúdo do manifest, na ordem.
  const video = fs.readFileSync(path.join(extensao, 'video-simulado.html'), 'utf8');
  const scriptsDoVideo = [...video.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const scriptsDeConteudo = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).content_scripts.flatMap(entrada => entrada.js);
  assert.deepStrictEqual(scriptsDoVideo, ['/preview-chrome-simulado.js', ...scriptsDeConteudo]);
  assert(video.includes('<video'), 'sem vídeo na página, a extensão não procura legenda');

  // As páginas públicas: a política sai nos dois endereços, a página inicial a leva num link, e o que elas
  // carregam (a Veio, a folha do site e, na landing, o script do movimento) está no site, sem nada de fora.
  const privacidade = fs.readFileSync(path.join(saida, 'privacidade', 'index.html'), 'utf8');
  assert.strictEqual(fs.readFileSync(path.join(saida, 'privacy', 'index.html'), 'utf8'), privacidade);
  assert(privacidade.includes('Política de privacidade') && privacidade.includes('Uso limitado'));
  const sobre = fs.readFileSync(path.join(saida, 'sobre', 'index.html'), 'utf8');
  for (const endereco of ['/privacidade/', '/privacy/']) {
    assert(sobre.includes(`href="${endereco}"`), `a landing devia levar à política em ${endereco}`);
  }
  // O botão de instalar leva ao item da extensão na Chrome Web Store: o mesmo ID que a Conexão com o Anki atende.
  const { origemDaExtensao } = JSON.parse(fs.readFileSync('complemento/contrato/exemplos.json', 'utf8'));
  const idDaExtensao = origemDaExtensao.replace('chrome-extension://', '');
  assert(sobre.includes(`href="https://chromewebstore.google.com/detail/perpetualminer/${idDaExtensao}"`), 'a landing devia levar à extensão na Chrome Web Store');
  for (const [nome, html] of [['privacidade', privacidade], ['sobre', sobre]]) {
    // A política não tem script; a landing, só o do movimento dela. Nenhum escrito na página, nenhum de fora.
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => (m[1].match(/\bsrc="([^"]*)"/) || [])[1] || '(escrito na página)');
    assert.deepStrictEqual(scripts, nome === 'sobre' ? ['/site/site.js'] : [], `${nome}: script que não devia estar na página`);
    const pedidos = [...html.matchAll(/\b(?:src|srcset|href)="(\/[^"#?]*)"/g)].map(m => m[1]);
    for (const pedido of pedidos) {
      const alvo = path.join(saida, pedido);
      assert(fs.existsSync(alvo) || fs.existsSync(path.join(alvo, 'index.html')), `${nome} carrega ${pedido}, que não está no site`);
    }
    const externos = [...html.matchAll(/\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    assert(!externos.some(url => /fonts\.(googleapis|gstatic)/.test(url)), `${nome}: fonte de fora`);
    assert(!/\b(?:src|srcset)="https?:/.test(html), `${nome}: imagem de fora`);
  }
  const movimento = fs.readFileSync(path.join(saida, 'site', 'site.js'), 'utf8');
  const proibido = movimento.match(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|cookie|localStorage|sessionStorage|indexedDB)\b/);
  assert(!proibido, `o script da landing não fala com a rede nem guarda nada, e usa ${proibido}`);
  // As capturas da landing: toda imagem que `preview/capturar.mjs` deixou na pasta aparece na página.
  const capturas = fs.readdirSync(path.join(saida, 'site', 'capturas'));
  assert(capturas.length > 0, 'a landing devia ter capturas');
  for (const captura of capturas) {
    assert(sobre.includes(`"/site/capturas/${captura}"`), `a landing não mostra a captura ${captura}`);
  }
  assert(fs.readFileSync(path.join(saida, 'index.html'), 'utf8').includes('href="/sobre/"'), 'a capa devia levar ao /sobre/');

  // Os protótipos da nova landing (preview/prototipos/pagina/ e, com GSAP, pagina-gsap/): saem no site, a capa leva a
  // eles e a produção não os carrega. Valem para eles as regras da landing: o que pedem está no site, nada vem de fora
  // e os scripts não falam com a rede nem guardam nada.
  for (const [nome, html] of [['privacidade', privacidade], ['sobre', sobre]]) {
    assert(!html.includes('prototipos/'), `${nome}: a produção não carrega nada dos protótipos`);
  }
  const ESTUDOS = [
    { pasta: 'pagina', variantes: ['roteiro.html', 'mosaico.html', 'abas.html'] },
    { pasta: 'pagina-gsap', variantes: ['palco.html', 'travessia.html', 'compasso.html'] },
  ];
  /** Os arquivos de uma pasta e das pastas dentro dela, como caminhos a partir dela. */
  const todosOsArquivos = (pasta, prefixo = '') => fs.readdirSync(path.join(pasta, prefixo), { withFileTypes: true })
    .flatMap(item => (item.isDirectory() ? todosOsArquivos(pasta, path.join(prefixo, item.name)) : [path.join(prefixo, item.name)]));
  for (const { pasta, variantes: esperadas } of ESTUDOS) {
    const emEstudo = path.join(saida, 'prototipos', pasta);
    assert(fs.readFileSync(path.join(saida, 'index.html'), 'utf8').includes(`href="/prototipos/${pasta}/"`), `a capa devia levar aos protótipos de ${pasta}`);
    const variantes = [...fs.readFileSync(path.join(emEstudo, 'index.html'), 'utf8').matchAll(/quadro\('([^']+\.html)'/g)].map(m => m[1]);
    assert.deepStrictEqual(variantes, esperadas, `o seletor de ${pasta} devia montar as três variantes`);
    for (const pagina of ['index.html', ...variantes]) {
      const html = fs.readFileSync(path.join(emEstudo, pagina), 'utf8');
      // O `src="${arquivo}"` do seletor é o molde do quadro, não um pedido: os arquivos dele são as variantes, acima.
      const pedidos = [...html.matchAll(/\b(?:src|srcset|href)="([^"#?:$]+)"/g)].map(m => m[1]);
      for (const pedido of pedidos) {
        const alvo = pedido.startsWith('/') ? path.join(saida, pedido) : path.join(emEstudo, pedido);
        assert(fs.existsSync(alvo), `${pasta}/${pagina} (protótipo) carrega ${pedido}, que não está no site`);
      }
      assert(!/\b(?:src|srcset)="(?:https?:)?\/\//.test(html), `${pasta}/${pagina} (protótipo): imagem ou script de fora`);
      assert(!/<link\b[^>]*href="(?:https?:)?\/\//.test(html), `${pasta}/${pagina} (protótipo): folha ou fonte de fora`);
      if (pagina !== 'index.html') assert(html.includes(`href="https://chromewebstore.google.com/detail/perpetualminer/${idDaExtensao}"`), `${pasta}/${pagina} devia levar à extensão na Chrome Web Store`);
      if (pagina !== 'index.html') assert(html.includes('href="/privacidade/"'), `${pasta}/${pagina} devia levar à política de privacidade`);
    }
    // Todos os scripts da pasta, os copiados de terceiros (vendor/) também.
    for (const script of todosOsArquivos(emEstudo).filter(nome => nome.endsWith('.js'))) {
      const usa = fs.readFileSync(path.join(emEstudo, script), 'utf8').match(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|cookie|localStorage|sessionStorage|indexedDB)\b/);
      assert(!usa, `${pasta}/${script} (protótipo) não fala com a rede nem guarda nada, e usa ${usa}`);
    }
  }
  // O GSAP entra copiado (o site não pede nada para fora), com a licença ao lado e o aviso de direitos de cada arquivo
  // como veio: a licença proíbe tirar.
  const gsap = path.join(saida, 'prototipos', 'pagina-gsap', 'vendor', 'gsap');
  assert(fs.readFileSync(path.join(gsap, 'LICENCA.txt'), 'utf8').includes('Standard "No Charge" GSAP License'), 'o GSAP devia ter o texto da licença ao lado');
  const copiados = fs.readdirSync(gsap).filter(nome => nome.endsWith('.js'));
  assert(copiados.includes('gsap.min.js'), 'o GSAP devia estar copiado em vendor/gsap');
  for (const arquivo of copiados) {
    const cabecalho = fs.readFileSync(path.join(gsap, arquivo), 'utf8').slice(0, 300);
    assert(/@license Copyright \d{4}, GreenSock/.test(cabecalho) && cabecalho.includes('https://gsap.com/standard-license'), `${arquivo}: o aviso de direitos do GSAP saiu do arquivo`);
    const usado = ESTUDOS[1].variantes.some(pagina => fs.readFileSync(path.join(saida, 'prototipos', 'pagina-gsap', pagina), 'utf8').includes(`src="vendor/gsap/${arquivo}"`));
    assert(usado, `${arquivo} está copiado e nenhuma variante o carrega`);
  }

  fs.rmSync(saida, { recursive: true, force: true });
  console.log(`ok: ${arquivos.length} arquivos da extensão e ${paginas.length} páginas no preview`);
})().catch(erro => { console.error(erro); process.exit(1); });
