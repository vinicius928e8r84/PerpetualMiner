'use strict';

const {
  comEnvios, corpoDe, depoisDe, escolher, opcao, pedidos, periodo, rodarOsCasos, textoEm, textosEm, TODOS,
} = require('./painel_dos_custos_de_mentira.js');

const detalhe = painel => ({
  meta: textoEm(painel, '.anki-detalhe .anki-apoio'),
  selo: textoEm(painel, '.anki-detalhe .veio-selo'),
  seloDaClasse: corpoDe(painel).querySelector('.anki-detalhe .veio-selo').className,
  motivos: textosEm(painel, '.anki-detalhe .anki-motivo'),
  detalhes: textosEm(painel, '.anki-detalhe pre'),
  partes: textosEm(painel, '.anki-detalhe .anki-partes dt'),
  continuar: textosEm(painel, '.anki-detalhe button'),
});
const CASOS_DO_DETALHE = [
  {
    nome: 'concluído: o selo, as partes e sem Continuar',
    escolhido: 'en1',
    esperado: {
      meta: 'há:2026-11-20T10:00:00Z · Inglês', selo: 'ENV-07.concluido', seloDaClasse: 'veio-selo veio-selo--ok', motivos: [], detalhes: [],
      partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.total'], continuar: [],
    },
  },
  {
    nome: 'em parte: o que não entrou, a causa, os outros custos, a correção e Continuar',
    escolhido: 'ru1',
    esperado: {
      meta: 'há:2026-11-21T09:00:00Z · Russo', selo: 'BRG-31.emParte{"n":1,"total":4}', seloDaClasse: 'veio-selo veio-selo--parte',
      motivos: ['ENV-10.naoEntraram{"n":3}'], detalhes: ['timeout'],
      partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.outros', 'BRG-51', 'BRG-29.total'],
      continuar: ['continuar:ru1'],
    },
  },
  {
    nome: 'não concluído: os que falharam e Continuar',
    escolhido: 'en2',
    esperado: {
      meta: 'há:2026-11-19T08:00:00Z · Inglês', selo: 'ENV-07.falhou', seloDaClasse: 'veio-selo veio-selo--erro',
      motivos: ['ENV-10.naoEntraram{"n":2}'], detalhes: ['boom'],
      partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.total'], continuar: ['continuar:en2'],
    },
  },
  {
    nome: 'em parte, com as frases apagadas ao retomar: o motivo, sem Continuar',
    escolhido: 'ru1',
    marcar: estado => estado.apagados.add('ru1'),
    esperado: {
      meta: 'há:2026-11-21T09:00:00Z · Russo', selo: 'BRG-31.emParte{"n":1,"total":4}', seloDaClasse: 'veio-selo veio-selo--parte',
      motivos: ['ENV-24.apagado'], detalhes: ['timeout'],
      partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.outros', 'BRG-51', 'BRG-29.total'], continuar: [],
    },
  },
  {
    nome: 'em parte, com a falha ao retomar: ENV-14 e as duas causas',
    escolhido: 'ru1',
    marcar: estado => estado.falhasAoRetomar.set('ru1', 'caiu'),
    esperado: {
      meta: 'há:2026-11-21T09:00:00Z · Russo', selo: 'BRG-31.emParte{"n":1,"total":4}', seloDaClasse: 'veio-selo veio-selo--parte',
      motivos: ['ENV-14.falha'], detalhes: ['caiu\ntimeout'],
      partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.outros', 'BRG-51', 'BRG-29.total'],
      continuar: ['continuar:ru1'],
    },
  },
  {
    nome: 'as frases foram apagadas: o motivo e a causa, sem Continuar',
    escolhido: 'en3',
    esperado: {
      meta: 'há:2026-11-18T08:00:00Z · Inglês', selo: 'ENV-07.falhou', seloDaClasse: 'veio-selo veio-selo--erro',
      motivos: ['ENV-24.apagado'], detalhes: ['frases_apagadas'],
      partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.total'], continuar: [],
    },
  },
  {
    nome: 'andando: a etapa do Envio',
    escolhido: 'ru2',
    esperado: {
      meta: 'há:2026-11-17T08:00:00Z · Russo', selo: 'BRG-31.enviando{"etapa":"ENV-07.criandoCartoes"}', seloDaClasse: 'veio-selo veio-selo--info',
      motivos: [], detalhes: [], partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.total'], continuar: [],
    },
  },
  {
    nome: 'na fila, de um idioma sem nome: na fila, e o código cru',
    escolhido: 'xx1',
    esperado: {
      meta: 'há:2026-11-16T08:00:00Z · xx', selo: 'BRG-31.enviando{"etapa":"ENV-07.naFila"}', seloDaClasse: 'veio-selo veio-selo--info',
      motivos: [], detalhes: [], partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.total'], continuar: [],
    },
  },
  {
    nome: 'concluído com erro guardado: a causa em Detalhes',
    escolhido: 'en4',
    esperado: {
      meta: 'há:2026-11-15T08:00:00Z · Inglês', selo: 'ENV-07.concluido', seloDaClasse: 'veio-selo veio-selo--ok', motivos: [], detalhes: ['aviso do motor'],
      partes: ['BRG-08.criacaoDeCartoes', 'BRG-08.imagensGeradas', 'BRG-29.escolhaETriagem', 'BRG-29.total'], continuar: [],
    },
  },
];

