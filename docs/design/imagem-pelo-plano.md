# Página de desenho: o resto do plano do ChatGPT, a imagem do Cartão, a conta grátis e o primeiro limite (#156)

Continuação de [login-do-chatgpt.md](login-do-chatgpt.md) (#155) e de [imagem-do-cartao.md](imagem-do-cartao.md) (#144). Não há rota nova nem pedido novo entre a extensão e a
Conexão com o Anki: o estado do login ganha um valor (`falha: "chatgpt_not_eligible"`) e o Envio já gravava `chatgpt_usage_limit` e `chatgpt_not_eligible`
em `lastError` e no Cartão (`complemento/contrato/exemplos-do-chatgpt.json` tem os três exemplos novos, lidos pelo fake do e2e e pelo servidor real).

**Risco da fatia.** Nenhuma credencial nova nasce, é guardada ou registrada, e nada se registra no sistema: o token do login (#155) é lido por mais um
pedido (o juiz de imagem), no mesmo servidor (`OPENAI_BASE`) e pela mesma função (`LoginDoChatGPT.token`, com a tranca e a renovação). A extensão ganha
um dado só, `pm_plano_do_chatgpt_avisado` (um booleano: o aviso da primeira vez já foi dado neste computador).

## O Cartão com o plano (história 30, 31)

O texto continua pela Responses API (#155). A imagem (`imagem_do_cartao.py`, `credencial_da_imagem`) lê, antes de cada Cartão e só para ele, o login
(renovado) e a chave do cofre:

| ajuste | login | chave | o juiz de imagem | a triagem e a imagem gerada |
|---|---|---|---|---|
| Foto real (`"1"`) | sim | sim | **Responses API pelo plano** (`text.format` `json_object`, a foto como `input_image`) | pela chave, como antes; a foto disputa com a gerada |
| Foto real (`"1"`) | sim | não | pelo plano | nenhuma: `generation_policy="free_only"`, o Cartão leva a foto real que passou do mínimo ou fica sem imagem |
| Gerada por IA (`"2"`) | sim | sim | — | pela chave |
| Gerada por IA (`"2"`) | sim | não | — | nenhuma: o Cartão fica sem imagem e nada é pedido à OpenAI (o ajuste é só a gerada, e ela precisa da chave) |
| qualquer | não | sim | pela chave (chat completions), como antes | pela chave |

A imagem gerada **nunca** vai pelo plano. O juiz pelo plano não grava custo em US$ (o plano não é pago por Cartão, como o texto). Uma foto que o plano
não lê (`400 invalid_image_format`) descarta as candidatas, como na chave.

**Quando o plano para a imagem.** O limite de uso, a conta que o plano não atende, o login recusado ou acabado (`chatgpt_usage_limit`, `chatgpt_not_eligible`,
`chatgpt_rejected`, `chatgpt_signed_out`) no juiz levantam `ParaOEnvio`: o Cartão fica `failed` com o código, **o texto pago fica** e o Envio para. O Tentar de novo
(`/jobs/retry`) refaz só o que falta: a imagem e a nota. Sem isso o Cartão seguiria sem foto sem ninguém saber, e o Tentar de novo não teria o que melhorar.
O erro passageiro do plano (rede, 5xx, 429 sem código do plano) é pedido de novo como o da chave (`REPETICOES_DA_IMAGEM`); se continua, **com chave** o juiz da chave decide
(o aviso fica no log, com o código) e **sem chave** o Cartão segue sem imagem (“só a imagem falha”).

## A conta grátis ou Go e o primeiro 429 (histórias 27 e 36)

- **Risco 9 (`400 invalid_grant` sem segunda tentativa).** Uma troca do código recusada com `invalid_grant` pode ser um código gasto ou uma conta que o plano não atende;
  uma só recusa não prova a segunda. A primeira deixa o estado em `chatgpt_login_failed` (“Tente de novo”); a **segunda seguida** vira `chatgpt_not_eligible`: a faixa da
  coluna diz que o plano não serve para a conta grátis ou Go e que a chave é o caminho (CFG-35, com Usar a chave, que põe o foco no campo da chave). Um login que dá certo,
  qualquer outra resposta ou o Sair zera a conta. Quem prova o que a OpenAI faz com uma conta grátis ou Go de verdade é o #288; aqui só o servidor de login de mentira.
- No Envio, `subscription_sharing_user_not_eligible` grava `chatgpt_not_eligible`: o resumo e o cartão do Envio dizem a mesma coisa e levam à chave (Usar a chave).
- **O primeiro limite de uso.** O plano recusou duas vezes com 429 logo depois do primeiro registro (o risco do plano, na spec): `subscription_sharing_usage_limit_exceeded`
  chega como `chatgpt_usage_limit`, igual ao limite de verdade. A tela (ENV-20) não afirma que a cota acabou: diz que o ChatGPT recusou por limite de uso, que logo depois de entrar
  isso pode acontecer sem a cota ter acabado, e oferece **Gerenciar uso** (`chatgpt.com/settings/usage`) e **Tentar de novo**. O limite de verdade, com o que falta e quando volta, é o #158.

## O modal da primeira vez (história 29)

Na primeira vez que a coluna lê o login como conectado, o modal “Você está usando o seu plano do ChatGPT” (CFG-35, P2 do #101; as diretrizes da OpenAI o pedem) diz de onde
sai o uso. Entendi, Esc e o clique fora o dão por visto: `pm_plano_do_chatgpt_avisado: true` no storage da extensão, só neste computador, e ele não volta.

## O plano sem chave (história 31)

Conectado e sem chave guardada, a coluna do ChatGPT diz que o cartão sai com foto real ou sem imagem gerada (CFG-35.semChave); com a chave, a nota some.

## Provas

| o quê | teste | o que não prova |
|---|---|---|
| o juiz pela Responses API (o pedido, o `json_object`, as fotos, o token do login, nada pelo chat) e a foto que ele escolhe no Cartão | `complemento/test_imagem_pelo_plano.py`, `engine/test_openai_http.py` | o plano de verdade (#288) e a imagem gerada fora do motor de hoje (risco 10, #269) |
| a imagem gerada pela chave com o login, a triagem e a geração pela chave | `test_imagem_pelo_plano.py` | — |
| o plano sem chave: foto real, sem foto que preste, sem foto nenhuma, só a gerada pedida | `test_imagem_pelo_plano.py` | — |
| o limite de uso no juiz para o Envio, sem pagar o texto de novo, e o Tentar de novo termina o Cartão; a conta que não serve | `test_imagem_pelo_plano.py` | — |
| a segunda troca recusada com `invalid_grant` diz que o plano não serve | `complemento/test_login_do_chatgpt.py` | uma conta grátis ou Go de verdade |
| o estado e o Envio parado no contrato, nos dois lados | `exemplos-do-chatgpt.json`, `test_servidor.py`, `test_fake_anki.js`, `test_contrato_fechado.js` | — |
| o modal, a conta grátis ou Go, o plano sem chave | `e2e/tests/configuracoes-chatgpt-plano.spec.js` | a aprovação visual |
| o limite de uso e a conta que não serve no resumo e no cartão do Envio | `e2e/tests/painel-envio-plano.spec.js` | — |
| as referências visuais | `configuracoes-chatgpt-visual.spec.js`, `painel-envio-visual.spec.js`: `test.fixme` sem PNG até o dono aprovar | a aprovação |
| um Cartão com imagem feito pelo plano numa conta Plus ou Pro | ensaio do dono (#288, #269) | — |
