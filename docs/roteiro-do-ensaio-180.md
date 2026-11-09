# Roteiro do ensaio de ponta a ponta (#180)

Um só roteiro para o dono executar com uma pessoa nova, num **Mac** e num **Windows** limpos, e marcar o resultado de cada um dos 14 itens do #180 (riscos 1 a 13 do mapa #138). O agente só escreveu este arquivo: **o ensaio e o envio à loja são do dono**. Cada afirmação aponta o arquivo ou o ticket de onde veio; onde o repositório não prova, está dito.

Cada falha vira um **ticket novo**, que não reabre o #180. Anote em cada item: sistema, navegador, versão do Anki, data, e *passou*, *falhou* ou *não deu para testar*.

## 0. A ordem real (antes de qualquer passo)

| Ordem | O que | Estado | Onde está |
|---|---|---|---|
| 1 | Os tickets que o #180 lista em “Blocked by” | conferir no #180 | `gh-axi issue view 180` |
| 2 | **#177**, a atualização em silêncio pelo AnkiWeb | fechado: na `main` e provada num Anki real (PRs #319, #329, #349, #358); **Windows e Anki 2.1.50/26.09 ficam para este ensaio** | [comentário de fechamento](https://github.com/vinicius928e8r84/PerpetualMiner/issues/177#issuecomment-6741614107); `docs/ankiweb/LEIA-ME.md` |
| 3 | O ensaio deste roteiro (Mac e Windows, pasta descompactada ou loja) | do dono; **não depende** de #192 nem de P6 | seções 1 a 3 |
| 4 | **#192**, a credencial de pareamento da Conexão | **aberto**; a loja o exige | `docs/publicar-chrome-web-store.md` § Gate de publicação; `docs/seguranca/chave-da-openai.md` |
| 5 | **P6**, as regras reais do Firestore, publicadas e comprovadas | **PENDING OWNER**; fake e CI não encerram | `docs/seguranca/chave-da-openai.md` § Regras Firestore; mesmo gate |
| 6 | Pacote, upload e revisão da loja | do dono, **só depois de #192 e P6** | `docs/publicar-chrome-web-store.md` §§ 2 a 7 |

**A loja exige #192 e P6** (e o gate vale mesmo que este ensaio passe): não publique a versão na Chrome Web Store antes dos dois (`docs/publicar-chrome-web-store.md`). O ensaio pode rodar antes, pela pasta descompactada, que tem o mesmo ID do item da loja (`docs/instalar-extensao.md`).

## 1. O que preparar

- Um Mac e um Windows sem a extensão, sem o Anki ou com o Anki sem a Conexão, e uma pessoa que nunca viu o produto.
- Os navegadores: Chrome no Mac; Chrome e **Opera** no Windows.
- O Anki: a versão atual nos dois, e uma máquina (ou perfil de teste) com o **Anki 2.1.50** (item 9). Use sempre um **perfil de teste** do Anki, copie a pasta do perfil antes (`complemento/LEIA-ME.md`, passo 10).
- Uma conta Google da pessoa nova; uma chave da OpenAI de um projeto com limite de gasto; uma conta ChatGPT Plus ou Pro e, se houver, uma grátis ou Go (item 10).
- A versão do pacote: `node scripts/empacotar-extensao.mjs` (`docs/publicar-chrome-web-store.md` § 2). O `.ankiaddon` vai dentro do zip.

## 2. O caminho da pessoa nova (Mac e Windows, o mesmo)

Faça os passos 1 a 6 duas vezes: primeiro pela **loja** e depois pela **pasta descompactada**, com o mesmo login Google (itens 1 e 2). Se a loja ainda não aprovou, faça só a pasta e marque o item 14 como pendente.

