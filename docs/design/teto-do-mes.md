# Página de desenho: o teto do mês (#160)

Fatia MÉDIA pelo [modelo](modelo-fatia-alta.md): controla gasto, não guarda nem registra credencial.

## 1. Dono único de cada dado

| dado | dono | o que a cópia nunca é |
|---|---|---|
| o teto (`limitUsd`, dólares com dois decimais; sem arquivo vale US$ 10) | a Conexão com o Anki deste computador: `user_files/teto-do-mes.json`, gravado de uma vez | uma cópia no navegador ou na conta Google: **o teto vale por computador** |
| o gasto do mês | os custos de cada Envio (`custos/<jobId>/costs.jsonl`), somados a cada leitura no mês do computador | guardado: a conta é refeita, então o mês virando a zera sozinha |
| a pausa do Envio | o estado do Envio: `running` com `waiting: { reason: "monthly_cap" }` | uma falha: nenhum Cartão falha por causa do teto |

## 2. O que conta

O que a **chave** gastou: texto, juiz e triagem da imagem, imagem gerada e voz paga (`totalUsd` de `custos.resumir`). O Cartão que o plano
do ChatGPT fez custa 0 (`plan_tokens`), mas a imagem gerada que o Envio pediu à chave conta (#156).

## 3. O Envio

Antes de gastar a chave com cada Cartão (depois de ver se a nota já está no Anki, antes de pedir o texto) a thread de trabalho confere
o teto. No teto, o estado diz `waiting: monthly_cap`, nada é pedido e a thread confere de novo a cada 60 s. Voltam sozinhos: **subir o
teto** (`POST /custos/teto/definir` acorda a espera) e **o mês virar**. O Apagar tudo e parar a Conexão encerram a espera. Um Cartão
que já tem o texto pago grava a nota mesmo no teto: só se pausa o que ainda gastaria.

## 4. Rotas (`complemento/contrato/exemplos-do-teto.json`)

`POST /custos/teto` → `{ limitUsd, spentUsd, month }`; `POST /custos/teto/definir` com `{ limitUsd }` (positivo, até 1.000.000) responde o mesmo;
qualquer outro valor é `400 invalid_request` e o teto guardado não muda.

## 5. A tela (`painel-teto.js`)

- **80%:** aviso no alto do Painel, em qualquer área, com Ajustar teto (leva a Custos e ao campo). **100%:** o aviso diz que o teto chegou.
- **Custos:** o card “Teto do mês” com o gasto, o campo e Salvar teto.
- **Envio:** o cartão diz “Envio pausado: o teto do mês chegou” e Ver Custos. **Nenhum valor no Envio.**
- Com a Conexão desligada nada disso aparece.

## 6. Leitura aberta (risco 14)

O dono não confirmou que o teto vale por computador; foi construído assim. Valer por conta Google pediria guardá-lo na nuvem e somar os
custos dos computadores, o que a Conexão hoje não faz.