const CASOS_DOS_GESTOS = [
  {
    nome: 'o primeiro Envio, o mais novo, vem escolhido',
    ver: painel => [textosEm(painel, '[role="option"]').length, corpoDe(painel).querySelector('[aria-selected="true"]')?.dataset.foco],
    esperado: [7, 'envio:ru1'],
  },
  {
    nome: 'as setas, Home e End andam na lista e levam o foco; outra tecla não faz nada',
    agir: async painel => {
      await painel.entrar();
      const passos = [];
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'ArrowDown', 'Home', 'ArrowUp', 'a']) {
        const evento = { key };
        await depoisDe(() => corpoDe(painel).querySelector('.anki-lista').disparar('keydown', evento));
        passos.push(`${key}:${painel.documento.activeElement?.dataset.foco}:${Boolean(evento.evitado)}`);
      }
      painel.passos = passos;
    },
    ver: painel => painel.passos,
    esperado: ['ArrowDown:envio:en1:true', 'ArrowDown:envio:en2:true', 'ArrowUp:envio:en1:true', 'End:envio:en4:true',
      'ArrowDown:envio:en4:true', 'Home:envio:ru1:true', 'ArrowUp:envio:ru1:true', 'a:envio:ru1:false'],
  },
  {
    nome: 'o foco que estava no corpo volta ao mesmo item depois de desenhar de novo',
    agir: async painel => {
      await painel.entrar();
      opcao(painel, 'en2').focus();
      await painel.mudarAConexao('ligada');
    },
    ver: painel => [painel.documento.activeElement === opcao(painel, 'en2'), opcao(painel, 'en2').tabIndex, opcao(painel, 'ru1').tabIndex],
    esperado: [true, -1, 0],
  },
  {
    nome: 'o azulejo do idioma filtra a lista e marca o escolhido',
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => painel.porId('anki-custos-azulejos').children[2].click());
    },
    ver: painel => [
      painel.porId('anki-custos-azulejos').children.map(azulejo => `${azulejo.dataset.idioma}:${azulejo.getAttribute('aria-pressed')}:${azulejo.className}`),
      textosEm(painel, '[role="option"]').length,
    ],
    esperado: [
      ['all:false:veio-azulejo anki-azulejo', 'en:false:veio-azulejo anki-azulejo', 'ru:true:veio-azulejo anki-azulejo veio-azulejo--escolhido'],
      2,
    ],
  },
  {
    nome: 'os azulejos somam cada idioma',
    ver: painel => painel.porId('anki-custos-azulejos').children.map(azulejo => azulejo.textContent),
    esperado: [
      'BRG-28.codigoTodosBRG-28.todosBRG-03.valor{"valor":"2,06"}BRG-28.envios{"n":7}',
      'BRG-28.codigoEnInglêsBRG-03.valor{"valor":"1,56"}BRG-28.envios{"n":4}',
      'BRG-28.codigoRuRussoBRG-03.valor{"valor":"0,50"}BRG-28.envios{"n":2}',
    ],
  },
  {
    nome: 'quatro casas: grava a escolha e mostra quatro casas, e o valor abaixo da menor casa é “menos de”',
    agir: async painel => {
      await painel.entrar();
      await escolher(painel, 'ru1');
      await depoisDe(() => painel.porId('anki-quatro-casas').disparar('change', { target: { checked: true } }));
    },
    ver: painel => [painel.armazenamento.guardado.pm_anki_quatro_casas, textosEm(painel, '.anki-detalhe .anki-partes dd')],
    esperado: [true, ['BRG-03.valor{"valor":"0,0040"}', 'BRG-03.valor{"valor":"0,0000"}', 'BRG-03.valor{"valor":"0,0000"}',
      'BRG-03.valor{"valor":"0,3000"}', 'BRG-03.valor{"valor":"0,2000"}', 'BRG-03.valor{"valor":"0,5040"}']],
  },
  {
    nome: 'duas casas: o valor abaixo de um centavo é “menos de”',
    agir: async painel => {
      await painel.entrar();
      await escolher(painel, 'ru1');
    },
    ver: painel => textosEm(painel, '.anki-detalhe .anki-partes dd')[0],
    esperado: 'BRG-26{"valor":"0,01"}',
  },
  {
    nome: 'Mostrar IDs grava a escolha e põe o jobId na lista, no detalhe e no diagnóstico',
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => painel.porId('anki-ids-dos-envios').disparar('change', { target: { checked: true } }));
    },
    ver: painel => [painel.armazenamento.guardado.pm_anki_ids_dos_envios, opcao(painel, 'ru1').querySelector('small').textContent,
      textoEm(painel, '.anki-detalhe .anki-apoio'), painel.porId('anki-custos-diagnostico').children[0].children[1].textContent],
    esperado: [true, 'há:2026-11-21T09:00:00Z · ru1', 'há:2026-11-21T09:00:00Z · Russo · ru1', 'há:2026-11-21T09:00:00Z · BRG-28.codigoRu · ru1'],
  },
  {
    nome: 'Hoje lê só o dia de hoje',
    agir: async painel => {
      await painel.entrar();
      painel.documento.radios[0].checked = true;
      await depoisDe(() => painel.documento.radios[0].disparar('change'));
    },
    ver: pedidos,
    esperado: ['/analytics/jobs {"lang":"all","from":"2026-11-01","to":"2026-11-21"}', '/analytics/jobs {"lang":"all","from":"2026-11-21","to":"2026-11-21"}'],
  },
  {
    nome: 'De e Até viram um período de datas',
    agir: async painel => {
      await painel.entrar();
      painel.porId('anki-custos-de').value = '2026-10-01';
      painel.porId('anki-custos-ate').value = '2026-10-31';
      await depoisDe(() => painel.porId('anki-custos-ate').disparar('change'));
    },
    ver: painel => [pedidos(painel)[1], periodo(painel)],
    esperado: ['/analytics/jobs {"lang":"all","from":"2026-10-01","to":"2026-10-31"}',
      { radios: ['hoje:false:false', 'mes:false:false', 'tudo:false:false'], campos: ['2026-10-01:false', '2026-10-31:false'] }],
  },
  {
    nome: 'Baixar diagnóstico pede o pacote e o baixa como arquivo',
    respostas: [comEnvios(TODOS), { ok: true, dados: { pacote: 1 } }],
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => painel.porId('anki-custos-diagnostico').children[0].querySelector('button').click());
    },
    ver: painel => [pedidos(painel)[1], painel.documento.cliques.at(-1).download, painel.baixados.urls[0].partes, painel.baixados.revogadas,
      painel.porId('anki-diagnostico-falha').hidden, painel.documento.body.children.length],
    esperado: ['/jobs/debug-bundle {"jobId":"ru1"}', 'diagnostico-ru1.json', ['{\n  "pacote": 1\n}'], ['blob:1'], true, 0],
  },
  {
    nome: 'Baixar diagnóstico que falha mostra BRG-23',
    respostas: [comEnvios(TODOS), { ok: false, status: 500 }],
    agir: async painel => {
      await painel.entrar();
      await depoisDe(() => painel.porId('anki-custos-diagnostico').children[0].querySelector('button').click());
    },
    ver: painel => [painel.porId('anki-diagnostico-falha').hidden, painel.porId('anki-diagnostico-falha').textContent, painel.baixados.urls.length],
    esperado: [false, 'BRG-23.falha', 0],
  },
];

const casoDoDetalhe = ({ nome, escolhido, marcar = () => {}, esperado }) => ({
  nome, esperado, ver: detalhe,
  agir: async painel => {
    await painel.entrar();
    marcar(painel.continuados.deps.estado);
    await escolher(painel, escolhido);
  },
});

rodarOsCasos([...CASOS_DO_DETALHE.map(casoDoDetalhe), ...CASOS_DOS_GESTOS], 'envios nos custos do anki').catch(erro => { console.error(erro); process.exit(1); });
