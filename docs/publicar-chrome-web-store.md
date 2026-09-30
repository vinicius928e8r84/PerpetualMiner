# Publicar na Chrome Web Store (item não listado)

Objetivo: o PerpetualMiner instalado da loja, com link privado (visibilidade **Não listada**), para o Chrome do Mac e o Opera do desktop receberem cada versão nova sozinhos. **Nada disso foi feito ainda**: a conta, o pagamento e o envio são seus.

Enquanto a loja não aprova, use o caminho da pasta descompactada: [instalar-extensao.md](instalar-extensao.md).

## 1. Conta de desenvolvedor (uma vez)

1. Entre em <https://chrome.google.com/webstore/devconsole> com a conta Google que será a dona do item.
2. Aceite o contrato e pague a taxa única de **US$ 5**.
3. Em **Conta**, informe o e-mail de contato e **verifique-o** (a loja não deixa publicar sem isso). Ative a verificação em duas etapas na conta Google, se ainda não estiver.

## 2. Gerar o pacote

Na raiz do repositório:

```bash
node scripts/empacotar-extensao.mjs
```

Sai `dist/perpetualminer-<versão>.zip` com só os arquivos de execução (sem `e2e`, `docs`, `preview`, `bridge`, `engine`, testes, `.git`, `node_modules`, nem os bundles `lib/firebase/`, que nenhuma página carrega), a lista dos arquivos e o tamanho. O script recusa gerar se o `manifest.json` estiver inválido para a loja (versão fora do formato, descrição acima de 132 caracteres, ícone de 128 px ou arquivo referenciado faltando, campo `key`). `dist/` não vai para o git.

**Cada envio precisa de uma `version` maior que a publicada** (ex.: `5.0` → `5.0.1`). Altere só o `manifest.json` antes de empacotar.

## 3. Criar o item (rascunho)

1. No painel: **Novo item** → envie o `.zip`.
2. Anote o **ID do item** (32 letras, aparece na página do item). Ele é fixo daqui em diante e é ele que o Chrome e o Opera usam para atualizar.
3. **Cadastre o login do Google para esse ID**: no Google Cloud Console, projeto do Firebase `perpetualminer-4c219`, cliente OAuth `777592854175-o2ha6n3oqv4f9i2mavbdmfoqbh9iauio`, acrescente em *URIs de redirecionamento autorizados*:
   ```
   https://<ID-DO-ITEM>.chromiumapp.org/
   ```
   Sem isso, entrar na conta e sincronizar não funcionam na versão da loja (o restante funciona). O mesmo vale para o ID de qualquer pasta descompactada que você use.

## 4. Aba "Listagem" (Store listing)

Idioma padrão: **Português (Brasil)**. Categoria: **Educação** (ou Produtividade).

**Nome:** PerpetualMiner

**Descrição curta** (o campo vem do `manifest.json`, máx. 132 caracteres; a atual já serve):
> Minerador de legendas com histórico em tempo real e painel de estudos.

**Descrição longa:**
```
O PerpetualMiner transforma o que você assiste e lê em material de estudo de idiomas.

• Minere a legenda de um vídeo com um atalho (padrão: Alt+S) ou selecione qualquer trecho de texto na página e minere a seleção. A frase é guardada com o nome do vídeo ou da página e o dia.
• O painel de estudos reúne todas as frases, com busca, filtros por idioma e por fonte, e a lista do dia.
• Minerar de uma foto: fotografe uma página de livro com trechos marcados (/assim/, _assim_ ou sublinhados) e a extensão lê só os trechos marcados, usando o Gemini com a sua própria chave de API.
• Palavra automática: opcionalmente, a extensão separa sozinha as palavras que valem estudo, com limite diário por idioma.
• Envio ao Anki: com o programa auxiliar que roda no seu computador, as frases viram cartões do Anki com áudio e imagem.
• Conta opcional: entre com o Google para sincronizar as frases entre computadores.
• Idiomas: inglês e russo.

Suas frases ficam no seu navegador. Nada é enviado para servidores do PerpetualMiner. Detalhes na política de privacidade.
```

