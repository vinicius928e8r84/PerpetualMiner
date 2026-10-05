'use strict';

// O card Conexão com o Anki de Configurações: o interruptor “Abrir o Anki com o
// computador” (história 101, #106). Vem desligado. Ligado, a Conexão escreve o
// item de login (um LaunchAgent no Mac, um atalho na pasta Inicializar no
// Windows); desligado, ela o apaga. O item mora na Conexão, não na extensão:
// por isso o interruptor mostra o que a Conexão diz (`POST
// /abrir-com-o-computador/estado`) e só muda depois da resposta dela (`POST
// /abrir-com-o-computador`, `{ ligado }`). Nada é gravado no storage.
//
// Sem a Conexão o estado não se sabe: o interruptor fica indisponível e a nota
// diz por quê (C8); o resumo da linha fechada, também. Um pedido que falha deixa
// o interruptor no que está de verdade e mostra o aviso persistente (CFG-39),
// com a causa em Detalhes.
//
// O Anki nunca abre sozinho por aqui: esta tela só escreve ou apaga o item. Toda
// cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, Shell } = raiz;
  const { SITUACAO } = ConexaoAnki;
  const ROTA = `${ConexaoAnki.ENDERECO}/abrir-com-o-computador`;
  const porId = id => document.getElementById(id);

  const estado = {
    situacao: SITUACAO.CONECTANDO,
    ligado: null,        // null até a Conexão dizer
    gravando: false,     // um pedido de ligar ou desligar no ar
    falha: null,         // { ligar, erro }: o que não mudou, e a causa
    leitura: 0,          // só a leitura mais recente vale
  };
  let partes = null;     // o conteúdo do card, montado uma vez e atualizado no lugar

  function iniciar() {
    desenhar();
    ConexaoAnki.acompanhar(situacao => {
      const voltou = situacao === SITUACAO.LIGADA && estado.situacao !== SITUACAO.LIGADA;
      estado.situacao = situacao;
      if (voltou) ler();
      desenhar();
    });
    // O item pode mudar fora daqui (a pessoa o tira dos Itens de Início): ao entrar na área, lê de novo.
    Shell.aoEntrarNaArea('configuracoes', () => { if (estado.situacao === SITUACAO.LIGADA) ler(); });
  }

  // ─── A Conexão ─────────────────────────────────────────────────────────────

  /** `POST` com `corpo`; devolve o JSON, ou levanta um erro com o `codigo` que a Conexão deu. */
  async function pedir(caminho, corpo) {
    const resposta = await fetch(`${ROTA}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(ConexaoAnki.TEMPO_DA_RESPOSTA),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw Object.assign(new Error(`HTTP ${resposta.status}${dados.error ? ` · ${dados.error}` : ''}`), { codigo: dados.error || null });
    }
    return dados;
  }

  async function ler() {
    const leitura = ++estado.leitura;
    try {
      const { ligado } = await pedir('/estado', {});
      if (leitura === estado.leitura && !estado.gravando) estado.ligado = ligado === true;
    } catch {
      // Sem resposta o estado fica como estava; a conferência da Conexão diz se ela caiu.
    }
    desenhar();
  }

  async function mudar(ligar) {
    estado.gravando = true;
    estado.falha = null;
    estado.leitura++;
    desenhar();
    try {
      const { ligado } = await pedir('', { ligado: ligar });
      estado.ligado = ligado === true;
    } catch (erro) {
      estado.falha = { ligar, erro };
    }
    estado.gravando = false;
    desenhar();
    partes.interruptor.focus();
  }

  // ─── Card ──────────────────────────────────────────────────────────────────

  function montar() {
    const nome = elemento('b', 'cfg-nome', textoDaVoz('CFG-36.rotulo'));
    nome.id = 'cfg-anki-nome';
    const nota = elemento('span', 'cfg-nota');
    nota.id = 'cfg-anki-nota';
    const interruptor = elemento('input');
    interruptor.type = 'checkbox';
    interruptor.id = 'cfg-anki-interruptor';
    interruptor.setAttribute('role', 'switch');
    interruptor.setAttribute('aria-labelledby', nome.id);
    interruptor.setAttribute('aria-describedby', nota.id);
    interruptor.addEventListener('change', () => mudar(interruptor.checked));
    const aviso = elemento('div', 'cfg-anki-aviso');

    const linha = elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem', nome, nota),
      elemento('div', 'cfg-acoes', elemento('label', 'veio-toggle', interruptor, elemento('span', 'veio-toggle__trilho'))));
    porId('cfg-anki-corpo').replaceChildren(aviso, linha);
    return { aviso, avisoDe: null, nota, interruptor };
  }

  function desenhar() {
    if (!partes) partes = montar();
    const ligada = estado.situacao === SITUACAO.LIGADA;
    const lendo = ligada && estado.ligado === null;

    partes.interruptor.checked = estado.ligado === true;
    partes.interruptor.disabled = !ligada || lendo || estado.gravando;
    partes.interruptor.setAttribute('aria-busy', String(estado.gravando || lendo));
    partes.nota.textContent = !ligada ? textoDaVoz('CFG-38.indisponivel')
      : lendo ? textoDaVoz('CFG-38.lendo')
        : textoDaVoz('CFG-36.nota');
    desenharOResumo(ligada && !lendo);
    desenharOAviso();
  }

  /** A linha fechada: o que o item faz agora; sem a Conexão, que não se sabe. */
  function desenharOResumo(sabe) {
    const texto = !sabe ? 'CFG-37.indisponivel' : estado.ligado ? 'CFG-37.ligado' : 'CFG-37.desligado';
    porId('cfg-anki-resumo').replaceChildren(elemento('span', null, textoDaVoz(texto)));
  }

  /** O aviso fica o mesmo nó enquanto a falha é a mesma: o Detalhes aberto e o foco sobrevivem às outras leituras. */
  function desenharOAviso() {
    const { falha } = estado;
    if (falha === partes.avisoDe) return;
    partes.avisoDe = falha;
    if (!falha) {
      partes.aviso.replaceChildren();
      return;
    }
    const texto = falha.erro.codigo === 'anki_not_found' ? textoDaVoz('CFG-39.semAnki')
      : falha.erro.codigo === 'login_item_unsupported' ? textoDaVoz('CFG-39.semSuporte')
        : textoDaVoz(falha.ligar ? 'CFG-39.ligar' : 'CFG-39.desligar');
    partes.aviso.replaceChildren(Veio.montarAviso({
      texto,
      detalhes: falha.erro.message,
      rotuloDeFechar: textoDaVoz('PAI-34'),
      aoFechar: () => { estado.falha = null; partes.avisoDe = null; },
    }));
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
