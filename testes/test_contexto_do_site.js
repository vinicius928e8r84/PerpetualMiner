'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = {};
contexto.globalThis = contexto;
vm.createContext(contexto);
const arquivo = 'lib/contexto-do-site.js';
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8'), contexto, { filename: arquivo });
const { lembraOUltimo } = contexto.PerpetualMiner.ContextoDoSite;

function soANetflixPedeALeituraDepoisDoMouse() {
  assert.strictEqual(lembraOUltimo('www.netflix.com'), true);
  for (const host of ['www.youtube.com', 'play.max.com', 'www.primevideo.com', 'www.disneyplus.com', 'hd.kinopoisk.ru', 'example.com', '']) {
    assert.strictEqual(lembraOUltimo(host), false, `${host || '(sem host)'} não lê o Contexto quando o mouse mexe`);
  }
}

soANetflixPedeALeituraDepoisDoMouse();
console.log('test_contexto_do_site: ok');
