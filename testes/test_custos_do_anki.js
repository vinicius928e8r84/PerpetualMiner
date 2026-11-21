'use strict';

const {
  AGORA, comEnvios, corpoDe, depoisDe, ENVIO_INGLES, ENVIO_QUE_FALHOU, LEITURA_GUARDADA, lendo, pedidos, periodo, rodarOsCasos, textoEm, textosEm, vista,
} = require('./painel_dos_custos_de_mentira.js');

const CASOS_DAS_VISTAS = [
  {
    nome: 'antes da primeira resposta: a faixa Conectando e o esqueleto',
    abrir: { situacao: 'conectando', respondeu: false },
    agir: async () => {},
    ver: vista,
    esperado: { conectando: false, nota: true, azulejos: true, avancado: true, antigo: true, corpo: ['anki-esqueleto'] },
  },
  {
    nome: 'lendo: BRG-25 e o esqueleto',
    abrir: { respostas: [lendo] },
    ver: painel => [vista(painel).corpo, textoEm(painel, '.anki-espera')],
    esperado: [['anki-espera', 'anki-esqueleto'], 'BRG-25'],
  },
  {
    nome: 'ligada e nada lido ainda: carregando',
    agir: async () => {},
    ver: painel => vista(painel).corpo,
    esperado: ['anki-espera', 'anki-esqueleto'],
  },
  {
    nome: 'a leitura deu HTTP: o total indisponível e o aviso com o pedido e o status',
    abrir: { respostas: [{ ok: false, status: 500, detalhes: 'não usado' }] },
    ver: painel => [vista(painel).corpo, textoEm(painel, '.aviso-de-mentira')],
    esperado: [['anki-numero anki-numero--indisponivel', 'aviso-de-mentira'],
      'BRG-04.avisoBRG-04.tentarDeNovodetalhes:POST /analytics/jobs {"lang":"all","from":"2026-11-01","to":"2026-11-21"} · HTTP 500fechavel:false'],
  },
  {
    nome: 'a leitura falhou sem HTTP: o aviso traz os detalhes do desfecho',
    abrir: { respostas: [{ ok: false, status: 0, detalhes: 'sem rede' }] },
    ver: painel => textoEm(painel, '.aviso-de-mentira'),
    esperado: 'BRG-04.avisoBRG-04.tentarDeNovodetalhes:POST /analytics/jobs {"lang":"all","from":"2026-11-01","to":"2026-11-21"} · sem redefechavel:false',
  },
  {
    nome: 'Tentar de novo confere a Conexão e lê de novo',
    abrir: { respostas: [{ ok: false, status: 503 }, comEnvios([])] },
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => corpoDe(painel).querySelector('.aviso-de-mentira button').click());
    },
    ver: painel => [painel.conexao.conferencias, pedidos(painel).length, vista(painel).corpo],
    esperado: [1, 2, ['veio-vazio']],
  },
  {
    nome: 'desligada e sem leitura guardada: só o total indisponível, e a nota dos Ajustes',
    abrir: { situacao: 'desligada' },
    agir: async () => {},
    ver: vista,
    esperado: { conectando: true, nota: false, azulejos: true, avancado: true, antigo: true, corpo: ['anki-numero anki-numero--indisponivel'] },
  },
  {
    nome: 'desligada com a leitura guardada: a leitura antiga, com o selo e o período travado',
    abrir: { situacao: 'desligada', guardado: { pm_anki_custos: LEITURA_GUARDADA } },
    agir: async () => {},
    ver: painel => [vista(painel), periodo(painel), painel.porId('anki-custos-antigo').textContent, textosEm(painel, '.anki-detalhe button'),
      corpoDe(painel).querySelector('.anki-detalhe button').atributos],
    esperado: [
      { conectando: true, nota: false, azulejos: false, avancado: false, antigo: false, corpo: ['anki-faixa-resumo', 'anki-cartao', 'anki-lista-e-detalhe'] },
      { radios: ['hoje:false:true', 'mes:false:true', 'tudo:true:true'], campos: [':true', ':true'] },
      'BRG-12.anki{"quando":"há:1000"}DetalhesGET http://127.0.0.1:8766/health · sem resposta',
      ['continuar:ru1'],
      { 'aria-disabled': 'true', 'aria-describedby': 'anki-continuar-indisponivel' },
    ],
  },
  {
    nome: 'nenhum Envio no período: BRG-22 e Ver tudo, que lê tudo',
    abrir: { respostas: [comEnvios([]), comEnvios([ENVIO_INGLES])] },
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => corpoDe(painel).querySelector('.veio-vazio button').click());
    },
    ver: painel => [pedidos(painel), periodo(painel).radios, vista(painel).corpo],
    esperado: [
      ['/analytics/jobs {"lang":"all","from":"2026-11-01","to":"2026-11-21"}', '/analytics/jobs {"lang":"all"}'],
      ['hoje:false:false', 'mes:false:false', 'tudo:true:false'],
      ['anki-faixa-resumo', 'anki-cartao', 'anki-lista-e-detalhe'],
    ],
  },
  {
    nome: 'nenhum Envio em Tudo: sem Ver tudo',
    abrir: { guardado: { pm_anki_custos: { ...LEITURA_GUARDADA, envios: [] } } },
    agir: async () => {},
    ver: painel => [textoEm(painel, '.veio-vazio'), textosEm(painel, '.veio-vazio button')],
    esperado: ['BRG-22BRG-33.vazioTexto', []],
  },
  {
    nome: 'a resposta sem lista de Envios é um período vazio, e a leitura fica guardada',
    abrir: { respostas: [{ ok: true, dados: { jobs: 'nada' } }] },
    ver: painel => [vista(painel).corpo, painel.armazenamento.gravacoes],
    esperado: [['veio-vazio'], [{ pm_anki_custos: { quando: AGORA, periodo: 'mes', de: '2026-11-01', ate: '2026-11-21', envios: [] } }]],
  },
];

