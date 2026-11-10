# GSAP, copiado para dentro do site

O site não pede nada para fora dele, então o GSAP entra copiado: os quatro arquivos abaixo são os do pacote
`gsap@3.15.1` do npm (`dist/*.min.js`), sem alteração. O cabeçalho de cada um (nome, versão, direitos e o endereço da
licença) fica como veio: a licença proíbe tirar.

| Arquivo | Quem usa | Bytes | Com gzip |
|---|---|---|---|
| `gsap.min.js` | as três variantes | 73.357 | 28.415 |
| `ScrollTrigger.min.js` | Palco | 44.683 | 18.034 |
| `Flip.min.js` | Travessia | 25.596 | 9.719 |
| `SplitText.min.js` | Compasso | 7.955 | 3.657 |

## A licença

`LICENCA.txt` é o texto de <https://gsap.com/standard-license>, lido em 10/11/2026 (em vigor desde 30/04/2025, mudado
pela última vez em 30/05/2025). O GSAP **não é software livre** e não entra na AGPL-3.0 deste repositório: é código
da Webflow, com licença própria.

- **Uso comercial sem pagar:** permitido, com todos os plugins (os que eram pagos, como o SplitText, também).
- **Obrigações:** não tirar nem mudar os avisos de direitos dos arquivos; não usar o GSAP numa ferramenta de montar
  animação sem código que concorra com a da Webflow (não é o caso de um site); a licença vale junto com os Termos de
  Serviço da Webflow.
- **Riscos:** a Webflow pode mudar a licença para as versões futuras (quem não aceitar fica na versão que já tem, sem
  atualização) e pode encerrá-la se os termos forem descumpridos.

## Atualizar

```bash
npm pack gsap@<versão> && tar xzf gsap-*.tgz
cp package/dist/{gsap,ScrollTrigger,Flip,SplitText}.min.js preview/prototipos/pagina-gsap/vendor/gsap/
```

Confira a licença de novo no endereço acima e atualize a tabela e a data.
