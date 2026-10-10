# A chave da OpenAI que acompanha a conta: nota de ameaça

Ticket #154 (histórias 32 e 34 da spec #138), decisão #94 do dono (opção B: a chave acompanha a conta Google).
Esta nota diz quem pode ler a chave, por onde ela anda e quais riscos foram aceitos. Ela é **ALTA: credenciais**.

## Por onde a chave anda

| Lugar | O que fica | Quem lê |
|---|---|---|
| A nuvem da conta: Firestore `usuarios/{uid}/segredos/openai` | `{ chave, em }`, ou o tombstone `{ apagada: true, em }` | o dono da conta (as regras abaixo) e quem administra o projeto Firebase |
| A extensão: IndexedDB `pm-segredos` › `chaves` | `openai` (a chave), `openai-em` (a hora da última mudança), `openai-apagar-na-conexao` | as páginas da extensão; **não** o content script nem o overlay, que abrem o IndexedDB do site |
| Sessão Firebase: IndexedDB `pm-sessao` › `sessao` › `firebase` | UID, tokens de acesso e renovação; a sessão legada é migrada e removida do `chrome.storage.local` | só páginas e service worker da extensão; não o content script (um token legível permitiria buscar a chave na nuvem) |
| `chrome.storage.local` › `pm_chave_openai` | só `{ ultimos4 }`; `pm_chave_openai_versao` guarda `{ em, conta, versao }`, sem segredo | toda a extensão, o content script inclusive: por isso só os 4 últimos |
| A Conexão com o Anki: `user_files/chaves/openai.json` | a chave, modo 0600 | o usuário do sistema; fora do `.ankiaddon`, da configuração do complemento, dos logs e do pacote de diagnóstico |

A extensão nunca fala com a OpenAI: quem confere e gasta a chave é a Conexão. Uma chave que chega da nuvem já foi
conferida no computador onde foi colada e é entregue à Conexão daqui pelo mesmo `POST /ia/openai/chave`.

## Por que o Firestore, e não o `chrome.storage.sync`

1. **A mesma conta.** A história 32 fala da conta Google com que a pessoa entra na extensão (Conta & sync, o `uid` do
   Firebase). O `chrome.storage.sync` segue outra conta: a do perfil do Chrome, só quando a sincronização do Chrome está
   ligada e inclui as extensões. Uma pessoa sem o Chrome sincronizado, ou com outra conta no navegador, não receberia a
   chave, e a tela diria “vai junto com a sua conta Google” sem ser verdade (C8).
2. **O content script lê o `chrome.storage.sync`.** É o mesmo motivo pelo qual a chave já saiu do `chrome.storage.local`
   no #140 (`lib/chave-da-openai.js`): qualquer página com o content script injetado ficaria a um bug de distância da chave.
3. **O Apagar tudo e o tombstone já moram no Firestore.** As frases já são apagadas lá com tombstone e o Apagar tudo com
   conta já vai à nuvem; a chave segue o mesmo caminho (`lib/sincronizacao.js`), com o mesmo token e o mesmo login.
4. **Nenhuma permissão nova.** O Firestore já é `host_permissions` do manifesto, falado por REST (sem SDK).

O que o `chrome.storage.sync` faria melhor: não passaria pelo projeto Firebase (os administradores não a leriam).
Isso não compensa os itens 1 e 2.

## Quem pode ler a chave (risco 15 da spec #138)

- **Quem administra o projeto Firebase** (`perpetualminer-4c219`): não há criptografia ponta a ponta. As regras de
  segurança barram os outros usuários, não o console nem uma conta de serviço do projeto.
- **Quem tomar a conta Google da pessoa**: entra na extensão com ela e recebe a chave como qualquer outro computador.
- **O navegador**: a chave fica no IndexedDB da extensão, e a OpenAI pede para não guardar chaves no cliente. Malware no
  computador, ou outra extensão com acesso ao perfil, alcança o que está ali.
