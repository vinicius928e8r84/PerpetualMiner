'use strict';

const id = 'teste-le-codigo';

const conserto = 'Exercite a rota ou a função, não o texto dela: a rota por HTTP '
  + '(complemento/test_servidor.py) ou a função com fakes nas fronteiras '
  + '(complemento/test_envio.py é o modelo). Não leia um .py com read_text/open/inspect.getsource/ast.get_source_segment '
  + '(CODING_STANDARDS.md regra 9).';

const seAplica = arquivo => /(^|\/)test_[^/]*\.py$/.test(arquivo);

const ehComentario = linha => /^\s*#/.test(linha);

const semComentarios = fonte => fonte.split('\n').map(linha => (ehComentario(linha) ? '' : linha)).join('\n');

const recuoDe = linha => /^\s*/.exec(linha)[0].length;

const continuaNaFuncao = (linha, recuo) => linha.trim() === '' || recuoDe(linha) > recuo;

function fimDaFuncao(linhas, inicio, recuo) {
  let fim = inicio + 1;
  while (fim < linhas.length && continuaNaFuncao(linhas[fim], recuo)) fim++;
  return fim;
}

function funcoes(codigo) {
  const linhas = codigo.split('\n');
  const lista = [];
  linhas.forEach((linha, i) => {
    const m = /^(\s*)def\s+(\w+)\s*\(/.exec(linha);
    if (m) lista.push({ nome: m[2], de: i + 1, ate: fimDaFuncao(linhas, i, m[1].length) });
  });
  return lista;
}

const chamaAlgum = (nomes, linha) => [...nomes].some(nome => new RegExp(`\\b${nome}\\s*\\(`).test(linha));

const mencionaAlgum = (nomes, linha) => [...nomes].some(nome => new RegExp(`\\b${nome}\\b`).test(linha));

const nomesDeCaminhosDeCodigo = codigo => new Set([...codigo.matchAll(/^(\w+)\s*=.*['"][\w./-]+\.py['"]/gm)].map(m => m[1]));

const pedeOCodigoDireto = linha => /\b(?:inspect\.)?getsource\s*\(|\bget_source_segment\s*\(/.test(linha);

const abreArquivo = linha => /\.read_text\s*\(|\bopen\s*\(|\.read_bytes\s*\(/.test(linha);

const citaArquivoDeCodigo = linha => /['"][\w./-]+\.py['"]/.test(linha);

const abreArquivoDeCodigo = (linha, caminhosDeCodigo) => abreArquivo(linha)
  && (citaArquivoDeCodigo(linha) || mencionaAlgum(caminhosDeCodigo, linha));

const leCodigoComOs = caminhosDeCodigo => linha => pedeOCodigoDireto(linha) || abreArquivoDeCodigo(linha, caminhosDeCodigo);

function leitoresDe(defs, linhas, leCodigo) {
  const leitores = new Set();
  const ehLeitor = def => {
    const corpo = linhas.slice(def.de, def.ate);
    return corpo.some(leCodigo) || corpo.some(linha => chamaAlgum(leitores, linha));
  };
  let novos;
  do {
    novos = defs.filter(def => !leitores.has(def.nome) && ehLeitor(def));
    novos.forEach(def => leitores.add(def.nome));
  } while (novos.length);
  return leitores;
}

const dentroDeAlgumLeitor = (defsLeitoras, numero) => defsLeitoras.some(def => numero > def.de && numero <= def.ate);

function achadoDaLinha(linha, numero, leitores, leCodigo) {
  const chamado = [...leitores].find(nome => chamaAlgum([nome], linha));
  if (chamado) return { linha: numero, detalhe: `lê o código com ${chamado}()` };
  if (leCodigo(linha)) return { linha: numero, detalhe: `lê o código: ${linha.trim().slice(0, 100)}` };
  return null;
}

function verificar(arquivo, fonte) {
  const codigo = semComentarios(fonte);
  const linhas = codigo.split('\n');
  const leCodigo = leCodigoComOs(nomesDeCaminhosDeCodigo(codigo));
  const defs = funcoes(codigo).filter(def => !/^test/.test(def.nome));
  const leitores = leitoresDe(defs, linhas, leCodigo);
  const defsLeitoras = defs.filter(def => leitores.has(def.nome));
  const achados = [];
  linhas.forEach((linha, i) => {
    if (dentroDeAlgumLeitor(defsLeitoras, i + 1) || /^\s*def\s/.test(linha)) return;
    const achado = achadoDaLinha(linha, i + 1, leitores, leCodigo);
    if (achado) achados.push(achado);
  });
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
