# Storage Schema

Lido sob demanda. O código é a verdade: cada chave tem um dono (o arquivo que a grava), citado na linha dela.

Each entry in `chrome.storage.local["frases"]` (unlimited, newest first):
```js
{
  texto:     string,
  data:      string,          // "dd/mm/yyyy" (pt-BR locale)
  streaming: string,          // platform name, 'web', 'pdf', or 'livro'
  id:        number,          // max(Date.now(), highest stored id + 1), assigned inside the `pm-historico` lock (`lib/historico.js`)
  idioma:    string,          // 'Inglês' or 'Russo' (lib/idioma.js: Cyrillic → Russo, else Inglês)
  contexto?: {                // optional; added for web/pdf/book sources
    fonte:   string,
    titulo:  string,
    detalhe: string,
  },
  keywords?:     string[],    // the Palavra(s) of the phrase, set by hand or by the Mineração automática
  autoKeyword?:  boolean,     // true when `keywords` came from the automatic reading, false when typed (background.js)
  status?:       'exported',  // Enviada ao Anki (a name from before the glossary); merged with `exportadaTxt` across devices by lib/sincronizacao.js
  exportadaTxt?: true,        // Exportada: the phrase went out through Exportar .txt, which never writes `status`
}
```

Other storage keys:
- `ankiBridgePresets` — the Ajustes de envio: `{ en, ru }`, each `{ deckName, imageSource: '1' (Foto real) | '2' (Gerada por IA), nivel: 'iniciante' | 'intermediario' | 'avancado', frente, ttsWordTld, ttsPhraseTld, ttsReserva, tipoProprio?, versao }` (`frente`: the Cartão's front; `ttsReserva`: the fallback voice; `tipoProprio`: the “Usar um tipo que já tenho” mapping, absent while the person uses the ready style; the names are in `lib/ajustes-de-envio.js`); written only by Salvar ajustes (`lib/ajustes-de-envio.js`), a missing or blank field reads as the language's default
- `geminiApiKey` — the Gemini key, written only by Configurações › Chave do Gemini and read by Minerar de uma foto
- `pm_chave_openai` — public cache `{ ultimos4, conta, versao, naoEnviada }` read from the Conexão, written by `lib/chave-da-openai.js`. The only local whole key is in the Conexão's owner; with an account it replicates to Firestore (#154). The extension's old `pm-segredos` store is cleared during exact-proof migration/wipe; `pm_chave_openai_versao` and every client generation/per-UID secret/removal record are gone.
- `bookTitleDefault` — the Livro (Título) last typed in Minerar de uma foto, filled back on the next visit
- `pm_tema` — `'escuro'` (the default, and what an absent key means) or `'claro'`: the theme chosen on this computer. It is local on purpose and never syncs. `veio/tema.js` mirrors it into `localStorage` under the same name, which is read before the first paint so a light page never flashes dark; `chrome.storage` stays the truth and corrects the mirror
- Firebase auth session — `{ uid, idToken, refreshToken, expiresAt }` in extension-origin IndexedDB `pm-sessao` › `sessao` › `firebase`, outside the content scripts' reach. `pm_firebase_auth` in `chrome.storage.local` is legacy only: migrated and removed by the service worker/panel
- `pm_user_info` — `{ uid, email, displayName, photoURL }` — Google user profile
- `pm_pending_sync` — gone (old versions wrote phrase IDs nobody read); `aoInstalar` removes it
- `pm_deleted_ids` — `string[]` of deleted phrase IDs whose Firestore DELETE hasn't succeeded yet
- `pm_tombstone_pendente` — `string[]` of deleted phrase IDs whose Firestore tombstone (`meta/deleted`) write has not succeeded yet; `lib/sincronizacao.js` rewrites it on the next `carregar` and keeps the sync tombstone until it lands
- `pm_atalho_legenda` — the “Minerar legenda” shortcut. Absent → the default Alt+S; `null` → no caption shortcut
- `pm_atalho` — the “Minerar seleção” shortcut; `null` or absent → none (the default). Both use `{ type: 'keyboard'|'mouse', code, button, altKey, ctrlKey, shiftKey, label }`
- `pm_apagar_tudo` — pending Apagar tudo; shape, account matching and cutoff are documented in `lib/sincronizacao.js`
- `pm_anki_ja_conectou` — stored first-success fact; `lib/conexao-anki.js` owns its lifecycle
- `pm_auto_keyword_vocab_en` / `pm_auto_keyword_vocab_ru` — the last vocabulary reading the Mineração automática uses `{ cacheVersion, deckName, createdAt, words, terms, wordInfo, termInfo }`; no expiry, owned by `lib/vocabulario-da-mineracao.js` (the popup says its age with the Conexão off)
- `pm_anki_custos` — `{ quando, periodo, de, ate, envios }`, the last Custos reading (the `/analytics/jobs` rows), shown with BRG-12 while the Conexão is off
- `pm_anki_baralhos` — `{ quando, nomes, dados }`, the last `POST /anki/stats/decks`; `pm_anki_vocabulario` — `{ quando, nomes, dados: { en, ru } }` (each `{ deckName, itens, total }`), the last vocabulary. Both show with BRG-12 while the Conexão is off
- `pm_anki_quatro_casas` / `pm_anki_ids_dos_envios` — the Avançado switches “Mostrar custos com 4 casas” and “Mostrar IDs dos envios” (local on purpose: remembered on this computer)
- `pm_boas_vindas` — `{ agoraNao: string[], concluida: boolean, lembreteOculto?: true, primeiroEnvio? }`: written by the install; the steps the person answered “Agora não” to, whether they reached Abrir painel in the Boas-vindas, whether they hid the “Configuração pela metade” reminder and the first Cartão's Envio (`primeiroEnvio`, shape in `lib/configuracao.js`); everything else about a step is read from its real state. Absent (an update, not an install) → no reminder
- `pm_abridor` — `{ agoraNao: boolean }`: the answer to step 3 of the first connection, Abrir o Anki sozinho (#147). `true` after Agora não; `false` once the extension finds the optional `nativeMessaging` granted (the permission itself is Chrome's, not stored here). Absent → never answered. Written only by `lib/abridor.js`
- `pm_envio` — `{ envios: [{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar, corpo }], apagarFrases?: true }` (`id`: a `crypto.randomUUID()`, the card's key and `jobId`; `corpo`: the `POST /jobs` body, saved before the first request, resent unchanged until answered; `apagarFrases`: an Apagar tudo not yet confirmed by `POST /jobs/apagar-frases`, resent until it is, also every 30 s by the worker): the Envios tracked until the summary is answered; see “Envio ao Anki” in the `painel-anki` skill
- `pm_anki_abridor_pendente` — `boolean`: the permission prompt of Abrir o Anki sozinho is waiting for an answer, so the wait survives a reload (`painel-anki-primeira-conexao.js`)
- `pm_auto_miner_settings` — `{ en: { enabled, dailyLimit }, ru }` and `pm_auto_miner_daily` — `{ date, en: { count }, ru }` (a count only holds on its day): the Mineração automática's settings and counter, which the service worker watches through `chrome.storage.onChanged` (`lib/mineracao-do-dia.js`); `pm_auto_miner_state_view` — `{ settings, daily, updatedAt }`, the picture of the state the popup and the panel read; `pm_auto_miner_last_event` — the diagnostic of the last caption evaluated (`content.js`)
- `pm_conexao_atualizada_vista` — the Conexão version whose “atualizada” notice the person has seen (`painel-conexao-versao.js`)
- `pm_migrated` — the uid whose phrases were already moved to Firestore; a different uid migrates again (`painel.js`)
- `pm_plano_do_chatgpt_avisado` — `boolean`: the first-time notice of the ChatGPT plan was given on this computer (`painel-ia-chatgpt.js`)
- `pm_auto_recarregar_hash` — in `chrome.storage.session`, not `local`: the hash of the unpacked extension's files, so `lib/auto-recarregar.js` reloads it only when they change
