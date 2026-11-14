'use strict';

// Os dados de exemplo do protótipo: os mesmos que as referências visuais do painel de verdade usam
// (e2e/tests/painel-frases-visual.spec.js, painel-anki-visual.spec.js, painel-anki-baralhos-visual.spec.js e
// apoio-das-configuracoes.js), para o lado a lado com o painel atual comparar a mesma coisa. Nada aqui é gravado:
// recarregar a página volta tudo ao começo.

(function (PS) {
  const IDIOMAS = { en: 'Inglês', ru: 'Russo' };

  // As Fontes de PAI-29 e o ícone de cada uma.
  const FONTES = {
    netflix: { nome: 'Netflix', icone: 'tv' },
    youtube: { nome: 'YouTube', icone: 'video' },
    primevideo: { nome: 'Prime Video', icone: 'tv' },
    max: { nome: 'Max', icone: 'tv' },
    web: { nome: 'Web', icone: 'globo' },
    selecao: { nome: 'Seleção', icone: 'globo' },
    pdf: { nome: 'PDF', icone: 'pagina' },
    livro: { nome: 'Livro', icone: 'livro' },
    manual: { nome: 'Manual', icone: 'mais' },
    importado: { nome: 'Importado', icone: 'arquivo' },
  };

  // `dias` é há quantos dias a frase foi minerada; `palavras` são os grupos da Palavra (cada grupo, uma lista de palavras
  // da frase); `auto` diz que a Palavra foi escolhida pela mineração automática.
  const FRASES = [
    { id: 12, texto: 'I never take it for granted.', dias: 0, fonte: 'netflix', idioma: 'en', titulo: 'Dark', detalhe: 'T1E3', palavras: [['granted']], estado: 'enviada' },
    { id: 11, texto: 'She was reluctant to say anything.', dias: 0, fonte: 'youtube', idioma: 'en', titulo: 'Vsauce', detalhe: '', palavras: [['reluctant']], auto: true },
    { id: 10, texto: 'Он так и не сказал спасибо.', dias: 0, fonte: 'livro', idioma: 'ru', titulo: 'Мастер и Маргарита', detalhe: 'cap. 3', palavras: [['спасибо']] },
    { id: 9, texto: 'The meeting was put off until next week.', dias: 1, fonte: 'web', idioma: 'en', titulo: 'The Guardian', detalhe: '', palavras: [['put', 'off']] },
    { id: 8, texto: 'Don’t beat around the bush.', dias: 1, fonte: 'pdf', idioma: 'en', titulo: 'Atomic Habits', detalhe: 'cap. 2', palavras: [] },
    { id: 7, texto: 'You cannot have your cake and eat it.', dias: 3, fonte: 'manual', idioma: 'en', titulo: '', detalhe: '', palavras: [['cake'], ['eat']] },
    { id: 6, texto: 'Let us call it a day.', dias: 3, fonte: 'youtube', idioma: 'en', titulo: 'Veritasium', detalhe: '', palavras: [], estado: 'enviada' },
    { id: 5, texto: 'He has been under the weather lately.', dias: 3, fonte: 'netflix', idioma: 'en', titulo: 'The Bear', detalhe: 'T2E3', palavras: [] },
    { id: 4, texto: 'Мне всё равно.', dias: 3, fonte: 'youtube', idioma: 'ru', titulo: 'Russian with Max', detalhe: '', palavras: [] },
    { id: 3, texto: 'The plan backfired spectacularly.', dias: 3, fonte: 'web', idioma: 'en', titulo: 'Wikipedia', detalhe: '', palavras: [] },
    { id: 2, texto: 'Keep me posted.', dias: 5, fonte: 'netflix', idioma: 'en', titulo: 'Succession', detalhe: 'T2E4', palavras: [] },
    { id: 1, texto: 'That ship has sailed.', dias: 5, fonte: 'netflix', idioma: 'en', titulo: 'Succession', detalhe: 'T2E1', palavras: [] },
  ];

  // Os Envios de Custos. `horas` é há quantas horas foi; os custos são em dólar, por parte.
  const ENVIOS = [
    { id: 'job_8f2c1a', idioma: 'en', horas: 1, estado: 'concluido', pedidas: 12, enviadas: 12, custos: { cartoes: 0.081, geradas: 0, escolha: 0.0021, triagem: 0.0011 }, imagens: { real: 11, geradas: 0, sem: 1, falhas: 0 }, economia: 0.15 },
    { id: 'job_7d19e0', idioma: 'ru', horas: 3, estado: 'em-parte', pedidas: 4, enviadas: 3, custos: { cartoes: 0.027, geradas: 0.012, escolha: 0.0008, triagem: 0.0004 }, imagens: { real: 1, geradas: 2, sem: 0, falhas: 1 }, economia: 0, erro: 'HTTP 502 · AnkiConnect: collection is not available' },
    { id: 'job_77b3c9', idioma: 'en', horas: 21, estado: 'concluido', pedidas: 8, enviadas: 8, custos: { cartoes: 0.054, geradas: 0.024, escolha: 0.0013, triagem: 0.0007 }, imagens: { real: 5, geradas: 2, sem: 1, falhas: 0 }, economia: 0.07 },
    { id: 'job_6a02ff', idioma: 'en', horas: 14, estado: 'falhou', pedidas: 3, enviadas: 0, custos: { cartoes: 0.011, geradas: 0, escolha: 0, triagem: 0 }, imagens: { real: 0, geradas: 0, sem: 0, falhas: 0 }, economia: 0, erro: 'HTTP 500 · Falha ao criar job EN' },
    { id: 'job_5c4410', idioma: 'en', horas: 74, estado: 'concluido', pedidas: 30, enviadas: 30, custos: { cartoes: 0.172, geradas: 0.048, escolha: 0.0031, triagem: 0.0015 }, imagens: { real: 24, geradas: 4, sem: 2, falhas: 0 }, economia: 0.33 },
  ];

  const BARALHOS = {
    en: { baralho: 'English Mining', palavras: 3412, cartoes: 2140, termos: 1870, porCartao: 1.6, maduros: 1410, recentes: 420, novos: 310 },
    ru: { baralho: 'RUSSIAN', palavras: 612, cartoes: 480, termos: 455, porCartao: 1.3, maduros: 216, recentes: 144, novos: 120 },
  };

  const VOCABULARIO = {
    en: [
      { item: 'take for granted', tipo: 'termo', maduros: 3, recentes: 1, novos: 0 },
      { item: 'reluctant', tipo: 'palavra', maduros: 0, recentes: 2, novos: 1 },
      { item: 'close call', tipo: 'termo', maduros: 1, recentes: 0, novos: 1 },
      { item: 'cut corners', tipo: 'termo', maduros: 0, recentes: 0, novos: 1 },
      { item: 'barely', tipo: 'palavra', maduros: 6, recentes: 0, novos: 0 },
      { item: 'overwhelming', tipo: 'palavra', maduros: 0, recentes: 2, novos: 0 },
      { item: 'get away with', tipo: 'termo', maduros: 1, recentes: 1, novos: 1 },
      { item: 'stubborn', tipo: 'palavra', maduros: 4, recentes: 0, novos: 0 },
    ],
    ru: [
      { item: 'спасибо', tipo: 'palavra', maduros: 5, recentes: 0, novos: 0 },
      { item: 'наверное', tipo: 'palavra', maduros: 0, recentes: 3, novos: 0 },
      { item: 'как будто', tipo: 'termo', maduros: 1, recentes: 0, novos: 1 },
    ],
  };

  // Ajustes de envio, um por idioma (BRG-07, BRG-42, BRG-44).
  const AJUSTES = {
    en: { baralho: 'English Mining', imagens: 'real', estilo: 'iniciante', frente: 'frase', sotaquePalavra: 'Estados Unidos', sotaqueFrase: 'Estados Unidos', reserva: 'openai' },
    ru: { baralho: 'RUSSIAN', imagens: 'real', estilo: 'iniciante', frente: 'frase', sotaquePalavra: 'Rússia', sotaqueFrase: 'Rússia', reserva: 'nenhuma' },
  };
  const BARALHOS_DO_ANKI = ['CIMV', 'English Mining', 'English Mining::Séries', 'RUSSIAN', 'Padrão'];
  const SOTAQUES = { en: ['Estados Unidos', 'Reino Unido', 'Austrália', 'Índia', 'Canadá', 'Irlanda', 'África do Sul'], ru: ['Rússia'] };

  // A prévia do cartão de cada estilo (o exemplo que o painel mostra em Ajustes de envio).
  const PREVIA = {
    en: {
      frase: [['She', 'c1'], ['gave up', 'c2'], ['smoking', 'c3'], ['last year.', '']],
      verso: { iniciante: 'shi GUÊIV âp SMÔU-kin lést iâr', intermediario: 'gave up = parou de (fazer algo)', avancado: 'to give up: to stop doing something you did regularly' },
    },
    ru: {
      frase: [['Он', 'c1'], ['бросил', 'c2'], ['курить', 'c3'], ['в прошлом году.', '']],
      verso: { iniciante: 'on BRÔ-sil ku-RÍT f PRÔSH-lam ga-DÚ', intermediario: 'бросил = parou de, largou', avancado: 'бросить: перестать делать что-либо' },
    },
  };

  const CONTA = { nome: 'Ana Souza', email: 'ana.souza@example.com' };

  PS.dados = {
    IDIOMAS, FONTES, BARALHOS_DO_ANKI, SOTAQUES, PREVIA, CONTA,
    frases: FRASES.map(frase => ({ ...frase })),
    envios: ENVIOS.map(envio => ({ ...envio })),
    baralhos: BARALHOS,
    vocabulario: VOCABULARIO,
    ajustes: JSON.parse(JSON.stringify(AJUSTES)),
    ajustesSalvos: JSON.parse(JSON.stringify(AJUSTES)),
    // O que as Configurações guardam.
    conta: { entrou: false, sincronizado: true },
    atalhos: { legenda: 'Alt+S', selecao: '' },
    openai: '',
    chatgpt: false,
    gemini: 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9',
    abrirComOComputador: false,
    perfil: 'Usuário 1',
    teto: 10,
    automatica: { en: { ligada: false, limite: 20 }, ru: { ligada: false, limite: 20 } },
    proximoId: 13,
  };
})(window.PS = window.PS || {});
