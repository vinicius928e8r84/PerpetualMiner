'use strict';

// As imagens da loja: o nome, o tamanho e o campo do formulário onde cada uma
// vai. O gerador, o `validar.js` e a tabela do `docs/loja/LEIA-ME.md` leem
// daqui, então nenhum dos três desanda dos outros.

const CAPTURA = { largura: 1280, altura: 800 };

const IMAGENS = {
  icone: { arquivo: 'icone-128.png', largura: 128, altura: 128, campo: '**Ícone da loja**' },
  captura1: { arquivo: 'captura-1.png', ...CAPTURA, campo: '**Capturas de tela**, 1ª: legenda de um vídeo com o overlay e o aviso "Frase minerada e copiada"' },
  captura2: { arquivo: 'captura-2.png', ...CAPTURA, campo: '**Capturas de tela**, 2ª: painel de estudos, lista de Frases' },
  captura3: { arquivo: 'captura-3.png', ...CAPTURA, campo: '**Capturas de tela**, 3ª: minerar de uma foto, com as frases lidas' },
  captura4: { arquivo: 'captura-4.png', ...CAPTURA, campo: '**Capturas de tela**, 4ª: Configurações (atalhos, chave do Gemini, aparência)' },
  captura5: { arquivo: 'captura-5.png', ...CAPTURA, campo: '**Capturas de tela**, 5ª: popup da barra, com o contador da mineração automática do dia' },
  promo: { arquivo: 'promo-pequena-440x280.png', largura: 440, altura: 280, campo: '**Imagem promocional pequena**' },
};

/** A linha da tabela do LEIA-ME para uma imagem. */
const linhaDaTabela = ({ arquivo, largura, altura, campo }) => `| \`${arquivo}\` | ${largura}×${altura} | ${campo} |`;

module.exports = { IMAGENS, CAPTURA, linhaDaTabela };
