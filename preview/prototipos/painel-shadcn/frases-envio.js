'use strict';

// O Envio ao Anki: o progresso por idioma, o resumo e o que fazer com as enviadas (ENV-06 a ENV-15). É uma
// encenação: nenhum cartão sai daqui.

(function (PS) {
  const { esc, ic, plural } = PS;
  const visao = PS.frases;
  const { tirarDoHistorico } = PS.partesDasFrases;
  const A = PS.acoes;

  // ---------- Envio ao Anki (ENV-06 a ENV-15): o progresso por idioma e o resumo ----------
  const ETAPAS = ['Na fila', 'Criando cartões', 'Preparando imagens', 'Gerando áudio', 'Escolhendo imagens', 'Esperando o Anki', 'Enviando ao Anki', 'Concluído'];   // ENV-07
  let envio = null;

  function cartoesDoEnvio() {
    return envio.partes.map(parte => {
      const feito = parte.etapa === ETAPAS.length - 1;
      return `<div class="cartao cartao--p envio"><div class="cartao__corpo"><div class="envio__topo"><b>Envio em ${PS.idiomaEm(parte.idioma)} · ${parte.frases.length} ${plural(parte.frases.length, 'frase', 'frases')}</b><span class="selo ${feito ? 'selo--sucesso' : 'selo--aviso'}">${ETAPAS[parte.etapa]}</span></div>`
        + `<div class="envio__etapas" role="progressbar" aria-label="Envio em ${PS.idiomaEm(parte.idioma)}" aria-valuemin="0" aria-valuemax="7" aria-valuenow="${parte.etapa}">${Array.from({ length: 7 }, (_, i) => `<i data-feita="${i < parte.etapa}" data-agora="${i === parte.etapa && !feito}"></i>`).join('')}</div>`
        + `<p class="campo-ajuda">etapa ${Math.min(7, parte.etapa + 1)} de 7 · atualizado agora</p></div></div>`;
    }).join('');
  }

  function abrirProgresso() {
    const nomes = envio.partes.map(parte => PS.idiomaEm(parte.idioma)).join(' e ');
    PS.abrirCamada({
      rotulo: 'Enviando ao Anki…', classe: 'dialogo--largo',
      conteudo: PS.dialogo({
        titulo: 'Enviando ao Anki…', descricao: `${envio.partes.length} ${plural(envio.partes.length, 'envio', 'envios')} · ${nomes}`,
        corpo: `<div id="envio-partes" class="dialogo__corpo">${cartoesDoEnvio()}</div><p class="campo-ajuda">Pode fechar: o resumo abre quando o envio terminar.</p>`,
      }),
    });
  }

  function andarOEnvio() {
    if (!envio) return;
    // Os idiomas andam em passo diferente, como no painel: um de cada vez chega ao Anki.
    envio.volta += 1;
    envio.partes.forEach((parte, i) => { if (parte.etapa < ETAPAS.length - 1 && (i === 0 || envio.volta % 2 === 0 || parte.etapa > 0)) parte.etapa += 1; });
    const el = document.getElementById('envio-partes');
    if (el) el.innerHTML = cartoesDoEnvio();
    if (envio.partes.every(parte => parte.etapa === ETAPAS.length - 1)) { setTimeout(abrirResumo, 600); return; }
    setTimeout(andarOEnvio, 620);
  }

  function abrirResumo() {   // ENV-10
    const total = envio.partes.reduce((soma, parte) => soma + parte.frases.length, 0);
    for (const parte of envio.partes) {
      for (const frase of parte.frases) frase.estado = 'enviada';
      PS.dados.envios.unshift({ id: `job_${(PS.dados.proximoId++).toString(16).padStart(6, '0')}`, idioma: parte.idioma, horas: 0, estado: 'concluido', pedidas: parte.frases.length, enviadas: parte.frases.length, custos: { cartoes: 0.0068 * parte.frases.length, geradas: 0, escolha: 0.0002 * parte.frases.length, triagem: 0.0001 * parte.frases.length }, imagens: { real: parte.frases.length, geradas: 0, sem: 0, falhas: 0 }, economia: 0.012 * parte.frases.length });
    }
    PS.abrirCamada({
      rotulo: 'Envio concluído', classe: 'dialogo--largo',
      conteudo: PS.dialogo({
        titulo: 'Envio concluído', descricao: `${total} ${plural(total, 'frase', 'frases')} · ${envio.partes.length} ${plural(envio.partes.length, 'baralho', 'baralhos')}`,
        corpo: `<div class="resumo-do-envio">${envio.partes.map(parte => `<div class="cartao cartao--p"><div class="cartao__corpo"><p class="rotulo">${PS.dados.IDIOMAS[parte.idioma]}</p><p class="resumo-do-envio__numero">+${parte.frases.length} ${plural(parte.frases.length, 'cartão', 'cartões')}</p><p class="campo-ajuda">no baralho ${esc(PS.dados.ajustesSalvos[parte.idioma].baralho)}</p></div></div>`).join('')}</div>`
          + `<div><p class="rotulo">${total === 1 ? 'Tirar a enviada do histórico?' : `Tirar as ${total} enviadas do histórico?`}</p><p class="campo-ajuda">${total === 1 ? 'Ela já está no Anki. Manter deixa no histórico, marcada como enviada.' : 'Elas já estão no Anki. Manter deixa no histórico, marcadas como enviadas.'}</p></div>`,
        pe: `<button type="button" class="botao botao--contorno" data-acao="frases.manterEnviadas">Manter</button><button type="button" class="botao" data-acao="frases.tirarEnviadas" data-foco-inicial>${ic('lixeira')}Tirar do histórico</button>`,
      }),
      aoFechar: () => { envio = null; visao.selecao.clear(); PS.desenhar(); },
    });
  }

  A['frases.enviar'] = () => {
    if (envio) { abrirProgresso(); return; }
    const marcadas = PS.dados.frases.filter(frase => visao.selecao.has(frase.id));
    const idiomas = [...new Set(marcadas.map(frase => frase.idioma))];
    envio = { volta: 0, partes: idiomas.map(idioma => ({ idioma, etapa: 0, frases: marcadas.filter(frase => frase.idioma === idioma) })) };
    abrirProgresso();
    setTimeout(andarOEnvio, 620);
  };
  A['frases.manterEnviadas'] = () => PS.fecharCamada();
  A['frases.tirarEnviadas'] = () => {
    const frases = envio.partes.flatMap(parte => parte.frases);
    tirarDoHistorico(frases);
    PS.fecharCamada();
    PS.avisar(`${frases.length} ${plural(frases.length, 'frase apagada', 'frases apagadas')}`);   // ENV-11
  };
})(window.PS);
