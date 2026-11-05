'use strict';

// O catálogo da Voz do passo do nível da Boas-vindas e da prévia do Cartão (#164): BRG-43 e ONB-20, a frente do cartão (#166): BRG-44, o tipo de nota que a pessoa já tem (#165): BRG-45, e o quiz de nível (#170): ONB-21 e ONB-22, no mesmo `CATALOGO_DA_VOZ` de `catalogo.js`, que tem de
// ser carregado antes. Está à parte só porque `catalogo.js` não pode crescer (o limite de tamanho dos arquivos); o texto aprovado está na spec da Voz,
// como o do resto, e `test_voz.js` confere os dois arquivos juntos.

(function (raiz) {
  Object.assign(raiz.CATALOGO_DA_VOZ, {
    'BRG-43': {
      titulo: 'Prévia do cartão', quadro: 'Cartão de exemplo', legenda: 'Exemplo do {nivel} em {idioma}, como o Anki mostra.', frente: 'Frente', verso: 'Verso',
      carregando: 'Montando a prévia…', semConexao: 'A prévia aparece com a Conexão com o Anki ligada.', antiga: 'Atualize a Conexão com o Anki para ver a prévia.',
      falhou: 'Não deu para montar a prévia. Tente de novo.', tentarDeNovo: 'Tentar de novo', maisEstilos: 'Mais estilos em Ajustes de envio',
    },

    'ONB-20': {
      corpo: 'Escolha o nível de cada idioma ligado. Ele decide o que o verso do cartão explica, e dá para mudar depois.',
      semIdioma: 'Nenhum idioma está ligado. Ligue a mineração automática em um idioma para escolher o nível dele aqui; o nível também fica em Ajustes de envio.',
      ligar: 'Ligar a mineração automática', falha: 'Não deu para salvar o nível. Tente de novo.',
    },

    'BRG-44': {
      titulo: 'Frente', fraseComAudio: 'Frase com áudio', ouvirPrimeiro: 'Ouvir primeiro', lacuna: 'Lacuna', producao: 'Produção', ditado: 'Ditado', textoFraseComAudio: 'A frase e o áudio na frente',
      textoOuvirPrimeiro: 'Só o botão de tocar na frente: ouça antes de ler', textoLacuna: 'A frase sem a palavra, com uma dica e sem áudio',
      textoProducao: 'A frase em português na frente: escreva no idioma e o Anki compara', textoDitado: 'Só o botão de tocar e um campo: escreva o que ouviu e o Anki mostra o que errou',
      nota: 'Todos os cartões em {idioma} mudam na hora, sem custo', naoMudou: 'Os outros ajustes foram salvos, mas a frente não mudou: {motivo}.',
      semConexao: 'a Conexão com o Anki está desligada', ankiOcupado: 'o Anki não está pronto (sem perfil aberto, em outro perfil ou sincronizando)',
      tipoMexido: 'o tipo de nota em {idioma} foi alterado no Anki e a Conexão não mexe nele', falhou: 'a Conexão não conseguiu trocá-la', tentarDeNovo: 'Tentar de novo',
    },

    'BRG-45': {
      titulo: 'Usar um tipo que já tenho',
      ajuda: 'Escolha o tipo de nota e diga em que campo vai cada parte do cartão. Várias partes podem ir no mesmo campo.',
      tipo: 'Tipo de nota',
      escolherTipo: 'Escolha um tipo de nota',
      frase: 'Frase',
      audioDaFrase: 'Áudio da frase',
      resposta: 'Resposta',
      palavra: 'Palavra',
      audioDaPalavra: 'Áudio da palavra',
      imagem: 'Imagem',
      escolherCampo: 'Escolha um campo',
      naoUsar: 'Não usar',
      continuar: 'Continuar',
      usarOPronto: 'Usar o estilo pronto',
      usando: 'Usando o tipo {tipo}. A frente que ele já tem fica como está.',
      faltaCampo: 'Este tipo de nota não tem um campo para a frase e outro para a resposta. Nada foi alterado no Anki. Escolha outro tipo ou use o estilo pronto.',
      escolhaOsCampos: 'Escolha um campo para a frase e outro, diferente, para a resposta.',
      semTipos: 'O Anki não tem outro tipo de nota. Use o estilo pronto.',
      carregando: 'Lendo os tipos de nota…',
      semConexao: 'Os tipos de nota aparecem com a Conexão com o Anki ligada.',
      antiga: 'Atualize a Conexão com o Anki para usar um tipo que você já tem.',
      falhou: 'Não deu para ler os tipos de nota. Tente de novo.',
      tentarDeNovo: 'Tentar de novo',
    },

    'ONB-21': {
      descobrir: 'Não sei meu nível, quero descobrir', rotulo: 'Quiz de nível em {idioma}', sair: 'Sair do quiz',
      alfabeto: 'Você já lê o alfabeto russo?', jaLeio: 'Já leio', aindaNao: 'Ainda não', series: 'Como você assiste séries em {idioma}?',
      seriesDublada: 'Só dubladas ou com legenda em português', seriesLegenda: 'Com legenda em {idioma}', seriesSemLegenda: 'Sem legenda',
      noticia: 'E uma notícia em {idioma}?', noticiaTraduzo: 'Preciso traduzir quase tudo',
      noticiaGeral: 'Entendo o geral e olho uma palavra ou outra', noticiaDireto: 'Leio direto, sem traduzir', progresso: 'Pergunta {n} de {total}',
      sequencia: 'Sequência: {n}', escuta: 'Ouça e escolha o que foi dito', legenda: 'Leia como numa legenda e escolha o sentido',
      verso: 'Este verso explica qual palavra?', ouvirDeNovo: 'Ouvir de novo', semAudio: 'Não deu para tocar o áudio. Tente de novo.',
      audioSemConexao: 'O áudio precisa da Conexão com o Anki ligada.', audioAntiga: 'Atualize a Conexão com o Anki para ouvir as perguntas.',
      naoSei: 'Não sei', acertou: 'Certo.', errou: 'Não foi essa. A certa está marcada.', naoSeiResposta: 'A certa está marcada.',
    },

    'ONB-22': {
      titulo: 'Nível sugerido em {idioma}',
      resumo: '{acertos} de {perguntas} certas · melhor sequência: {sequencia} · escuta: {escutaAcertos} de {escutaPerguntas}',
      escutaNota: 'A escuta aparece aqui, mas não muda o estilo.', semAlfabeto: 'Sem ler o alfabeto, o ponto de partida é o Iniciante.',
      trocar: 'Prefere outro nível? Troque aqui.', usar: 'Usar este estilo', depois: 'Dá para trocar depois em Ajustes de envio › Estilo do cartão.',
    },
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
