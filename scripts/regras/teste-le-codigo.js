'use strict';

// Teste Python que lê o texto do código (`assertIn("…", fonte_da_funcao)`) passa
// com o comportamento quebrado e quebra com uma renomeação (CODING_STANDARDS.md
// regra 9). A revisão da D1 (#124) pediu duas vezes para trocá-los por testes
// da rota; os que sobraram estão na linha de base, e um novo é acusado.

const id = 'teste-le-codigo';

const conserto = 'Exercite a rota ou a função, não o texto dela: o cliente do Flask '
  + '(`bridge.app.test_client()`, como em bridge/test_envio_api.py) ou a função com fakes nas fronteiras '
  + '(bridge/test_envio.py é o modelo). Não leia um .py com read_text/open/inspect.getsource/ast.get_source_segment '
  + '(CODING_STANDARDS.md regra 9).';

const seAplica = arquivo => /(^|\/)test_[^/]*\.py$/.test(arquivo);

// O texto sem comentários de linha; strings ficam (os nomes de arquivo estão nelas).
function semComentarios(fonte) {
  return fonte.split('\n').map(linha => (/^\s*#/.test(linha) ? '' : linha)).join('\n');
}

// As funções de primeiro nível e de classe: nome, onde começa e onde termina o corpo.
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
  // As constantes que apontam para um .py (`SERVER_PATH = Path(__file__).with_name("server.py")`).
  const caminhosDeCodigo = new Set();
  for (const m of codigo.matchAll(/^(\w+)\s*=.*['"][\w./-]+\.py['"]/gm)) caminhosDeCodigo.add(m[1]);
  const leCodigo = linha => /\b(?:inspect\.)?getsource\s*\(|\bget_source_segment\s*\(/.test(linha)
    || (/\.read_text\s*\(|\bopen\s*\(|\.read_bytes\s*\(/.test(linha)
      && (/['"][\w./-]+\.py['"]/.test(linha) || [...caminhosDeCodigo].some(nome => new RegExp(`\\b${nome}\\b`).test(linha))));

  // Quem lê o código, direta ou indiretamente: os auxiliares como `_function_source`.
  // Um `test_…` nunca é auxiliar: é nele que a leitura conta.
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
