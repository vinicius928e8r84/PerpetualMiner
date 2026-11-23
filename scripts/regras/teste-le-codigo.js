'use strict';

const id = 'teste-le-codigo';

const conserto = 'Exercite a rota ou a função, não o texto dela: a rota por HTTP '
  + '(complemento/test_servidor.py) ou a função com fakes nas fronteiras '
  + '(complemento/test_envio.py é o modelo). Não leia um .py com read_text/open/inspect.getsource/ast.get_source_segment '
  + '(CODING_STANDARDS.md regra 9).';

const seAplica = arquivo => /(^|\/)test_[^/]*\.py$/.test(arquivo);

function semComentarios(fonte) {
  return fonte.split('\n').map(linha => (/^\s*#/.test(linha) ? '' : linha)).join('\n');
}

function funcoes(codigo) {
  const linhas = codigo.split('\n');
  const lista = [];
  linhas.forEach((linha, i) => {
    const m = /^(\s*)def\s+(\w+)\s*\(/.exec(linha);
    if (!m) return;
    const recuo = m[1].length;
    let fim = i + 1;
    while (fim < linhas.length && (linhas[fim].trim() === '' || /^\s*/.exec(linhas[fim])[0].length > recuo)) fim++;
    lista.push({ nome: m[2], de: i + 1, ate: fim });
  });
  return lista;
}

function verificar(arquivo, fonte) {
  const codigo = semComentarios(fonte);
  const linhas = codigo.split('\n');
  const caminhosDeCodigo = new Set();
  for (const m of codigo.matchAll(/^(\w+)\s*=.*['"][\w./-]+\.py['"]/gm)) caminhosDeCodigo.add(m[1]);
  const leCodigo = linha => /\b(?:inspect\.)?getsource\s*\(|\bget_source_segment\s*\(/.test(linha)
    || (/\.read_text\s*\(|\bopen\s*\(|\.read_bytes\s*\(/.test(linha)
      && (/['"][\w./-]+\.py['"]/.test(linha) || [...caminhosDeCodigo].some(nome => new RegExp(`\\b${nome}\\b`).test(linha))));

  const defs = funcoes(codigo).filter(def => !/^test/.test(def.nome));
  const leitores = new Set();
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const def of defs) {
      if (leitores.has(def.nome)) continue;
      const corpo = linhas.slice(def.de, def.ate);
      const chamaLeitor = corpo.some(l => [...leitores].some(nome => new RegExp(`\\b${nome}\\s*\\(`).test(l)));
      if (corpo.some(leCodigo) || chamaLeitor) { leitores.add(def.nome); mudou = true; }
    }
  }
  const dentroDeUmLeitor = numero => defs.some(def => leitores.has(def.nome) && numero > def.de && numero <= def.ate);

  const achados = [];
  linhas.forEach((linha, i) => {
    const numero = i + 1;
    if (dentroDeUmLeitor(numero) || /^\s*def\s/.test(linha)) return;
    const chamado = [...leitores].find(nome => new RegExp(`\\b${nome}\\s*\\(`).test(linha));
    if (chamado) achados.push({ linha: numero, detalhe: `lê o código com ${chamado}()` });
    else if (leCodigo(linha)) achados.push({ linha: numero, detalhe: `lê o código: ${linha.trim().slice(0, 100)}` });
  });
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
