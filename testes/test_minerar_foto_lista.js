'use strict';

const assert = require('assert');

const { abrirPagina, adiado, esperar, foto, respostaDoGemini } = require('./pagina-da-foto');

const cenarios = [];
const cenario = (nome, rodar) => cenarios.push({ nome, rodar });

async function paginaComFrases(textos, opcoes = {}) {
  const respostas = textos.map(respostaDoGemini);
  const pagina = await abrirPagina({ gemini: async () => respostas.shift(), ...opcoes });
  await pagina.soltar(textos.map((texto, i) => foto(`f${i + 1}.jpg`)));
  if (textos.length === 1) await pagina.clicar(pagina.botoesDaColuna()[0]);
  return pagina;
}

const gravacoesEmEspera = () => {
  const pendentes = [];
  const gravar = () => {
    const gravacao = adiado();
    pendentes.push(gravacao);
    return gravacao.promessa;
  };
  return { gravar, pendentes };
};

const gravarSo = textosQueFalham => async ({ texto }) => ({ ok: !textosQueFalham.includes(texto) });

const linhaAberta = (texto, extra = {}) => ({
  texto, marcada: true, desligada: false, rotulo: texto, editavel: 'plaintext-only', soLeitura: 'false',
  classes: 'veio-frase foto-frase', minerada: false, ...extra,
});

const linhaMinerada = texto => linhaAberta(texto, {
  desligada: true, editavel: 'false', soLeitura: 'true', classes: 'veio-frase foto-frase foto-frase--minerada', minerada: true,
});

cenario('as frases aparecem por foto, todas marcadas, com a contagem e o botão de minerar', async () => {
  const pagina = await paginaComFrases(['uma\nduas', 'NENHUM_TRECHO', 'três']);
  assert.deepStrictEqual(pagina.retrato().lista, {
    grupos: [
      { titulo: 'FOT-25.grupo{"n":1}f1.jpg', frases: [linhaAberta('uma'), linhaAberta('duas')] },
      { titulo: 'FOT-25.grupo{"n":3}f3.jpg', frases: [linhaAberta('três')] },
    ],
    todas: '3/3',
    contagem: 'FOT-09{"n":3}',
    minerar: '«manual»FOT-12{"n":3}',
  });
});

cenario('desmarcar uma frase, e depois todas, muda o botão e a caixa de todas', async () => {
  const pagina = await paginaComFrases(['uma\nduas']);
  const [primeira] = pagina.linhas();
  const marcar = primeira.querySelector('.foto-frase__marcar');
  marcar.checked = false;
  marcar.disparar('change');
  let lista = pagina.retrato().lista;
  assert.deepStrictEqual(lista.grupos[0].frases[0], linhaAberta('uma', { marcada: false, classes: 'veio-frase foto-frase foto-frase--desmarcada' }));
  assert.strictEqual(lista.todas, '1/2');
  assert.strictEqual(lista.minerar, '«manual»FOT-12{"n":1}');

  pagina.no('foto-todas').disparar('change', { target: { checked: false } });
  lista = pagina.retrato().lista;
  assert.strictEqual(lista.todas, '0/2');
  assert.strictEqual(lista.minerar, '«manual»FOT-13|desligado');

  pagina.no('foto-todas').disparar('change', { target: { checked: true } });
  assert.strictEqual(pagina.retrato().lista.minerar, '«manual»FOT-12{"n":2}');
});

cenario('a frase editada vira só espaços e sai do botão; editada, muda o rótulo da caixa', async () => {
  const pagina = await paginaComFrases(['uma\nduas']);
  const [primeira, segunda] = pagina.linhas();
  const texto = primeira.querySelector('.foto-frase__texto');
  texto.textContent = '   ';
  texto.disparar('input');
  assert.strictEqual(pagina.retrato().lista.minerar, '«manual»FOT-12{"n":1}');

  const outro = segunda.querySelector('.foto-frase__texto');
  outro.textContent = '  duas editada ';
  outro.disparar('input');
  assert.strictEqual(pagina.retrato().lista.grupos[0].frases[1].rotulo, '  duas editada ');
});

