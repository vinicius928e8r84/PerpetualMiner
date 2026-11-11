# Instalar a extensão para testar (com atualização automática)

Este guia carrega o PerpetualMiner como **pasta descompactada** no Chrome do Mac e no Opera do desktop. A pasta é um clone do repositório que se mantém atualizado sozinho; quando um arquivo muda, a própria extensão se recarrega em até ~1 minuto. Você não troca arquivo nenhum à mão.

> Quando a extensão estiver na Chrome Web Store, o navegador passa a atualizá-la sozinho e este caminho deixa de ser necessário: veja [publicar-chrome-web-store.md](publicar-chrome-web-store.md).

## Como funciona

1. Um clone do repositório (na branch `main`) fica em disco. Um agendador roda `scripts/atualizar-extensao.sh` a cada 10 minutos: é um `git pull --ff-only`, que não cria merge nem sobrescreve mudança local.
2. O navegador carrega esse clone como extensão descompactada.
3. A cada minuto a extensão relê os próprios arquivos (só os da pasta, sem rede). Se algum mudou, chama `chrome.runtime.reload()`. Na instalação da loja essa verificação não faz nada (`installType` diferente de `development`).

Tempo até a nova versão aparecer: até ~10 min (o pull) + ~1 min (o reload).

## ID fixo e login com Google

O `manifest.json` leva o campo `"key"` (a chave pública do item da Chrome Web Store). Por causa dela, a extensão carregada da pasta (Chrome do Mac, Opera do desktop) e a versão da loja têm **o mesmo ID**, em qualquer aparelho e de qualquer pasta:

```
ohpoogiccjmdgilgegholdidgfhjkadf
```

O ID não é segredo. Você o vê no cartão da extensão em `chrome://extensions` (Chrome) ou `opera://extensions` (Opera), na linha **ID** (com o Modo do desenvolvedor ligado).

O login por `chrome.identity` usa o endereço de retorno `https://<id>.chromiumapp.org/`. Com o ID fixo, existe um só endereço para cadastrar no cliente OAuth do Google Cloud (projeto do Firebase `perpetualminer-4c219`, "URIs de redirecionamento autorizados"):

```
https://ohpoogiccjmdgilgegholdidgfhjkadf.chromiumapp.org/
```

Sem esse cadastro o resto da extensão funciona; só entrar na conta e sincronizar falham.

**Se você já tinha a extensão carregada antes da `key` existir**, ela tem o ID antigo (o que vinha do caminho da pasta), e trocar de ID tem um custo: o `chrome.storage.local` é separado por ID, então as frases guardadas só no navegador sob o ID antigo **não aparecem** na extensão com o ID novo. As frases sincronizadas na conta voltam ao entrar de novo. Faça nesta ordem:

1. **Exporte as frases locais antes de remover nada.** No painel da extensão antiga, em Frases, marque as frases (a caixa de seleção da página, e "selecionar todas" se houver mais de uma página) e clique em **Exportar** (baixa `perpetualminer-export.txt`). Cada linha do .txt leva a Palavra, o texto e o contexto da frase, no formato que o **Arquivo .txt** de Minerar frases lê de volta; depois, importe-o por lá ou apenas minere de novo o que quiser.
2. **Deixe o clone com a `key` antes de carregar.** Rode `scripts/atualizar-extensao.sh` (ou `git pull --ff-only` na pasta) e confira que o `manifest.json` do clone tem `"key"`. Carregar antes do pull mantém o ID antigo, e o agendador só puxa a `key` até 10 minutos depois.
3. **Remova a extensão antiga**: `chrome://extensions` / `opera://extensions` → **Remover** no cartão do PerpetualMiner.
4. **Carregue a pasta de novo** (passo "Carregar sem compactação" / "Carregar extensão descompactada" abaixo).
5. **Confira o ID** no cartão: deve ser `ohpoogiccjmdgilgegholdidgfhjkadf`. Se for outro, o clone ainda está sem a `"key"`: volte ao passo 2.

O ID muda uma única vez; depois disso as atualizações automáticas não o mudam.

