# Instalar a extensão para testar (com atualização automática)

Este guia carrega o PerpetualMiner como **pasta descompactada** no Chrome do Mac e no Opera do desktop. A pasta é um clone do repositório que se mantém atualizado sozinho; quando um arquivo muda, a própria extensão se recarrega em até ~1 minuto. Você não troca arquivo nenhum à mão.

> Quando a extensão estiver na Chrome Web Store, o navegador passa a atualizá-la sozinho e este caminho deixa de ser necessário: veja [publicar-chrome-web-store.md](publicar-chrome-web-store.md).

## Como funciona

1. Um clone do repositório (na branch `main`) fica em disco. Um agendador roda `scripts/atualizar-extensao.sh` a cada 10 minutos: é um `git pull --ff-only`, que não cria merge nem sobrescreve mudança local.
2. O navegador carrega esse clone como extensão descompactada.
3. A cada minuto a extensão relê os próprios arquivos (só os da pasta, sem rede). Se algum mudou, chama `chrome.runtime.reload()`. Na instalação da loja essa verificação não faz nada (`installType` diferente de `development`).

Tempo até a nova versão aparecer: até ~10 min (o pull) + ~1 min (o reload).

## Aviso sobre o login com Google

A extensão faz login por `chrome.identity`, e o endereço de retorno do Google (`https://<id-da-extensão>.chromiumapp.org/`) depende do **ID** da extensão. Uma pasta descompactada tem um ID que muda de aparelho para aparelho (vem do caminho da pasta), e a versão da loja terá outro. O login só funciona depois que esse endereço é cadastrado no cliente OAuth do Google Cloud (projeto do Firebase `perpetualminer-4c219`, "URIs de redirecionamento autorizados"). Sem isso, o resto da extensão funciona; só entrar na conta e sincronizar falham. Anote o ID de cada instalação (aparece no cartão da extensão em `chrome://extensions`).

## Chrome no Mac

Pré-requisitos: Git e o GitHub CLI (`brew install git gh`).

1. **Clone o repositório** (privado, então autentique antes). No Terminal:
   ```bash
   gh auth login          # GitHub.com → HTTPS → "Login with a web browser"
   gh auth setup-git      # faz o git usar essa autenticação; nada de token no repositório
   git clone https://github.com/vinicius928e8r84/PerpetualMiner.git ~/PerpetualMiner
   ```
   Esperado: a pasta `~/PerpetualMiner` com `manifest.json` na raiz.
2. **Ligue a atualização automática.**
   ```bash
   cd ~/PerpetualMiner
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
5. Clique em **Carregar sem compactação** e escolha a pasta `~/PerpetualMiner` (a que tem o `manifest.json`).
   Esperado: o cartão **PerpetualMiner** aparece, ativado, com a versão do `manifest.json` e sem botão vermelho de *Erros*. Uma aba de Boas-vindas abre sozinha.
6. Clique no ícone de quebra-cabeça da barra e **fixe** o PerpetualMiner para ver o ícone e o contador.

## Opera no desktop (Windows)

O Opera usa o mesmo motor de extensões do Chrome. Duas formas de ter a pasta; escolha uma.

### Opção 1: a pasta do clone que já está no WSL (recomendada, nada a instalar)

O clone do WSL (`~/PerpetualMiner`, na `main`) já é mantido atualizado. Para que ele rode o `git pull` sozinho, agende no WSL:

```bash
crontab -e   # acrescente a linha abaixo
*/10 * * * * /home/sadvi/PerpetualMiner/scripts/atualizar-extensao.sh
```

O cron só roda enquanto o WSL estiver de pé. Se você não deixa o WSL aberto, use a Opção 2 ou agende no Windows uma tarefa que rode `wsl.exe -e /home/sadvi/PerpetualMiner/scripts/atualizar-extensao.sh` (Agendador de Tarefas, a cada 10 min). O script recusa rodar se o clone não estiver na `main`; se você desenvolve nesse clone, use um clone só para o teste (`git clone … ~/PerpetualMiner-teste`) e carregue esse.

1. Abra o Opera e vá para `opera://extensions`.
2. Ligue **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar extensão descompactada** e, na janela de pastas, cole na barra de endereço:
   ```
   \\wsl.localhost\Ubuntu\home\sadvi\PerpetualMiner
   ```
   (troque `Ubuntu` pelo nome da sua distro, que aparece em `wsl -l`). Selecione a pasta.
   Esperado: o cartão **PerpetualMiner** aparece ativado, com a versão e sem *Erros*. Uma aba de Boas-vindas abre.
4. Se o Opera reclamar do caminho de rede (`\\wsl.localhost` às vezes é recusado), use a Opção 2.

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
3. Siga os passos 1 a 3 da Opção 1, escolhendo a pasta `C:\PerpetualMiner`.

## Conferir que a atualização automática funciona

1. Anote a versão do cartão em `chrome://extensions` (ou `opera://extensions`).
2. No clone do computador de desenvolvimento, aumente `"version"` no `manifest.json` (por exemplo `5.0` para `5.0.1`), faça commit e mande para a `main`.
3. No aparelho de teste, rode o script à mão para não esperar os 10 minutos:
   ```bash
   ~/PerpetualMiner/scripts/atualizar-extensao.sh && tail -n 2 ~/Library/Logs/perpetualminer-atualizar.log
   ```
   Esperado: `atualizado <antes> -> <depois> (versão 5.0.1)`.
4. Espere até ~1 minuto com a página de extensões aberta. Esperado: o cartão troca sozinho para a versão nova (a página das extensões às vezes só mostra depois de você recarregá-la com F5). Abas de páginas de vídeo já abertas precisam ser recarregadas para pegar o script de conteúdo novo.

Se nada mudar: veja o log (linha `ERRO`), confira `git -C ~/PerpetualMiner log -1` e que o cartão está com **Modo do desenvolvedor** ligado (fora dele a verificação não roda).

## Reverter

- **Parar as atualizações**: no Mac, `launchctl unload ~/Library/LaunchAgents/com.perpetualminer.atualizar.plist`; no WSL, remova a linha do `crontab -e`; no Windows, desative a tarefa.
- **Voltar a uma versão anterior**: `git -C ~/PerpetualMiner checkout <commit-ou-tag>` (o script então recusa atualizar, porque o clone deixa de estar na `main`, e a pasta fica parada nessa versão; a extensão se recarrega sozinha com os arquivos antigos). Para retomar: `git checkout main`.
- **Remover a extensão**: em `chrome://extensions` / `opera://extensions`, **Remover** no cartão do PerpetualMiner. As frases guardadas localmente somem junto; as sincronizadas na conta continuam na nuvem.
