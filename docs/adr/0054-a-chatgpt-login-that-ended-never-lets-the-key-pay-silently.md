# A ChatGPT login that ended never lets the key pay silently

The tokens of "Sign in with ChatGPT" live only in `user_files/chaves/chatgpt.json` (mode 0600, written whole), and nothing returns them or writes them to the log. The stored login is one of three things: no login, connected, or ended (`acabou`, with no token at all, after the login server refused a renewal).

When it ended, every request raises `SAIU`, never `None`, because `None` would let the OpenAI key pay without the person ever having chosen it. From `acabou` one leaves only by the person's choice (signing in again, signing out, or "Usar a minha chave"), never by itself and not even by Tentar de novo.

The attempt of a login (`state`, the PKCE verifier and `nonce`) lives in memory, one at a time and valid once, and the return of the browser is accepted only for the pending attempt, by its `state`, at the Conexão's loopback address; any other return changes nothing. Every read and write of the file, the exchange of the code, the renewal and Sair go through the same lock, because the `refresh_token` rotates at each renewal.
