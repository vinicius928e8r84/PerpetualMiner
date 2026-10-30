'use strict';

// A coluna Conta do ChatGPT do card IA dos cartões (#155, docs/design/login-do-chatgpt.md), a do mesmo tamanho que a da chave.
// O login e os tokens são da Conexão com o Anki: esta coluna só pede (`PedidoAoAnki`), abre a URL de autorização numa aba e lê o
// estado `{ conectada, entrando, falha }`, que ela nunca guarda no navegador. Enquanto a pessoa entra no ChatGPT, relê a cada 2 s.
// `painel-ia.js` desenha o card e pede aqui a coluna (`coluna(lugar)`) e a faixa do erro dela (`faixa(lugar)`), em cada lugar do card.

(function (raiz) {
  const { textoDaVoz } = raiz;
  const { mostrarToastDeSucesso, montarAviso } = raiz.Veio;

  // Gerenciar uso: a página de uso do ChatGPT, onde a pessoa vê o uso e desconecta o app (doc do Sign in with ChatGPT,
  // “Accounts and sessions” § Tracking usage; os endereços do login estão em complemento/chatgpt_oficial.py).
  const GERENCIAR_USO = 'https://chatgpt.com/settings/usage';
  // A extensão só abre a autorização do servidor de login oficial, venha o que vier de quem responde na porta da Conexão.
  const AUTORIZAR = 'https://auth.openai.com/api/accounts/authorize?';
  const RELER_A_CADA_MS = 2000;
  // O aviso da primeira vez com o plano (as diretrizes da OpenAI o pedem, P2 do #101): dado uma vez neste computador, no storage da extensão.
  const AVISADO = 'pm_plano_do_chatgpt_avisado';

  // login: o que a Conexão disse (null: não se sabe); cancelado: a pessoa desistiu de esperar a aba (a próxima tentativa troca a da Conexão).
  const estado = { login: null, pedindo: false, erro: null, cancelado: false };
  const lugares = new Map(); // lugar do card → { coluna, faixa }: os nós desta coluna, redesenhados no lugar
  let releitura = null;
  let avisando = false;

  async function pedir(pedido) {
    try {
      const resposta = await raiz.PedidoAoAnki.pedir(raiz.ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(5000) });
      return { status: resposta.status, json: await resposta.json().catch(() => null) };
    } catch { return null; }
  }

  const doPedido = resposta => ({ motivo: !resposta ? 'sem_conexao' : resposta.status === 404 ? 'antiga' : 'chatgpt_login_failed',
    detalhes: resposta ? `HTTP ${resposta.status}${resposta.json?.error ? ` · ${resposta.json.error}` : ''}` : 'sem resposta' });

  async function ler() {
    clearTimeout(releitura);
    const resposta = await pedir(raiz.PedidoAoAnki.estadoDoChatGPT());
    const login = resposta?.status === 200 && typeof resposta.json?.conectada === 'boolean' ? resposta.json : null;
    estado.login = login;
    if (login?.conectada) avisarDoPlano();
    if (entrando()) releitura = setTimeout(ler, RELER_A_CADA_MS);
    desenharTudo();
  }

  const entrando = () => Boolean(estado.login?.entrando) && !estado.cancelado;

  /** O modal “Você está usando o seu plano do ChatGPT”, na primeira vez que o plano aparece em uso: Entendi, Esc e o clique fora o dão por visto. */
  function avisarDoPlano() {
    if (avisando) return;
    avisando = true;
    chrome.storage.local.get({ [AVISADO]: false }, dados => {
      if (dados[AVISADO]) return;
      const titulo = elemento('h2', 'veio-modal__titulo', textoDaVoz('CFG-35.planoTitulo'));
      const corpo = elemento('p', 'veio-modal__corpo', textoDaVoz('CFG-35.planoCorpo'));
      titulo.id = 'ia-plano-titulo';
      corpo.id = 'ia-plano-corpo';
      const entendi = botao('primario', textoDaVoz('CFG-35.planoEntendi'), () => modal.fechar());
      entendi.dataset.focoSeguro = '';
      const dialogo = elemento('div', 'veio-modal', titulo, corpo, elemento('div', 'veio-modal__acoes', entendi));
      dialogo.setAttribute('role', 'dialog');
      dialogo.setAttribute('aria-labelledby', titulo.id);
      dialogo.setAttribute('aria-describedby', corpo.id);
      const scrim = elemento('div', 'veio-scrim', dialogo);
      scrim.hidden = true;
      document.body.append(scrim);
      const modal = raiz.Veio.abrirModal(scrim, { aoFechar: () => { scrim.remove(); chrome.storage.local.set({ [AVISADO]: true }); } });
    });
  }

  async function entrar() {
    if (estado.pedindo || entrando()) return;
    estado.pedindo = true;
    estado.erro = null;
    estado.cancelado = false;
    desenharTudo();
    const resposta = await pedir(raiz.PedidoAoAnki.entrarComOChatGPT());
    estado.pedindo = false;
    const url = resposta?.status === 200 ? resposta.json?.url : null;
    if (typeof url === 'string' && url.startsWith(AUTORIZAR)) {
      chrome.tabs.create({ url });
      return ler();
    }
    estado.erro = doPedido(resposta);
    desenharTudo();
  }

  async function sair() {
    if (estado.pedindo) return;
    estado.pedindo = true;
    estado.erro = null;
    desenharTudo();
    const resposta = await pedir(raiz.PedidoAoAnki.sairDoChatGPT());
    estado.pedindo = false;
    if (resposta?.status === 200 && resposta.json?.ok === true) {
      if (resposta.json.revogada === true) mostrarToastDeSucesso(textoDaVoz('CFG-35.chatgptSaiu'));
      else estado.erro = { motivo: 'sem_revogar', detalhes: 'revogada: false' };
      return ler();
    }
    estado.erro = doPedido(resposta);
    desenharTudo();
  }

  /** O erro de agora: o de um pedido desta página, ou a falha da última tentativa que a Conexão conta. */
  function erroDeAgora() {
    const { login } = estado;
    return estado.erro || (login?.falha && !login.entrando && !login.conectada ? { motivo: login.falha, detalhes: login.falha } : null);
  }

  function coluna(lugar) {
    const no = elemento('section', 'ia-coluna ia-coluna--chatgpt');
    no.setAttribute('aria-labelledby', `${lugar.prefixo}-ia-chatgpt-titulo`);
    const faixa = elemento('div', 'ia-chatgpt-faixa');
    lugares.set(lugar, { coluna: no, faixa });
    desenhar(lugar);
    return no;
  }

  const faixa = lugar => lugares.get(lugar)?.faixa || elemento('div', 'ia-chatgpt-faixa');

  function desenharTudo() {
    for (const lugar of lugares.keys()) desenhar(lugar);
  }

  function desenhar(lugar) {
    const { coluna: no, faixa: daFaixa } = lugares.get(lugar);
    const titulo = elemento('h3', 'ia-coluna__titulo', textoDaVoz('CFG-35.chatgptTitulo'),
      elemento('span', 'veio-selo', textoDaVoz('CFG-35.chatgptSelo')));
    titulo.id = `${lugar.prefixo}-ia-chatgpt-titulo`;
    const partes = [titulo, elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chatgptCorpo'))];
    const { login } = estado;
    if (login?.conectada) {
      const ponto = elemento('span', 'cfg-ponto');
      ponto.dataset.estado = 'ok';
      ponto.setAttribute('aria-hidden', 'true');
      const gerenciar = elemento('a', 'veio-botao veio-botao--link', textoDaVoz('CFG-35.chatgptGerenciar'));
      Object.assign(gerenciar, { href: GERENCIAR_USO, target: '_blank', rel: 'noopener noreferrer' });
      partes.push(elemento('p', 'cfg-status ia-chatgpt-plano', ponto, textoDaVoz('CFG-35.chatgptUsando'), ' · ', gerenciar),
        elemento('div', 'cfg-acoes', botao('contorno', textoDaVoz('CFG-35.chatgptSair'), sair)));
      // Com o plano e sem chave, o cartão não leva imagem gerada (#156): a coluna diz o que a pessoa perde.
      if (!raiz.CartaoDaIA.temChave()) partes.push(elemento('p', 'cfg-nota', textoDaVoz('CFG-35.semChave')));
    } else if (entrando()) {
      const esperando = botao('secundario', textoDaVoz('CFG-35.chatgptEsperando'), entrar);
      esperando.setAttribute('aria-disabled', 'true');
      const cancelar = botao('fantasma', textoDaVoz('CFG-35.chaveCancelar'), () => {
        estado.cancelado = true;
        clearTimeout(releitura);
        desenharTudo();
      });
      partes.push(elemento('div', 'cfg-acoes', esperando, cancelar), elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chatgptEsperandoNota')));
    } else {
      const continuar = botao('secundario', textoDaVoz('CFG-35.chatgptBotao'), entrar);
      if (estado.pedindo) continuar.setAttribute('aria-disabled', 'true');
      partes.push(elemento('div', 'cfg-acoes', continuar));
    }
    partes.push(elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chatgptNota')));
    no.replaceChildren(...partes);
    const erro = erroDeAgora();
    daFaixa.replaceChildren(...(erro ? [faixaDoErro(lugar, erro)] : []));
  }

  /** A faixa do erro, abaixo das colunas como a da chave, aberta por “Conta do ChatGPT:”, com o que fazer e o Detalhes. */
  function faixaDoErro(lugar, { motivo, detalhes }) {
    const tentar = { rotulo: textoDaVoz('CFG-35.erroTentarDeNovo'), aoUsar: entrar };
    const usarAChave = { rotulo: textoDaVoz('CFG-35.erroChatgptUsarChave'), aoUsar: () => document.getElementById(`${lugar.prefixo}-ia-campo`)?.focus() };
    const cada = {
      chatgpt_access_denied: ['CFG-35.erroChatgptSemPlano', tentar],
      chatgpt_plan_not_granted: ['CFG-35.erroChatgptSemPlano', tentar],
      chatgpt_not_eligible: ['CFG-35.erroChatgptNaoServe', usarAChave],
      sem_conexao: ['CFG-35.erroChatgptSemConexao', tentar],
      antiga: ['CFG-35.erroChatgptAntiga', { rotulo: textoDaVoz('CFG-35.erroAtualizar'), aoUsar: () => raiz.CartaoDaIA.baixarConexao() }],
      sem_revogar: ['CFG-35.erroChatgptSemRevogar', { rotulo: textoDaVoz('CFG-35.chatgptGerenciar'),
        aoUsar: () => window.open(GERENCIAR_USO, '_blank', 'noopener,noreferrer') }],
    }[motivo] || ['CFG-35.erroChatgptFalhou', tentar];
    const aviso = montarAviso({
      abertura: textoDaVoz('CFG-35.erroChatgptEntrada'), texto: textoDaVoz(cada[0]), icone: 'alerta', acao: cada[1], detalhes, fechavel: false,
    });
    aviso.id = `${lugar.prefixo}-ia-chatgpt-erro`;
    return aviso;
  }

  function botao(variante, rotulo, aoUsar) {
    const b = elemento('button', `veio-botao veio-botao--${variante}`, rotulo);
    b.type = 'button';
    b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') !== 'true') aoUsar(); });
    return b;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', () => {
    // A Conexão que liga relê o login; a que desliga deixa a coluna sem afirmar nada dele (C8).
    raiz.ConexaoAnki.acompanhar(situacao => {
      if (situacao === raiz.ConexaoAnki.SITUACAO.LIGADA) ler();
      else if (situacao !== raiz.ConexaoAnki.SITUACAO.CONECTANDO && estado.login) {
        estado.login = null;
        desenharTudo();
      }
    });
    // A pessoa volta da aba do ChatGPT: relê na hora, sem esperar a próxima volta.
    window.addEventListener('focus', () => { if (entrando()) ler(); });
  });

  raiz.ColunaDoChatGPT = { coluna, faixa };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
