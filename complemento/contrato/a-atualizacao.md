# A atualização da Conexão pelo AnkiWeb (#177)

A Conexão se atualiza sozinha pelo AnkiWeb (`complemento/atualizacao.py`); os exemplos estão em `exemplos-da-atualizacao.json`. O `contexto` tem dois campos novos:
`atualizacao`, o que a Conexão tem guardado da última vez (`instalada`: uma versão nova já está no disco; `falhou`; `atualizada`: a Conexão que roda acabou de vir de
uma atualização), e `ankiweb`, como o AnkiWeb de mentira responde ao Atualizar agora (`com_versao_nova`, `sem_versao_nova`, `recusa`); sem `ankiweb` a Conexão não tem de onde
atualizar nem o que fechar (`503 restart_unavailable`). A saúde só leva `atualizacao` quando há o que dizer.

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /health` | | com o que dizer: `atualizacao: { estado: instalada \| falhou \| em_dia, versao, atualizada }` (`versao` é a que ficou no disco em `instalada`, e a que roda nos outros; `atualizada` é a versão que roda quando veio de uma atualização) |
| `POST /atualizacao/agora` | `{}` | consulta o AnkiWeb e instala o que houver; responde `{ estado, versao, atualizada }` como acima (`falhou` não é erro HTTP) |
| `POST /atualizacao/reiniciar` | `{}` | `{ ok: true }`: o Anki é fechado pelo caminho normal dele; quem o abre de novo é o abridor, a pedido da extensão. `503 restart_unavailable` quando o Anki não entregou o pedido |

Os pedidos da extensão são `PedidoAoAnki.atualizarAConexao` e `PedidoAoAnki.reiniciarOAnki`.