## Chrome no Mac

Pré-requisitos: Git e o GitHub CLI (`brew install git gh`).

1. **Clone o repositório** (privado, então autentique antes). No Terminal:
   ```bash
   gh auth login          # GitHub.com → HTTPS → "Login with a web browser"
   gh auth setup-git      # faz o git usar essa autenticação; nada de token no repositório
   git clone https://github.com/vinicius928e8r84/PerpetualMiner.git ~/PerpetualMiner-ext
   ```
   Esperado: a pasta `~/PerpetualMiner-ext` com `manifest.json` na raiz.
2. **Ligue a atualização automática.**
   ```bash
   cd ~/PerpetualMiner-ext
   cp scripts/com.perpetualminer.atualizar.plist.exemplo ~/Library/LaunchAgents/com.perpetualminer.atualizar.plist
   ```
   Abra o arquivo copiado e troque `SEU_USUARIO` pelo seu usuário do Mac (`whoami`) nos dois caminhos. Depois:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.perpetualminer.atualizar.plist
   tail -n 3 ~/Library/Logs/perpetualminer-atualizar.log
   ```
   Esperado: uma linha como `sem novidade (2f8a0b5)` (ou `atualizado … -> …`). Se aparecer `ERRO no git pull`, refaça o `gh auth login` do passo 1.
3. Abra o Chrome e vá para `chrome://extensions`.
4. Ligue **Modo do desenvolvedor** (canto superior direito). Aparecem os botões *Carregar sem compactação*, *Empacotar extensão* e *Atualizar*.
5. Clique em **Carregar sem compactação** e escolha a pasta `~/PerpetualMiner-ext` (a que tem o `manifest.json`).
   Esperado: o cartão **PerpetualMiner** aparece, ativado, com a versão do `manifest.json` e sem botão vermelho de *Erros*. Uma aba de Boas-vindas abre sozinha.
6. Clique no ícone de quebra-cabeça da barra e **fixe** o PerpetualMiner para ver o ícone e o contador.

## Opera no desktop (Windows)

O Opera usa o mesmo motor de extensões do Chrome. Duas formas de ter a pasta; escolha uma.

### Opção 1: um clone dedicado no WSL (recomendada)

Use um clone só para a extensão, sempre na `main`. Não use o clone em que você desenvolve (ele fica em outras branches e com arquivos modificados) nem o que outro programa gerencia: o script recusa rodar fora da `main`, e um clone sujo trava o `pull`.

1. No terminal do WSL (`gh auth login` e `gh auth setup-git` uma vez, como no Mac):
   ```bash
   git clone https://github.com/vinicius928e8r84/PerpetualMiner.git ~/PerpetualMiner-ext
   ```
2. Agende o `git pull` a cada 10 minutos com `crontab -e`, acrescentando:
   ```
   */10 * * * * $HOME/PerpetualMiner-ext/scripts/atualizar-extensao.sh
   ```
   O cron só roda enquanto o WSL estiver de pé (confira com `service cron status`; se estiver parado, `sudo service cron start`). Se você não deixa o WSL aberto, agende no Windows: **Agendador de Tarefas → Criar Tarefa Básica**, a cada 10 minutos, programa `wsl.exe`, argumentos `-e bash -lc "~/PerpetualMiner-ext/scripts/atualizar-extensao.sh"`.
3. Confira que funciona: rode `~/PerpetualMiner-ext/scripts/atualizar-extensao.sh && tail -n 3 ~/.local/state/perpetualminer-atualizar.log`. Esperado: `sem novidade (…)` ou `atualizado … -> …`.
4. Abra o Opera e vá para `opera://extensions`.
5. Ligue **Modo do desenvolvedor** (canto superior direito).
6. Clique em **Carregar extensão descompactada** e, na janela de pastas, cole na barra de endereço:
   ```
   \\wsl.localhost\<DISTRO>\home\<USUARIO>\PerpetualMiner-ext
   ```
   `<DISTRO>` é o nome que aparece em `wsl -l` (por exemplo `Ubuntu`) e `<USUARIO>` é o resultado de `whoami` no WSL. Selecione a pasta.
   Esperado: o cartão **PerpetualMiner** aparece ativado, com a versão e sem *Erros*. Uma aba de Boas-vindas abre.
