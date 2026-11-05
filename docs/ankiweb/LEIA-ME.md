# A página da Conexão com o Anki no AnkiWeb (#176)

`pagina.html` é o corpo da página, pronto para colar. O resto é o formulário de upload em
<https://ankiweb.net/shared/addons/> (“Upload”), campo a campo:

| Campo | Valor |
|---|---|
| Título | `PerpetualMiner · Cartões de frases com IA` (também o nome na lista de Complementos do Anki; PT + EN no corpo) |
| Description | o conteúdo de `pagina.html` |
| Support Page | `https://github.com/vinicius928e8r84/PerpetualMiner/issues` (confira que abre sem login **antes** de a página ir ao ar: risco 13) |
| Tags | `english`, `russian`, `mining` |
| Versions | de 2.1.50 a 26.09; “testado até” (Tested Up To): 26.09 |
| License | AGPL-3.0 (`LICENSE` na raiz) |
| Fotos | Cartão iniciante, Cartão de russo e o painel (Conexão com o Anki). Tire-as do Anki/painel reais, com frases de exemplo (nada pessoal). |
| Arquivo | `conexao/perpetualminer.ankiaddon` |

## Passo do dono (não é feito por agente)

1. Suba `conexao/perpetualminer.ankiaddon` com a conta do dono. O AnkiWeb devolve o **código** (número) da página.
2. No repositório, troque o `package` de `complemento/manifest.json` e o `codigo` de `lib/ankiweb.js` (`{ codigo: '<número>' }`) por esse número,
   e refaça o arquivo: `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon` com `SOURCE_DATE_EPOCH=<hora do upload, em segundos>`
   (o `mod` do arquivo é a hora do upload; o Anki compara com ela para oferecer atualização). Suba esse arquivo de novo em “Update”, se o AnkiWeb pedir.
3. `python3 -m unittest complemento.test_pacote` confere que o `package` do arquivo, o do manifesto e o código do painel são o mesmo número e que o `mod` é de uma hora real;
   o e2e `painel-anki-primeira-conexao` confere o código no Detalhes “O arquivo não abriu?”.

## A atualização em silêncio (#177) e o risco 6

A Conexão sabe se atualizar sozinha pelo AnkiWeb (`complemento/atualizacao.py`): consulta pelo próprio id ao abrir o Anki e a cada 6 h, instala sem perguntar e se marca
com a atualização automática do Anki desligada (`update_enabled`). **Está desligada por padrão** (`ATUALIZACAO_AUTOMATICA = False` em `complemento/configuracao.py`).

- **Os termos do AnkiWeb não foram conferidos.** A página de termos do AnkiWeb (`https://ankiweb.net/account/terms`) só é montada por JavaScript e o agente que fez o #177
  não conseguiu lê-la; a conclusão sobre um complemento que se atualiza sozinho **não está registrada, nem a favor nem contra**. O dono lê a página, decide, e só então
  troca a chave por `True` (e sobe a versão, porque é um arquivo do pacote). Enquanto ela está desligada nada é consultado nem marcado sozinho; o botão Atualizar agora
  da extensão, que é um clique da pessoa, continua valendo.
- **As funções internas do Anki** foram lidas no código do Anki 26.09 (`aqt/addons.py`: `fetch_update_info`, `AddonManager.get_updated_addons`, `download_and_install_addon`,
  `AddonManager.addon_meta` e `write_addon_meta`), sem rodar um Anki de verdade. `AnkiWebDoAnki.pronto()` confere que elas existem antes de usá-las; se um Anki mudar um nome,
  a Conexão não consulta, não instala e desfaz a marca, e o diálogo normal do Anki volta (nunca pior que isso).
- **O ensaio do dono** (com a Conexão instalada pelo AnkiWeb): ligar a chave, subir uma versão nova no AnkiWeb, abrir o Anki e conferir que nenhum diálogo de atualização aparece,
  que a versão nova entra e vale na abertura seguinte, e que o botão Reiniciar o Anki do Painel fecha e abre o Anki; com um Anki que mudou as funções internas, que o diálogo normal volta.
- **Só funciona com o arquivo do AnkiWeb:** o id é o nome da pasta da Conexão no Anki (`addons21/<id>`), então uma Conexão instalada por arquivo com o `package` provisório
  (`perpetualminer`) não tem de onde atualizar.

## Riscos que seguem abertos

- **Risco 8:** o piso do Anki 2.1.50 não foi testado no Mac do dono.
- **Risco 13:** o link de suporte precisa funcionar antes de a página ir ao ar.
