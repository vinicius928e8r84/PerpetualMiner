# Dentro do Anki: o item “PerpetualMiner…” em Ferramentas (#175)

Fatia do mapa [#138](https://github.com/vinicius928e8r84/PerpetualMiner/issues/138), histórias 106 a 109. O que a pessoa vê, dentro do Anki:

- **O item** Ferramentas › PerpetualMiner…, que abre uma janela pequena (sem travar o Anki) com a Conexão com o Anki (Ligada, ou Desligada
  com onde achar o motivo), a versão, o perfil aberto, o Envio de agora (“7 de 12 cartões”, a etapa, a barra e o Baralho) e o último erro.
- **O botão Config** de Ferramentas › Extensões abre a mesma janela, nunca a configuração em texto cru (o complemento não tem `config.json`).
- **Um aviso que some sozinho** no começo e no fim de cada Envio (“12 cartões enviados ao Baralho Inglês”) e **o rótulo do item** com a
  contagem enquanto envia (“PerpetualMiner · 7 de 12”).
- **Sem selo fixo na barra do Anki** (a spec do #138 o deixa como acréscimo pequeno, se o dono quiser).

## Quem faz o quê

| arquivo | o que faz |
|---|---|
| `complemento/janela.py` | `Janela.estado()` (o que a janela lê) e `Janela.passo()` (o rótulo e os avisos novos), só com a fila e o estado do Envio (`envio.py`); `ligar` põe o item, o Config e a conferência (a cada 1,5 s) no Anki por uma fronteira de cinco chamadas (`qt`) |
| `complemento/qt_do_anki.py` | a fronteira de verdade, sobre o `aqt`: `QAction` em `mw.form.menuTools`, `addonManager.setConfigAction`, `tooltip`, `QTimer` e o `QDialog`. Só roda dentro do Anki |
| `complemento/texto_da_janela.py` | a cópia abaixo, por ID, com os modelos da extensão (`{nome}`, `{n\|singular\|plural}`) |
| `complemento/no_anki.py` | `ao_carregar` põe o item depois de subir a Conexão, **suba ela ou não** (desligada, a janela diz onde está o motivo) |

## O que a janela lê (e o que nunca lê)

Só `fila.ordem()`, `fila.estado(jobId)` e o Baralho do pedido de cada Envio (os últimos 20, a fila não tem limpeza: #151). O “Envio de agora” é o
mais antigo que está na fila ou andando; sem nenhum, o último. O “último erro” é o `lastError` do Envio mais recente que terminou, escrito com o
código e quantos Cartões não entraram. **A chave da OpenAI, a Palavra e a Frase não têm por onde chegar à tela do Anki**: a janela não abre o cofre
nem a linha do pedido, e o `lastError` é sempre um código.

O aviso de começo vem uma vez por vez que um Envio anda (um Tentar de novo anuncia de novo); o de fim, uma vez por fim. O que já tinha terminado
quando o Anki abriu não ganha aviso. Um Envio que começa e termina entre duas conferências ganha só o de fim.

## Erros nunca abrem o diálogo do Anki

Tudo o que o Anki chama de volta (o item, o Config, a conferência, a atualização da janela) passa por `janela.protegido`: o erro vai a
`user_files/logs/complemento.log` e nunca sai para o Anki. Um erro de leitura da fila vira “sem Envio” e entra no registro uma vez por erro diferente
(não a cada 1,5 s). Se o Anki mudou o menu, o item não entra, a Conexão sobe do mesmo jeito e o motivo fica no registro.

## A cópia

Os IDs `ANK-*` vivem aqui e não no catálogo da Voz (`docs/design/voz/README.md`, `lib/voz/catalogo.js`): os dois estão no teto de tamanho do gancho
(`scripts/ganchos/linha-de-base-de-tamanho.json` só desce) e uma tela de dentro do Anki não passa pela extensão. A tabela segue o formato dele;
`complemento/test_janela.py` confere cada texto de `texto_da_janela.py` com esta tabela (os `ANK-*`) e com o retrato do catálogo (os `ENV-07` e `ENV-10`
que a janela reusa). Entrar no catálogo é dividi-lo, outro ticket.

| ID | Cópia | Onde |
|---|---|---|
| ANK-01.parado | PerpetualMiner… | o rótulo do item em Ferramentas, sem Envio andando. O “…” é a convenção do Anki para um item que abre uma janela (exceção pedida no #175 à V7, que reserva as reticências ao que está em andamento) |
| ANK-01.enviando | PerpetualMiner · {feitos} de {total} | o rótulo enquanto um Envio anda: a contagem de Cartões que já entraram no Anki |
| ANK-02.titulo | PerpetualMiner | o título da janela |
| ANK-02.conexao | Conexão com o Anki | o rótulo da linha da Conexão |
| ANK-02.ligada | Ligada | a Conexão respondendo no Anki |
| ANK-02.desligada | Desligada. O motivo está no registro da pasta user_files (Ferramentas › Extensões › Ver arquivos). | a Conexão que não subiu (a porta ocupada, por exemplo): onde achar o motivo. “Extensões” porque é o nome do menu do próprio Anki em pt-BR (#99, #237) |
| ANK-02.versao | Versão | o rótulo da linha da versão |
| ANK-02.perfil | Perfil | o rótulo da linha do perfil |
| ANK-02.semPerfil | Nenhum perfil aberto | o Anki na janela de perfis, ou o perfil não se lê |
| ANK-02.envio | Envio | o rótulo da linha do Envio |
| ANK-02.semEnvio | Nenhum Envio ainda | a fila ainda não recebeu nenhum Envio |
| ANK-02.progresso | {feitos} de {total} {total\|cartão\|cartões} | o Envio de agora (ou, sem nenhum andando, o último): quantos Cartões já estão no Anki; a etapa vem do ENV-07 e a barra é a mesma fração |
| ANK-02.baralho | Baralho {baralho} | o Baralho do Envio, com os níveis separados por › (“Inglês › Mineradas”) |
| ANK-02.erro | Último erro | o rótulo da linha do último erro |
| ANK-02.semErro | Nenhum erro | o Envio mais recente que terminou, terminou bem (ou nenhum terminou) |
| ANK-02.falhou | {n} {n\|cartão não entrou\|cartões não entraram} no Baralho {baralho} · {codigo} | o código do Envio mais recente que terminou com erro, sem frase nova (C8: as falhas novas ainda não têm cópia própria; o código nunca é a chave nem texto da OpenAI) |
| ANK-02.fechar | Fechar | o botão que fecha a janela |
| ANK-03.comecou | Enviando {total} {total\|cartão\|cartões} ao Baralho {baralho} | o aviso que some sozinho quando um Envio começa |
| ANK-03.terminou | {n} {n\|cartão enviado\|cartões enviados} ao Baralho {baralho} | o aviso que some sozinho quando um Envio termina; se for o caso, segue “ · N já estava lá” (ENV-10.jaEstavam) e “ · N não entrou” (ENV-10.naoEntraram) |
| ANK-03.naoTerminou | O Envio ao Baralho {baralho} não terminou | o aviso do fim de um Envio que não pôs nenhum Cartão no Anki; o motivo fica no último erro da janela |
| ANK-04.esperando | Esperando o Envio de agora terminar | a linha da Conexão, no lugar de Ligada, enquanto a passagem do Windows do dono espera o Envio da Conexão de hoje terminar (#178, `docs/design/passagem-do-windows.md`) |

## Provado e não provado

- **Provado pelo `unittest` (sem Qt):** o estado que a janela lê e os avisos, com um Envio de verdade (a thread de trabalho, a coleção em memória e a OpenAI
  de mentira), no meio (7 de 12), esperando o Anki, terminado, em parte, com duplicata, sem chave e sem Envio; a chave fora de tudo o que a pessoa lê; o item e o
  Config abrindo a mesma janela; um erro que não sai para o Anki; o `ao_carregar` com o item, com a Conexão desligada e com um Anki que quebra o menu.
- **Não provado aqui:** o Qt e o `aqt` de verdade (o item na posição certa do menu, a janela desenhada, o botão Config abrindo mesmo a janela, o aviso
  sumindo, o rótulo mudando, a ausência de diálogo de erro). É o ensaio do dono (abaixo) e o ensaio geral do #269.
- **Sem referência visual:** a janela é do Anki (Qt), fora do alcance do Playwright; não há PNG, e nenhuma foi aprovada. O dono a compara com o protótipo
  aprovado (#87) olhando a janela de verdade.

## Ensaio do dono, no Mac

1. Com o complemento novo no Anki (`python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`, ou o botão Baixar a Conexão com o Anki),
   abra o Anki e um perfil: Ferramentas › **PerpetualMiner…** existe e abre a janela pequena. Ela diz Ligada, a versão, o perfil e “Nenhum Envio
   ainda” / “Nenhum erro”. O Anki segue usável com a janela aberta. Fechar a fecha.
2. Ferramentas › Extensões › PerpetualMiner › **Config** abre a **mesma** janela, nunca a configuração em texto cru.
3. Mande um Envio de 12 Frases (passo 9 do `complemento/LEIA-ME.md`): aparece o aviso “Enviando 12 cartões ao Baralho …” e some sozinho; o item vira
   “PerpetualMiner · 7 de 12” enquanto envia; a janela aberta acompanha (a barra e o Baralho); no fim, o aviso “12 cartões enviados ao Baralho …” e o item
   volta a “PerpetualMiner…”.
4. Apague a chave (painel › Configurações) e mande outro Envio: a janela mostra o último erro com o código, e a chave não aparece em lugar nenhum do Anki.
5. Com a porta 8766 ocupada (o Anki aberto com a Conexão de hoje rodando), o item abre a janela com “Desligada…”.
6. Em nenhum passo o Anki abre o diálogo de erro dele culpando o complemento (se abrir, anote o texto), e não há selo fixo na barra do Anki.