**Finalidade única** (campo "Single purpose"):
> Capturar frases de legendas de vídeo, de texto selecionado e de fotos de páginas para estudo de idiomas, guardá-las num painel e enviá-las ao Anki.

**Capturas de tela** (obrigatório ao menos 1; até 5; 1280×800 ou 640×400, PNG ou JPEG sem transparência):
1. Legenda de um vídeo com o overlay do PerpetualMiner e o aviso "minerada".
2. Painel de estudos, lista de Frases.
3. Minerar de uma foto, com as frases lidas.
4. Configurações (atalhos, chave do Gemini, aparência) ou o Envio ao Anki.
5. Popup da barra de ferramentas com o contador do dia.

As telas do painel podem sair do Playwright (`e2e/tests/*-visual.spec.js`) ou de um print direto do Chrome com a janela em 1280×800. Use frases de exemplo, nunca dados pessoais.

**Ícone da loja:** `veio/icones/icone-128.png` (128×128). **Imagem promocional pequena** (440×280): recomendada; a tela de envio pode pedir. Com item não listado, a imagem grande (1400×560) é dispensável.

## 5. Aba "Práticas de privacidade"

### Justificativa de cada permissão

Cole nos campos correspondentes (a loja pede uma por permissão).

| Permissão | Justificativa |
|---|---|
| `storage` | Guarda no navegador as frases mineradas, as configurações, os atalhos, a chave do Gemini informada pela pessoa e a sessão da conta. |
| `unlimitedStorage` | O histórico de frases e os caches de vocabulário crescem com o uso contínuo e passam do limite padrão de 10 MB do armazenamento local. |
| `alarms` | Um alarme por dia, à meia-noite, para zerar o contador do ícone na barra (frases mineradas hoje). |
| `contextMenus` | Cria o item "Minerar seleção" no menu de clique direito sobre texto selecionado. |
| `identity` | Login opcional com a conta Google (`launchWebAuthFlow`) para sincronizar as frases entre computadores. |
| `tabs` | Encontra e foca a aba do painel da própria extensão em vez de abrir outra, lê o título da aba para nomear a fonte da frase minerada pelo menu de contexto e avisa as abas abertas quando o estado da mineração automática muda. |
| `activeTab` | Acesso à aba atual quando a pessoa aciona o menu de contexto ou o atalho. |
| Scripts de conteúdo em todos os sites (`<all_urls>`, todos os frames) | O overlay que lê a legenda do player e marca o trecho minerado precisa rodar no site do vídeo, que pode ser qualquer um (YouTube, Netflix, players de terceiros dentro de iframes). O script só lê a legenda e o texto que a pessoa seleciona, quando ela aciona a captura; não envia nada da página para fora do navegador. |
| `http://127.0.0.1:8766/*`, `http://localhost:8766/*` | Conversa com o programa auxiliar local (bridge) que envia os cartões ao Anki instalado no mesmo computador. É opcional e nunca sai da máquina. |
| `https://generativelanguage.googleapis.com/*` | "Minerar de uma foto": envia a foto escolhida ao Gemini com a chave de API da própria pessoa. |
| `https://firestore.googleapis.com/*`, `https://securetoken.googleapis.com/*`, `https://identitytoolkit.googleapis.com/*`, `https://www.googleapis.com/*` | Login com Google via Firebase e sincronização das frases da conta (Firestore); `www.googleapis.com` devolve nome, e-mail e foto do perfil. |
| `https://*.firebaseio.com/*`, `https://*.firebaseapp.com/*` | Ver o item 4 da lista de riscos abaixo: não são usados pelo código atual e devem sair do manifest. |

**Código remoto:** "Não, não uso código remoto". Todo o JavaScript está no pacote (sem `eval`, sem `<script>` externo). A verificação de atualização automática incluída (`lib/auto-recarregar.js`) só age em instalação descompactada e apenas lê os próprios arquivos.

### Uso de dados (formulário de divulgação)

Marque como **coletados**:
- **Informações de identificação pessoal** (nome, e-mail, foto do perfil Google): só se a pessoa entrar na conta.
- **Conteúdo do site** (texto de legendas e de seleções, título da página): as frases que a pessoa minera.
- **Informações de autenticação**: tokens da sessão do Google/Firebase, guardados no navegador.

