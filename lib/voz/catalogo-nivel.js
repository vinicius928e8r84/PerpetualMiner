'use strict';

// O catálogo da Voz do passo do nível da Boas-vindas e da prévia do Cartão (#164): BRG-43 e ONB-20, e a frente do cartão (#166): BRG-44, no mesmo `CATALOGO_DA_VOZ` de `catalogo.js`, que tem de
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
      titulo: 'Frente', fraseComAudio: 'Frase com áudio', ouvirPrimeiro: 'Ouvir primeiro', lacuna: 'Lacuna', textoFraseComAudio: 'A frase e o áudio na frente',
      textoOuvirPrimeiro: 'Só o botão de tocar na frente: ouça antes de ler', textoLacuna: 'A frase sem a palavra, com uma dica e sem áudio',
      nota: 'Todos os cartões em {idioma} mudam na hora, sem custo', naoMudou: 'Os outros ajustes foram salvos, mas a frente não mudou: {motivo}.',
      semConexao: 'a Conexão com o Anki está desligada', ankiOcupado: 'o Anki não está pronto (sem perfil aberto, em outro perfil ou sincronizando)',
      tipoMexido: 'o tipo de nota em {idioma} foi alterado no Anki e a Conexão não mexe nele', falhou: 'a Conexão não conseguiu trocá-la', tentarDeNovo: 'Tentar de novo',
    },
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
