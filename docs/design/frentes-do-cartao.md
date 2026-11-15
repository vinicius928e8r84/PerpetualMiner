# As frentes do Cartão: Ouvir primeiro, Lacuna, Produção, Ditado e Criação (#166, #167, #168)

Continuação de [`tipo-de-nota-por-idioma.md`](tipo-de-nota-por-idioma.md) (o desenho do tipo de nota, os níveis do inglês e do russo, a prévia); está à parte porque aquele arquivo não pode crescer (o limite de tamanho dos arquivos). Fatia fechada: o código é `complemento/rotas_da_frente.py`, `tipo_de_nota.py`, `modelo_da_criacao.js`, `criacao_na_revisao.py`, `correcao_da_criacao.py` e `engine/estilos.json`; esta página guarda só as decisões e os limites.

Em Ajustes de envio › Estilo do cartão › Frente, cada idioma tem a sua frente. Trocar a frente **reescreve o único modelo de Cartão** do tipo de nota do idioma (frente, começo do verso, nome e estilo) e nada mais: nenhuma nota nova, nenhum Cartão novo, nenhuma chamada à IA, à voz ou às fotos, e os Cartões que já existem mudam na hora. Quem troca é a Conexão (`POST /anki/card-front`), e não o AnkiConnect. É um Cartão por Frase.

| frente (`frente`) | nome do modelo | frente do Cartão | começo do verso (o resto é o verso do nível, igual nas três) |
|---|---|---|---|
| Frase com áudio (`frase_com_audio`, padrão) | Frase com áudio | a Frase e o áudio dela | `{{FrontSide}}` |
| Ouvir primeiro (`ouvir_primeiro`) | Ouvir primeiro | só o áudio da Frase (o ▶, sem texto) | o ▶ e a Frase, com a Palavra em negrito |
| Produção (`producao`) | Produção | a Frase em português (a Tradução natural, que só o Iniciante preenche) e o campo de digitação do Anki (`{{type:Frase}}`) | a mesma frente, em que o Anki compara o que a pessoa escreveu com a Frase original, e o áudio da Frase |
| Ditado (`ditado`) | Ditado | só o ▶ e o campo de digitação (`{{type:Frase}}`) | a mesma frente, em que o Anki mostra o que errou letra por letra |
| Criação (`criacao`) | Criação | a Palavra com o áudio, a Dica e o campo onde a pessoa escreve (ver abaixo) | o que ela escreveu, “✓ usou a palavra” e o exemplo |
| Lacuna (`lacuna`) | Lacuna | a Frase sem a Palavra (`[…]`) e a Dica, **sem áudio** (ele entregaria a resposta) | a Frase e o áudio dela |

## Decisões

