'use strict';

// “Usar um tipo que já tenho” (#165, BRG-45): em Ajustes de envio › Estilo do cartão, a pessoa escolhe um tipo de nota do Anki dela e diz em que campo vai cada parte do
// Cartão (várias partes podem ir num campo só); a prévia mostra o Cartão como o Anki o desenha naquele tipo. Continuar confirma o mapeamento no rascunho do idioma
// (`rascunho.tipoProprio`, que Salvar ajustes grava), e fica desligado sem um campo para a Frase e outro, diferente, para a resposta. A Conexão só grava notas nesse
// tipo: não o muda, e a frente é a que ele já tem (`EstiloDoCartao.campoDaFrente` some). Os tipos vêm de `POST /anki/note-types`; o desenho, da prévia (`painel-anki-previa.js`).

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, PedidoAoAnki, AjustesDeEnvio } = raiz;
  const { PARTES_DO_TIPO_PROPRIO: PARTES, PARTES_OBRIGATORIAS: OBRIGATORIAS } = AjustesDeEnvio;
  const VOZ_DA_PARTE = {
    frase: 'BRG-45.frase', audio_da_frase: 'BRG-45.audioDaFrase', resposta: 'BRG-45.resposta', palavra: 'BRG-45.palavra', audio_da_palavra: 'BRG-45.audioDaPalavra', imagem: 'BRG-45.imagem',
  };

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  /** Os tipos de nota da pessoa: `{ estado: 'pronta', tipos }` ou `{ estado: 'semConexao' | 'antiga' | 'falhou' }`; nunca levanta. */
  async function lerOsTipos() {
    let resposta;
    try {
      resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, PedidoAoAnki.tiposDeNota());
    } catch {
      return { estado: 'semConexao' };
    }
    if (resposta.status === 503) return { estado: 'semConexao' };
    if (!resposta.ok) return { estado: PedidoAoAnki.ausenciaDaRota(resposta.status) };
    const dados = await resposta.json().catch(() => null);
    return Array.isArray(dados?.noteTypes) ? { estado: 'pronta', tipos: dados.noteTypes } : { estado: 'falhou' };
  }

  /** O mapa que o tipo sugere ao ser escolhido: a Frase no primeiro campo e a resposta no segundo (o que um “Básico” pede); a pessoa muda. */
  function mapaSugerido(tipo) {
    const [frase, resposta] = tipo.fields;
    return { ...(frase && { frase }), ...(resposta && { resposta }) };
  }

  /** O que o mapa ainda não cumpre: `faltaCampo` (o tipo não tem campos para a Frase e a resposta separadas), `escolhaOsCampos` ou null (serve). */
  function problemaDoMapa(tipo, mapa) {
    if (tipo.fields.length < OBRIGATORIAS.length) return 'faltaCampo';
    return OBRIGATORIAS.every(parte => mapa[parte]) && mapa.frase !== mapa.resposta ? null : 'escolhaOsCampos';
  }

  /**
   * O bloco de um idioma. `rascunho.tipoProprio` é o confirmado (`{ nome, mapa }`); `nivelAtual()` o nível do rascunho, para a prévia. Devolve `{ no, mostrarNivel }`:
   * `aoMudar` roda quando Continuar ou “Usar o estilo pronto” muda o rascunho.
   */
  function montar({ lang, rascunho, nivelAtual, aoMudar }) {
    const id = `ajustes-proprio-${lang}`;
    const estado = { aberto: Boolean(rascunho.tipoProprio), leitura: null, nome: rascunho.tipoProprio?.nome ?? null, mapa: { ...rascunho.tipoProprio?.mapa } };
    const previa = raiz.PreviaDoCartao.montar({ prefixo: 'ajustes-proprio', lang });

    const abrir = elemento('button', 'veio-botao veio-botao--secundario', textoDaVoz('BRG-45.titulo'));
    abrir.type = 'button';
    abrir.id = `${id}-abrir`;
    abrir.setAttribute('aria-controls', `${id}-painel`);
    abrir.addEventListener('click', () => { estado.aberto = true; desenhar(); lerEMostrar(); });

    const painel = elemento('div', 'ajustes-proprio', );
    painel.id = `${id}-painel`;
    painel.setAttribute('role', 'group');
    painel.setAttribute('aria-labelledby', `${id}-titulo`);
    const no = elemento('div', 'ajustes-campo', abrir, painel);

    async function lerEMostrar() {
      if (estado.leitura?.estado === 'pronta') return;
      estado.leitura = { estado: 'carregando' };
      desenhar();
      estado.leitura = await lerOsTipos();
      desenhar();
    }

    function tipoEscolhido() {
      return estado.leitura?.tipos?.find(tipo => tipo.name === estado.nome) || null;
    }

    function escolherOTipo(nome) {
      estado.nome = nome || null;
      const tipo = tipoEscolhido();
      estado.mapa = tipo ? mapaSugerido(tipo) : {};
      desenhar();
    }

    /** O rascunho mudou: quem monta o campo é avisado e o formulário, que ouve `change`, vê que há o que salvar. */
    function mudou() {
      aoMudar();
      no.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function confirmar() {
      rascunho.tipoProprio = { nome: estado.nome, mapa: { ...estado.mapa } };
      desenhar();
      mudou();
    }

    function usarOPronto() {
      delete rascunho.tipoProprio;
      estado.aberto = false;
      estado.nome = null;
      estado.mapa = {};
      desenhar();
      mudou();
    }

    function selecaoDeCampo(parte, tipo) {
      const rotuloId = `${id}-${parte}`;
      const rotulo = elemento('label', 'ajustes-campo__ajuda', textoDaVoz(VOZ_DA_PARTE[parte]));
      rotulo.htmlFor = rotuloId;
      const obrigatoria = OBRIGATORIAS.includes(parte);
      const vazio = elemento('option', '', textoDaVoz(obrigatoria ? 'BRG-45.escolherCampo' : 'BRG-45.naoUsar'));
      vazio.value = '';
      const escolha = elemento('select', 'veio-campo', vazio, ...tipo.fields.map(campo => {
        const opcao = elemento('option', '', campo);
        opcao.value = campo;
        return opcao;
      }));
      escolha.id = rotuloId;
      escolha.value = estado.mapa[parte] || '';
      escolha.addEventListener('change', () => {
        if (escolha.value) estado.mapa[parte] = escolha.value;
        else delete estado.mapa[parte];
        desenhar();
      });
      return elemento('div', 'ajustes-proprio__campo', rotulo, elemento('span', 'veio-select', escolha));
    }

    function avisoDeFalta(chave) {
      return Veio.montarAviso({
        tom: chave === 'faltaCampo' ? 'perigo' : 'info',
        texto: textoDaVoz(`BRG-45.${chave}`),
        fechavel: false,
        ...(chave === 'faltaCampo' && { acao: { rotulo: textoDaVoz('BRG-45.usarOPronto'), aoUsar: usarOPronto } }),
      });
    }

    function corpoDoPainel() {
      const { leitura } = estado;
      if (!leitura || leitura.estado === 'carregando') return [elemento('p', 'ajustes-campo__ajuda', textoDaVoz('BRG-45.carregando'))];
      if (leitura.estado !== 'pronta') {
        return [Veio.montarAviso({
          tom: 'info',
          texto: textoDaVoz(`BRG-45.${leitura.estado}`),
          fechavel: false,
          ...(leitura.estado !== 'antiga' && { acao: { rotulo: textoDaVoz('BRG-45.tentarDeNovo'), aoUsar: () => { estado.leitura = null; lerEMostrar(); } } }),
        })];
      }
      const escolha = elemento('select', 'veio-campo');
      escolha.id = `${id}-tipo`;
      const nenhum = elemento('option', '', textoDaVoz('BRG-45.escolherTipo'));
      nenhum.value = '';
      escolha.append(nenhum, ...leitura.tipos.map(tipo => {
        const opcao = elemento('option', '', tipo.name);
        opcao.value = tipo.name;
        return opcao;
      }));
      escolha.value = estado.nome || '';
      escolha.addEventListener('change', () => escolherOTipo(escolha.value));
      const rotulo = elemento('label', 'ajustes-campo__ajuda', textoDaVoz('BRG-45.tipo'));
      rotulo.htmlFor = escolha.id;
      const blocos = [elemento('div', 'ajustes-proprio__campo', rotulo, elemento('span', 'veio-select', escolha))];
      if (!leitura.tipos.length) return [elemento('p', 'ajustes-campo__ajuda', textoDaVoz('BRG-45.semTipos'))];
      const tipo = tipoEscolhido();
      let problema = null;
      if (tipo) {
        blocos.push(...PARTES.map(parte => selecaoDeCampo(parte, tipo)));
        problema = problemaDoMapa(tipo, estado.mapa);
        if (problema) blocos.push(avisoDeFalta(problema));
        else blocos.push(previaNoTipo(tipo));
      }
      const continuar = elemento('button', 'veio-botao veio-botao--primario', textoDaVoz('BRG-45.continuar'));
      continuar.type = 'button';
      continuar.id = `${id}-continuar`;
      continuar.disabled = !tipo || Boolean(problema);
      continuar.addEventListener('click', confirmar);
      const pronto = elemento('button', 'veio-botao veio-botao--link', textoDaVoz('BRG-45.usarOPronto'));
      pronto.type = 'button';
      pronto.id = `${id}-pronto`;
      pronto.addEventListener('click', usarOPronto);
      blocos.push(elemento('div', 'ajustes-acoes', continuar, pronto));
      return blocos;
    }

    /** A prévia só pede de novo o que mudou (o nível, o tipo ou o mapa): refazer o painel por outro motivo não a pisca. */
    function previaNoTipo() {
      const pedido = { nivel: nivelAtual(), tipoProprio: { nome: estado.nome, mapa: { ...estado.mapa } } };
      const chave = JSON.stringify(pedido);
      if (chave !== estado.pedidoDaPrevia) {
        estado.pedidoDaPrevia = chave;
        previa.mostrar(pedido.nivel, pedido.tipoProprio);
      }
      return previa.no;
    }

    function desenhar() {
      const confirmado = rascunho.tipoProprio;
      const foco = document.activeElement?.id;
      abrir.hidden = estado.aberto;
      painel.hidden = !estado.aberto;
      if (!estado.aberto) return painel.replaceChildren();
      const titulo = elemento('span', 'ajustes-campo__rotulo', textoDaVoz('BRG-45.titulo'));
      titulo.id = `${id}-titulo`;
      painel.replaceChildren(titulo, elemento('span', 'ajustes-campo__ajuda', textoDaVoz('BRG-45.ajuda')),
        ...(confirmado ? [elemento('p', 'ajustes-campo__ajuda ajustes-proprio__usando', textoDaVoz('BRG-45.usando', { tipo: confirmado.nome }))] : []), ...corpoDoPainel());
      if (foco && painel.contains(document.getElementById(foco))) document.getElementById(foco).focus();
    }

    /** O nível do rascunho mudou: a prévia no tipo da pessoa o acompanha. */
    function mostrarNivel() {
      if (estado.aberto && tipoEscolhido() && !problemaDoMapa(tipoEscolhido(), estado.mapa)) desenhar();
    }

    desenhar();
    if (estado.aberto) lerEMostrar();
    return { no, mostrarNivel };
  }

  raiz.TipoProprioDoCartao = Object.freeze({ montar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
