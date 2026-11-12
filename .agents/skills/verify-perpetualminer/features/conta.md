# Conta & sync

Configurações › Conta & sync is where a person signs in with Google, sees whether their phrases are synced, and signs out. The same state is said by the sidebar chip, the closed row's summary and the card itself (CFG-01…10: Sincronizando, Sincronizado, Sem sincronizar, Nuvem recusou, Sync parcial, Sem conta, Login falhou, Sessão expirou, Primeira subida, Perfil sem nome). Signing out keeps the phrases on this computer; with the account the phrases (and the OpenAI key, see [ia.md](./ia.md)) follow the person to other computers.

## Sub-features

- `conta-states`: the card, the chip and the closed row's summary say the same state for CFG-01…04 and CFG-06…08: Sincronizado (name, green dot, Sair da conta, the note), Sincronizando (while the cloud does not answer), Sem sincronizar (Tentar de novo and Detalhes), Nuvem recusou (Sair da conta becomes a normal button; Detalhes carries Firestore's message), Sessão expirou (Entrar goes to the login and syncs again), Sem conta, Login falhou (error in the card with Tentar de novo and Detalhes; the chip stays without an account).
- `conta-clock`: “Sincronizado há N min” (CFG-02) counts from the last time the panel became in sync. Coming back to the panel tab only checks the OpenAI key with the Conexão; it does not restart the clock.
- `conta-nameless`: a profile with no name (CFG-10): the card, the closed row's summary and the chip say “Conta Google”.
- `conta-first-upload`: signing in with phrases on this computer shows “Sincronizando N frases…” and uploads all of them; when that fails, only the card and the chip say “Não deu para sincronizar suas frases” and trying again uploads all.
- `conta-partial`: “8 de 10 frases sincronizadas · 2 ficaram só neste computador”, and the chip “8 de 10 sincronizadas”; the count is of this computer's phrases, not the cloud's. Editing, mining or deleting during the upload does not lose the phrases still waiting, and a retry undoes no edit.
- `conta-sign-in-out`: Entrar com Google uploads the phrases and shows the account; Sair da conta leaves the phrases on this computer (storage keeps no `pm_user_info`, no session). After signing out, the AI card offers local-only deletion of its key: [ia.md](./ia.md) › `ia-delete` (`O1:`).
- `conta-delete-cloud`: with the account connected, a phrase deleted in the panel leaves the cloud and stays as a tombstone; Apagar tudo (Configurações › Zona de perigo) deletes every phrase from the cloud and tombstones each id. The offline copy of the tombstones in `chrome.storage.sync` (`pm_del_{id}`, 512 items at most) keeps the newest 500.
- `conta-session`: the Firebase session renews its token when mining with under two minutes left and keeps Contexto and Palavra in the cloud; a session that does not renew keeps the mined phrase on the computer and in the retry queue; signing out during a renewal does not restore the account, and the next mining stays on this computer.

## How to get to it (user POV)

- Sidebar › Configurações › the **Conta & sync** card, or `painel.html#configuracoes/conta`.
- The sidebar chip (“Sincronizado agora”, “Sem sincronizar”, “Sessão expirou”…) leads to the same card, open.
- **Entrar com Google** opens the Google window; **Sair da conta** signs out. Phrases are deleted from Frases (the cloud follows) or by Apagar tudo in Zona de perigo.

## Driving it with the Playwright e2e harness

Each line is `scripts/drive.sh <run-id> <command>`; the filters are regexes (SKILL.md § Drive), kept literal.

- `conta-states`: `configuracoes-conta.spec -g "Sincronizado \(CFG-02\)|Sincronizando \(CFG-01\)|Sem sincronizar \(CFG-03\)|Nuvem recusou|Sessão expirou|Sem conta \(CFG-06\)|Login falhou"`
- `conta-clock`: `configuracoes-conta-relogio.spec` (the clock is stopped by `relogioParado`; the spec fires the `visibilitychange` Chrome would fire). Observable: after 2 min 30 s, the return to the tab and 1 more minute, the chip says `Sincronizado há 3 min`.
- `conta-nameless`: `configuracoes-conta.spec -g "Perfil sem nome \(CFG-10\)"`
- `conta-first-upload`: `configuracoes-conta.spec -g "Primeira subida"`
- `conta-partial`: `configuracoes-conta.spec -g "Sync parcial"`
- `conta-sign-in-out`: `configuracoes-conta.spec -g "entrar com Google sobe as frases"`. Observable: after Sair da conta `extensao.lerStorage(['pm_user_info', 'pm_firebase_auth'])` is empty, `extensao.lerSessao()` is null and `extensao.frases()` still has the phrases.
- `conta-delete-cloud`: `painel-apagar.spec`. Observable: the deleted phrase is gone from `fakes.google.frasesDe(uid)` and its id is in `fakes.google.apagadasDe(uid)` (the tombstone). `painel-apagar.spec -g "520 frases"`: after deleting 520 phrases at once, `chrome.storage.sync` holds the `pm_del_` keys of the 500 newest.
- `conta-session`: `sincronizacao.spec` (token renewal, signing out during a renewal).

## Gotchas

- The Google login is the fake (`fakes.google`, `fakes.google.usarPerfil({ name, email })`, uid `uid-teste`); a spec that starts already signed in seeds the session with `extensao.semearSessao({ uid })`. The real Google consent screen and the Firebase rules (P6) are the owner's.
- The session lives in extension-origin IndexedDB (`pm-sessao`), not in `chrome.storage`: read it with `extensao.lerSessao()`.
- The Conexão's key replication to the account is not here; it is in [ia.md](./ia.md).
- `configuracoes-conta.spec.js` also has tests no ID above maps: the closed rows and their summaries, the chip link, the layout below ~560 px, keyboard and reduced-motion tests, “Sincronizado há 2 min”, cancelling the login and deleting a phrase with the cloud down. Run the whole file to see them.