- **Produção e Ditado (#167) usam o campo de digitação do Anki**, apontado para o campo `Frase`; o verso repete a frente em vez de `{{FrontSide}}`, porque a comparação tem de estar no verso. O Anki compara com o texto do campo sem as marcas. Nenhum campo novo. O verso do russo sem a Frase (#163) não vale nelas nem na Ouvir primeiro: a Frase ainda não foi vista.
- **A Produção só é oferecida no Iniciante**, o único nível que preenche a Tradução natural (`AjustesDeEnvio.frenteDisponivel`; trocar o nível com ela escolhida volta à Frase com áudio). Uma Produção já salva num nível sem tradução continua marcada, e o Cartão mostra a Definição, para a frente nunca ficar só com o campo de digitar.
- **Os dois campos da Lacuna** (`Frase com lacuna`, `Dica`) o Envio grava em todo Cartão em que a Palavra está na Frase, qualquer que seja a frente do momento, sem IA (a lacuna é a Frase sem o texto em negrito, ou, no russo, sem a Palavra que o pedido deu; a Dica é a primeira parte preenchida do verso, `dica_da_lacuna` de `engine/estilos.json`). É assim que trocar de frente não gera nada. Quem não tem a lacuna (a Palavra não estava na Frase, ou o Cartão é de antes do #166) vê a Frase, sem áudio, na frente Lacuna; na Ouvir primeiro, um Cartão sem o áudio da Frase (o Envio de texto de antes do #143) aparece vazio.
- **O que a troca regrava**: o modelo e o estilo (`css`) do tipo de nota **da Conexão**, por inteiro; uma mudança que a pessoa fez à mão neles se perde. Um tipo de nota que não tem exatamente um modelo de Cartão não é tocado: `409 note_type_changed`, e a tela diz que a frente não mudou. Sem o tipo (a pessoa o apagou), ele nasce já com a frente.
- **A extensão**: `frente` mora em `ankiBridgePresets` por idioma. Salvar ajustes pede a troca à Conexão **antes** de gravar e só grava a frente nova se a Conexão a trocou; se não trocou, o resto é salvo e a escolha fica na tela, com “Tentar de novo”. A frente **não** vai no `POST /jobs`.

## A Criação (#168)

A 6ª frente: a pessoa escreve uma frase **dela** com a Palavra. Mesmo mecanismo da troca, sem custo; o modelo leva um script e o estilo (`CSS_DA_CRIACAO`) só entra com essa frente.

- O campo de digitação do Anki não serve (ele compara com uma resposta certa): o script guarda o que a pessoa escreve pelo padrão “Anki Persistence”. Se a página não guardou nada (o celular recarregou), o verso lê o campo **Frase escrita**.
- **O “✓ usou a palavra” é calculado no próprio Cartão**, sem IA: vale a Palavra ou o radical (no russo, uma palavra que **contenha a Raiz**; o Iniciante não a tem). Formas irregulares (gave ≠ give) não contam; é uma leitura do worker, ainda não confirmada pelo dono.
- **O gancho da revisão** (`complemento/criacao_na_revisao.py`) grava a frase, como texto (HTML escapado, até 2000 caracteres), no campo **Frase escrita** da nota em revisão, **só** se ela é de um tipo de nota da Conexão e só no Anki do computador. Durante uma sincronização ou noutro perfil nada é gravado e a revisão segue. No AnkiMobile e no AnkiDroid só o “✓” funciona (BRG-44.notaCriacao).

### A correção da Criação (#169)

No **próximo Envio** do idioma, depois dos Cartões, a IA corrige as frases escritas (`complemento/correcao_da_criacao.py`, o prompt `engine/prompts/correcao_da_criacao.txt`, que o arquivo do dono em `user_files/prompts` também troca).

- **Quem entra**: toda nota com a **Frase escrita** não vazia e **diferente do Escrito antes** (a frase que a IA leu da última vez: uma frase já corrigida não é corrigida nem paga de novo). Até 20 por Envio (`LIMITE_POR_ENVIO`). **Escrito antes** e **Correção** guardam o que a IA leu e devolveu; a Frase escrita não muda.
- **O verso** mostra “Da última vez você escreveu … → …” (BRG-44.cartaoAntes). Quando o Envio grava a primeira correção e o tipo de nota ainda tem **só** o nosso modelo Criação, o modelo é regravado; um tipo que a pessoa mexeu não é tocado.
- **Quem paga**: a chave da OpenAI ou o plano do ChatGPT, como o texto; o teto do mês vale (no teto, a correção espera o próximo Envio). Um pedido por frase, e um registro `correction_tokens` por frase nos custos (modelo e tokens; **nunca a Palavra nem as frases**), mostrado como **Correção das frases** (BRG-29.correcao).
- **Extra do Envio: não derruba o Envio.** A IA que recusa, o plano no limite, o teto, a coleção ocupada ou sem os campos e a falta de chave deixam as frases para o próximo Envio, sem erro na tela. Uma resposta vazia não marca a frase como lida.

## Limites aceitos

- Quem muda a frente em duas abas ao mesmo tempo pode deixar o gravado diferente do Anki até a próxima troca (a Conexão troca antes da conferência de versão do Salvar).
- “Usar um tipo que já tenho” (#165) fica com a frente que a pessoa já tem; a Imagem primeiro não existe.
- Medido com a biblioteca de verdade do Anki (`pip install anki`, 25.09.5): depois de trocar quatro vezes, as notas, os Cartões e o `scm` ficaram os mesmos. Não repetido no Anki do dono nem em 2.1.50.
- **Risco 7 (ensaio do dono)**: o gancho, o “Anki Persistence”, o `text:` e os campos escondidos **não foram vistos num Anki real**, nem a correção com a OpenAI de verdade; o roteiro está em `ensaios-do-dono-da-conexao.md`.
- As referências visuais (`painel-ajustes-frente-visual.spec.js`, `painel-custos-correcao-visual.spec.js`) são propostas (`test.fixme`) até o dono olhar.
