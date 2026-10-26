# O perfil fixo do Anki (#149)

Página do [modelo de fatia ALTA](modelo-fatia-alta.md): o estado vive em mais de um processo (o arquivo `perfil.json` e o script do abridor,
que o Native Messaging lê) e a Conexão passa a fechar e abrir perfis do Anki da pessoa. Os Cartões só entram no perfil que ficou marcado na
primeira conexão. Texto, sem código; o código é `complemento/perfil.py`, `no_anki.py`, `rotas_do_perfil.py`, `inicio.py` e `envio.py`.

## 1. Dono único

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| o perfil marcado | a Conexão (`user_files/perfil.json`) | o script do abridor (`-p "<marcado>"`), reescrito a cada mudança | a extensão não guarda o perfil; a linha “Perfil do Anki” relê a Conexão |
| os perfis que existem e o aberto | o Anki (`mw.pm.profiles()`, `mw.pm.name` com `mw.col`) | a resposta de `/anki/profiles`, lida na hora | uma lista guardada: ela se relê, e só a thread principal do Anki a lê |
| a espera do Envio (`state.waiting`) | o Envio na Conexão | o painel, que só a mostra | uma decisão: o painel não escolhe perfil por conta própria |

## 2. Estados

Do marcado: **nenhum** (sem perfil aberto ainda), **marcado e aberto**, **marcado e outro perfil aberto**, **marcado e o Anki na tela de perfis**,
**marcado que o Anki já não tem** (renomeado ou apagado), **arquivo que não se lê**. A tela diz o verdadeiro de cada um (regra 6): com 1
perfil não há nada sobre perfis, salvo o marcado sumido; com outro aberto, “O Anki está no perfil X. O Envio espera.” e **Abrir <perfil>**;
com o marcado sumido, o aviso vermelho e **Escolher perfil**. O arquivo que não se lê é “a Conexão não respondeu”: nada é marcado por cima.

## 3. Transições

| transição | quem pede | o que lê antes | o que muda | o que não pode mudar |
|---|---|---|---|---|
| marcar na primeira conexão | a carga, `profile_did_open`, a primeira lista ou a primeira gravação | `perfil.json` ausente (`FileNotFoundError`) e um perfil aberto | grava o aberto, ao lado e trocando de uma vez | um arquivo que existe e não se lê (`PerfilIlegivel`: recusa); um marcado já existente |
| escolher outro | a pessoa (“Perfil do Anki ▾”) | que o Anki tem o perfil (senão 404) | grava o escolhido e reescreve o abridor | o escolhido vale também por cima de um arquivo ilegível (é a saída) |
| gravar um Cartão | o Envio | na thread principal, no mesmo passo que grava: `pm.name` e `pm.profiles()` | a nota, no marcado | nenhuma troca de perfil cabe entre a conferência e a nota; outro perfil → `OutroPerfil`, marcado sumido → `PerfilSumiu`: o Envio espera |
| entrar sozinho | o Envio à espera, de ~2 s em 2 s | tela de perfis, sem coleção, marcado existente, sem diálogo modal e a janela de perfis ativa | `pm.load` + `onOpenProfile`, no máximo 1 vez em 15 s | nada com um modal aberto: o Excluir/Renomear confirmado agiria sobre `pm.name`, que já seria o marcado |
| Abrir <perfil> | a pessoa | marcado existente; outro perfil aberto | `unloadProfile` (sincroniza), `showProfileManager`, `pm.load`, `onOpenProfile` | um segundo clique durante a sincronização ao fechar não fecha de novo (trava até o fim do fechamento) |
| escrever o abridor | cada mudança do marcado | o marcado e a lista de perfis | `-p "<marcado>"`, ou sem `-p` se o marcado já não existe | `-p` com perfil inexistente (o Anki 2.1.50 não abre) |

Pedido repetido: o mesmo nome não regrava. Resposta perdida: a linha relê `/anki/profiles`. A atomicidade está no `os.replace` do `perfil.json` e na
tranca do `PerfilFixo`. A Conexão **nunca** apaga, renomeia nem grava perfis ou coleções por conta própria. Quem reverte: a pessoa, escolhendo outro perfil.

## 4. As 8 variantes

1. **Sem Conexão:** a linha fica escondida; nada é alegado. 2. **Anki fechado:** igual; o abridor (que o #150 chama) tem o marcado.
3. **Complemento antigo:** a rota dá 404, a linha fica escondida. 4. **Bridge Flask na 8766:** 404 igual. 5. **Dois perfis do Chrome:** um dono só,
o `perfil.json` da Conexão; a extensão não guarda perfil. 6. **Quem vem da `main`:** sem marca, o primeiro perfil aberto fica marcado; não migra o #120.
7. **Resposta perdida:** `escolherOPerfil` relê a lista no fim. 8. **Pedido repetido:** `_gravar` com o mesmo nome não faz nada.

## 5. Limites aceitos

- A entrada sozinha só acontece com um Envio esperando: quem abriu o Anki só para estudar não é puxado para um perfil (decisão 3 da PR).
- As leituras (Baralhos, números, vocabulário) continuam vindo do perfil aberto.
- A espera de 15 s entre entradas é uma estimativa, não medida num Anki real.
- `state.waiting` leva nomes de perfis e eles entram no pacote de diagnóstico, como o `deckName` (a decidir; é issue).
- Não migra o perfil da configuração antiga (#120).

## 6. Provas

Com fronteiras falsas: `test_perfil_fixo` (a lista, a escolha, o arquivo ilegível, o Envio que espera, entra e abre), `test_no_anki_perfil` (a ordem
`pm.load`, `onOpenProfile`, `unloadProfile`, `showProfileManager` num `mw` de mentira, com modal aberto, outra janela ativa e o fechamento adiado),
`test_no_anki` e `test_colecao_em_memoria` (o contrato do adaptador), `test_inicio` (o abridor com o marcado, ou sem `-p`), `test_servidor` (os exemplos do contrato).
e2e: `configuracoes-perfil`, `painel-envio-perfil`. As telas novas são `test.fixme` até o dono aprovar.

**O que isso não prova:** as funções de perfil do Anki (`pm.load`, `onOpenProfile`, `unloadProfile`, o Excluir/Renomear aberto) só rodaram num `mw` de
mentira, lidas no aqt 26.9.3. A prova no caminho real é o ensaio do dono (#269, passo 8b de `complemento/LEIA-ME.md`, que inclui o duplo clique
e o modal com um perfil de teste), em Mac e Windows, e o `-p` no Anki mais antigo suportado.