7. Se o Opera recusar o caminho de rede (`\\wsl.localhost` às vezes é recusado), use a Opção 2.

### Opção 2: um clone no Windows

1. Instale o [Git para Windows](https://git-scm.com/download/win) e o [GitHub CLI](https://cli.github.com/). No PowerShell:
   ```powershell
   gh auth login
   gh auth setup-git
   git clone https://github.com/vinicius928e8r84/PerpetualMiner.git C:\PerpetualMiner
   ```
2. Agende a atualização: **Agendador de Tarefas → Criar Tarefa Básica**, repetir a cada 10 minutos, ação *Iniciar um programa*:
   - Programa: `C:\Program Files\Git\bin\bash.exe`
   - Argumentos: `C:/PerpetualMiner/scripts/atualizar-extensao.sh`
   O log fica em `%USERPROFILE%\.local\state\perpetualminer-atualizar.log`.
3. Confira que funciona (PowerShell): `& "C:\Program Files\Git\bin\bash.exe" C:/PerpetualMiner/scripts/atualizar-extensao.sh; Get-Content $env:USERPROFILE\.local\state\perpetualminer-atualizar.log -Tail 3`. Esperado: `sem novidade (…)` ou `atualizado … -> …`.
4. Siga os passos 4 a 6 da Opção 1 (`opera://extensions`, Modo do desenvolvedor, Carregar extensão descompactada), escolhendo a pasta `C:\PerpetualMiner`.

## Conferir que a atualização automática funciona

1. Anote a versão do cartão em `chrome://extensions` (ou `opera://extensions`).
2. No clone do computador de desenvolvimento, aumente `"version"` no `manifest.json` (por exemplo `5.0` para `5.0.1`), faça commit e mande para a `main`.
3. No aparelho de teste, rode o script à mão para não esperar os 10 minutos e leia o fim do log:
   - Mac: `~/PerpetualMiner-ext/scripts/atualizar-extensao.sh && tail -n 2 ~/Library/Logs/perpetualminer-atualizar.log`
   - WSL: `~/PerpetualMiner-ext/scripts/atualizar-extensao.sh && tail -n 2 ~/.local/state/perpetualminer-atualizar.log`
   - Windows (PowerShell): `& "C:\Program Files\Git\bin\bash.exe" C:/PerpetualMiner/scripts/atualizar-extensao.sh; Get-Content $env:USERPROFILE\.local\state\perpetualminer-atualizar.log -Tail 2`

   Esperado: `atualizado <antes> -> <depois> (versão 5.0.1)`.
4. Espere até ~1 minuto com a página de extensões aberta. Esperado: o cartão troca sozinho para a versão nova (a página das extensões às vezes só mostra depois de você recarregá-la com F5). Abas de páginas de vídeo já abertas precisam ser recarregadas para pegar o script de conteúdo novo.

Se nada mudar: veja o log (linha `ERRO`), confira `git -C <pasta-do-clone> log -1` e que o cartão está com **Modo do desenvolvedor** ligado (fora dele a verificação não roda).

## Reverter

- **Parar as atualizações**: no Mac, `launchctl unload ~/Library/LaunchAgents/com.perpetualminer.atualizar.plist`; no WSL, remova a linha do `crontab -e`; no Windows, desative a tarefa.
- **Voltar a uma versão anterior**: `git -C ~/PerpetualMiner-ext checkout <commit-ou-tag>` (o script então recusa atualizar, porque o clone deixa de estar na `main`, e a pasta fica parada nessa versão; a extensão se recarrega sozinha com os arquivos antigos). Para retomar: `git checkout main`.
- **Remover a extensão**: em `chrome://extensions` / `opera://extensions`, **Remover** no cartão do PerpetualMiner. As frases guardadas localmente somem junto; as sincronizadas na conta continuam na nuvem.

Prova descartável do passo 2 (PR só de documentação); não mesclar.
