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
  "contexto": { "perfil": "Usuário 1" },
  "pedido": { "metodo": "GET", "caminho": "/health", "origem": null, "secFetchSite": "none" },
  "resposta": { "status": 200, "json": { "ok": true, "versao": "0.1.0", "perfil": "Usuário 1" } }
}
```

- `contexto`: em que situação o complemento está (hoje, o `perfil` aberto; `null` é a tela
  de perfis). O fake muda de contexto por `fakes.anki.abrirPerfil(...)`.
- `pedido`: o que chega, com `origem` (o cabeçalho `Origin`) e `secFetchSite` (o `Sec-Fetch-Site`);
  `null` quer dizer que o cabeçalho não veio. Rotas com corpo ganham `corpo`.
- `resposta`: o status e o JSON.

## Quem o complemento atende

Só a extensão. O Chrome manda o GET de uma página da extensão (com permissão de host) **sem**
`Origin` e com `Sec-Fetch-Site: none`; o POST leva `Origin: chrome-extension://<id>` (visto
numa extensão real contra o servidor real). Por isso o complemento atende:

1. um `Origin` igual ao da extensão; ou
2. nenhum `Origin`, com `Sec-Fetch-Site: none`.

Recusa (403, `origin_not_allowed`) qualquer outra origem, uma página de outro site sem `Origin`
(cross-site ou same-site) e quem não manda cabeçalho de navegador. Os exemplos de recusa só o
lado do complemento confere: uma página da extensão não consegue pedir como outro site.

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