Não marque histórico de navegação, localização, atividade do usuário nem dados financeiros/de saúde. Marque as três declarações: não vendo dados; não uso para fins alheios à finalidade única; não uso para avaliar crédito.

### Política de privacidade

A loja exige uma **URL pública** (o repositório é privado, então hospede o texto abaixo numa página pública, como um site seu, GitHub Pages ou um gist público, e cole o endereço).

```
Política de Privacidade — PerpetualMiner

Última atualização: <data>

O PerpetualMiner é uma extensão de navegador para estudo de idiomas. Esta política descreve quais dados ela trata.

O que a extensão guarda
As frases que você minera (texto da legenda ou da seleção, o idioma, o nome do vídeo ou da página de onde veio, e a data), suas configurações, seus atalhos e, se você informar, a sua chave da API do Gemini. Tudo isso fica no armazenamento local do seu navegador.

Conta Google (opcional)
Se você entrar com o Google, a extensão recebe seu nome, e-mail e foto de perfil e guarda um identificador de conta. As suas frases passam a ser sincronizadas com um banco de dados Firestore do projeto Firebase do PerpetualMiner, vinculado à sua conta, para que você as veja em outros computadores. "Apagar tudo" nas configurações remove as frases da nuvem. Sem entrar na conta, nada é enviado à nuvem.

Minerar de uma foto (opcional)
A foto que você escolhe é enviada à API do Gemini (Google), com a chave que você informou, para ler os trechos marcados. Nada é guardado em servidores do PerpetualMiner. O tratamento pelo Google segue os termos da API do Gemini.

Envio ao Anki (opcional)
Se você instalar o programa auxiliar, a extensão conversa com ele em 127.0.0.1 (o seu próprio computador) para criar cartões no Anki. Esses dados não saem da sua máquina, exceto o que o programa auxiliar consultar por conta própria (por exemplo, serviços de voz e de imagem configurados por você).

O que a extensão NÃO faz
Não vende nem compartilha dados com terceiros, não usa dados para publicidade, não coleta histórico de navegação e não tem análise de uso nem rastreadores. Nos sites, os scripts da extensão só leem a legenda do player e o texto que você seleciona quando aciona a captura.

Seus controles
Você pode apagar as frases a qualquer momento no painel (individualmente ou "Apagar tudo"), sair da conta e remover a chave do Gemini. Desinstalar a extensão apaga os dados locais.

Contato
<e-mail de contato>
```

Confira o texto contra o que o programa auxiliar (bridge/engine) faz no seu computador antes de publicar: ele chama serviços de terceiros (voz e imagens) que não são da extensão, e a política acima só os cita de passagem.

## 6. Aba "Distribuição" e envio

1. **Visibilidade: Não listada** (só quem tem o link instala; não aparece na busca). Regiões: todas, ou só o Brasil.
2. **Instruções para teste** (campo para o revisor):
   > O recurso principal funciona sem login: abra um vídeo com legenda (ex.: YouTube com legendas ligadas), pressione Alt+S para minerar a legenda atual e abra o painel pelo ícone da extensão. Login com Google, Gemini e Anki são opcionais; o Anki depende de um programa local que o revisor não precisa instalar.
3. **Enviar para revisão**. Como há script de conteúdo em todos os sites, a primeira revisão costuma ser mais demorada (de dias a algumas semanas). Depois de aprovado o item, publique (ou escolha "publicar automaticamente" ao enviar).
4. Guarde o **link do item** (`https://chromewebstore.google.com/detail/<ID>`).

## 7. Como a atualização chega aos navegadores

**Chrome no Mac:** abra o link do item e clique **Adicionar ao Chrome**. Depois disso o Chrome checa atualizações sozinho, a cada poucas horas. Para forçar: `chrome://extensions` → Modo do desenvolvedor → **Atualizar**. Se você já carregou a pasta descompactada, **remova** essa cópia antes (são duas extensões diferentes, com IDs diferentes).