cenario('minerar tudo que deu certo grava no Histórico com o título do Livro, avisa com o toast e trava as frases', async () => {
  const pagina = await paginaComFrases(['uma\nduas'], { livro: 'Dom Casmurro' });
  assert.strictEqual(pagina.no('foto-livro').value, 'Dom Casmurro');
  const segunda = pagina.linhas()[1].querySelector('.foto-frase__texto');
  segunda.textContent = '  duas  ';
  segunda.disparar('input');
  pagina.no('foto-livro').value = '  Dom Casmurro  ';
  await pagina.clicar('foto-minerar');
  assert.deepStrictEqual(pagina.registro.gravacoes, [
    { texto: 'uma', contexto: { fonte: 'livro', titulo: 'Dom Casmurro', detalhe: '' } },
    { texto: 'duas', contexto: { fonte: 'livro', titulo: 'Dom Casmurro', detalhe: '' } },
  ]);
  assert.deepStrictEqual(pagina.registro.toasts, ['FOT-14{"n":2}']);
  const lista = pagina.retrato().lista;
  assert.deepStrictEqual(lista.grupos[0].frases, [linhaMinerada('uma'), linhaMinerada('duas')]);
  assert.strictEqual(lista.todas, '0/0|desligada');
  assert.strictEqual(lista.minerar, '«manual»FOT-13|desligado');

  await pagina.clicar('foto-minerar');
  assert.strictEqual(pagina.registro.gravacoes.length, 2);
});

cenario('sem Livro, o título é Físico/Livro, e o campo do Livro é guardado a cada tecla', async () => {
  const pagina = await paginaComFrases(['uma']);
  pagina.no('foto-livro').value = '   ';
  pagina.no('foto-livro').disparar('input');
  assert.deepStrictEqual(pagina.registro.gravados, [{ bookTitleDefault: '   ' }]);
  await pagina.clicar('foto-minerar');
  assert.strictEqual(pagina.registro.gravacoes[0].contexto.titulo, 'Físico/Livro');
});

cenario('uma parte que falha recebe o FOT-15, e o Tentar de novo minera só as que falharam', async () => {
  let falham = ['duas', 'três'];
  const pagina = await paginaComFrases(['uma\nduas\ntrês'], { gravar: async ({ texto }) => ({ ok: !falham.includes(texto) }) });
  const desmarcada = pagina.linhas()[2].querySelector('.foto-frase__marcar');
  await pagina.clicar('foto-minerar');
  assert.deepStrictEqual(pagina.registro.toasts, []);
  const [aviso] = pagina.avisos();
  assert.deepStrictEqual(pagina.retrato().avisos, [{
    texto: 'FOT-15.resumo{"n":1,"total":3,"falhas":2}', acao: 'FOT-15.tentarDeNovo', rotuloDeFechar: 'PAI-34',
  }]);
  assert.deepStrictEqual(pagina.retrato().lista.grupos[0].frases.map(frase => frase.minerada), [true, false, false]);
  assert.strictEqual(pagina.retrato().lista.minerar, '«manual»FOT-12{"n":2}');

  desmarcada.checked = false;
  desmarcada.disparar('change');
  falham = ['três'];
  aviso.acao.aoUsar();
  await esperar();
  assert.deepStrictEqual(pagina.registro.gravacoes.slice(3).map(gravacao => gravacao.texto), ['duas', 'três']);
  assert.deepStrictEqual(pagina.retrato().avisos, [{
    texto: 'FOT-15.resumo{"n":1,"total":2,"falhas":1}', acao: 'FOT-15.tentarDeNovo', rotuloDeFechar: 'PAI-34',
  }]);

  falham = [];
  pagina.avisos()[0].acao.aoUsar();
  await esperar();
  assert.deepStrictEqual(pagina.registro.toasts, ['FOT-14{"n":1}']);
  assert.deepStrictEqual(pagina.retrato().avisos, []);
});

