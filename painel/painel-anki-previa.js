'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, ConversaComOAnki, PedidoAoAnki, IDIOMAS } = raiz;
  const { elemento } = Veio;
  const NOME_DO_IDIOMA = { en: IDIOMAS.INGLES, ru: IDIOMAS.RUSSO };
  const VOZ_DO_NIVEL = { iniciante: 'BRG-42.iniciante', intermediario: 'BRG-42.intermediario', avancado: 'BRG-42.avancado' };
  const ALTURA_MINIMA = 140;
  const ALTURA_MAXIMA = 460;
  const POLITICA = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  const { MOTIVO } = ConversaComOAnki;
  const ESTADO = Object.freeze({ CARREGANDO: 'carregando', PRONTA: 'pronta', SEM_CONEXAO: 'semConexao', ANTIGA: 'antiga', SEM_NOTA: 'semNota', SEM_TIPO: 'semTipo', FALHOU: 'falhou' });

  const lidas = new Map();

  /** O documento do quadro: o CSS do tipo de nota, o Cartão dentro do `.card` (como o Anki o põe) e a política que só deixa `data:` entrar. */
  function documentoDoQuadro(css, html) {
    return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLITICA}">`
      + `<style>html { min-height: 100%; } body { margin: 0; } .card { min-height: 100vh; box-sizing: border-box; padding: 16px; } ${css}</style><div class="card">${html}</div>`;
  }

  function ler(lang, nivel, tipoProprio) {
    if (tipoProprio) return pedir(lang, nivel, tipoProprio);
    const chave = `${lang}/${nivel}`;
    if (!lidas.has(chave)) {
      const leitura = pedir(lang, nivel);
      lidas.set(chave, leitura);
      leitura.then(({ estado }) => { if (estado !== ESTADO.PRONTA) lidas.delete(chave); });
    }
    return lidas.get(chave);
  }

  const pedir = (lang, nivel, tipoProprio) => pedirAoAnki(PedidoAoAnki.previaDoCartao(lang, nivel, tipoProprio));

  const temOCartao = previa => ['front', 'back', 'css'].every(parte => typeof previa[parte] === 'string');

  async function pedirAoAnki(pedido) {
    const desfecho = await ConversaComOAnki.pedir(pedido, { formato: temOCartao });
    if (desfecho.ok) return { estado: ESTADO.PRONTA, previa: desfecho.dados };
    if ([MOTIVO.SEM_RESPOSTA, MOTIVO.ANKI_OCUPADO].includes(desfecho.motivo)) return { estado: ESTADO.SEM_CONEXAO };
    if (desfecho.motivo === MOTIVO.ANTIGA) return { estado: ESTADO.ANTIGA };
    if (desfecho.codigo === 'note_not_found') return { estado: ESTADO.SEM_NOTA };
    return { estado: desfecho.codigo === 'note_type_missing' ? ESTADO.SEM_TIPO : ESTADO.FALHOU };
  }

  function montar({ prefixo, lang }) {
    const id = `${prefixo}-previa-${lang}`;
    const estado = { nivel: null, tipoProprio: null, nota: null, face: 'back', previa: null, vez: 0 };

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
        ...(estadoDoErro !== ESTADO.ANTIGA && { acao: { rotulo: textoDaVoz('BRG-43.tentarDeNovo'), aoUsar: () => (estado.nota ? mostrarNota(estado.nota) : mostrar(estado.nivel, estado.tipoProprio)) } }),
      }));
    }

    async function exibir(textoDaLegenda, ler) {
      const vez = ++estado.vez;
      legenda.textContent = textoDaLegenda;
      no.dataset.estado = ESTADO.CARREGANDO;
      palco.replaceChildren(elemento('p', 'previa__carregando', textoDaVoz('BRG-43.carregando')));
      const { estado: resultado, previa } = await ler();
      if (vez !== estado.vez) return undefined;
      no.dataset.estado = resultado;
      estado.previa = previa || null;
      if (resultado === ESTADO.PRONTA) desenharOCartao();
      else desenharUmErro(resultado);
      return { estado: resultado, previa };
    }

    function mostrar(nivel, tipoProprio = null) {
      Object.assign(estado, { nivel, tipoProprio, nota: null });
      return exibir(textoDaVoz('BRG-43.legenda', { nivel: textoDaVoz(VOZ_DO_NIVEL[nivel]), idioma: NOME_DO_IDIOMA[lang].toLowerCase() }), () => ler(lang, nivel, tipoProprio));
    }

    function mostrarNota(guid) {
      estado.nota = guid;
      return exibir(textoDaVoz('BRG-43.legendaDaNota'), () => pedirAoAnki(PedidoAoAnki.previaDaNota(guid)));
    }

    return { no, mostrar, mostrarNota };
  }

  raiz.PreviaDoCartao = Object.freeze({ ESTADO, montar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
