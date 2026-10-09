# A chave da OpenAI que acompanha a conta: nota de ameaça

Ticket #154 (histórias 32 e 34 da spec #138), decisão #94 do dono (opção B: a chave acompanha a conta Google).
Esta nota diz quem pode ler a chave, por onde ela anda e quais riscos foram aceitos. Ela é **ALTA: credenciais**.

## Por onde a chave anda

| Lugar | O que fica | Quem lê |
|---|---|---|
| A nuvem da conta: Firestore `usuarios/{uid}/segredos/openai` | `{ chave, em }`, ou o tombstone `{ apagada: true, em }` | o dono da conta (as regras abaixo) e quem administra o projeto Firebase |
| A extensão: IndexedDB `pm-segredos` › `chaves` | `openai` (a chave), `openai-em` (a hora da última mudança), `openai-apagar-na-conexao` | as páginas da extensão; **não** o content script nem o overlay, que abrem o IndexedDB do site |
| `chrome.storage.local` › `pm_chave_openai` | só `{ ultimos4 }` | toda a extensão, o content script inclusive: por isso só os 4 últimos |
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
  Conexão nem ao `chrome.storage`. A falha da sincronização da chave registra só o status ou o motivo.
- Trocar, Apagar chave e Apagar tudo deixam a hora da mudança; a mais nova vale entre os computadores, então uma cópia
  velha não volta pelo sync (`test_sync.js`, seção CHAVE). O tombstone na nuvem não tem campo de chave.
- Uma Conexão que estava desligada quando a chave foi apagada perde a cópia quando volta a responder.
- Os testes usam só chaves de mentira.

## As regras do Firestore

As regras moram no console do Firebase, não neste repositório. A chave precisa de que só o dono da conta leia e
escreva `usuarios/{uid}/segredos/openai`. Se as regras de hoje listam as coleções uma a uma (`frases`, `meta`), elas
recusam `segredos`, e a chave simplesmente não sincroniza (a falha fica no console). O mínimo:

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

Publicar e conferir estas regras é do dono.