**Opera no Windows:** o Opera não tem loja própria para extensões do Chrome, mas instala as da Chrome Web Store:
1. Instale o complemento **Install Chrome Extensions** em <https://addons.opera.com/en/extensions/details/install-chrome-extensions/>.
2. Abra o link do item da Chrome Web Store no Opera e clique **Adicionar ao Opera**.
3. O Opera atualiza essas extensões sozinho; para forçar, `opera://extensions` → Modo do desenvolvedor → **Atualizar**.

**Publicar uma versão nova:** aumente a `version` no `manifest.json`, `node scripts/empacotar-extensao.mjs`, no painel do item vá em **Pacote → Fazer upload do novo pacote** e envie para revisão. Cada versão passa por nova revisão (em geral de horas a poucos dias); quando aprovada, o Chrome e o Opera a recebem sozinhos.

O login com Google da versão da loja usa o ID do item (etapa 3 da seção "Criar o item"), não o da pasta descompactada.

## 8. O que a loja tende a rejeitar ou pedir justificativa

Resultado da revisão do `manifest.json` atual, do mais provável de dar problema ao menos:

1. **Scripts de conteúdo em `<all_urls>` com `all_frames`.** Dispara revisão aprofundada e a pergunta "por que todos os sites?". A justificativa da tabela acima cobre; ela precisa ser convincente porque não há como listar os sites de vídeo. Mitigação possível: restringir a sites conhecidos, ao custo de quebrar players de terceiros.
2. **`tabs`.** Aparece no aviso de instalação como "Ler seu histórico de navegação". O código só precisa achar as abas do próprio painel e ler o título da aba clicada no menu de contexto (o que a `activeTab` já cobre). Provavelmente dá para tirar `tabs`, mas isso não foi testado; teste antes de remover, porque a busca por URL do painel depende dela.
3. **`activeTab` junto com `tabs` e os scripts em todos os sites.** É redundante com as duas; a loja costuma pedir para remover permissão desnecessária. Fique com a justificativa curta acima ou tire a `activeTab` (o código não usa nada que só ela dê, fora o título da aba no menu de contexto, que o clique no menu já concede).
4. **Hosts sem uso.** `https://*.firebaseio.com/*` e `https://*.firebaseapp.com/*` não são chamados por nenhum código (o Firestore é usado por `firestore.googleapis.com`), e `http://localhost:8766/*` repete `127.0.0.1:8766`. Permissão de host sem uso é o motivo mais comum de "Purple Potassium" (permissão não usada): **tire as duas primeiras do `manifest.json` antes do envio** (é uma mudança de manifest que eu não fiz aqui, para não mexer no que os testes esperam) e mantenha só o `127.0.0.1` se o `localhost` não for usado.
5. **`web_accessible_resources` com `<all_urls>` incluindo `painel.html` e `bookreader.html`.** Qualquer site pode embutir essas páginas por `iframe` e identificar que a extensão está instalada (fingerprinting). O overlay só precisa das folhas de estilo, fontes e do SVG; as páginas do painel não precisam ser públicas se ninguém as abre de dentro de um site. Vale restringir antes do envio.
6. **Servidor local na porta 8766.** Explique na descrição e nas instruções de teste que ele é um programa auxiliar opcional do próprio usuário; revisores olham com atenção qualquer conexão a `localhost`.
7. **Login com Google exige o ID do item cadastrado no OAuth** (seção 3), e o cliente OAuth e a chave web do Firebase ficam expostos no código da extensão. A chave web do Firebase é pública por desenho; o que protege os dados são as regras do Firestore, então confirme que só o dono de `usuarios/{uid}` lê e escreve o próprio caminho.
8. **Política de privacidade em URL pública e formulário de dados coerentes com o que o código faz.** Divergência (por exemplo não declarar o e-mail do Google) é motivo de recusa.
9. **Finalidade única.** A extensão faz várias coisas (legenda, seleção, foto, Anki, sincronização); a redação acima as apresenta como um único propósito (estudo de idiomas por captura de frases). Se o revisor questionar, o Anki e a foto são as funções mais fáceis de defender como parte do mesmo fluxo.
10. **Chave `key` no manifest.** Não deve constar no pacote da loja (o script recusa). Para manter o mesmo ID nas cópias descompactadas, use a chave pública que o painel do item mostra em *Pacote → Ver chave pública*, colocada só nas cópias de teste.
