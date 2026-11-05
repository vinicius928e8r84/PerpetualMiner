'use strict';

// O catálogo da Voz do passo do nível da Boas-vindas e da prévia do Cartão (#164): BRG-43, ONB-20 e ONB-21 (o primeiro Envio, #173), e a frente do cartão (#166): BRG-44, no mesmo `CATALOGO_DA_VOZ` de `catalogo.js`, que tem de
// ser carregado antes. Está à parte só porque `catalogo.js` não pode crescer (o limite de tamanho dos arquivos); o texto aprovado está na spec da Voz,
// como o do resto, e `test_voz.js` confere os dois arquivos juntos.

(function (raiz) {
  Object.assign(raiz.CATALOGO_DA_VOZ, {
    'BRG-43': {
      titulo: 'Prévia do cartão', quadro: 'Cartão de exemplo', legenda: 'Exemplo do {nivel} em {idioma}, como o Anki mostra.', legendaDaNota: 'O seu cartão, como o Anki mostra.', frente: 'Frente', verso: 'Verso',
      carregando: 'Montando a prévia…', semConexao: 'A prévia aparece com a Conexão com o Anki ligada.', antiga: 'Atualize a Conexão com o Anki para ver a prévia.',
      falhou: 'Não deu para montar a prévia. Tente de novo.', tentarDeNovo: 'Tentar de novo', maisEstilos: 'Mais estilos em Ajustes de envio',
    },

    'ONB-20': {
      corpo: 'Escolha o nível de cada idioma ligado. Ele decide o que o verso do cartão explica, e dá para mudar depois.',
      semIdioma: 'Nenhum idioma está ligado. Ligue a mineração automática em um idioma para escolher o nível dele aqui; o nível também fica em Ajustes de envio.',
      ligar: 'Ligar a mineração automática', falha: 'Não deu para salvar o nível. Tente de novo.',
    },

    'ONB-03': Object.assign(raiz.CATALOGO_DA_VOZ['ONB-03'], { envio: 'Enviar o primeiro cartão' }),   // o título do passo 9 (a lista de títulos é de `catalogo.js`)
    'ONB-13': Object.assign(raiz.CATALOGO_DA_VOZ['ONB-13'], { enviado: 'enviado' }),   // o valor do passo 9 em Tudo pronto

    // O primeiro Envio (#173): o último passo da Boas-vindas manda um Cartão de verdade, sem etapas, custo nem estimativa.
    'ONB-21': {
      corpo: 'Vamos mandar um cartão de verdade ao Anki, para provar que tudo está ligado.',
      enviando: 'Enviando…', enviado: 'Cartão enviado ao Anki',
      teste: 'Você ainda não minerou nenhuma frase, então este é um cartão de teste. Ele tem a etiqueta perpetualminer-teste no Anki, para você apagá-lo quando quiser.',
      abrirNoAnki: 'Abrir no Anki', concluir: 'Concluir', naoAbriu: 'Não deu para abrir o Anki. Tente de novo.',
      falhou: 'Este cartão não foi', tentarDeNovo: 'Tentar de novo', trocarAChave: 'Trocar a chave',
      motivoSemChave: 'Falta a chave da OpenAI.', motivoChaveRecusada: 'A OpenAI não aceitou a chave.', motivoSemCredito: 'A conta da OpenAI está sem crédito.',
      motivoOpenAI: 'A OpenAI não respondeu agora.', motivoChatGPT: 'O login do ChatGPT não serve para gerar cartões.',
      motivoTipoDeNota: 'O tipo de nota deste idioma foi alterado no Anki.', motivoAnki: 'O Anki não guardou o cartão.',
      motivoConexao: 'A Conexão com o Anki não respondeu. Confira se ela está ligada.', motivoOutro: 'Algo impediu o envio.',
    },

    'BRG-44': {
      titulo: 'Frente', fraseComAudio: 'Frase com áudio', ouvirPrimeiro: 'Ouvir primeiro', lacuna: 'Lacuna', producao: 'Produção', ditado: 'Ditado', textoFraseComAudio: 'A frase e o áudio na frente',
      textoOuvirPrimeiro: 'Só o botão de tocar na frente: ouça antes de ler', textoLacuna: 'A frase sem a palavra, com uma dica e sem áudio',
      textoProducao: 'A frase em português na frente: escreva no idioma e o Anki compara', textoDitado: 'Só o botão de tocar e um campo: escreva o que ouviu e o Anki mostra o que errou',
      nota: 'Todos os cartões em {idioma} mudam na hora, sem custo', naoMudou: 'Os outros ajustes foram salvos, mas a frente não mudou: {motivo}.',
      semConexao: 'a Conexão com o Anki está desligada', ankiOcupado: 'o Anki não está pronto (sem perfil aberto, em outro perfil ou sincronizando)',
      tipoMexido: 'o tipo de nota em {idioma} foi alterado no Anki e a Conexão não mexe nele', falhou: 'a Conexão não conseguiu trocá-la', tentarDeNovo: 'Tentar de novo',
    },
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