1. **Instalar.** Loja: abra o link do item e adicione ao navegador. Pasta: `docs/instalar-extensao.md`. No Opera do Windows use o complemento “Install Chrome Extensions” (`docs/publicar-chrome-web-store.md` § 7). *Deve aparecer:* a extensão na lista de extensões, com o ID `ohpoogiccjmdgilgegholdidgfhjkadf`. *Se falhar:* anote o que o navegador disse. Antes de testar a loja, remova a cópia da pasta: as duas têm o mesmo ID e o documento de publicação manda removê-la (§ 7).
2. **Entrar com o Google.** *Deve aparecer:* a conta no painel e as Frases voltando por sync. *Se falhar:* o endereço `https://ohpoogiccjmdgilgegholdidgfhjkadf.chromiumapp.org/` não está no cliente OAuth (§ 3 do documento de publicação).
3. **Ligar a Conexão com o Anki.** Siga a tela da primeira conexão (a Boas-vindas ou a área Conexão com o Anki): baixar o arquivo, abri-lo no Anki, reiniciar o Anki. Não rode comando no terminal. *Deve aparecer:* a tela conferindo sozinha e achando o Anki, com o perfil e a versão. *Se falhar:* `complemento/LEIA-ME.md` § Ensaio do dono, no Mac, passos 1 a 8 (o log do complemento em `user_files` diz por quê).
4. **Permitir abrir o Anki sozinho** (a permissão opcional `nativeMessaging`). *Deve aparecer:* o aviso de permissão do navegador e depois o passo concluído. Detalhes: item 3.
5. **Configurar a IA e o nível.** Cole a chave da OpenAI (ou entre com o ChatGPT) e faça o quiz de nível ou escolha o nível. *Deve aparecer:* a chave conferida só com os 4 últimos caracteres. *Se falhar:* anote o Detalhes da tela.
6. **O primeiro Cartão.** O último passo da Boas-vindas envia um Cartão sozinho. *Deve aparecer:* o Cartão no Anki, no Baralho e no estilo escolhidos, com a etiqueta de teste, e o mesmo passo repetido **não** duplica Baralho, tipo de nota nem Cartão (`complemento/LEIA-ME.md`, passos 9 e 10). *Se o Anki pedir sincronização completa:* **cancele e avise**; é o sinal de parar (passo 10).

## 3. Os 14 itens

Marque um resultado por item. “Como” aponta o roteiro já escrito; este arquivo não o repete.

