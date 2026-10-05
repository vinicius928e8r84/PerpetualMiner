'use strict';

// O card IA dos cartões de Configurações (docs/design/painel/configuracoes/, desenho A do #101):
// as duas entradas da IA em colunas do mesmo tamanho, a Chave da OpenAI e a Conta do ChatGPT,
// e uma linha sobre a imagem gerada. A coluna da chave funciona; a do ChatGPT mostra que ainda
// não dá para entrar (chega no ticket do plano, #155) e leva a pessoa à chave.
//
// A chave é colada num campo, a Conexão com o Anki a confere na OpenAI (a extensão não fala com ela)
// e, aceita, o card mostra “Chave conferida” com ela mascarada. A chave inteira nunca volta à tela:
// salva, só os 4 últimos caracteres aparecem, e Trocar chave abre o campo vazio. Onde a chave mora
// e como chega à Conexão: lib/chave-da-openai.js. O que o card lê do storage é `pm_chave_openai`
// (os 4 últimos), nunca a chave.
//
// Os erros (chave recusada, sem crédito, organização não verificada, a OpenAI fora do ar, a Conexão
// sem responder) atravessam o card, abaixo das duas colunas, e a abertura em negrito diz a qual
// entrada pertencem. Abaixo de ~620 px de largura do card, as colunas viram linhas.
//
// O mesmo card mora no passo “Configurar a IA dos cartões” da Boas-vindas: `CartaoDaIA.montar(corpo,
// { prefixo })` o desenha em outro lugar, com a mesma chave; cada lugar tem o seu Trocar chave e o seu
// erro. Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, ChaveDaOpenAI, ConexaoAnki } = raiz;
  const { mostrarToastDeSucesso, montarAviso } = raiz.Veio;
  const porId = id => document.getElementById(id);

  // Onde a pessoa resolve o que a OpenAI pede (links, não cópia).
  const ONDE_CRIAR_A_CHAVE = 'https://platform.openai.com/api-keys';
  const ONDE_ADICIONAR_CREDITO = 'https://platform.openai.com/settings/organization/billing/overview';
  const ONDE_VERIFICAR_A_ORGANIZACAO = 'https://platform.openai.com/settings/organization/general';

  /** O que cobre o que a tela não sabe: só o fim da chave aparece, atrás da máscara do painel (a do resumo do Gemini). */
  const MASCARA_DA_CHAVE = '••••••••';

  const estado = {
    ultimos4: null,    // null até a primeira leitura do storage; '' sem chave
    copia: null,       // a Conexão tem a cópia da chave? true · false · null (não se sabe: ela não respondeu)
    focarAoLer: false, // o endereço pediu o foco antes de o storage responder
  };

  /** Onde o card é desenhado: { corpo, prefixo, trocando, conferindo, erro, digitado }. `digitado` é o que a pessoa colou no campo. */
  const lugares = [];
  let configuracoes = null;
  let conexaoLigada = false;

  function iniciar() {
    configuracoes = montar(porId('cfg-ia-corpo'), { prefixo: 'cfg' });
    chrome.storage.local.get({ [ChaveDaOpenAI.MARCA]: null }, dados => {
      estado.ultimos4 = dados[ChaveDaOpenAI.MARCA]?.ultimos4 || '';
      desenharResumo();
      lugares.forEach(desenhar);
      if (estado.focarAoLer) focarOCampoSeVazio();
    });
    // Outra página (ou o outro lugar do card) guardou a chave: aparece aqui sem recarregar. No meio de uma
    // troca ou de uma conferência o que a pessoa faz não é derrubado.
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !(ChaveDaOpenAI.MARCA in mudancas)) return;
      estado.ultimos4 = mudancas[ChaveDaOpenAI.MARCA].newValue?.ultimos4 || '';
      desenharResumo();
      for (const lugar of lugares) if (!lugar.trocando && !lugar.conferindo) desenhar(lugar);
    });
    // Quando a Conexão volta a responder, ela pode estar sem a cópia da chave que a extensão guarda.
    ConexaoAnki.acompanhar(situacao => {
      const ligada = situacao === ConexaoAnki.SITUACAO.LIGADA;
      const voltou = ligada && !conexaoLigada;
      conexaoLigada = ligada;
      if (voltou) conferirACopia();
    });
    raiz.Shell.aoAbrirASecao('ia', focarOCampoSeVazio);
  }

  /** Desenha o card em `corpo`; `prefixo` separa os ids de cada lugar. */
  function montar(corpo, { prefixo }) {
    const lugar = { corpo, prefixo, trocando: false, conferindo: false, erro: null, digitado: '' };
    lugares.push(lugar);
    if (estado.ultimos4 !== null) desenhar(lugar);
    return lugar;
  }

  const idDe = (lugar, parte) => `${lugar.prefixo}-ia-${parte}`;

  function focarOCampoSeVazio() {
    if (estado.ultimos4 === null) {
      estado.focarAoLer = true;
      return;
    }
    if (!estado.ultimos4) porId(idDe(configuracoes, 'campo'))?.focus();
  }

  async function conferirACopia() {
    const tem = await ChaveDaOpenAI.conferirACopia();
    if (tem === estado.copia) return;
    estado.copia = tem;
    for (const lugar of lugares) if (!lugar.trocando && !lugar.conferindo) desenhar(lugar);
  }

  // ─── Desenho ───────────────────────────────────────────────────────────────

  /** A linha fechada: a chave mascarada em mono; sem chave, o ponto `danger` e “Sem chave”. */
  function desenharResumo() {
    const resumo = porId('cfg-ia-resumo');
    if (!estado.ultimos4) {
      const ponto = elemento('span', 'cfg-ponto');
      ponto.dataset.estado = 'erro';
      ponto.setAttribute('aria-hidden', 'true');
      resumo.replaceChildren(elemento('span', 'cfg-status cfg-status--erro', ponto, textoDaVoz('CFG-28.semChave')));
      return;
    }
    resumo.replaceChildren(elemento('span', 'cfg-chave-mascarada', mascarada()));
  }

  const mascarada = () => MASCARA_DA_CHAVE + estado.ultimos4;

  function desenhar(lugar) {
    const colunaDaChave = estado.ultimos4 && !lugar.trocando
      ? chaveSalva(lugar)
      : campoDaChave(lugar);
    const colunas = elemento('div', 'ia-colunas', colunaDaChave, colunaDoChatGPT(lugar));
    const partes = [colunas];
    if (lugar.erro) partes.push(faixaDoErro(lugar));
    partes.push(elemento('p', 'cfg-nota ia-imagem', textoDaVoz('CFG-35.imagem')));
    lugar.corpo.classList.add('ia-cartao');
    lugar.corpo.replaceChildren(...partes);
  }

  function colunaDaChave(lugar, ...filhos) {
    const titulo = elemento('h3', 'ia-coluna__titulo', textoDaVoz('CFG-35.chave.titulo'));
    titulo.id = idDe(lugar, 'chave-titulo');
    const coluna = elemento('section', 'ia-coluna', titulo,
      elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chave.corpo')), ...filhos);
    coluna.setAttribute('aria-labelledby', titulo.id);
    return coluna;
  }

  /** Ponto verde, “Chave conferida”, a chave mascarada e Trocar chave; embaixo, onde ela mora. */
  function chaveSalva(lugar) {
    const ponto = elemento('span', 'cfg-ponto');
    ponto.dataset.estado = 'ok';
    ponto.setAttribute('aria-hidden', 'true');
    const trocar = botao('contorno', textoDaVoz('CFG-35.chave.trocar'), () => {
      lugar.trocando = true;
      lugar.erro = null;
      desenhar(lugar);
      porId(idDe(lugar, 'campo')).focus();
    });
    trocar.id = idDe(lugar, 'trocar');

    const linha = elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem',
        elemento('span', 'cfg-status', ponto, textoDaVoz('CFG-35.chave.salva')),
        elemento('span', 'cfg-chave-mascarada cfg-chave-mascarada--card', mascarada())),
      elemento('div', 'cfg-acoes', trocar));
    return colunaDaChave(lugar, linha, ...notasDaChave(lugar, true));
  }

  /** O campo, Conferir e salvar e (trocando) Cancelar. */
  function campoDaChave(lugar) {
    const campo = elemento('input', 'veio-campo cfg-chave-campo');
    campo.id = idDe(lugar, 'campo');
    campo.type = 'text';
    campo.autocomplete = 'off';
    campo.spellcheck = false;
    campo.placeholder = textoDaVoz('CFG-35.chave.campo');
    campo.setAttribute('aria-label', textoDaVoz('CFG-35.chave.titulo'));
    campo.value = lugar.digitado;
    campo.disabled = lugar.conferindo;

    const vazia = elemento('p', 'veio-campo-erro', textoDaVoz('CFG-35.chave.vazia'));
    vazia.id = idDe(lugar, 'vazia');
    vazia.hidden = true;
    campo.addEventListener('input', () => {
      lugar.digitado = campo.value;
      marcarVazia(campo, vazia, false);
      if (lugar.erro) {
        lugar.erro = null;
        porId(idDe(lugar, 'erro'))?.remove();
      }
    });

    const conferir = elemento('button', `veio-botao veio-botao--${estado.ultimos4 ? 'secundario' : 'primario'}`,
      textoDaVoz(lugar.conferindo ? 'CFG-35.chave.conferindo' : 'CFG-35.chave.conferir'));
    conferir.type = 'submit';
    conferir.id = idDe(lugar, 'conferir');
    // O botão fica no Tab e no foco, mas não repete o pedido enquanto a conferência anda.
    if (lugar.conferindo) conferir.setAttribute('aria-disabled', 'true');
    const acoes = elemento('div', 'cfg-acoes', conferir);
    if (lugar.trocando) {
      const cancelar = botao('fantasma', textoDaVoz('CFG-35.chave.cancelar'), () => {
        lugar.trocando = false;
        lugar.erro = null;
        lugar.digitado = '';
        desenhar(lugar);
        porId(idDe(lugar, 'trocar')).focus();
      });
      cancelar.disabled = lugar.conferindo;
      acoes.append(cancelar);
    }

    // Um formulário: o Enter no campo confere, como o botão.
    const formulario = elemento('form', 'cfg-chave-form',
      elemento('div', 'cfg-chave-entrada', campo, vazia), acoes);
    formulario.noValidate = true;
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      conferirAChave(lugar, campo, vazia);
    });
    if (lugar.conferindo) formulario.setAttribute('aria-busy', 'true');

    return colunaDaChave(lugar, formulario, ...notasDaChave(lugar, false));
  }

  /** Onde a chave mora (e, salva, se a Conexão já tem a cópia) e a sugestão do projeto próprio. */
  function notasDaChave(lugar, salva) {
    const notas = [];
    if (salva) {
      notas.push(elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chave.guardada')));
      if (estado.copia !== null) {
        const copia = elemento('p', 'cfg-nota', textoDaVoz(estado.copia ? 'CFG-35.chave.copiaNaConexao' : 'CFG-35.chave.semCopia'));
        copia.dataset.copia = estado.copia ? 'tem' : 'falta';
        notas.push(copia);
      }
    }
    const onde = elemento('a', 'veio-botao veio-botao--link', textoDaVoz('CFG-35.chave.onde'));
    onde.href = ONDE_CRIAR_A_CHAVE;
    onde.target = '_blank';
    onde.rel = 'noopener noreferrer';
    notas.push(elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chave.dica'), ' ', onde));
    return notas;
  }

  /** A outra entrada: a do ChatGPT, do mesmo tamanho, ainda sem login (o plano chega no #155). */
  function colunaDoChatGPT(lugar) {
    const titulo = elemento('h3', 'ia-coluna__titulo', textoDaVoz('CFG-35.chatgpt.titulo'),
      elemento('span', 'veio-selo', textoDaVoz('CFG-35.chatgpt.selo')));
    titulo.id = idDe(lugar, 'chatgpt-titulo');
    const continuar = elemento('button', 'veio-botao veio-botao--secundario', textoDaVoz('CFG-35.chatgpt.botao'));
    continuar.type = 'button';
    continuar.disabled = true;
    const coluna = elemento('section', 'ia-coluna ia-coluna--chatgpt', titulo,
      elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chatgpt.corpo')),
      elemento('div', 'cfg-acoes', continuar),
      elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chatgpt.indisponivel')));
    coluna.setAttribute('aria-labelledby', titulo.id);
    return coluna;
  }

  /** A faixa do erro, abaixo das colunas, com a entrada a que pertence, o que fazer e o Detalhes. */
  function faixaDoErro(lugar) {
    const { motivo, detalhes } = lugar.erro;
    const abrir = url => () => window.open(url, '_blank', 'noopener,noreferrer');
    const tentar = { rotulo: textoDaVoz('CFG-35.erro.tentarDeNovo'), aoUsar: () => reenviar(lugar) };
    const cada = {
      recusada: { texto: 'CFG-35.erro.recusada', acao: { rotulo: textoDaVoz('CFG-35.erro.trocar'), aoUsar: () => trocarDeNovo(lugar) } },
      sem_credito: { texto: 'CFG-35.erro.semCredito', acao: { rotulo: textoDaVoz('CFG-35.erro.adicionarCredito'), aoUsar: abrir(ONDE_ADICIONAR_CREDITO) } },
      organizacao_nao_verificada: { texto: 'CFG-35.erro.organizacao', acao: { rotulo: textoDaVoz('CFG-35.erro.verificarOrganizacao'), aoUsar: abrir(ONDE_VERIFICAR_A_ORGANIZACAO) } },
      openai_fora_do_ar: { texto: 'CFG-35.erro.foraDoAr', acao: tentar },
      sem_conexao: { texto: 'CFG-35.erro.semConexao', acao: tentar },
      conexao_com_erro: { texto: 'CFG-35.erro.conexaoComErro', acao: tentar },
    }[motivo];
    const aviso = montarAviso({
      abertura: textoDaVoz('CFG-35.erro.entrada'),
      texto: textoDaVoz(cada.texto),
      icone: 'alerta',
      acao: cada.acao,
      detalhes,
      fechavel: false,
    });
    aviso.id = idDe(lugar, 'erro');
    return aviso;
  }

  // ─── Ações ─────────────────────────────────────────────────────────────────

  /** Liga ou desliga o erro de conferir vazio: borda danger (aria-invalid) e o aviso embaixo, ligado ao campo. */
  function marcarVazia(campo, aviso, vazia) {
    aviso.hidden = !vazia;
    if (vazia) {
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', aviso.id);
    } else {
      campo.removeAttribute('aria-invalid');
      campo.removeAttribute('aria-describedby');
    }
  }

  async function conferirAChave(lugar, campo, vazia) {
    if (lugar.conferindo) return;
    const chave = campo.value.trim();
    if (!chave) {
      marcarVazia(campo, vazia, true);
      campo.focus();
      return;
    }
    await enviarAChave(lugar, chave);
  }

  /** Entrega a chave à Conexão e mostra o que veio: a chave conferida ou a faixa do erro. */
  async function enviarAChave(lugar, chave) {
    lugar.conferindo = true;
    lugar.erro = null;
    lugar.digitado = chave;
    desenhar(lugar);
    porId(idDe(lugar, 'conferir')).focus();
    let resultado;
    try {
      resultado = await ChaveDaOpenAI.confirmar(chave);
    } catch (erro) {
      // A Conexão aceitou, mas a chave não coube no armazenamento da extensão: não está guardada aqui.
      resultado = { ok: false, motivo: 'conexao_com_erro', detalhes: String(erro?.message || erro) };
    }
    lugar.conferindo = false;
    if (resultado.ok) {
      lugar.trocando = false;
      lugar.digitado = '';
      estado.ultimos4 = resultado.ultimos4;
      estado.copia = true;
      desenharResumo();
      // Este volta ao resumo; o outro lugar também, se não estiver no meio de uma troca.
      for (const outro of lugares) if (!outro.trocando && !outro.conferindo) desenhar(outro);
      porId(idDe(lugar, 'trocar'))?.focus();
      mostrarToastDeSucesso(textoDaVoz('CFG-35.chave.toast'));
      return;
    }
    // O campo volta com o que a pessoa colou, para ela corrigir ou tentar de novo.
    lugar.erro = { motivo: resultado.motivo, detalhes: resultado.detalhes };
    desenhar(lugar);
    porId(idDe(lugar, 'campo'))?.focus();
  }

  /** Tentar de novo: manda a chave que a pessoa tinha colado (ainda no campo). */
  function reenviar(lugar) {
    if (lugar.digitado.trim()) enviarAChave(lugar, lugar.digitado.trim());
  }

  /** Trocar chave, no erro de chave recusada: limpa o campo para colar outra. */
  function trocarDeNovo(lugar) {
    lugar.erro = null;
    lugar.digitado = '';
    desenhar(lugar);
    porId(idDe(lugar, 'campo'))?.focus();
  }

  function botao(variante, rotulo, aoUsar) {
    const b = elemento('button', `veio-botao veio-botao--${variante}`, rotulo);
    b.type = 'button';
    b.addEventListener('click', aoUsar);
    return b;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  raiz.CartaoDaIA = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
