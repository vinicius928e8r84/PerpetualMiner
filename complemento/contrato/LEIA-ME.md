# O contrato da Conexão com o Anki

`exemplos.json` é o conjunto único de pedidos e respostas entre a extensão e a Conexão
com o Anki (o complemento do Anki, em `127.0.0.1:8766`). Dois lados leem o mesmo arquivo:

- **o complemento**: `python3 complemento/test_servidor.py` sobe o servidor real e confere
  cada exemplo (rode também no 3.9, o Python do Anki do Mac);
- **a extensão**: o fake da Conexão do e2e (`e2e/fakes/anki.js`) responde pelos exemplos,
  e `e2e/tests/contrato-da-conexao.spec.js` confere o fake contra eles.

Mudar só um lado quebra um teste, e a mensagem diz o exemplo e os dois arquivos.

## Um exemplo

```json
{
  "nome": "saúde com um perfil aberto",
  "daExtensao": true,
  "contexto": { "perfil": "Usuário 1" },
  "pedido": { "metodo": "GET", "caminho": "/health", "origem": null },
  "resposta": { "status": 200, "json": { "ok": true, "versao": "0.1.0", "perfil": "Usuário 1" } }
}
```

- `daExtensao`: o pedido é um que a extensão faz de verdade. O e2e confere o fake contra esses; os
  outros (outro site, outra extensão, sem origem) só o lado do complemento confere, porque uma
  página da extensão não consegue pedir como outro cliente.
- `contexto`: em que situação o complemento está (hoje, o `perfil` aberto; `null` é a tela
  de perfis). O fake muda de contexto por `fakes.anki.abrirPerfil(...)`.
- `pedido`: o que chega, com `origem` (o cabeçalho `Origin`; `null` é que ele não veio). Rotas com corpo
  ganham `corpo`.
- `resposta`: o status e o JSON.

## Quem o complemento atende

O complemento gasta a chave da OpenAI, então a regra é a da origem da extensão
(`chrome-extension://<id>`), e o que o Chrome manda de verdade (visto numa extensão real contra o servidor real) decide o resto:

- o **POST** (e o PUT) de uma página da extensão leva `Origin: chrome-extension://<id>`, que ninguém falsifica;
- o **GET** de uma página da extensão, com permissão de host, vai **sem** `Origin`, e é igual ao GET de
  qualquer outra extensão com a mesma permissão (credenciais, cabeçalho próprio e `mode: cors` não mudam isso).

Por isso (decisão do dono, opção B):

1. **`GET /health` é aberto**, sem `Origin`: só diz a versão e o perfil, a quem pedir (qualquer cliente local).
   Com um `Origin` que não é o da extensão, até a saúde é recusada.
2. **Todo o resto exige a origem da extensão.** Sem `Origin`, ou com a de outra extensão ou site, é 403
   (`origin_not_allowed`). Por isso rota que gasta a chave ou lê dado da pessoa (a chave, os custos, o
   vocabulário, os Envios) é **POST**, nunca GET.
3. Fica para a primeira rota de leitura sensível decidir entre POST para as leituras autenticadas
   e um token de pareamento (a extensão o recebe por um POST e o manda nos GET).

Rota nova que deva responder sem origem entra em `ROTAS_ABERTAS` (`servidor.py`) só com essa decisão.

## Como uma rota nova entra

1. Escreva os exemplos dela aqui (o caso feliz, cada erro que a extensão trata e, se muda
   com a situação do Anki, um por `contexto`), **antes** de escrever a rota.
2. Rode `python3 complemento/test_servidor.py`: o exemplo novo falha até a rota existir
   (`ROTAS` em `servidor.py`).
3. Rode `cd e2e && npx playwright test contrato-da-conexao`: ele falha até o fake responder.
   O fake responde pelo exemplo (`respostaDoContrato` em `e2e/fakes/anki.js`); só estados novos
   (um `contexto` novo, uma fila) pedem código no fake.
4. Uma rota que já existe na Conexão de hoje (`bridge/server.py`) entra com o formato que a
   extensão já lê; a regra é a de “o mesmo contrato HTTP”, e o exemplo é a prova.
