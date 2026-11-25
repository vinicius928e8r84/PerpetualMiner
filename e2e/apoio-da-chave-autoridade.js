'use strict';

const chaveNaNuvem = (fakes, conta) => fakes.google.chaveDaOpenAIDe(conta)?.chave;

const VARIANTES_DO_O1 = [
  { nome: 'Apagar chave', botao: 'Apagar chave', secao: '#cfg-ia', foto: 'chave', frasesAoFim: 1, abrirPerigo: false },
  { nome: 'Apagar tudo', botao: 'Apagar 1 frase', secao: '#cfg-perigo', foto: 'tudo', frasesAoFim: 0, abrirPerigo: true },
];

const DA_CONTA_B = { versao: 42, conta: 'B', em: 101, naoEnviada: false };

module.exports = { chaveNaNuvem, VARIANTES_DO_O1, DA_CONTA_B };
