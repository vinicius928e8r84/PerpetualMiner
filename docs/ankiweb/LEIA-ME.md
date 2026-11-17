# A página da Conexão com o Anki no AnkiWeb (#176)

`pagina.html` é o corpo da página, pronto para colar. O resto é o formulário de upload em
<https://ankiweb.net/shared/addons/> (“Upload”), campo a campo:

| Campo | Valor |
|---|---|
| Título | `PerpetualMiner · Cartões de frases com IA` (também o nome na lista de Extensões do Anki; PT + EN no corpo) |
| Description | o conteúdo de `pagina.html` |
| Support Page | `https://github.com/vinicius928e8r84/PerpetualMiner/issues` (confira que abre sem login **antes** de a página ir ao ar: risco 13) |
| Tags | `english`, `russian`, `mining` |
| Versions | de 2.1.50 a 26.09; “testado até” (Tested Up To): 26.09 |
| License | AGPL-3.0 (`LICENSE` na raiz) |
| Fotos | Cartão iniciante, Cartão de russo e o painel (Conexão com o Anki). Tire-as do Anki/painel reais, com frases de exemplo (nada pessoal). |
| Arquivo | `conexao/perpetualminer.ankiaddon` |

## Passo do dono (não é feito por agente; feito: o código é 1108882947)

1. Suba `conexao/perpetualminer.ankiaddon` com a conta do dono. O AnkiWeb devolve o **código** (número) da página.
2. No repositório, troque o `package` de `complemento/manifest.json` e o `codigo` de `lib/ankiweb.js` (`{ codigo: '<número>' }`) por esse número
   e refaça o arquivo; suba esse arquivo de novo em “Update”, se o AnkiWeb pedir.
   O script recusa um HEAD que não é commit verde (tag `verde/*`, ver `docs/commit-verde.md`); aqui a árvore está sendo editada, então rode com `PM_COMMIT_VERDE=ignorar`, e o arquivo que vai ao AnkiWeb sai de um commit verde, sem a variável.
3. **Depois do upload** (de cada versão nova, também), refaça o arquivo com o `mod` que o AnkiWeb deu à página:
   `python3 complemento/empacotar.py --mod-do-ankiweb conexao/perpetualminer.ankiaddon`. O script lê o `t=` do redirect do download do AnkiWeb
   (o mesmo que `curl -sI 'https://ankiweb.net/shared/download/<código>?v=2.1&p=250900'` mostra na `Location`), **baixa o zip que o AnkiWeb serve** e o grava com esse número no `manifest.json`:
   os outros bytes são os do upload (não as fontes de hoje, que a main pode ter mudado depois), então **não se sobe de novo**.
   Se o `conexao/perpetualminer.ankiaddon` existe e leva outro código que o do AnkiWeb (o upload ainda não aconteceu, ou foi de outro arquivo), o script para e não escreve nada; o mesmo sem rede ou sem a página no ar.
   Não use a hora do upload nem a do empacotamento: o AnkiWeb dá a sua (na #503, 49 minutos depois da do arquivo), e com qualquer outro número o Anki que instalou pelo arquivo
   vê “atualização” para a mesma versão (no 25.09, um download inútil; no 2.1.50, o diálogo Atualizar Extensões, que falha por W2: #503).
   Confira: o `t=` do `curl -sI` acima é o `mod` do `manifest.json` do arquivo (`python3 -c "import zipfile; print(zipfile.ZipFile('conexao/perpetualminer.ankiaddon').read('manifest.json').decode())"`).
   Commite o arquivo refeito direto na main, como o commit de versão: uma PR não mexe no `.ankiaddon` (a regra `versoes-publicadas` a barra).
4. `python3 -m unittest complemento.test_pacote` confere que o `package` do arquivo, o do manifesto e o código do painel são o mesmo número e que o `mod` é de uma hora real (que ele é o do AnkiWeb, só o passo 3 garante: o teste não vai à rede);
   o e2e `painel-anki-primeira-conexao` confere o código no Detalhes “O arquivo não abriu?”.

## Antes de subir uma versão

- **Política:** toda PR desta versão com link em `Política:` tem a política no ar em perpetualminer.com/privacidade/, e a aba Práticas de privacidade da loja diz o mesmo.

## A atualização em silêncio (#177) e o risco 6

A Conexão sabe se atualizar sozinha pelo AnkiWeb (`complemento/atualizacao.py`): consulta pelo próprio id ao abrir o Anki e a cada 6 h, instala sem perguntar e se marca
com a atualização automática do Anki desligada (`update_enabled`). **Está ligada por padrão** (`ATUALIZACAO_AUTOMATICA = True` em `complemento/configuracao.py`, a partir da Conexão 0.4.20).

- **Como desligar** (o caminho de recuperação): quem não quer cria o arquivo vazio `sem-atualizacao-automatica` em `user_files` da Conexão (o Anki preserva a pasta) e reabre o Anki:
  a Conexão sobe desligada, desfaz a marca e o diálogo normal do Anki volta. Para todos, o dono troca a chave por `False` e sobe uma versão nova (a chave é um arquivo do pacote). Em
  qualquer dos casos o botão Atualizar agora da extensão, que é um clique da pessoa, continua valendo.
- **Os termos do AnkiWeb foram lidos** (09/11): nada proíbe uma extensão que se atualiza sozinha, a licença é a AGPL3 e o que vetam são clientes de terceiros. Ligar a atualização por
  padrão (Conexão 0.4.20) não contraria os termos; a chave `ATUALIZACAO_AUTOMATICA` só volta a `False` por outro motivo.
- **As funções internas do Anki** foram lidas no código do Anki 26.09 (`aqt/addons.py`: `fetch_update_info`, `AddonManager.get_updated_addons`, `download_and_install_addon`,
  `AddonManager.addon_meta` e `write_addon_meta`) e **provadas num Anki real, o do Mac**: a troca da 0.4.20 para a 0.4.21 aconteceu em silêncio, sem diálogo.
  `AnkiWebDoAnki.pronto()` confere que elas existem antes de usá-las; se um Anki mudar um nome,
  a Conexão não consulta, não instala e desfaz a marca, e o diálogo normal do Anki volta (nunca pior que isso).
- **O ensaio do dono** (feito no Anki do Mac: a troca 0.4.20 → 0.4.21 foi silenciosa; o roteiro, para repetir com a Conexão instalada pelo AnkiWeb): subir uma versão nova no AnkiWeb (a 0.4.20 é a primeira com a chave ligada: quem vem de uma versão anterior ainda vê o diálogo do Anki nessa atualização), abrir o Anki e conferir que nenhum diálogo de atualização aparece,
  que a versão nova entra e vale na abertura seguinte, e que o botão Reiniciar o Anki do Painel fecha e abre o Anki; com um Anki que mudou as funções internas, que o diálogo normal volta.
  A 0.4.21 existiu para isso: só o número da versão muda (nenhum comportamento), então enviá-la a quem está na 0.4.20 prova a troca silenciosa sem misturar outra mudança.
  A 0.4.22 leva o Cartão do russo (#163): o Intermediário com a palavra-chave destacada e a morfologia depois do outro exemplo, o Avançado monolingue.
- **Só funciona com o arquivo do AnkiWeb:** o id é o nome da pasta da Conexão no Anki (`addons21/<id>`), então uma Conexão instalada por arquivo com o `package` antigo
  (`perpetualminer`) não tem de onde atualizar.

## Riscos que seguem abertos

- **Risco 8:** o piso do Anki 2.1.50 não foi testado no Mac do dono.
- **Risco 13:** o link de suporte precisa funcionar antes de a página ir ao ar.
