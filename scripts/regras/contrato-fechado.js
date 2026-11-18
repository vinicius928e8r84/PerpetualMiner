'use strict';

const fs = require('fs');
const path = require('path');
const { ehJsDaExtensao, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'contrato-fechado';

const conserto = 'Peça pela `PerpetualMiner.ConversaComOAnki.pedir(PedidoAoAnki.<construtor>(…))` (lib/pedido-ao-anki.js: '
  + '`saude`, `baralhos`, `estatisticas`, `vocabulario`); uma rota nova ganha o construtor e os exemplos dela em '
  + 'complemento/contrato/exemplos.json (o caso feliz, cada erro, cada corpo que a extensão monta) antes de a extensão pedi-la. '
  + 'Veja complemento/contrato/LEIA-ME.md § Como uma rota nova entra.';

const ARQUIVO_DO_CONSTRUTOR = 'lib/pedido-ao-anki.js';
const seAplica = arquivo => ehJsDaExtensao(arquivo) && arquivo !== ARQUIVO_DO_CONSTRUTOR;

const ENDERECO = /(?:\bENDERECO\w*|\bendereco\b|127\.0\.0\.1:8766|localhost:8766)\}?(?=\/|\$\{)/g;

function caminhoDe(codigo, de) {
  let caminho = '';
  for (let i = de; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === '$' && codigo[i + 1] === '{') {
      const fim = fechamento(codigo, i + 1);
      if (fim < 0) break;
      caminho += ':id';
      i = fim;
    } else if (/[`'"?\s,)]/.test(c)) break;
    else caminho += c;
  }
  return caminho;
}

const contratos = new Map();
function rotasDoContrato(raiz) {
  if (!contratos.has(raiz)) {
    const pasta = path.join(raiz, 'complemento', 'contrato');
    const [base, carregador] = ['exemplos.json', 'carregar.js'].map(nome => path.join(pasta, nome));
    const exemplos = !fs.existsSync(base) ? [] : fs.existsSync(carregador) ? require(carregador).carregar(pasta).exemplos : JSON.parse(fs.readFileSync(base, 'utf8')).exemplos;
    contratos.set(raiz, new Set(exemplos.filter(e => e.daExtensao === true).map(e => `${e.pedido.metodo} ${e.pedido.caminho}`)));
  }
  return contratos.get(raiz);
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const codigo = semComentariosJs(fonte);
  const rotas = rotasDoContrato(raiz);
  const achados = [];
  for (const m of codigo.matchAll(/\bfetch\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fecha = fechamento(codigo, abre);
    if (fecha < 0) continue;
    const chamada = codigo.slice(abre + 1, fecha);
    ENDERECO.lastIndex = 0;
    const alvo = ENDERECO.exec(chamada);
    if (!alvo) continue;
    const rota = caminhoDe(chamada, alvo.index + alvo[0].length);
    const metodo = (/\bmethod\s*:\s*['"](\w+)['"]/i.exec(chamada) || [, 'GET'])[1].toUpperCase();
    const detalhe = rota === '' || rota.startsWith(':id')
      ? `fetch direto à Conexão com o caminho vindo de uma variável (${metodo}): o contrato não tem como conferir o pedido`
      : rotas.has(`${metodo} ${rota}`)
      ? `fetch direto a ${metodo} ${rota}, que o contrato tem: peça por ConversaComOAnki.pedir com o construtor dele`
      : `fetch direto a ${metodo} ${rota}: a rota não tem exemplo no contrato (complemento/contrato/exemplos.json)`;
    achados.push({ linha: linhaDe(codigo, m.index), detalhe });
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