- **Um processo local que forje a origem da extensão** pode gravar uma chave na Conexão ou apagar a cópia dela, nunca
  lê-la (`complemento/contrato/LEIA-ME.md` § Quem o complemento atende; a credencial de pareamento é o #192).

**Mitigações aceitas pelo dono:** criar a chave num **projeto próprio da OpenAI, com limite de gasto por mês**, e
**revogar a chave na OpenAI** como o desligamento de verdade. A tela diz as duas coisas no card da IA e no modal de
Apagar chave (CFG-35). Apagar a chave na extensão tira as cópias que o PerpetualMiner controla; não desfaz uma cópia
que alguém já tenha levado.

## O que o código garante

- A chave inteira nunca vai à tela (a tela só conhece `ultimos4`), a um log, a uma mensagem de erro, à resposta da
  Conexão nem ao `chrome.storage`. A falha da sincronização da chave mostra só códigos no Detalhes da Conta & sync e mantém “Sem sincronizar”; Tentar de novo repete também a chave e o tombstone.
- Trocar, Apagar chave e Apagar tudo deixam a hora da mudança; a mais nova vale entre os computadores, então uma cópia
  velha não volta pelo sync (`test_sync.js`, seção CHAVE). O tombstone na nuvem não tem campo de chave.
- A chave de uma conta nunca sobe para outra: a extensão vincula a alteração ao UID antes do primeiro pedido, mesmo quando o PATCH falha, preserva versões pendentes por UID,  e entrar com outra
  conta Google no mesmo computador não a leva para lá (CHAVE 10 e o e2e da troca de conta).
- Sem conta, Apagar chave vale só para este computador: o tombstone local não sobe a nenhuma conta. A versão local ainda ordena a remoção na Conexão; uma chave da conta pode chegar quando a pessoa entrar nela. Apagar chave simples não varre as pendências de outros UIDs; essa limpeza é do Apagar tudo.
- Uma mudança aqui durante o sync não é desfeita pela chave que vinha da nuvem: a gravação só acontece se a hora
  guardada ainda é a que foi lida, na mesma transação do IndexedDB (CHAVE 9).
- Uma Conexão que estava desligada quando a chave foi apagada perde a cópia quando volta a responder. O POST e a remoção levam uma geração HTTP local não secreta (`openai-conexao-versao`), separada da hora remota `em`: trocar para outra conta com chave mais antiga ainda ordena uma operação nova na Conexão; a Conexão grava um tombstone persistente e recusa HTTP 409 para versões antigas (inclusive reentregas após reiniciar). Dois sufixos iguais nunca são prova de que a cópia corresponde à versão atual.
- Chave, hora e UID são lidos numa transação IndexedDB única, e a versão é relida antes de subir. Não há garantia de CAS no Firestore para um PATCH já em trânsito (limite abaixo).
- Falha local ao apagar mostra aviso persistente com repetição e Detalhes; Apagar tudo comunica o resultado parcial, sem toast de sucesso total.
- Apagar tudo varre a loja inteira numa transação: tira a chave ativa e TODOS os segredos em `conta:<uid>`. Só ficam marcas de remoção sem chave, vinculadas aos UIDs; uma marca de A só sobe quando A autentica, nunca usando o token de B ou C. A conta ativa recebe a hora nova do apagamento; as outras mantêm a hora da própria cópia removida, para não apagar uma chave mais nova que chegou à nuvem noutro computador. No empate de hora em milissegundos, a remoção vence a chave (por exemplo, um upload cuja confirmação não voltou); não há identidade global de versão, e uma chave diferente com a mesma hora também perde. A cópia de `contaAntes` é removida inclusive se já estava sincronizada: a marca só sobe quando aquela conta autentica e pode apagar a mesma hora na nuvem/outros computadores. Sem conta, essa limpeza das pendências também acontece, mas espera cada UID autenticar.
- Cada confirmação reserva uma geração exclusiva numa transação readwrite ANTES do HTTP, inclusive entre duas abas no mesmo milissegundo. A aceitação só grava localmente se nenhuma mudança de geração maior já foi gravada; uma reserva mais nova que falhou não invalida uma chave aceita. Apagar/chegada remota já gravados invalidam a aceitação anterior. Na Conexão, uma geração igual não pode substituir outra chave; reentregar a MESMA chave é idempotente.
- Falha transitória exclusiva da sincronização da chave tem texto próprio (CFG-41), repetição e Detalhes, quando há chave/remoção dessa conta. O texto informa que não deu para conferir o sync, não que uma chave já enviada ainda não chegou. O painel mantém o resultado das frases separado: CFG-41 não cobre falhas/pendências delas. Acesso recusado e sessão expirada, também no sync da chave sem chave local, mantêm CFG-04/CFG-08 e pedem autenticação.
- O cofre confirmado daqui é a única verdade para a cópia da Conexão. Se ela gravou um rascunho mas a resposta se perdeu, o painel consulta o estado real (mesmo sem chave local), avança a geração acima da Conexão e repõe a chave confirmada anterior ou remove a cópia não confirmada. Ao abrir, invalida reservas não confirmadas da página anterior ANTES de desenhar, impedindo que uma conferência antiga termine depois e deixe uma cópia órfã. A hora/conta na nuvem não mudam por essa recuperação. Se a chave anterior foi revogada/recusada e não pode ser reposta, a recuperação remove a cópia divergente, em vez de deixar o Envio gastar outra chave. Com a Conexão indisponível, a recuperação espera ela responder novamente.
- Reentregar a MESMA chave e geração já gravadas devolve o sucesso armazenado, sem outra consulta à OpenAI nem nova gravação; vale após reiniciar e quando a OpenAI está fora do ar. Uma geração antiga/diferente ou apagada segue recusada com 409. `/ia/estado` expõe a geração não secreta também do tombstone, nunca a chave inteira.
- Os testes usam só chaves de mentira.

## Limites aceitos

- **A hora é a de cada computador.** Um computador com o relógio adiantado vence uma mudança feita depois noutro. A
  nuvem não tem hora do servidor nem pré-condição na escrita (o PATCH não confere `updateTime`), então duas mudanças
  no mesmo segundo em dois computadores terminam com a última gravada. Para uma chave que muda raramente e a pessoa vê
  mascarada no card, isso foi julgado suficiente; a correção seria a hora do servidor (`REQUEST_TIME`) e a pré-condição.
- **A chave chega quando o painel abre** (ou volta a ficar visível) num computador com a conta. O service worker não a
  busca sozinho: com o Chrome aberto e o painel fechado, a Conexão daquele computador fica com a cópia que tinha até o
  painel ser aberto. O Envio começa no painel, então o caso comum está coberto.

## As regras do Firestore

As regras moram no console do Firebase, não neste repositório. A chave precisa de que só o dono da conta leia e
escreva `usuarios/{uid}/segredos/openai`. Se as regras de hoje listam as coleções uma a uma (`frases`, `meta`), elas
recusam `segredos`, e a chave não sincroniza (Conta & sync informa a falha e permite repetir). O mínimo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid}/{documento=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

**P6 — PENDING OWNER.** Publicar e conferir estas regras é do dono; nenhuma credencial foi criada e nenhum deploy foi feito nesta correção. Antes de integrar: comprovar leitura/escrita pelo próprio UID, recusa entre dois UIDs e recusa sem autenticação. Os testes locais usam Firebase falso, não comprovam as regras implantadas.
