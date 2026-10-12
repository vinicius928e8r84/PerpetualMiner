# Modelo de desenho para uma fatia ALTA

Uma página curta, escrita **antes do código**, quando a fatia mexe em credencial, em sync ou em estado que vive em mais de um processo (a extensão, a Conexão com o Anki, a nuvem, outro perfil do Chrome). Serve para a revisão pegar a classe do erro na página, e não em cinco rodadas de código. Não retroage: as fatias já entregues não precisam dela.

Cada fatia ALTA copia a estrutura abaixo para uma página sua (na descrição do PR ou ao lado da spec) e responde a todas as seções. Uma seção sem resposta é a revisão pedindo a resposta, não um item a pular.

## 1. Dono único de cada dado

Uma tabela, uma linha por dado: **quem é o dono**, quem só guarda um resumo, e o que cada cópia nunca pode ser. Regra: se duas linhas parecem donas do mesmo dado, o desenho está errado, e a correção é tirar uma cópia, não sincronizar as duas.

Exemplo, tirado de [`docs/seguranca/chave-da-openai.md`](../seguranca/chave-da-openai.md) (Opção B, PR #204):

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| a chave inteira da OpenAI | a Conexão (`user_files/chaves/openai.json`) | a nuvem replica entre computadores (`usuarios/{uid}/segredos/openai`) | a extensão não guarda a chave nem a lê inteira da nuvem |
| resumo público (`ultimos4`, `conta`, `versao`, `naoEnviada`) | a Conexão | cache em `chrome.storage.local.pm_chave_openai` | segredo: o cache só se relê do dono |
| sessão Firebase | a extensão (IndexedDB `pm-sessao`) | nenhum | legível pelo content script |
| UID e bearer do sync | o pedido em curso | nenhum | URL, resposta, log ou telemetria |

## 2. Estados

Os estados que o dono pode ter, um nome para cada um, e o que a tela diz em cada um (cópia do catálogo da Voz, regra C8: a tela diz o estado verdadeiro). Para a chave: sem chave; chave confirmada e vinculada a uma conta; chave sem conta (legada ou `conta: ''`); chave com mudança não enviada; chave apagada (valor vazio com hora nova); estado não versionado do complemento antigo.

## 3. Transições

Uma linha por transição: **quem a pede, o que ela lê antes, quem a aceita, o que muda e o que não pode mudar**. Responda também: qual é a base observada que o pedido leva (a revisão, e não uma geração reservada pelo cliente); o que acontece com o mesmo pedido repetido; o que acontece se a resposta se perder. Exemplo: confirmar a mesma chave inteira na revisão atual é leitura idempotente; uma base antiga recebe 409; só o dono avança `versao`.

O que o desenho precisa dizer sobre a falha, sem exceção:

- a transição **atômica** (arquivo, tranca): onde ela começa e termina;
- o que acontece entre dois passos que cruzam processos (a extensão confirma, a Conexão grava, a nuvem recebe) se um deles não responde;
- quem tem permissão de reverter, e por qual caminho. Se ninguém tem, escreva isso.

## 4. As 8 variantes

Toda fatia ALTA da Conexão é provada nas 8 variantes abaixo, ou diz por escrito qual não se aplica e por quê. A mesma lista está na skill [`verify-perpetualminer`](../../.agents/skills/verify-perpetualminer/SKILL.md) (§ The 8 variants of the Conexão), com como cada uma é reproduzida hoje no e2e.

| # | variante | o que muda para o desenho |
|---|---|---|
| 1 | sem Conexão | a ausência da Conexão opcional não cria erro nem alegação de sucesso |
| 2 | Anki fechado | nada responde na 8766; o painel não afirma o que não leu |
| 3 | complemento antigo | o estado não versionado (0.1.0) pede atualização e não recebe mutação |
| 4 | bridge Flask na 8766 | a rota nova responde 404; o bearer não é enviado, e a pendência pede atualização |
| 5 | dois perfis ou contas numa Conexão | um dono local só; a saúde de B não dispara sync de A |
| 6 | quem vem da `main` | estado legado sem UID: nada é vinculado sozinho, a pessoa escolhe |
| 7 | resposta perdida ou painel fechado | o painel relê o dono; não existe rascunho secreto nem cópia antiga a restaurar |
| 8 | pedido repetido | reentrega do mesmo valor é leitura: sem revalidar, sem regravar, sem avançar a revisão |

## 5. Limites

Os limites que a fatia **aceita** e o dono (o capitão) já viu, cada um com um nome e o lugar onde estão escritos, para a revisão não os reabrir como defeito. Exemplos do desenho da chave: ACL do arquivo no Windows herdada da pasta; a Conexão não autentica o cliente nem o listener (#192, antes da publicação na loja); `em` depende do relógio dos computadores; dois perfis no mesmo computador dividem uma chave. O que não está nesta seção e a revisão achar é achado, não limite.

O texto completo dos limites fica no documento de ameaça do assunto (para a chave, `docs/seguranca/chave-da-openai.md`); esta página só aponta para ele.

## 6. Provas

Para cada transição e cada variante, o teste que a prova (e2e dirigindo o Chromium real, ou o servidor real do complemento com provedores externos falsos) e **o que o teste não prova** (login real, Anki real, Windows). A lista de provas da chave está em `.agents/skills/verify-perpetualminer/features/ia.md` e em `complemento/contrato/LEIA-ME.md`.

## Quando a página é obrigatória

Quando a fatia mexe em **credencial**, em **sync** ou em **estado em mais de um processo**. A página é revisada antes do código. Este arquivo define só o formato.
