'use strict';

// A prévia do Cartão (#164, BRG-43): o Cartão de exemplo de um estilo (idioma × nível) como o Anki o desenha. É o Anki que o desenha (a Conexão pede
// ao renderizador dele, `POST /anki/card-preview`), e esta página só o mostra, num quadro isolado: o HTML do Cartão vem de fora e o quadro não roda
// script nenhum (`sandbox` sem `allow-scripts`) nem carrega nada que não seja `data:` (a política do documento). Frente e Verso são as duas faces; o Verso
// traz a frente em cima, como o Anki depois de “Mostrar resposta”. Um componente só: Ajustes de envio › Estilo do cartão e o passo do nível da Boas-vindas
// o montam, e o do primeiro Cartão (#173) pode pedir o de uma nota gravada.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, PedidoAoAnki, IDIOMAS } = raiz;
  const NOME_DO_IDIOMA = { en: IDIOMAS.INGLES, ru: IDIOMAS.RUSSO };
  const VOZ_DO_NIVEL = { iniciante: 'BRG-42.iniciante', intermediario: 'BRG-42.intermediario', avancado: 'BRG-42.avancado' };
  const ALTURA_MINIMA = 140;
  const ALTURA_MAXIMA = 460;
  const POLITICA = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  const ESTADO = Object.freeze({ CARREGANDO: 'carregando', PRONTA: 'pronta', SEM_CONEXAO: 'semConexao', ANTIGA: 'antiga', FALHOU: 'falhou' });

  const lidas = new Map();   // `${idioma}/${nível}` → a leitura (a promessa de `{ estado, previa }`): o exemplo de um estilo não muda enquanto a página está aberta

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  /** O documento do quadro: o CSS do tipo de nota, o Cartão dentro do `.card` (como o Anki o põe) e a política que só deixa `data:` entrar. */
  function documentoDoQuadro(css, html) {
    return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLITICA}">`
      + `<style>html { min-height: 100%; } body { margin: 0; } .card { min-height: 100vh; box-sizing: border-box; padding: 16px; } ${css}</style><div class="card">${html}</div>`;
  }

  /** Pede o exemplo à Conexão (um pedido por estilo, repartido entre quem o mostra); devolve `{ estado, previa }`, nunca levanta. Só a leitura boa fica guardada. */
  function ler(lang, nivel, tipoProprio) {
    if (tipoProprio) return pedir(lang, nivel, tipoProprio);   // no tipo de nota da pessoa (#165) o Cartão muda com o Anki dela: nada fica guardado
    const chave = `${lang}/${nivel}`;
    if (!lidas.has(chave)) {
      const leitura = pedir(lang, nivel);
      lidas.set(chave, leitura);
      leitura.then(({ estado }) => { if (estado !== ESTADO.PRONTA) lidas.delete(chave); });
    }
    return lidas.get(chave);
  }

  async function pedir(lang, nivel, tipoProprio) {
    let resposta;
    try {
      resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, PedidoAoAnki.previaDoCartao(lang, nivel, tipoProprio));
    } catch {
      return { estado: ESTADO.SEM_CONEXAO };
    }
    if (resposta.status === 503) return { estado: ESTADO.SEM_CONEXAO };
    if (!resposta.ok) return { estado: PedidoAoAnki.ausenciaDaRota(resposta.status) === 'antiga' ? ESTADO.ANTIGA : ESTADO.FALHOU };
    const previa = await resposta.json().catch(() => null);
    if (typeof previa?.front !== 'string' || typeof previa?.back !== 'string' || typeof previa?.css !== 'string') return { estado: ESTADO.FALHOU };
    return { estado: ESTADO.PRONTA, previa };
  }

  /**
   * A prévia de um idioma. `prefixo` separa os ids de quem a monta (a Boas-vindas e Ajustes de envio vivem na mesma página). Devolve `{ no, mostrar }`:
   * `mostrar(nivel, tipoProprio)` pede e desenha o exemplo do nível (um pedido que chega depois de outro mais novo é descartado); com `tipoProprio`
   * (`{ nome, mapa }`, #165), o exemplo no tipo de nota que a pessoa já tem, com as partes nos campos do mapa.
   */
  function montar({ prefixo, lang }) {
    const id = `${prefixo}-previa-${lang}`;
    const estado = { nivel: null, tipoProprio: null, face: 'back', previa: null, vez: 0 };

    const titulo = elemento('span', 'previa__titulo', textoDaVoz('BRG-43.titulo'));
    titulo.id = `${id}-titulo`;
    const faces = elemento('div', 'veio-segmentado', ...['front', 'back'].map(face => {
      const radio = elemento('input');
      radio.type = 'radio';
      radio.name = `${id}-face`;
      radio.value = face;
      radio.checked = face === estado.face;
      radio.addEventListener('change', () => { estado.face = face; desenharOCartao(); });
      return elemento('label', 'veio-segmentado__opcao', radio, elemento('span', '', textoDaVoz(face === 'front' ? 'BRG-43.frente' : 'BRG-43.verso')));
    }));
    faces.setAttribute('role', 'radiogroup');
    faces.setAttribute('aria-labelledby', titulo.id);
    const legenda = elemento('p', 'previa__legenda');
    const palco = elemento('div', 'previa__palco');
    palco.setAttribute('aria-live', 'polite');
    const no = elemento('section', 'previa', elemento('div', 'previa__cabecalho', titulo, faces), legenda, palco);
    no.id = id;
    no.setAttribute('aria-labelledby', titulo.id);
    no.dataset.estado = ESTADO.CARREGANDO;

    function desenharOCartao() {
      const quadro = elemento('iframe', 'previa__quadro');
      quadro.title = textoDaVoz('BRG-43.quadro');
      quadro.setAttribute('sandbox', 'allow-same-origin');   // sem `allow-scripts`: o Cartão só é lido; a mesma origem é para medir a altura
      quadro.style.height = `${ALTURA_MINIMA}px`;
      quadro.addEventListener('load', () => {
        const altura = quadro.contentDocument?.documentElement?.scrollHeight || 0;
        quadro.style.height = `${Math.min(ALTURA_MAXIMA, Math.max(ALTURA_MINIMA, altura))}px`;
      });
      quadro.srcdoc = documentoDoQuadro(estado.previa.css, estado.previa[estado.face]);
      palco.replaceChildren(quadro);
    }

    function desenharUmErro(estadoDoErro) {
      palco.replaceChildren(Veio.montarAviso({
        tom: 'info',
        texto: textoDaVoz(`BRG-43.${estadoDoErro}`),
        fechavel: false,
        ...(estadoDoErro !== ESTADO.ANTIGA && { acao: { rotulo: textoDaVoz('BRG-43.tentarDeNovo'), aoUsar: () => mostrar(estado.nivel, estado.tipoProprio) } }),
      }));
    }

    async function mostrar(nivel, tipoProprio = null) {
      const vez = ++estado.vez;
      estado.nivel = nivel;
      estado.tipoProprio = tipoProprio;
      legenda.textContent = textoDaVoz('BRG-43.legenda', { nivel: textoDaVoz(VOZ_DO_NIVEL[nivel]), idioma: NOME_DO_IDIOMA[lang].toLowerCase() });
      no.dataset.estado = ESTADO.CARREGANDO;
      palco.replaceChildren(elemento('p', 'previa__carregando', textoDaVoz('BRG-43.carregando')));
      const { estado: resultado, previa } = await ler(lang, nivel, tipoProprio);
      if (vez !== estado.vez) return;
      no.dataset.estado = resultado;
      estado.previa = previa || null;
      if (resultado === ESTADO.PRONTA) desenharOCartao();
      else desenharUmErro(resultado);
    }

    return { no, mostrar };
  }

  raiz.PreviaDoCartao = Object.freeze({ ESTADO, montar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