cenario('nada gravado diz FOT-16', async () => {
  const pagina = await paginaComFrases(['uma\nduas'], { gravar: gravarSo(['uma', 'duas']) });
  await pagina.clicar('foto-minerar');
  assert.deepStrictEqual(pagina.retrato().avisos, [{ texto: 'FOT-16', acao: 'FOT-15.tentarDeNovo', rotuloDeFechar: 'PAI-34' }]);
});

cenario('o clique durante uma gravação é ignorado, e o botão fica desligado até ela acabar', async () => {
  const { gravar, pendentes } = gravacoesEmEspera();
  const pagina = await paginaComFrases(['uma'], { gravar });
  await pagina.clicar('foto-minerar');
  assert.strictEqual(pagina.retrato().lista.minerar, '«manual»FOT-12{"n":1}|desligado');
  await pagina.clicar('foto-minerar');
  assert.strictEqual(pagina.registro.gravacoes.length, 1);
  pendentes[0].resolver({ ok: true });
  await esperar();
  assert.deepStrictEqual(pagina.registro.toasts, ['FOT-14{"n":1}']);
});

cenario('Recomeçar com frases pede confirmação, e uma gravação que termina depois só dá o toast se gravou', async () => {
  const { gravar, pendentes } = gravacoesEmEspera();
  const pagina = await paginaComFrases(['uma\nduas\n   '], { gravar, livro: 'Livro' });
  await pagina.clicar('foto-minerar');
  await pagina.clicar('foto-recomecar');
  const [confirmacao] = pagina.registro.confirmacoes;
  assert.deepStrictEqual({ ...confirmacao, aoConfirmar: typeof confirmacao.aoConfirmar }, {
    id: 'foto-recomecar', titulo: 'FOT-18.titulo{"n":2}', corpo: 'FOT-18.corpo', cancelar: 'FOT-18.cancelar',
    confirmar: 'FOT-18.confirmar{"n":2}', aoConfirmar: 'function', confirmarComContorno: true,
  });
  confirmacao.aoConfirmar();
  await esperar();
  assert.strictEqual(pagina.retrato().lista, null);
  assert.deepStrictEqual(pagina.retrato().cartoes, []);
  assert.strictEqual(pagina.retrato().coluna, '«livro»FOT-01.tituloFOT-01.subtitulo FOT-25.comoAparecem');
  assert.strictEqual(pagina.retrato().foco, 'foto-escolher');
  assert.strictEqual(pagina.no('foto-livro').value, 'Livro');
  assert.deepStrictEqual(pagina.registro.revogadas, ['blob:f1.jpg']);
  pendentes[0].resolver({ ok: false });
  pendentes[1].resolver({ ok: true });
  await esperar();
  assert.deepStrictEqual(pagina.registro.toasts, ['FOT-14{"n":1}']);
  assert.deepStrictEqual(pagina.retrato().avisos, []);

  const nenhuma = gravacoesEmEspera();
  const outra = await paginaComFrases(['uma'], { gravar: nenhuma.gravar });
  await outra.clicar('foto-minerar');
  await outra.clicar('foto-recomecar');
  outra.registro.confirmacoes[0].aoConfirmar();
  nenhuma.pendentes[0].resolver({ ok: false });
  await esperar();
  assert.deepStrictEqual(outra.registro.toasts, []);
  assert.deepStrictEqual(outra.retrato().avisos, []);
});

cenario('Recomeçar sem frase a perder não pergunta', async () => {
  const pagina = await paginaComFrases(['uma']);
  await pagina.clicar('foto-minerar');
  await pagina.clicar('foto-recomecar');
  assert.deepStrictEqual(pagina.registro.confirmacoes, []);
  assert.strictEqual(pagina.retrato().lista, null);
});

(async () => {
  for (const { nome, rodar } of cenarios) {
    await rodar();
    console.log(`ok: ${nome}`);
  }
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
