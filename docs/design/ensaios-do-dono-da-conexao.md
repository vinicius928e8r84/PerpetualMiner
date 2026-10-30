# Ensaios do dono: o item de login e o abridor

Movidos de `complemento/LEIA-ME.md` (que não pode passar de 20.000 bytes); o texto é o mesmo.

## Ensaio do dono: Abrir o Anki com o computador (risco 5)

O item de login **nunca foi testado** num Mac nem num Windows de verdade: os testes só conferem o arquivo escrito. No ensaio:

1. Painel › Configurações › Conexão com o Anki: ligue **Abrir o Anki com o computador**.
2. **Mac:** o arquivo `~/Library/LaunchAgents/com.perpetualminer.abrir-o-anki.plist` existe; o macOS pode avisar “itens de segundo plano adicionados” (Ajustes › Geral › Itens de Início); saia da sessão e entre: o Anki abre sozinho? (`launchctl list | grep perpetualminer` mostra o item.)
3. **Windows:** `Anki (PerpetualMiner).lnk` está em `shell:startup` (Win+R); clique duas vezes nele: o Anki abre? Reinicie o computador: o Anki abre sozinho? O Gerenciador de Tarefas › Inicializar o lista?
4. Desligue o interruptor: o arquivo some. O atalho do Anki que a pessoa mesma pôs na pasta (se houver) fica.
5. Como o Anki é achado: o complemento usa `ANKI_LAUNCHER` (o abridor do Anki novo), depois o programa que roda o complemento, depois onde o instalador o põe; no Mac, `open -a Anki` se nada disso vale. Se o item não abrir o Anki certo, o aviso “não sabe onde o Anki está” (Windows) ou o conteúdo do `.plist` mostram o motivo.

## Ensaio do dono: Abrir o Anki sozinho (riscos 1 e 2 do #138)

O abridor **não foi testado num Mac de verdade**. No Windows real (ensaio de 2026-10-10), o complemento escreveu e registrou o host;
o PowerShell 5.1 respondeu `conferir` e recusou as cinco ações inválidas sem abrir outro Anki. Chrome 153 e Opera GX 136, em perfis separados,
encontraram e chamaram o host registrado só em HKCU do Chrome, com permissão nativa concedida por UI Automation. Isso não prova outros builds
nem o fluxo do painel: a porta 8766 estava ocupada, `/health` e o painel não rodaram; `abrir` não foi executado.
`test_abridor.py` escreve e registra só em pastas temporárias e num registro de mentira; no Linux, roda o `.sh` com o mesmo parser
JavaScript em Node (a CLI do JXA adaptada), não o `osascript` real. O e2e usa um abridor de mentira; `test_inicio.py` e `test_no_anki.py`
o desligam (`abridor=None`). Isso não confirma o aceite do dono:

| Confirmação exigida antes de fechar #147 | Estado | Prova do dono |
|---|---|---|
| Risco 1 — Opera no Windows encontra e chama o host registrado | **VERIFICADO: Opera GX 136** | W4, Windows real, 2026-10-10: host só em `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts`, `conferirOAnki()` → `achou`. Outros builds e fluxo visual do painel não confirmados; aceitação final (S5) permanece **PENDING OWNER** |
| Risco 2 — Chrome no Mac chama o host e abre o Anki sem pergunta do macOS | **PENDING OWNER** | Ainda não registrada |
| Comparação/aprovação visual do passo 3 e do Pronto (S4) | **PENDING OWNER** | Propostas continuam `test.fixme`, sem PNG aprovado |

Não fechar #147 só com testes de Linux, um ✓ de `conferir` ou a abertura pelo Terminal: registre sistema, navegador, resultado, data
e confirmação do dono. O que só o ensaio mostra:

1. Com o complemento novo no Anki (refaça o arquivo: `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`), abra o Anki
   e um perfil. Em `user_files/abridor` (Ferramentas › Complementos › Ver arquivos) aparece o script; o log só diz “O abridor não foi escrito” se algo falhou.
2. Painel › Conexão com o Anki (nunca conectada) ou Boas-vindas › passo 4: depois de “Achei o Anki”, **Permitir abrir o Anki**. O Chrome
   mostra o aviso da permissão (“Comunicar-se com aplicativos nativos cooperativos”); responda Permitir. A tela deve dizer
   “O Anki abre sozinho quando um Envio precisar.” e o passo virar ✓. Nada abre nem fecha.
3. **Mac (risco 2):** o manifesto está em `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.perpetualminer.abridor.json`
   e aponta para `…/user_files/abridor/abrir-o-anki.sh`. Para ver o `abrir` (que o Envio usa, #150), feche o Anki e rode, no Terminal,
   `printf '\x13\x00\x00\x00{"acao":"abrir"}' | sh "<o caminho do script>" | tail -c +5`: o Anki abre no perfil anotado, **sem pergunta
   do macOS**? A resposta é `{"achou":true,"abriu":true}`. Se o macOS perguntar algo (Gatekeeper, “Terminal quer controlar…”), anote o texto.
   Isto é só uma aproximação (o macOS julga diferente o script do Terminal e o do Chrome, e a extensão só manda `abrir`
   do Envio e do botão, #150): o risco 2 de verdade (o Chrome chama, o Anki abre sem pergunta) continua **PENDING OWNER**.
4. **Windows com o Chrome:** `reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.perpetualminer.abridor"` mostra o caminho
   do manifesto em `user_files\abridor`. O passo 2 acima dá ✓? Se a política do computador bloquear o PowerShell (`-ExecutionPolicy Bypass`
   não basta), o passo diz que o abridor não respondeu, com o Detalhes: anote o texto.
5. **Windows com o Opera (risco 1):** instale a extensão no Opera e repita o passo 2. O Opera acha o host registrado na chave do Chrome?
   Se não achar (“Specified native messaging host not found.”), registre também na chave que o Opera lê (`ONDE_REGISTRAR_NO_WINDOWS` e o teste).
6. **Agora não:** num perfil novo do Chrome, aperte Agora não: o passo fica “agora não” e o Pronto devolve as abas.
