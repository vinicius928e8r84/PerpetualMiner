# PR #204 — Opção B (antes do único push)

## Dono e estados restantes

Há **um dono local por Conexão**, `user_files/chaves/openai.json`: `{ chave, conta, versao, em, naoEnviada }`. O valor é uma chave ou vazio; a única flag distingue mudança ainda não replicada / replicada. São quatro combinações, não filas por UID. Arquivo ausente é o estado vazio inicial. UID vazio identifica uma configuração local sem Google; UID `null` no resumo identifica um legado cujo vínculo ainda não foi provado, bloqueado para exportação automática.

A extensão mantém **um cache público** `{ ultimos4, conta, versao, naoEnviada }`. A flag é a projeção do dono, não outro árbitro. Chave digitada e UID/bearer existem apenas no pedido transitório. A sessão Firebase fica no IndexedDB da origem da extensão, inacessível ao content script. Firestore replica `{ chave, em }` por UID; valor vazio representa ausência, não um arquivo/mapa de marcas por conta.

## Invariantes

- Apenas uma mudança aceita no dono avança a revisão; recusa OpenAI não reserva nada. CAS usa a revisão observada. Reenvio idêntico com a base da aceitação retorna o sucesso armazenado, sem OpenAI, revisão ou escrita, inclusive após reiniciar; não desfaz mudança posterior.
- UI lê o resumo real depois da operação, não inventa vazio nem restaura a chave antiga. Leitura HTTP + escrita do cache são serializadas entre abas. Confirmação de cópia anterior é invalidada antes de mutar; falha do cache deixa resultado incerto, não alegação de que a chave continua ou de que foi apagada.
- Sync usa a tranca do dono e UID capturado da sessão privada. Uma chave sem conta não pertence ao primeiro UID que pede sync: permanece no dono e exige nova confirmação explícita naquela conta antes de exportar. A mudança não enviada de A impede substituição automática por B: é necessário terminar em A. Depois disso B pode substituir o dono com sua chave, mesmo mais antiga. Trocar/apagar explicitamente são novos comandos ao único dono.
- Na mesma conta vence `em` maior. No empate de valores diferentes, entrega-se a mudança não replicada; uma cópia já replicada adota o valor observado na nuvem. Hora/sufixo iguais não confirmam entrega de outro valor. Download não chama OpenAI.
- Apagamento é um valor vazio versionado do dono, destinado somente ao UID autenticado da operação. Wipe de C não faz PATCH em A. Apagar tudo limpa também a loja legada inteira, inclusive `conta:<uid>`; erro parcial permanece visível.
- Migração é compatibilidade, não dono paralelo: só transfere UID/hora após prova do **valor inteiro** já no cofre; nunca importa pendências. Prova divergente preserva o legado sem exportá-lo; a UI mostra o dono e pede configuração explícita. Após prova/ação explícita a loja inteira é retirada; não se afirma que suas antigas pendências foram enviadas.
- Nenhuma resposta devolve a chave inteira. Tokens/corpos secretos não são gravados, logados, incluídos em URLs, telemetria, diagnóstico ou pacote.

## O que foi subtraído

Cofre ativo IndexedDB da extensão, `conta:<uid>` pendentes, rascunho secreto persistido, reservas/contador de geração, piso/fence e rollback/restauração, chave de versão separada no storage, mapas/marcas de apagamento por UID, reconciliação de nuvem da chave no navegador e endpoints de leitura da chave na biblioteca Firebase. Foram removidos os testes/fixtures exclusivos dessas máquinas; permanecem regressões sobre comportamento e arquivos/HTTP/UI reais, com apenas fronteiras externas falsas. Tombstones **de frases** não são desta refatoração.

## Limites / gates reais

Revisão é local, não CAS global Firestore; relógios desviados e uploads concorrentes não são linearizáveis. Propagação depende dos triggers do painel e disponibilidade. Bytes antigos físicos não têm apagamento comprovado; revogar na OpenAI é o desligamento real. Administradores/perfil/sistema são fora da garantia de isolamento do content script. Origin não autentica o listener local: o bearer agora passa à Conexão, então **#192/pareamento antes de publicação** é relevante e não está implementado/certificado aqui. Um impostor de loopback poderia capturar o bearer; um processo local pode forjar Origin para ler metadados, trocar/apagar o dono, e o apagamento pode seguir à conta. Sync sozinho não exporta mais uma chave sem vínculo. Portanto todos os clientes/listeners locais precisam ser confiáveis nesta versão: Origin protege contra sites, não autentica processos/usuários locais. #192 deve autenticar ambos os lados antes de publicação; regras own-UID não resolvem esse elo. **P6 PENDING OWNER**: regras reais own-UID/cross-UID/sem autenticação, publicação e Google/OpenAI/Anki físico Mac/Windows. Nenhuma regra, credencial ou deploy foi tocado; provas locais não significam “100% real”.
