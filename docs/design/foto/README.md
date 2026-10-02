# Minerar de uma foto (ex-BookReader): layout “C · Fotos × frases”

Resolução do ticket [Protótipo: Minerar de uma foto (ex-BookReader)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/7) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Herda a identidade [Veio](../identidade-veio/README.md), os vereditos da [auditoria](../auditoria/README.md) e a cópia do [catálogo da Voz](../voz/README.md) (FOT-01…18). Esta spec foi escrita na consolidação a partir do comentário de resolução do ticket; o conteúdo é o que o dono travou.

- Protótipo: [`prototipo-bookreader.html`](prototipo-bookreader.html). Abra direto no navegador. `?variant=C` é o layout travado (e abre por padrão); `A` (Fiel, sidebar) e `B` (Fluxo, uma coluna) ficam no arquivo só como referência. `?state=` percorre os 11 estados.
- Avaliado no Lavish em 2026-09-14.

## Decisão

Três layouts foram avaliados: **A · Fiel** (a página de hoje com sidebar), **B · Fluxo** (uma coluna) e **C · Fotos × frases** (duas colunas). O dono travou o **C**.

## A tela

- **Topo:** marca Veio, nome da página “Minerar de uma foto” (FOT-01), campo **Livro** (o Título, que fica) e “Voltar ao painel”.
- **Coluna da esquerda: fila de fotos.** Cada foto com miniatura e status próprio: Pronta · Na fila · Lendo… · N frases · Sem marcações · Falhou + motivo · Cancelada. Progresso “2 de 4 lidas” e o botão **Cancelar** (FOT-06, FOT-07). No pé, a legenda “Marcações que o Gemini lê”.
- **Coluna da direita: frases agrupadas por foto.** Um checkbox “Selecionar todas” (o mesmo padrão do painel), a contagem (FOT-09), “Recomeçar” (FOT-17) e o botão primário fixo **“Minerar N frases”** (FOT-12).

## Regras

- **Cancelar** para as fotos restantes e **mantém** as frases das fotos já lidas. As canceladas ficam marcadas na fila. É um item da lista fechada.
- **Recomeçar** junta “Trocar Foto” e “Limpar Lista” numa ação só. Com frases não mineradas, **pede confirmação** no modal FOT-18. É um item da lista fechada.
- **“Tentar de novo” numa foto que falhou**, no card da foto (FOT-11). O dono pediu: “só poderia ter opção de retentar a imagem que deu erro”. É um item da lista fechada.
- Quando parte do envio falha, “Tentar de novo” nas frases que falharam (FOT-15) repete a mesma ação com o mesmo dado, então é revestimento (regra da Voz), não função nova.
- **A chave do Gemini sai da página.** Sem chave, aparece um cartão que leva a Configurações (FOT-05 → `#configuracoes/chave`).
- Uma frase só fica **“Minerada”** depois da gravação confirmada no histórico; então sai do botão e não entra nele de novo. Sem confirmação, continua selecionável para **tentar de novo**. Isso faz parte da correção do bug “Botão salvo reabilita e re-salva duplicado” em [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9), assim como a corrida do salvamento em paralelo.

## Cópia

Toda a cópia vem do catálogo da Voz (FOT-01…18, mais os status por foto registrados na consolidação). O verbo é **minerar**: o nome da página é “Minerar de uma foto” e o botão diz “Minerar N frases”. No formulário do protótipo, o dono chegou a marcar “Adicionar N frases”, mas essa opção era só insumo para a Voz, e a Voz já tinha decidido o verbo único. Vale o catálogo; mudar isso exige reabrir a Voz.

## Dependências de construção

Chave em Configurações, o padrão de seleção de Frases e o modal de confirmação do Veio.