const CASOS_DA_LEITURA = [
  {
    nome: 'a Conexão que liga na aba lê; ligada de novo, ou fora da aba, não',
    abrir: { situacao: 'desligada' },
    agir: async painel => {
      painel.lidas = [];
      const mudarEContar = async situacao => {
        await painel.mudarAConexao(situacao);
        painel.lidas.push(`${situacao}:${pedidos(painel).length}`);
      };
      await mudarEContar('ligada');
      await mudarEContar('ligada');
      painel.shell.area = 'frases';
      await mudarEContar('desligada');
      await mudarEContar('ligada');
    },
    ver: painel => painel.lidas,
    esperado: ['ligada:1', 'ligada:1', 'desligada:1', 'ligada:1'],
  },
  {
    nome: 'entrar na aba desligada não lê',
    abrir: { situacao: 'desligada' },
    ver: painel => pedidos(painel).length,
    esperado: 0,
  },
  {
    nome: 'Atualizar confere a Conexão, lê e chama quem pediu para saber',
    agir: async painel => {
      painel.avisados = 0;
      painel.Anki.aoAtualizar(() => { painel.avisados++; });
      await depoisDe(() => painel.porId('btn-anki-atualizar').click());
    },
    ver: painel => [painel.conexao.conferencias, pedidos(painel).length, painel.avisados],
    esperado: [1, 1, 1],
  },
  {
    nome: 'Atualizar desligada não lê nem avisa',
    abrir: { situacao: 'desligada' },
    agir: async painel => {
      painel.avisados = 0;
      painel.Anki.aoAtualizar(() => { painel.avisados++; });
      await depoisDe(() => painel.Anki.atualizar());
    },
    ver: painel => [painel.conexao.conferencias, pedidos(painel).length, painel.avisados],
    esperado: [1, 0, 0],
  },
  {
    nome: 'a leitura calada não começa enquanto outra lê',
    abrir: { respostas: [lendo] },
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => painel.continuados.deps.ler({ calado: true }));
    },
    ver: painel => pedidos(painel).length,
    esperado: 1,
  },
  {
    nome: 'a leitura calada que falha deixa a tela e a leitura de antes',
    abrir: { respostas: [comEnvios([ENVIO_INGLES]), { ok: false, status: 500 }] },
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => painel.continuados.deps.ler({ calado: true }));
    },
    ver: painel => [pedidos(painel).length, vista(painel).corpo, painel.armazenamento.gravacoes.length],
    esperado: [2, ['anki-faixa-resumo', 'anki-cartao', 'anki-lista-e-detalhe'], 1],
  },
  {
    nome: 'a leitura calada que dá certo troca a leitura sem mostrar carregando',
    abrir: { respostas: [comEnvios([ENVIO_INGLES]), comEnvios([ENVIO_INGLES, ENVIO_QUE_FALHOU])] },
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => painel.continuados.deps.ler({ calado: true }));
    },
    ver: painel => [textosEm(painel, '[role="option"]').length, painel.armazenamento.gravacoes.length],
    esperado: [2, 2],
  },
  {
    nome: 'a resposta de uma leitura vencida não troca a tela',
    agir: async painel => {
      const respostas = [];
      painel.conversa.respostas = [() => new Promise(resolver => respostas.push(resolver))];
      await painel.entrar();
      await painel.entrar();
      respostas[1](comEnvios([ENVIO_INGLES]));
      await depoisDe(() => respostas[0](comEnvios([])));
    },
    ver: painel => [vista(painel).corpo, painel.armazenamento.gravacoes.length],
    esperado: [['anki-faixa-resumo', 'anki-cartao', 'anki-lista-e-detalhe'], 1],
  },
  {
    nome: 'a leitura guardada sem lista de Envios é ignorada, e o período começa em Este mês',
    abrir: { situacao: 'desligada', guardado: { pm_anki_custos: { periodo: 'tudo' } } },
    agir: async () => {},
    ver: painel => [periodo(painel), vista(painel).corpo],
    esperado: [{ radios: ['hoje:false:false', 'mes:true:false', 'tudo:false:false'], campos: ['2026-11-01:false', '2026-11-21:false'] },
      ['anki-numero anki-numero--indisponivel']],
  },
];

rodarOsCasos([...CASOS_DAS_VISTAS, ...CASOS_DA_LEITURA], 'custos do anki').catch(erro => { console.error(erro); process.exit(1); });