| # | Item | Risco | Mac | Windows | Como e o que já se sabe |
|---|---|---|---|---|---|
| 1 | Instalar pela loja e pela pasta descompactada, com o mesmo login Google | — | ☐ | ☐ | Passos 1 e 2 acima; `docs/instalar-extensao.md` |
| 2 | O mesmo caminho no Mac e no Windows | — | ☐ | ☐ | Os passos 1 a 6 acima, nos dois |
| 3 | O abridor no **Opera do Windows** (risco 1) e no **Mac** (risco 2) | 1 e 2 | ☐ (risco 2) | ☐ (risco 1) | `docs/design/ensaios-do-dono-da-conexao.md` § Abrir o Anki sozinho, passos 3 (Mac) e 5 (Opera). Risco 1: já **verificado no Opera GX 136** em 2026-10-10 (tabela do mesmo arquivo); outros builds, o fluxo do painel e a aceitação do dono seguem **PENDING OWNER**. Risco 2: **PENDING OWNER**, nunca testado num Mac de verdade; se o macOS perguntar algo, anote o texto |
| 4 | Fechar à força (30 s) e o `meta.json` | 3 | ☐ | ☐ | `docs/design/ensaio-do-conserto.md`, cenários 1, 7 a 12; no Windows leia o `.ps1` pela tabela “Só no Windows” (ele nunca rodou além de `conferir`). Custo aceito: pode perder o Cartão que estava sendo editado. Use perfil de teste |
| 5 | Entrar no perfil (tela de perfis e troca de perfil) | 4 | ☐ | ☐ | `complemento/LEIA-ME.md`, passo 8b (nunca testado no Anki real) |
| 6 | O item de login “Abrir o Anki com o computador” | 5 | ☐ | ☐ | `docs/design/ensaios-do-dono-da-conexao.md` § Abrir o Anki com o computador (LaunchAgent no Mac, atalho em `shell:startup` no Windows) |
| 7 | A atualização pelo AnkiWeb | 6 | ✔ #177 | ☐ | #177 (fechado) tem a atualização em silêncio na `main`, provada num Anki real: a troca da 0.4.20 para a 0.4.21 sem diálogo (PRs #319, #329, #349 e #358; [comentário de fechamento](https://github.com/vinicius928e8r84/PerpetualMiner/issues/177#issuecomment-6741614107), que não nomeia o sistema). **Windows e Anki 2.1.50/26.09 faltam.** Como ensaiar: `docs/ankiweb/LEIA-ME.md` § A atualização em silêncio. Em aberto: os termos do AnkiWeb sobre um complemento que se atualiza sozinho (nenhum agente os leu; a conclusão **não está registrada**). Instalada por arquivo com o `package` antigo, a Conexão não tem de onde atualizar |
| 8 | O gancho da Criação e o AnkiMobile/AnkiDroid | 7 | ☐ | ☐ | `docs/design/ensaios-do-dono-da-conexao.md` § a frente Criação (#168), passos 1 a 7. No celular só o “✓ usou a palavra” funciona; o campo da frase não muda |
| 9 | O Anki **2.1.50** e o Python 3.9 | 8 | ☐ | ☐ | O piso nunca foi testado no Mac do dono (`docs/ankiweb/LEIA-ME.md` § Riscos que seguem abertos). A biblioteca do Anki 2.1.50 já foi medida para o tipo de nota (`complemento/LEIA-ME.md`, passo 10); o ensaio de verdade é instalar a Conexão e mandar o primeiro Cartão nele |
| 10 | O plano com 10 a 20 Cartões, o consumo e a conta **grátis ou Go** | 9 | ☐ | ☐ | `docs/design/imagem-pelo-plano.md` § A conta grátis ou Go; a prova com Plus/Pro e com a conta grátis é o **#288** (aguarda assinatura). Anote quantos Cartões saem e o uso em Gerenciar uso; os 429 logo depois do primeiro login não devem concluir que a cota acabou |
| 11 | A imagem gerada | 10 | ☐ | ☐ | `docs/design/imagem-do-cartao.md` § Ensaio do dono, no Mac (#269): foto real e depois imagem gerada; a gerada sempre sai pela chave |
| 12 | A voz da Palavra | 11 | ☐ | ☐ | `complemento/LEIA-ME.md`, passo 9 (toque os dois áudios); `docs/design/audio-do-cartao.md`. O 400 do `translate.google.com` só apareceu no Mac do dono; a reserva deve falar. Anote se o Google limita pedidos seguidos |
| 13 | O **App Nap** (só Mac) | 12 | ☐ | — | `docs/design/ensaio-do-conserto.md`, cenário 14: Anki em segundo plano por mais de 10 min; nada deve ser fechado. Foi visto num Mac só, por 6,6 min (#138, risco 12) |
| 14 | O **tempo de revisão da loja** | 13 | ☐ | ☐ | Anote as datas de envio e de resposta; o tempo com `nativeMessaging` opcional é desconhecido (`docs/publicar-chrome-web-store.md` § 8, item 11). Falta instalar pela loja no Opera do Windows (item 1). Antes de a página do AnkiWeb ir ao ar, o link de suporte precisa abrir sem login (`docs/ankiweb/LEIA-ME.md`) |

Os 14 itens seguem a ordem dos critérios de aceite do #180; o item 3 junta os riscos 1 e 2, e os riscos 1 a 13 aparecem todos.

## 4. Fechando o ensaio

1. Para cada ☐ que falhou, abra um ticket novo com o sistema, o navegador, a versão do Anki, o passo e o que apareceu (o pacote de diagnóstico da Conexão, quando houver). Não reabra o #180.
2. Registre os resultados nos arquivos de origem (por exemplo a tabela de `docs/design/ensaios-do-dono-da-conexao.md`), com sistema, navegador, data e a confirmação do dono: é o que o próprio arquivo pede para fechar o #147.
3. Com #192 e P6 provados (seção 0), siga `docs/publicar-chrome-web-store.md`: aumentar a `version` no `manifest.json`, empacotar e enviar. Atualize a Conexão no Anki **antes** da extensão (a ordem está no gate do documento).

## 5. O que fica de fora

- **Linux, Firefox e Safari** (#138, Out of Scope).
- **A rota do programa instalável** e o Cartão feito na extensão (rotas A e B).
- **O ranking do grupo em escala** e outros provedores de IA (#11).
- **Trocar o desinstalador da Conexão antiga** e a passagem do Windows de hoje, que só serve ao PC do dono.
- **O que o ensaio não prova**: os termos do AnkiWeb (item 7), as regras do Firestore (P6) e o pareamento (#192) são passos à parte, listados na seção 0: a loja só vem depois deles.
