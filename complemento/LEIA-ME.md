# A Conexão com o Anki, como complemento do Anki

Python só com a biblioteca padrão (o Anki do Mac roda o 3.9, sem Flask nem requests).
Ela sobe em `127.0.0.1:8766`, numa thread, e responde a saúde
(`GET /health`: `{ ok, versao, perfil }`, aberta ao cliente local), as leituras da coleção do Anki
(`POST /anki/decks`, `/anki/stats/decks` e `/anki/vocabulary`) e a chave da OpenAI
(`POST /ia/openai/chave` a confere e guarda; `POST /ia/estado` diz se há cópia), o Envio (`POST /jobs`, `/jobs/list`, `/jobs/get`, `/jobs/retry`, `/jobs/debug-bundle`, `/analytics/jobs`: cada Frase vira um Cartão com texto e áudio gravado na coleção, #142) e o perfil fixo (`POST /anki/profiles`, `/anki/profile`, `/anki/profile/open`, #149); o resto exige a origem da extensão e é POST (`contrato/LEIA-ME.md`).

| Arquivo | O que faz |
|---|---|
| `__init__.py` | O que o Anki importa. Fora do Anki (nos testes) não há `aqt`; nada acontece |
| `no_anki.py` | A ligação com o `mw` do Anki: `perfil_aberto` (só com a coleção aberta; selecionado na janela de perfis é `null`), `ColecaoDoAnki` (o adaptador da coleção: lê e grava na thread principal, só no perfil marcado, que abre pelas funções de perfil do Anki) e `ao_carregar` |
| `perfil.py`, `rotas_do_perfil.py` | O perfil fixo (#149): `user_files/perfil.json` guarda o da primeira conexão; os adaptadores só gravam nele (`OutroPerfil`, `PerfilSumiu`: o Envio espera); as rotas o listam, escolhem e abrem |
| `inicio.py` | Ao carregar: prepara `user_files`, o log e sobe a Conexão. Nunca levanta erro |
| `servidor.py` | O servidor HTTP e as rotas (`ROTAS`); só a extensão é atendida |
| `rotas_da_chave.py` | As rotas da chave da OpenAI (`/ia/openai/…`, `/ia/estado`), listadas em `servidor.ROTAS` |
| `tipo_de_nota.py` | O tipo de nota próprio de cada idioma (#161): nome, campos (**todos** desde o nascimento: mudar campos depois força uma sincronização completa no Anki), modelo e CSS, montados do `estilos.json`; `preparar(colecao)` cria os tipos e, numa instalação nova, os Baralhos `PerpetualMiner::Inglês` e `PerpetualMiner::Russo` (quem já tem Baralho fica com o seu). Só cria: nada que já existe é tocado. `inicio.py` o chama ao carregar e a cada perfil que abre |
| `espera_do_anki.py` | A espera do Envio pelo Anki (coleção fechada, sincronizando, noutro perfil), de `envio.Trabalho` |
| `baralhos.py` | O que se lê da coleção: a lista de Baralhos, os números de cada um e o vocabulário, só pelo lado de leitura de um adaptador da coleção (o contrato do adaptador, de leitura e gravação, está no topo) |
| `pedido_do_envio.py` | O pedido de `POST /jobs` (o que vale, a impressão do corpo) e o id do Envio; `envio.py` os reexporta |
| `envio.py` | O Envio (#142): a fila, o estado de cada Cartão e o trabalho que gera o texto pelo motor e grava cada nota pelo adaptador (na thread principal do Anki), esperando o perfil fechado e a sincronização; o criar idempotente pelo `jobId`, a retomada sem refazer o que está pronto (`guid` fixo por Cartão). O desenho: `docs/design/envio-no-complemento.md`. `motor_do_envio.py`: o motor de cada pedido |
| `trabalhador.py` | A thread de trabalho do Envio: tira um Envio da fila de cada vez e o faz (`envio.Trabalho`); depois de subir, espera até 60 s o primeiro pedido de Envio antes de retomar o que ficou parado |
| `imagem_do_cartao.py` | A imagem do Cartão (#144): foto do Openverse ou gerada; se falha, o Cartão vai sem. `imagem_qt.py`: o Qt do Anki. `docs/design/imagem-do-cartao.md` |
| `voz.py` | A voz do Cartão (#143): o áudio pedido ao Google Tradutor como o gTTS 2.5 faz, só com a biblioteca padrão; `audio_do_cartao.py` o liga ao Envio. Página: `docs/design/audio-do-cartao.md` |
| `janela.py`, `qt_do_anki.py`, `texto_da_janela.py` | A janela “PerpetualMiner…” em Ferramentas, o Config e os avisos do Envio (#175): `docs/design/dentro-do-anki.md` |
| `diagnostico.py` | O diagnóstico de um Envio (`/jobs/debug-bundle`) |
| `custos.py` | Os custos de cada Envio (`user_files/custos/<jobId>/costs.jsonl`, do `cost_tracker` do motor) nas linhas de `bridge/analytics.py` que a aba Custos lê |
| `motor/` | O motor de `engine/` (texto, voz e imagem; o mesmo código que a Conexão de hoje roda): no `.ankiaddon`, `empacotar.py` copia os arquivos de `ARQUIVOS_DO_MOTOR` para cá; no repositório, `motor/__init__.py` aponta para `engine/` |
| `normalizacao.py` | A lógica pura do vocabulário e dos números (a de `bridge/card_normalization.py`, na biblioteca padrão) |
| `chaves.py` | O cofre das chaves: `user_files/chaves/openai.json`, só do dono (0600), gravado de uma vez; a chave inteira só sai daqui para o pedido que a gasta |
| `login_do_chatgpt.py`, `rotas_do_chatgpt.py`, `paginas_do_navegador.py`, `chatgpt_oficial.py` | O login do ChatGPT (#155): tokens só em `chaves/chatgpt.json` (0600), PKCE |
| `openai_api.py` | Conferir uma chave da OpenAI (`GET /v1/models` e um `POST /v1/embeddings` de uma palavra, só com a biblioteca padrão): recusada, sem crédito, organização não verificada ou a OpenAI fora do ar. Nunca copia o que a OpenAI diz ao recusar para o log nem para a resposta |
| `item_de_login.py` | O item de login de “Abrir o Anki com o computador”: um LaunchAgent no Mac, um atalho na pasta Inicializar no Windows (o `.lnk` escrito byte a byte). Ligar escreve, desligar apaga; desligado por padrão |
| `abridor.py` | O abridor de “Abrir o Anki sozinho” (#147): ao carregar, a cada perfil que abre e quando se escolhe outro, escreve em `user_files/abridor` o script com o caminho do Anki e o perfil marcado (`.sh` no Mac; no Windows, um `.bat` que chama com o PowerShell do Windows o `.ps1` ao lado) e o registra como host de Native Messaging `com.perpetualminer.abridor`, só para a origem da extensão: no Mac, o manifesto na pasta de hosts do Chrome; no Windows, o valor padrão de `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.perpetualminer.abridor` (o Opera GX 136 achou o host só aí num Windows real, ensaio W4 de 2026-10-10; outros builds não confirmados; a ajuda do Opera cita HKLM). O script responde `conferir` (o Anki está lá?), `abrir` (abre o Anki com `-p "<perfil>"`) e `consertar` (#152), pelos exemplos de `contrato/`. Escrever falhou: vai ao log, a Conexão sobe assim mesmo |
| `conserto_do_anki.py` | O `consertar` do abridor (#152): fecha à força o Anki parado há 30 s e o reabre, ou liga a Conexão no `meta.json`; só o Anki anotado pelo complemento. Ensaio: `docs/design/ensaio-do-conserto.md` |
| `registro.py` | O logger do complemento: todo erro vai para `user_files/logs/complemento.log` |
| `pasta_de_dados.py` | `user_files/{fila,estado,custos,logs,chaves}`, que o Anki preserva nas atualizações (os do Envio, `envio.py`) |
| `configuracao.py` | Versão, porta e o ID da extensão |
| `contrato/` | Os exemplos que o complemento e o fake do e2e leem, e como uma rota nova entra |
| `empacotar.py` | Monta o `.ankiaddon` (e `conexao/perpetualminer.ankiaddon`, o do botão Baixar a Conexão com o Anki), com o motor de `engine/` em `motor/` |
| `versoes.json` | O hash das fontes do pacote por `VERSAO` (fora do `.ankiaddon`); `test_pacote.py` falha, pedindo para subir a `VERSAO`, se as fontes mudam e a versão não |

## Regras que o código assume

- A thread da Conexão nunca mexe no processo do Anki: sem proxy, sem trocar `stdout`, `stderr`, `excepthook` nem os avisos; todo erro vai para o logger de `registro.py`. Com a porta ocupada ela fica quieta e registra o motivo.
- A coleção só é lida por um adaptador (`baralhos.py` diz o que ele tem: `perfis()`, `nomes_dos_baralhos()`, `cartoes_do_baralho()`). `no_anki.ColecaoDoAnki` é o do Anki e lê e grava na thread principal do Anki; os testes usam `test_colecao_em_memoria.ColecaoEmMemoria`. O lado de gravação é o do Envio: `tipo_de_nota()`, `guids_existentes()`, `adicionar_nota()`.
- `GET /health` é a única rota sem `Origin`, porque o Chrome manda o GET de uma extensão sem ele; as outras são só POST e exigem a origem (`contrato/LEIA-ME.md` § Quem o complemento atende). A credencial de pareamento é o ticket #192, antes do lançamento.
- `bridge/test_paridade_da_normalizacao.py` roda as 19 funções das duas cópias com os mesmos casos; `bridge/card_normalization.py` é a referência até a Conexão de hoje sair.
- Chave da OpenAI (#154): `POST /ia/openai/chave` a confere (`openai_api.py`, dois pedidos baratos, só a biblioteca padrão, URL base só por código) e guarda a cópia em `user_files/chaves` (fora do diagnóstico e do `.ankiaddon`); `/ia/estado` dá só máscara, UID, revisão e envio pendente; `/ia/openai/sincronizar`, `/legado` e `/chave/apagar` levam o dono à conta, migram o UID antigo (com a prova do segredo) e apagam a cópia. Nenhuma resposta devolve a chave inteira e o log nunca a escreve.
- Envio: o mesmo corpo de `POST /jobs` com o mesmo `jobId` é o mesmo Envio; outro corpo com ele dá `409`; `/jobs/list`, `/jobs/get`, `/jobs/retry` e `/jobs/debug-bundle` levam o `jobId` no corpo. Cada nota é gravada na thread principal do Anki, no tipo de nota do idioma (`tipo_de_nota.py`; o Envio o cria se faltar, então um Anki em inglês não falha); o criar usa a busca de duplicata pela frase normalizada, lida também nos campos “Frente” e “Front” do “Básico” de antes. O estilo (idioma × nível) é dado em `engine/estilos.json`: hoje o Iniciante, nos dois idiomas.

## Testes

```bash
python3.9 complemento/test_servidor.py   # o servidor real e o contrato (+ `test_servidor_item_de_login.py`, `test_servidor_processo.py`)
python3.9 complemento/test_servidor_erro_ao_atender.py  # os erros de um pedido, fora do log do Anki
python3.9 complemento/test_inicio.py     # a pasta de dados, a Conexão no ar, a porta ocupada
python3.9 complemento/test_no_anki.py    # o adaptador do Anki (um mw de mentira com sqlite)
python3.9 complemento/test_colecao_em_memoria.py  # o adaptador em memória e o contrato com o do Anki (+ `test_contrato_do_perfil_fixo.py`)
python3.9 complemento/test_pacote.py     # o conteúdo do .ankiaddon
python3.9 complemento/test_item_de_login.py  # o item de login escrito e apagado numa pasta temporária
python3.9 complemento/test_abridor.py        # o abridor escrito e registrado numa pasta temporária; roda o script do Mac
python3.9 complemento/test_conserto.py       # o consertar (+ `test_conserto_*.py`)
python3.9 complemento/test_chave_da_openai.py  # a chave: o que atravessa o HTTP, fica no disco e vai ao log
python3.9 complemento/test_perfil_fixo.py   # o perfil fixo: a escolha, a espera, a tela de perfis (+ `test_no_anki_perfil.py`)
python3.9 complemento/test_envio.py          # o Envio: a fila, o estado por Cartão, as duplicatas, a espera, a retomada, os custos
python3.9 complemento/test_envio_audio.py    # o áudio do Cartão: a voz do Google de mentira, a mídia na coleção
python3.9 complemento/test_envio_imagem.py   # a imagem do Cartão: Openverse e OpenAI de mentira
python3.9 complemento/test_envio_fronteiras.py  # a Conexão morre em cada gravação (#248)
python3.9 complemento/test_envio_tipo_de_nota.py  # o tipo de nota por idioma e o Cartão Iniciante, num Anki em inglês, num com Cartões antigos e um idioma novo por dados
python3.9 complemento/test_inicio_preparo.py  # a coleção preparada ao carregar e a cada perfil que abre (+ `test_contrato_da_criacao.py`, nos dois adaptadores)
python3.9 complemento/test_envio_apagar.py      # o Apagar tudo com o Anki fechado ou no Envio
python3.9 complemento/test_janela.py         # a janela e os avisos, com o Qt de mentira
python3.9 complemento/test_qt_do_anki.py     # o que se pede ao Qt do Anki
python3.9 complemento/test_motor.py          # o motor como pacote `complemento.motor`, sem PyYAML, dotenv nem SDK
python3.9 complemento/test_login_do_chatgpt.py
python3.9 complemento/test_plano_do_chatgpt.py
```

Rode todos também no `python3.12` e no `3.13` (`uv python install 3.9 3.13`).

## O arquivo que a extensão entrega

A primeira conexão (passo “Pôr a Conexão no Anki”, #145) é um link de download de `conexao/perpetualminer.ankiaddon`, que vai
dentro do pacote da loja (sem permissão nova). Mudou o código do complemento? Refaça o arquivo:

```bash
python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon
```

`test_pacote.py` falha se o arquivo estiver atrás do código (o `LEIA-ME.md` e os testes não entram nele). Refeito sem mudar o
código, dá os mesmos bytes.

Mudou o código do pacote (qualquer byte)? Suba a `VERSAO` em `configuracao.py` (a não lançada fica) e registre-a em
`versoes.json` com o hash que `test_pacote.py` mostra ao falhar (`python3 -c "from complemento import empacotar; print(empacotar.hash_das_fontes())"`).
Depois refaça o arquivo. Subir a `VERSAO` muda a `versao` dos exemplos de `contrato/`.

## Ensaio do dono, no Mac

1. Com a extensão carregada, abra o painel › Conexão com o Anki (ou a Boas-vindas, passo 4): **Baixar a Conexão com o Anki**.
2. Abra o arquivo baixado, com o Anki **fechado** de propósito: ele abre sozinho e pergunta se quer instalar; responda Sim.
3. Reinicie o Anki. A tela confere sozinha e diz “Achei o Anki · perfil · versão”.
4. Com um perfil aberto, abra o painel › Conexão com o Anki: **Baralhos e termos** e **Vocabulário** mostram os
   números e as palavras dos Baralhos dos Ajustes de envio, e **Ajustes de envio** lista os Baralhos do Anki.
5. Com a Mineração automática ligada, toque uma legenda num vídeo: ela é minerada e aparece em Frases.
6. Confira `user_files` do complemento (Ferramentas › Complementos › Ver arquivos): as pastas `fila`,
   `estado`, `custos`, `logs` e `chaves` existem, e o log diz “Conexão ouvindo em 127.0.0.1:8766”.
7. Em Configurações › IA dos cartões, cole uma chave da OpenAI de verdade (de um projeto com limite de gasto): a tela mostra
   “Chave conferida” com `••••••••` e os 4 últimos caracteres; `user_files/chaves/openai.json` guarda a cópia e o log não pode ter a chave.
   Uma chave inventada (`sk-proj-` e letras) deve ser recusada; sem os certificados do sistema, vem “Não deu para falar com a OpenAI”: anote o Detalhes.
8. Sem resposta em 2 minutos (tente com o Anki fechado), a tela mostra o checklist de 3 itens e Baixar de novo.
8b. **Perfil fixo (risco 4, #149, #269):** com 2 perfis, “Perfil do Anki” mostra o da primeira conexão. Com um Envio esperando em outro, o cartão diz “O Anki está no perfil X…” e **Abrir <perfil>** fecha o aberto (sincroniza) e abre o marcado, uma vez só? Na tela de perfis o Envio entra no marcado (`mw.pm.load`, `onOpenProfile`: nunca testados), **menos** com Excluir/Renomear aberto?
9. **O primeiro Cartão (#142, #161).** Com a chave conferida (passo 7) e um perfil aberto, marque uma Frase em inglês em Frases e aperte **Enviar ao Anki**: o progresso passa por “Criando cartões” e “Enviando ao Anki” e o
   resumo diz “+1 cartão”. No Baralho dos Ajustes de envio há a nota nova (etiqueta `perpetual_miner`), com o áudio da Frase (frente) e o da Palavra (verso)
   e a imagem; toque os dois (um 400 na Palavra é o risco 11, reserva no #174). Feche o painel e o Chrome logo ao apertar Enviar, espere um
   minuto e reabra: o resumo vem da Conexão. Na tela de perfis o Envio entra no marcado (8b). Enviar a mesma Frase de novo dá
   “1 já estava lá”, sem nota dobrada. O custo está em `user_files/custos/<jobId>/costs.jsonl` e na aba Custos; o log e o diagnóstico não têm a chave.
10. **O tipo de nota próprio e o Cartão Iniciante (#161, risco ALTO: cria tipos de nota na coleção). PENDING OWNER, num Anki em inglês e num em português (pt-BR).**
    Antes, copie a pasta do perfil. Instale a Conexão nova e **reinicie o Anki**: em Ferramentas › Gerenciar Tipos de Nota há “PerpetualMiner Inglês” e
    “PerpetualMiner Russo” (nenhum repetido, o “Básico”/“Basic” intacto, com os mesmos campos); num perfil sem Baralho nenhum aparecem `PerpetualMiner::Inglês`
    e `PerpetualMiner::Russo`, e com Baralho seu (CIMV, RUSSIAN) nenhum Baralho novo. Reinicie o Anki de novo: nada se repete. O próximo Anki pede
    sincronização completa **uma vez** (criar tipo de nota é mudança de esquema). Envie uma Frase em inglês e uma em russo: o Cartão tem a Frase e o áudio na frente
    e, no verso, pronúncia, literal (com as cores da Frase), natural e Contexto da cena em português, a Palavra com o áudio e a imagem; o Anki em inglês **não** falha
    com “note_type_missing”; reenviar a Frase dá “já estava lá”, também para a que está no “Básico” antigo. Nenhum Cartão antigo muda (compare a contagem e abra um).

`test_openai_de_mentira.py` não é teste: é a OpenAI de mentira (servidor local) no lugar da de verdade.

O `package` do manifesto (`perpetualminer`) é provisório: vira o id do AnkiWeb na publicação.

Os ensaios do item de login (“Abrir o Anki com o computador”, risco 5) e do abridor (“Abrir o Anki sozinho”, riscos 1 e 2 do #138) estão em
[`docs/design/ensaios-do-dono-da-conexao.md`](../docs/design/ensaios-do-dono-da-conexao.md).
