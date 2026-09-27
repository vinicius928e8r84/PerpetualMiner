'use strict';

// O catálogo da Voz como dado: os 198 estados-chave de `docs/design/voz/README.md`.
//
// Cada entrada é o texto aprovado, ou um objeto com as partes daquele estado
// (título, corpo, botões, rótulos). A busca por ID e a interpolação ficam em
// `lib/voz/texto.js`; aqui só mora a cópia.
//
// Modelos:
//   {nome}                  troca pelo valor. Número vira PT-BR ("1.284").
//   {n|singular|plural}     escolhe pelo valor de `n` (|n| === 1 → singular).
//
// Onde a cópia mostra um atalho ("Alt+S"), o valor entra por `{atalho}`: a tela
// mostra o atalho que estiver gravado, e sem nenhum usa GLB-02.
// Onde ela mostra um idioma, o valor entra por `{idioma}` — maiúscula nos selos
// ("Inglês") e minúscula no meio da frase ("em inglês"), como a cópia pede.

(function (raiz) {
  const CATALOGO_DA_VOZ = {
    // ─── Popup ───────────────────────────────────────────────────────────────
    'POP-01': '',
    'POP-02': {
      titulo: 'Nenhuma frase ainda',
      atalho: 'Aperte {atalho} num vídeo com legenda para minerar a primeira.',
      semAtalho: 'Defina um atalho para minerar legendas de vídeo.',
    },
    'POP-03': 'Cole ou escreva uma frase',
    'POP-04': 'Minerar',
    'POP-05': '',
    'POP-06': 'Não deu para minerar a frase. Tente de novo.',
    'POP-07': {
      limite: '/{limite}',
      leitor: '{n} de {limite} hoje',
    },
    'POP-08': 'Limite de hoje atingido',
    'POP-09': 'Abrir painel',
    'POP-10': 'Mineração automática',
    'POP-11': {
      atalho: '{atalho} minera a legenda do vídeo',
      mudar: 'Mudar atalho',
    },
    'POP-12': '',
    'POP-13': {
      titulo: 'Últimas mineradas',
      verTodas: 'Ver todas',
    },
    'POP-14': {
      porDia: 'por dia',
      limite: 'limite',
      dia: '/dia',
      ligar: 'Mineração automática em {idioma}',
      limiteDoIdioma: 'Limite por dia em {idioma}',
    },
    'POP-15': {
      en: 'EN',
      ru: 'RU',
    },
    'POP-16': {
      leitura: 'Não deu para carregar a mineração automática. Feche e abra o popup de novo.',
      gravacao: 'Não deu para salvar a mudança. Tente de novo.',
    },

    // ─── Minerar na página (componente de feedback) ───────────────────────────
    'MIN-01': 'Frase minerada e copiada',
    'MIN-02': 'Frase minerada',
    'MIN-03': {
      titulo: 'Não deu para minerar',
      dica: 'Tente de novo.',
    },
    'MIN-04': {
      titulo: 'Nenhuma legenda na tela',
      dica: 'Ligue as legendas do player e tente de novo.',
    },
    'MIN-05': 'Frase minerada',
    'MIN-06': 'Mineração automática',
    'MIN-07': {
      comAtalho: 'Minerar legenda ({atalho})',
      semAtalho: 'Minerar legenda',
    },
    'MIN-08': 'Minerar com PerpetualMiner',
    'MIN-09': {
      contador: 'Mineração automática: {n} hoje',
      noLimite: 'Mineração automática: limite de hoje atingido',
    },
    'MIN-10': {
      titulo: 'Nenhuma legenda na tela',
      dica: 'Esta página não tem vídeo com legenda.',
    },
    'MIN-11': {
      contador: 'Mineração automática · {idioma}: {n} de {limite} hoje',
      noLimite: 'Mineração automática · {idioma}: limite de hoje atingido',
    },

    // ─── Minerar de uma foto ─────────────────────────────────────────────────
    'FOT-01': {
      titulo: 'Minerar de uma foto',
      subtitulo: 'Tire uma foto da página com os trechos marcados e escolha quais frases minerar.',
    },
    'FOT-02': {
      titulo: 'Arraste fotos de páginas marcadas',
      acao: 'ou clique para escolher',
      formatos: 'JPG, PNG, HEIC ou WEBP',
    },
    'FOT-03': 'Confira se as marcações aparecem na foto',
    'FOT-04': 'Esse arquivo não é uma foto. Use JPG, PNG, HEIC ou WEBP.',
    'FOT-05': {
      titulo: 'Falta a chave do Gemini',
      aviso: 'Para ler fotos, adicione sua chave do Gemini em Configurações.',
      acao: 'Abrir Configurações',
    },
    'FOT-06': {
      titulo: 'Lendo a foto…',
      detalhe: 'Procurando os trechos marcados',
      cancelar: 'Cancelar',
    },
    'FOT-07': 'Lendo a foto {n} de {total}…',
    'FOT-08': '{n} {n|foto|fotos} na fila · arraste mais para ler em seguida',
    'FOT-09': '{n} {n|frase encontrada|frases encontradas}',
    'FOT-10': {
      titulo: 'Nenhuma marcação encontrada {n|nesta foto|nestas fotos}',
      texto: 'Marque as frases com /barras/, _sublinhado_ ou caneta e confira se aparecem na foto.',
    },
    'FOT-11': {
      aviso: 'Não deu para ler a foto {n}.',
      avisoVarias: 'Não deu para ler {n} fotos.',
      titulo: 'Não deu para ler {n|a foto|as fotos}',
      causaLimite: 'O Gemini está recebendo pedidos demais; espere um minuto e tente de novo.',
      causaChave: 'A chave do Gemini não funciona. Confira em Configurações.',
      causaRede: 'Sem conexão com a internet. Confira a rede e tente de novo.',
    },
    'FOT-12': 'Minerar {n} {n|frase|frases}',
    'FOT-13': 'Selecione pelo menos uma frase',
    'FOT-14': '{n} {n|frase minerada|frases mineradas}',
    'FOT-15': {
      resumo: '{n} de {total} frases mineradas · {falhas} {falhas|falhou|falharam}',
      tentarDeNovo: 'Tentar de novo',
    },
    'FOT-16': 'Não deu para minerar as frases. Tente de novo.',
    'FOT-17': 'Recomeçar',
    'FOT-18': {
      titulo: 'Descartar {n} {n|frase não minerada|frases não mineradas}?',
      corpo: 'Elas ainda não foram mineradas e vão se perder.',
      cancelar: 'Cancelar',
      confirmar: 'Descartar {n} {n|frase|frases}',
    },
    'FOT-19': {
      pronta: 'Pronta',
      naFila: 'Na fila',
      lendo: 'Lendo…',
      frases: '{n} {n|frase|frases}',
      semMarcacoes: 'Sem marcações',
      falhou: 'Falhou',
      cancelada: 'Cancelada',
      tentarDeNovo: 'Tentar de novo',
    },
    'FOT-20': '{n} de {total} lidas',
    'FOT-21': 'Leitura cancelada. {n} {n|foto ficou|fotos ficaram} sem ler; as frases das fotos já lidas continuam aqui.',
    'FOT-22': {
      livro: 'Livro',
      exemplo: 'Ex.: Atomic Habits',
      voltar: 'Voltar ao painel',
    },
    'FOT-23': {
      fotos: 'Fotos',
      maisFotos: 'Arraste mais páginas',
      escolher: 'Escolher',
      semChave: 'Adicione a chave do Gemini para começar',
    },
    'FOT-24': {
      titulo: 'Marcações que o Gemini lê',
      exemploBarras: '/texto/',
      barras: 'entre barras',
      exemploUnderscores: '_texto_',
      underscores: 'entre underscores',
      exemploSublinhado: 'texto',
      sublinhado: 'sublinhado à mão',
      exemploColchetes: '[texto]',
      colchetes: 'colchetes, círculo ou traço na margem',
    },
    'FOT-25': {
      selecionarTodas: 'Selecionar todas',
      grupo: 'Foto {n}',
      minerada: 'Minerada',
      lerMarcacoes: 'Ler marcações',
      comoAparecem: 'As frases aparecem aqui, agrupadas por foto.',
    },

    // ─── Painel · Shell ──────────────────────────────────────────────────────
    'SHL-01': {
      rotulo: 'Navegação do painel',
      frases: 'Frases',
      anki: 'Conexão com o Anki',
      configuracoes: 'Configurações',
    },
    'SHL-02': {
      frases: 'Frases mineradas',
      anki: 'Conexão com o Anki',
      configuracoes: 'Configurações',
    },
    'SHL-03': {
      rotulo: 'Seções da Conexão com o Anki',
      custos: 'Custos',
      baralhos: 'Baralhos e termos',
      vocabulario: 'Vocabulário',
      ajustes: 'Ajustes de envio',
    },
    'SHL-04': {
      conta: 'Conta & sync',
      atalhos: 'Atalhos',
      aparencia: 'Aparência',
      perigo: 'Zona de perigo',
    },
    'SHL-05': {
      semConta: 'Sem conta · só neste computador',
      semContaNome: 'Sem conta',
      semContaEstado: 'Só neste computador',
      semSincronizar: 'Sem sincronizar',
      parcial: '{n} de {total} sincronizadas',
      sessaoExpirou: 'Sessão expirou',
    },
    'SHL-06': 'Atualizar',

    // ─── Painel · Frases ─────────────────────────────────────────────────────
    'PAI-01': '',
    'PAI-02': {
      titulo: 'Nenhuma frase ainda.',
      texto: 'Minere de um vídeo com {atalho} ou use Minerar frases para colar, importar ou ler uma foto.',
      acao: 'Minerar frases',
    },
    'PAI-03': {
      texto: 'Nenhuma frase com estes filtros.',
      acao: 'Limpar filtros',
    },
    'PAI-04': {
      texto: 'Nenhuma frase com “{termo}”.',
      acao: 'Limpar busca',
    },
    'PAI-05': '{n} {n|frase|frases}',
    'PAI-06': '{n} {n|selecionada|selecionadas}',
    'PAI-07': '{inicio}–{fim} de {total}',
    'PAI-08': {
      enviada: 'Enviada ao Anki',
      exportada: 'Exportada',
    },
    'PAI-09': 'Ocultar enviadas e exportadas',
    'PAI-10': {
      todasAsFontes: 'Todas as fontes',
      todosOsIdiomas: 'Todos os idiomas',
      idioma: '{idioma}',
    },
    'PAI-11': {
      hoje: 'hoje',
      ontem: 'ontem',
      diasAtras: 'há {n} {n|dia|dias}',
    },
    'PAI-12': {
      titulo: 'Apagar esta frase?',
      corpo: 'Ela some também dos outros computadores conectados à sua conta. Não dá para desfazer.',
      corpoSemConta: 'Não dá para desfazer.',
      cancelar: 'Cancelar',
      confirmar: 'Apagar frase',
    },
    'PAI-13': {
      titulo: 'Apagar {n} {n|frase|frases}?',
      corpo: 'Elas somem também dos outros computadores conectados à sua conta. Não dá para desfazer.',
      corpoSemConta: 'Não dá para desfazer.',
      cancelar: 'Cancelar',
      confirmar: 'Apagar {n} {n|frase|frases}',
    },
    'PAI-14': '{n} {n|frase apagada|frases apagadas}',
    'PAI-15': {
      aviso: 'As frases foram apagadas deste computador, mas não da nuvem. Elas podem voltar na próxima sincronização.',
      tentarDeNovo: 'Tentar de novo',
    },
    'PAI-16': '',
    'PAI-17': {
      sucesso: 'Frase copiada',
      falha: 'Não deu para copiar',
    },
    'PAI-18': '',
    'PAI-19': '{n} {n|frase exportada|frases exportadas} para .txt',
    'PAI-20': {
      umaFrase: 'Editar contexto',
      variasFrases: 'Editar contexto de {n} frases',
      ajuda: 'Campos em branco ficam como estão',
      cancelar: 'Cancelar',
      salvar: 'Salvar contexto',
    },
    'PAI-21': {
      fonte: 'Fonte',
      fonteAjuda: 'de onde a frase veio (netflix, youtube, livro…)',
      titulo: 'Título',
      detalhe: 'Detalhe',
      detalheAjuda: 'episódio, capítulo ou canal',
    },
    'PAI-22': 'Contexto de {n} {n|frase|frases} atualizado',
    'PAI-23': 'Buscar nas frases',
    'PAI-24': {
      novas: 'Mais novas primeiro',
      antigas: 'Mais antigas primeiro',
    },
    'PAI-25': {
      fonte: 'Fonte',
      idioma: 'Idioma',
      ordem: 'Ordem',
    },
    'PAI-26': {
      rotulo: 'Páginas',
      pagina: '{atual} de {total}',
      primeira: 'Primeira página',
      anterior: 'Página anterior',
      proxima: 'Próxima página',
      ultima: 'Última página',
    },
    'PAI-27': {
      remover: 'Remover a palavra',
      outroGrupo: 'Adicionar outro grupo',
    },
    'PAI-28': 'Selecionar frase',
    'PAI-30': {
      editarTexto: 'Editar texto',
      editarContexto: 'Editar contexto',
      copiar: 'Copiar frase',
      apagar: 'Apagar frase',
    },
    'PAI-29': {
      netflix: 'Netflix',
      youtube: 'YouTube',
      primevideo: 'Prime Video',
      max: 'Max',
      disneyplus: 'Disney+',
      starplus: 'Star+',
      kinopoisk: 'Kinopoisk',
      web: 'Web',
      selecao: 'Seleção',
      pdf: 'PDF',
      livro: 'Livro',
      manual: 'Manual',
      importado: 'Importado',
    },
    'PAI-31': 'Selecionar página',
    'PAI-32': {
      desmarcar: 'Desmarcar todas',
      selecionarTodas: 'Selecionar todas as {n} {n|frase|frases}',
      editarContexto: 'Editar contexto',
      exportar: 'Exportar .txt',
      apagar: 'Apagar',
      enviar: 'Enviar ao Anki',
      enviarIndisponivel: 'Indisponível: a conexão com o Anki está desligada. Ligue-a neste computador para enviar.',
    },
    'PAI-33': {
      campo: 'Texto da frase',
      dica: 'Enter salva · Esc cancela',
      cancelar: 'Cancelar',
      salvar: 'Salvar texto',
    },
    'PAI-34': 'Fechar',

    // ─── Painel · Minerar frases (Colar · Arquivo .txt · Foto) ───────────────
    'ADD-01': {
      botao: 'Minerar frases',
      colar: 'Colar',
      arquivo: 'Arquivo .txt',
      foto: 'Foto',
    },
    'ADD-02': 'Cole as frases, uma por linha',
    'ADD-03': 'Cole pelo menos uma frase.',
    'ADD-04': 'Minerando {n} de {total}…',
    'ADD-05': '{n} {n|frase minerada|frases mineradas}',
    'ADD-06': {
      aviso: '{n} {n|frase minerada|frases mineradas} neste computador, mas não {n|foi|foram} para a nuvem.',
      tentarDeNovo: 'Tentar de novo',
    },
    'ADD-07': 'Não deu para ler este arquivo. Use um .txt com uma frase por linha.',
    'ADD-08': 'O arquivo está vazio.',
    'ADD-09': {
      ambas: 'Nenhuma frase nova: {duplicadas} já {duplicadas|estava|estavam} no histórico e {invalidas} {invalidas|linha não pôde ser lida|linhas não puderam ser lidas}.',
      soRepetidas: 'Nenhuma frase nova: {duplicadas} já {duplicadas|estava|estavam} no histórico.',
      soIlegiveis: 'Nenhuma frase nova: {invalidas} {invalidas|linha não pôde ser lida|linhas não puderam ser lidas}.',
    },
    'ADD-10': '{n} {n|frase minerada|frases mineradas} · {duplicadas} já {duplicadas|existia|existiam}',
    'ADD-11': {
      colar: 'Colar',
      colarAjuda: 'Uma frase por linha',
      arquivo: 'Arquivo .txt',
      arquivoAjuda: 'Importar um .txt com uma frase por linha',
      foto: 'Foto',
      fotoAjuda: 'Abre Minerar de uma foto numa aba nova',
    },
    'ADD-12': {
      campo: 'Frases',
      exemploFonte: 'livro, web, podcast',
      exemploTitulo: 'Atomic Habits',
      minerar: 'Minerar {n} {n|frase|frases}',
      arquivo: 'Escolha um arquivo .txt',
      arquivoNota: 'Uma frase por linha. O .txt exportado daqui volta com o contexto. Frases que já estão no histórico ficam de fora.',
      escolher: 'Escolher arquivo',
      escolherOutro: 'Escolher outro arquivo',
      progressoNota: 'As frases entram no topo da lista.',
      cancelar: 'Cancelar',
      fechar: 'Fechar',
    },

    // ─── Envio ao Anki ───────────────────────────────────────────────────────
    'ENV-01': {
      aviso: 'A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.',
      tentarDeNovo: 'Tentar de novo',
    },
    'ENV-02': 'A conexão com o Anki não respondeu. Confira se ela está ligada e tente de novo.',
    'ENV-03': {
      motivo: 'A conexão com o Anki respondeu com erro.',
      motivoSemResposta: 'A conexão com o Anki não respondeu. Confira se ela está ligada.',
      tentarDeNovo: 'Tentar de novo',
    },
    'ENV-04': 'A conexão com o Anki não respondeu. Confira se ela está ligada.',
    'ENV-05': '',
    'ENV-06': {
      titulo: 'Enviando ao Anki…',
      detalhe: '{n} {n|envio|envios} · {idiomas}',
    },
    'ENV-07': {
      naFila: 'Na fila',
      criandoCartoes: 'Criando cartões',
      preparandoImagens: 'Preparando imagens',
      gerandoAudio: 'Gerando áudio',
      escolhendoImagens: 'Escolhendo imagens',
      esperandoOAnki: 'Esperando o Anki',
      enviandoAoAnki: 'Enviando ao Anki',
      concluido: 'Concluído',
      concluidoEmParte: 'Concluído em parte',
      falhou: 'Não concluído',
      naoComecou: 'Não começou',
    },
    'ENV-08': {
      titulo: 'Envio em {idioma} · {n} {n|frase|frases}',
      atualizado: 'atualizado {quando}',
      agora: 'agora',
      minutos: 'há {n} min',
      horas: 'há {n} h',
      etapa: 'etapa {n} de {total}',
    },
    'ENV-09': 'Sem resposta da conexão com o Anki. Tentando de novo…',
    'ENV-10': {
      titulo: 'Envio concluído',
      tituloEmParte: 'Envio concluído em parte',
      detalhe: '{n} {n|frase|frases} · {baralhos} {baralhos|baralho|baralhos}',
      cartoes: '+{n} {n|cartão|cartões}',
      noBaralho: 'no baralho {baralho}',
      jaEstavam: '{n} já {n|estava|estavam} lá',
      naoEntraram: '{n} não {n|entrou|entraram}',
      tentarDeNovo: 'Tentar de novo',
      pergunta: 'Tirar as {n} enviadas do histórico?',
      perguntaUma: 'Tirar a enviada do histórico?',
      ajuda: 'Elas já estão no Anki. Manter deixa no histórico, marcadas como enviadas.',
      ajudaUma: 'Ela já está no Anki. Manter deixa no histórico, marcada como enviada.',
      jaApagadas: '{n} {n|enviada|enviadas} você já tinha apagado.',
      nadaParaTirar: 'Nada para tirar do histórico.',
      manter: 'Manter',
      tirar: 'Tirar do histórico',
      pronto: 'Pronto',
    },
    'ENV-11': '{n} {n|frase apagada|frases apagadas}',
    'ENV-12': '',
    'ENV-13': {
      continuar: 'Continuar envio',
    },
    'ENV-14': {
      sucesso: 'Envio retomado',
      falha: 'Não deu para retomar o envio. Confira se a conexão com o Anki está ligada.',
    },
    'ENV-15': 'Pode fechar: o resumo abre quando o envio terminar.',

    // ─── Painel · Conexão com o Anki ─────────────────────────────────────────
    'BRG-01': {
      ligada: 'Conexão com o Anki: ligada',
      desligada: 'Conexão com o Anki: desligada',
      semEnvio: 'Enviar ao Anki fica indisponível',
    },
    'BRG-02': 'Conectando ao Anki…',
    'BRG-03': {
      valor: 'US$ {valor}',
      indisponivel: 'Custo indisponível',
    },
    'BRG-04': {
      aviso: 'Não deu para carregar os custos. Confira se a conexão com o Anki está ligada.',
      tentarDeNovo: 'Tentar de novo',
    },
    'BRG-05': '{n} {n|envio|envios} neste período',
    'BRG-06': {
      baralhos: 'Baralho, imagens e termos usados em cada envio.',
      custos: 'Quanto cada envio custou e de onde vieram as imagens.',
      vocabulario: 'Progresso de cada idioma no Anki.',
    },
    'BRG-07': {
      titulo: 'Ajustes de envio',
      salvar: 'Salvar ajustes',
      salvo: 'Ajustes de envio salvos',
    },
    'BRG-08': {
      criacaoDeCartoes: 'Criação de cartões',
      imagensGeradas: 'Imagens geradas',
      escolhaDeImagem: 'Escolha de imagem',
      triagemDeImagem: 'Triagem de imagem',
      economia: 'Economia com fotos reais',
    },
    'BRG-09': {
      fotoReal: 'Foto real',
      geradaPorIa: 'Gerada por IA',
      semImagem: 'Sem imagem',
      falhou: 'Falhou',
      fotos: '{n} {n|foto|fotos}',
      geradas: '{n} {n|gerada|geradas}',
    },
    'BRG-10': 'Lendo os baralhos do Anki…',
    'BRG-11': {
      aviso: 'Não deu para ler os baralhos do Anki. Use Reparar Anki e tente de novo.',
      repararAnki: 'Reparar Anki',
    },
    'BRG-12': 'Mostrando dados de {quando}. Não deu para atualizar agora.',
    'BRG-13': 'Números lidos direto do arquivo do Anki. Para enviar, o Anki precisa abrir normalmente.',
    'BRG-14': 'O baralho “{baralho}” não existe no Anki. Confira o nome em Ajustes de envio.',
    'BRG-15': {
      titulo: 'Reparando…',
      detalhe: 'Fechando o Anki travado e abrindo de novo…',
    },
    'BRG-16': 'Anki reparado',
    'BRG-17': {
      aviso: 'O reparo demorou demais e foi interrompido. O Anki pode ter reaberto mesmo assim: atualize para conferir.',
      atualizar: 'Atualizar',
    },
    'BRG-18': 'O Windows não deixou fechar o Anki. Feche o Anki pelo Gerenciador de Tarefas (como administrador) ou reinicie o computador, e tente de novo.',
    'BRG-19': 'Lendo o vocabulário…',
    'BRG-20': {
      aviso: 'Não deu para carregar o vocabulário.',
      tentarDeNovo: 'Tentar de novo',
    },
    'BRG-21': {
      resumo: '{n} {n|item|itens} em {idioma}',
      mostrando: 'mostrando {n}',
      vazio: 'Nenhum item com esta busca.',
      soPalavras: 'Só palavras',
      soTermos: 'Só termos',
    },
    'BRG-22': 'Nenhum envio neste período.',
    'BRG-23': {
      baixar: 'Baixar diagnóstico',
      falha: 'Não deu para baixar o diagnóstico.',
    },
    'BRG-24': 'Atualizar (abre o Anki se precisar)',
    'BRG-25': 'Somando os custos…',
    'BRG-26': '< US$ 0,01',
    'BRG-27': {
      legenda: 'baralho não encontrado',
      valor: '—',
    },

    // ─── Configurações · Conta & sync · Atalhos · Chave · Zona de perigo ─────
    'CFG-01': 'Sincronizando…',
    'CFG-02': 'Sincronizado {quando}',
    'CFG-03': {
      aviso: 'Sem sincronizar · as frases estão só neste computador',
      pendente: 'As mudanças deste computador ainda não subiram para a nuvem.',
      tentarDeNovo: 'Tentar de novo',
    },
    'CFG-04': 'A nuvem recusou o acesso. Saia da conta e entre de novo.',
    'CFG-05': {
      aviso: '{n} de {total} frases sincronizadas · {faltando} {faltando|ficou|ficaram} só neste computador',
      pendente: 'As mudanças deste computador ainda não subiram para a nuvem.',
      tentarDeNovo: 'Tentar de novo',
    },
    'CFG-06': {
      botao: 'Entrar com Google',
      ajuda: 'Suas frases em qualquer computador',
      semConta: 'Sem conta, elas ficam só neste computador.',
    },
    'CFG-07': {
      aviso: 'Não deu para entrar com o Google. Tente de novo.',
      tentarDeNovo: 'Tentar de novo',
    },
    'CFG-08': {
      aviso: 'Sua sessão expirou. Entre de novo para sincronizar.',
      entrar: 'Entrar',
    },
    'CFG-09': {
      andamento: 'Sincronizando {n} {n|frase|frases}…',
      sucesso: '{n} {n|frase sincronizada|frases sincronizadas}',
      falha: 'Não deu para sincronizar suas frases. Elas continuam neste computador.',
    },
    'CFG-10': 'Conta Google',
    'CFG-11': {
      minerarLegenda: 'Minerar legenda',
      minerarSelecao: 'Minerar seleção',
    },
    'CFG-12': {
      semAtalho: 'Sem atalho',
      gravar: 'Gravar atalho',
      cancelar: 'Cancelar',
    },
    'CFG-13': 'Pressione as teclas ou um botão extra do mouse…',
    'CFG-14': {
      botaoDoMeio: 'Botão do meio',
      botaoVoltar: 'Botão voltar',
      botaoAvancar: 'Botão avançar',
      outro: 'Botão {n} do mouse',
    },
    'CFG-15': {
      titulo: 'Chave do Gemini',
      ajuda: 'usada para ler fotos',
      campo: 'Cole a chave (começa com AIza)',
      salvar: 'Salvar chave',
      descricao: 'Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador.',
      salva: 'Chave salva',
      trocar: 'Trocar chave',
      cancelar: 'Cancelar',
      semChave: 'Sem a chave, Minerar de uma foto não consegue ler as fotos.',
    },
    'CFG-16': {
      vazia: 'Cole a chave antes de salvar',
      salva: 'Chave do Gemini salva',
    },
    'CFG-17': {
      titulo: 'Apagar todas as {n} frases?',
      tituloUma: 'Apagar 1 frase?',
      corpo: 'Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer.',
      corpoSemConta: 'Elas somem deste computador.',
      cancelar: 'Cancelar',
      confirmar: 'Apagar {n} {n|frase|frases}',
    },
    'CFG-18': 'Todas as frases foram apagadas',
    'CFG-19': 'Esse atalho já é do {acao}. Grave outro.',
    'CFG-20': 'Nenhuma frase para apagar',
    'CFG-21': 'Restaurar atalhos padrão',
    'CFG-22': 'Padrão: Minerar legenda em Alt+S, Minerar seleção sem atalho.',
    'CFG-23': 'Sair da conta',
    'CFG-24': {
      todas: 'Apagar todas as {n} frases',
      uma: 'Apagar 1 frase',
      rotulo: 'Apagar todas as frases',
      alcance: '{n} {n|frase|frases} em todos os computadores da sua conta',
      alcanceSemConta: '{n} {n|frase|frases} neste computador',
      nenhuma: 'Nenhuma frase no histórico',
    },
    'CFG-25': 'Com a conta, suas frases ficam iguais em qualquer computador em que você entrar.',
    'CFG-26': 'Ao sair, as frases continuam neste computador.',
    'CFG-27': '{nome} · {estado}',
    'CFG-28': {
      legenda: 'Legenda',
      selecao: 'Seleção',
      semChave: 'Sem chave',
      nenhumaFrase: 'Nenhuma frase',
    },
    'CFG-29': {
      titulo: 'Aparência',
      descricao: 'Só neste computador.',
    },
    'CFG-30': {
      rotulo: 'Tema',
      escuro: 'Escuro',
      claro: 'Claro',
    },
    'CFG-31': {
      escuro: 'Escuro',
      claro: 'Claro',
    },
    'CFG-32': {
      descricao: 'Apagar tudo aqui não dá para desfazer, e vale para todos os computadores da sua conta.',
      descricaoSemConta: 'Apagar tudo aqui não dá para desfazer.',
    },
    'CFG-33': 'Vale para qualquer página aberta no Chrome. Grave uma combinação de teclas ou um botão extra do mouse.',
    'CFG-34': {
      minerarLegenda: 'Minera a legenda que está na tela do vídeo.',
      minerarSelecao: 'Minera o texto que você selecionou na página.',
    },

    // ─── Boas-vindas (primeira execução) ─────────────────────────────────────
    'ONB-01': {
      titulo: 'Boas-vindas ao PerpetualMiner',
      corpo: 'Minere frases de vídeos, páginas e fotos de livros, e envie ao Anki como cartões. Seis passos rápidos deixam tudo pronto; os opcionais dá para pular.',
    },
    'ONB-02': {
      pular: 'Pular a configuração',
      comecar: 'Começar',
    },
    'ONB-03': {
      passo: 'Passo {n} de {total}',
      opcional: 'opcional',
    },
    'ONB-04': {
      voltar: 'Voltar',
      agoraNao: 'Agora não',
      continuar: 'Continuar',
    },
    'ONB-05': {
      video: 'Num vídeo com legenda, aperte {atalho}. A frase vai para o histórico e já fica copiada.',
      selecao: 'Numa página ou PDF, selecione o texto e use o botão direito › Minerar com PerpetualMiner.',
      colar: 'Ou cole uma frase aqui, como no popup:',
    },
    'ONB-06': 'Escolha uma tecla ou um botão extra do mouse para minerar o texto selecionado, sem abrir o menu.',
    'ONB-07': 'Entre com Google para ter suas frases em qualquer computador. Sem conta, elas ficam só neste.',
    'ONB-08': {
      corpo: 'A Conexão com o Anki é um programa que roda neste computador, ao lado do Anki. É ela que cria os cartões e diz quais palavras você já conhece. Ela liga sozinha com o Windows depois de instalada uma vez.',
      passo1: 'Abra o Anki neste computador, com o complemento AnkiConnect.',
      passo2: 'Instale a Conexão com o Anki uma vez (veja Detalhes). Depois ela liga sozinha com o Windows.',
      passo3: 'Volte aqui e use Tentar de novo.',
      tentarDeNovo: 'Tentar de novo',
    },
    'ONB-09': {
      corpo: 'Com ela ligada, as legendas com uma palavra que você ainda não conhece são mineradas sozinhas, até um limite por dia. Liga por idioma.',
      popup: 'Os mesmos botões ficam no popup, pelo ícone da extensão.',
    },
    'ONB-10': 'Nada é minerado com a Conexão com o Anki desligada: é ela que diz quais palavras você já conhece.',
    'ONB-11': {
      corpo: 'Só é usada em Minerar de uma foto, para ler os trechos marcados numa página de livro. Dá para adicionar depois: a página pede quando precisar.',
      detalhes: 'No Google AI Studio, em “Get API key”. A chave fica só neste computador.',
    },
    'ONB-12': {
      titulo: 'Tudo pronto',
      corpo: 'Dá para mudar qualquer coisa depois, em Configurações. A mineração automática fica no popup.',
      abrirPainel: 'Abrir painel',
    },
    'ONB-13': {
      feito: 'feito',
      agoraNao: 'agora não',
      falta: 'falta',
    },
    'ONB-14': {
      titulo: 'Configuração pela metade · {n} de {total}',
      corpo: 'Volte de onde parou',
      continuar: 'Continuar configuração',
    },
    'ONB-15': {
      texto: 'A configuração ficou pela metade: {n} de {total} passos.',
      ocultar: 'Ocultar',
      continuar: 'Continuar configuração',
    },
    'ONB-16': {
      titulo: 'Ainda não houve conexão neste computador',
      corpo: 'A Conexão com o Anki é um programa que roda neste computador, ao lado do Anki. É ela que cria os cartões e diz quais palavras você já conhece. Ela liga sozinha com o Windows depois de instalada uma vez. Sem ela, dá para minerar à vontade; o que fica indisponível é Enviar ao Anki e a mineração automática.',
    },

    // ─── Global ──────────────────────────────────────────────────────────────
    'GLB-01': 'Algo deu errado. Tente de novo.',
    'GLB-02': {
      semAtalho: 'Sem atalho',
      definir: 'Definir atalho',
    },
  };

  raiz.CATALOGO_DA_VOZ = CATALOGO_DA_VOZ;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
