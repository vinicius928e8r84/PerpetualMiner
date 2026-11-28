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

const HOSTS_QUE_LEEM_QUANDO_O_MOUSE_MEXE = ['www.netflix.com', 'www.primevideo.com', 'www.amazon.com'];
const HOSTS_QUE_NAO_LEEM = ['www.youtube.com', 'play.max.com', 'www.disneyplus.com', 'hd.kinopoisk.ru', 'example.com', ''];

function soANetflixEOPrimePedemALeituraDepoisDoMouse() {
  HOSTS_QUE_LEEM_QUANDO_O_MOUSE_MEXE.forEach(host => assert.strictEqual(lembraOUltimo(host), true, `${host} lê o Contexto quando o mouse mexe`));
  HOSTS_QUE_NAO_LEEM.forEach(host => assert.strictEqual(lembraOUltimo(host), false, `${host || '(sem host)'} não lê o Contexto quando o mouse mexe`));
}

soANetflixEOPrimePedemALeituraDepoisDoMouse();
console.log('test_contexto_do_site: ok');
