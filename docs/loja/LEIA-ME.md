# Imagens da Chrome Web Store

Todas são PNG de 24 bits, sem transparência, feitas com frases de exemplo (nada pessoal, nenhuma série ou marca de streaming na tela). Cada arquivo vai num campo da aba **Listagem da loja**:

| Arquivo | Tamanho | Campo do formulário |
|---|---|---|
| `icone-128.png` | 128×128 | **Ícone da loja** |
| `captura-1.png` | 1280×800 | **Capturas de tela**, 1ª: legenda de um vídeo com o overlay e o aviso "Frase minerada e copiada" |
| `captura-2.png` | 1280×800 | **Capturas de tela**, 2ª: painel de estudos, lista de Frases |
| `captura-3.png` | 1280×800 | **Capturas de tela**, 3ª: minerar de uma foto, com as frases lidas |
| `captura-4.png` | 1280×800 | **Capturas de tela**, 4ª: Configurações (atalhos, chave do Gemini, aparência) |
| `captura-5.png` | 1280×800 | **Capturas de tela**, 5ª: popup da barra, com o contador da mineração automática do dia |
| `promo-pequena-440x280.png` | 440×280 | **Imagem promocional pequena** |

A imagem promocional grande (1400×560) é dispensável num item não listado.

## Como regerar

```
cd e2e
npx playwright test -c loja --workers=1
node loja/validar.js
```

O gerador (`e2e/loja/gerar-imagens.spec.js`) abre a extensão desempacotada no Chromium, com a rede falsificada, e escreve aqui. O `validar.js` confere tamanho e ausência de alfa de cada arquivo e se a tabela acima bate com `e2e/loja/imagens.js`, onde ficam os nomes, tamanhos e campos. O gerador fica fora de `e2e/tests`, então o `npm test` não regera as imagens.
