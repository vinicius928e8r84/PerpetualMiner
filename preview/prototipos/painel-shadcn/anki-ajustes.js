'use strict';

// Ajustes de envio: um cartão por idioma, com o baralho, as imagens, o estilo do cartão com a prévia, a frente e a
// voz (BRG-07, BRG-42 a BRG-45). Mexer não grava: só Salvar ajustes.

(function (PS) {
  const { esc, ic, pecas } = PS;
  const { visao, situacao, ligada } = PS.partesDoAnki;
  const A = PS.acoes;

  // ---------- Ajustes de envio ----------
  const ESTILOS = { iniciante: ['Iniciante', () => 'Não entendo nada ou só algumas palavras'], intermediario: ['Intermediário', () => 'Com legenda, entendo 30% ou mais · numa frase, só me falta uma palavra'], avancado: ['Avançado', idioma => `Entendo o ${PS.idiomaEm(idioma)} explicado em ${PS.idiomaEm(idioma)}`] };   // BRG-42
  const FRENTES = {   // BRG-44
    frase: ['Frase com áudio', 'A frase e o áudio na frente'], ouvir: ['Ouvir primeiro', 'Só o botão de tocar na frente: ouça antes de ler'], lacuna: ['Lacuna', 'A frase sem a palavra, com uma dica e sem áudio'],
    producao: ['Produção', 'A frase em português na frente: escreva no idioma e o Anki compara. Só no nível Iniciante, o único que traz a tradução'], ditado: ['Ditado', 'Só o botão de tocar e um campo: escreva o que ouviu e o Anki mostra o que errou'], criacao: ['Criação', 'Você escreve uma frase sua com a palavra e vê, no verso, o que escreveu'],
  };
  const mudou = idioma => JSON.stringify(PS.dados.ajustes[idioma]) !== JSON.stringify(PS.dados.ajustesSalvos[idioma]);

  function previaDoCartao(idioma) {   // BRG-43
    const a = PS.dados.ajustes[idioma];
    const exemplo = PS.dados.PREVIA[idioma];
    const frase = exemplo.frase.map(([texto, classe]) => (classe ? `<span class="previa__${classe}">${esc(texto)}</span>` : esc(texto))).join(' ');
    const frente = a.frente === 'ouvir' || a.frente === 'ditado' ? '' : `<p class="previa__frase" lang="${idioma}">${a.frente === 'lacuna' ? frase.replace(/<span class="previa__c2">[^<]*<\/span>/, '<span class="previa__lacuna">[…]</span>') : frase}</p>`;
    const tocar = a.frente === 'lacuna' ? '' : `<span class="previa__tocar">${ic('tocar')}</span>`;
    return `<div class="campo-grupo"><div class="linha-ajuste"><span class="rotulo">Prévia do cartão</span>${pecas.escolha({ rotulo: 'Lado da prévia', valor: visao.previa, acao: 'anki.previa', chave: `previa-${idioma}`, classe: 'escolha--p', opcoes: [['frente', 'Frente'], ['verso', 'Verso']] })}</div>`
      + `<p class="campo-ajuda">Exemplo do ${ESTILOS[a.estilo][0]} em ${PS.idiomaEm(idioma)}, como o Anki mostra.</p>`
      + `<div class="previa" role="img" aria-label="Cartão de exemplo">${frente}${tocar}${a.frente === 'ditado' ? '<span class="previa__campo"></span>' : ''}${visao.previa === 'verso' ? `<hr><p class="previa__verso" lang="${a.estilo === 'avancado' ? idioma : 'pt-BR'}">${esc(exemplo.verso[a.estilo])}</p>` : ''}</div></div>`;
  }

  function formularioDosAjustes(idioma) {
    const a = PS.dados.ajustes[idioma];
    const p = `aj-${idioma}`;
    const campoDoBaralho = ligada()
      ? pecas.selecao({ id: `${p}-baralho`, rotulo: 'Baralho', valor: a.baralho, acao: 'anki.ajuste', classe: 'selecao--larga', opcoes: [...new Set([...PS.dados.BARALHOS_DO_ANKI, a.baralho])].map(nome => [nome, nome.replace(/::/g, ' › ')]) })
      : `<input class="campo" id="${p}-baralho" value="${esc(a.baralho)}" autocomplete="off" data-ao-digitar="anki.ajuste">`;
    const dicaDoOuvir = ligada() ? 'Ouvir' : 'A Conexão com o Anki está desligada. Ligue-a neste computador para ouvir.';
    const sotaque = (campo, rotulo) => `<div class="campo-grupo"><label class="rotulo" for="${p}-${campo}">${rotulo}</label><div class="com-acao">${pecas.selecao({ id: `${p}-${campo}`, rotulo, valor: a[campo], acao: 'anki.ajuste', opcoes: PS.dados.SOTAQUES[idioma].map(nome => [nome, nome]) })}<button type="button" class="botao botao--contorno botao--icone" data-acao="anki.ouvir" aria-label="Ouvir · ${rotulo}" data-dica="${dicaDoOuvir}" ${ligada() ? '' : 'aria-disabled="true"'}>${ic('som')}</button></div></div>`;
    return `<form class="ajustes" data-ao-enviar="anki.salvarAjustes" data-idioma="${idioma}" aria-label="Ajustes de envio · ${PS.dados.IDIOMAS[idioma]}">`
      + `<div class="campo-grupo"><label class="rotulo" for="${p}-baralho">Baralho</label>${campoDoBaralho}<span class="campo-ajuda">Em branco, volta para “CIMV”.</span></div>`
      + `<div class="campo-grupo"><span class="rotulo">Imagens</span>${pecas.escolha({ rotulo: 'Imagens', valor: a.imagens, acao: 'anki.ajusteEscolha', chave: `${p}-imagens`, opcoes: [['real', 'Foto real (Google)'], ['ia', 'Gerada por IA']] })}<span class="campo-ajuda">${a.imagens === 'real' ? 'Quando não acha uma foto boa, gera uma por IA, e aí tem custo.' : 'Toda imagem é gerada por IA e entra nos custos.'}</span></div>`
      + `<div class="campo-grupo"><span class="rotulo">Estilo do cartão</span>${pecas.escolha({ rotulo: 'Estilo do cartão', valor: a.estilo, acao: 'anki.ajusteEscolha', chave: `${p}-estilo`, opcoes: Object.entries(ESTILOS).map(([v, [nome]]) => [v, nome]) })}<span class="campo-ajuda">${ESTILOS[a.estilo][1](idioma)}</span></div>`
      + previaDoCartao(idioma)
      + `<div><button type="button" class="botao botao--secundario" data-acao="anki.tipoProprio" data-idioma="${idioma}">Usar um tipo que já tenho</button></div>`
      + `<div class="campo-grupo"><span class="rotulo">Frente</span>${pecas.escolha({ rotulo: 'Frente', valor: a.frente, acao: 'anki.ajusteEscolha', chave: `${p}-frente`, opcoes: Object.entries(FRENTES).map(([v, [nome]]) => [v, nome]) })}<span class="campo-ajuda">${FRENTES[a.frente][1]}</span><span class="campo-ajuda">Todos os cartões em ${PS.idiomaEm(idioma)} mudam na hora, sem custo</span></div>`
      + `<details class="recolhivel cartao-tracejado" id="${p}-avancado"><summary>${ic('direita', 'ic--seta')}Avançado <small>· voz e sotaque do áudio</small></summary><div class="avancado"><p class="campo-ajuda">Escolha o sotaque da voz que fala a palavra e a frase.</p><div class="duas-colunas">${sotaque('sotaquePalavra', 'Sotaque da palavra')}${sotaque('sotaqueFrase', 'Sotaque da frase')}</div>`
      + `<div class="campo-grupo"><span class="rotulo">Voz de reserva</span>${pecas.escolha({ rotulo: 'Voz de reserva', valor: a.reserva, acao: 'anki.ajusteEscolha', chave: `${p}-reserva`, opcoes: [['openai', 'OpenAI, pela chave'], ['nenhuma', 'Sem reserva']] })}<span class="campo-ajuda">${a.reserva === 'openai' ? 'Fala quando o Google falha. Usa a chave da OpenAI: cerca de US$ 0,001 por cartão.' : 'Se o Google falhar, o cartão não entra no Anki.'}</span></div></div></details>`
      + `<div class="ajustes__pe"><button type="submit" class="botao" data-foco="${p}-salvar">Salvar ajustes</button><span class="com-controle ajustes__estado" role="status"><span class="ponto ${mudou(idioma) ? 'ponto--aviso' : 'ponto--sucesso'}"></span>${mudou(idioma) ? 'Alterações não salvas' : 'Salvo'}</span></div></form>`;
  }

  function ajustes() {
    const nota = situacao() === 'desligada' ? `<p class="campo-ajuda">Os ajustes continuam editáveis com a conexão desligada. Valem a partir do próximo envio.</p>` : '';   // BRG-33
    const cartao = idioma => {
      const salvo = PS.dados.ajustesSalvos[idioma];
      const aberto = PS.estado.d === 'b' || visao.ajusteAberto === idioma;
      const resumo = `${esc(salvo.baralho)} · ${salvo.imagens === 'real' ? 'foto real' : 'gerada por IA'}`;
      return `<section class="cartao cfg" data-aberto="${aberto}" aria-labelledby="aj-${idioma}-titulo"><div class="cfg__cabeca"><span class="cfg__icone mono">${idioma.toUpperCase()}</span><div class="cfg__titulos"><h2 class="cartao__titulo">`
        + (PS.estado.d === 'b' ? `<span id="aj-${idioma}-titulo">${PS.dados.IDIOMAS[idioma]}</span>` : `<button type="button" class="cfg__alternar" id="aj-${idioma}-titulo" aria-expanded="${aberto}" aria-controls="aj-${idioma}-corpo" data-acao="anki.abrirAjuste" data-valor="${idioma}">${PS.dados.IDIOMAS[idioma]}</button>`)
        + `</h2>${aberto ? `<p class="cartao__descricao">Baralho e imagens usados em cada envio em ${PS.idiomaEm(idioma)}.</p>` : ''}</div>${aberto ? '' : `<span class="cfg__resumo">${resumo}</span>`}${PS.estado.d === 'b' ? '' : `<span class="cfg__seta">${ic(aberto ? 'acima' : 'abaixo')}</span>`}</div>`
        + `${aberto ? `<div class="cfg__corpo" id="aj-${idioma}-corpo">${formularioDosAjustes(idioma)}</div>` : ''}</section>`;
    };
    return `<div class="pilha-de-cartoes ${PS.estado.d === 'b' ? 'ajustes-lado-a-lado' : 'coluna-estreita'}" role="group" aria-label="Idioma dos ajustes">${nota}${cartao('en')}${cartao('ru')}</div>`;
  }

  A['anki.abrirAjuste'] = botao => { visao.ajusteAberto = visao.ajusteAberto === botao.dataset.valor ? '' : botao.dataset.valor; PS.desenhar(); };
  const idiomaDoForm = el => el.closest('form').dataset.idioma;
  function redesenharAjustes(idioma) {
    const abertos = [...document.querySelectorAll('details[id$="-avancado"]')].filter(d => d.open).map(d => d.id);
    PS.desenhar();
    for (const id of abertos) { const d = document.getElementById(id); if (d) d.open = true; }
    void idioma;
  }
  A['anki.ajuste'] = campo => {
    const idioma = idiomaDoForm(campo);
    const nome = campo.id.replace(`aj-${idioma}-`, '');
    PS.dados.ajustes[idioma][nome] = campo.value;
    const estado = campo.closest('form').querySelector('.ajustes__estado');
    estado.innerHTML = `<span class="ponto ${mudou(idioma) ? 'ponto--aviso' : 'ponto--sucesso'}"></span>${mudou(idioma) ? 'Alterações não salvas' : 'Salvo'}`;
  };
  A['anki.ajusteEscolha'] = botao => {
    const idioma = idiomaDoForm(botao);
    const nome = botao.dataset.foco.replace(`aj-${idioma}-`, '').replace(`-${botao.dataset.valor}`, '');
    PS.dados.ajustes[idioma][nome] = botao.dataset.valor;
    redesenharAjustes(idioma);
  };
  A['anki.previa'] = botao => { visao.previa = botao.dataset.valor; redesenharAjustes(); };
  A['anki.ouvir'] = () => PS.avisar('Tocando a voz (no protótipo, sem som)');
  A['anki.salvarAjustes'] = formulario => {   // BRG-07
    const idioma = formulario.dataset.idioma;
    if (!PS.dados.ajustes[idioma].baralho.trim()) PS.dados.ajustes[idioma].baralho = 'CIMV';
    PS.dados.ajustesSalvos[idioma] = JSON.parse(JSON.stringify(PS.dados.ajustes[idioma]));
    redesenharAjustes(idioma);
    PS.avisar('Ajustes de envio salvos');
  };
  A['anki.tipoProprio'] = botao => {   // BRG-45
    const idioma = botao.dataset.idioma;
    const campo = (id, rotulo, opcoes) => `<div class="campo-grupo"><label class="rotulo" for="${id}">${rotulo}</label>${pecas.selecao({ id, rotulo, valor: opcoes[0], acao: 'anki.nada', classe: 'selecao--larga', opcoes: opcoes.map(o => [o, o]) })}</div>`;
    PS.abrirCamada({
      rotulo: 'Usar um tipo que já tenho',
      conteudo: PS.dialogo({
        titulo: 'Usar um tipo que já tenho', descricao: 'Escolha o tipo de nota e diga em que campo vai cada parte do cartão. Várias partes podem ir no mesmo campo.',
        corpo: campo('tipo-nota', 'Tipo de nota', ['Básico', 'Básico (e cartão invertido)', 'Omissão de palavras']) + `<div class="duas-colunas">${campo('tipo-frase', 'Frase', ['Frente', 'Verso'])}${campo('tipo-resposta', 'Resposta', ['Verso', 'Frente'])}</div>`,
        pe: `<button type="button" class="botao botao--contorno" data-acao="camada.fechar">Usar o estilo pronto</button><button type="button" class="botao" data-acao="anki.usarTipo" data-idioma="${idioma}">Continuar</button>`,
      }),
    });
  };
  A['anki.nada'] = () => {};
  A['anki.usarTipo'] = () => { const tipo = document.getElementById('tipo-nota').value; PS.fecharCamada(); PS.avisar(`Usando o tipo ${tipo}. A frente que ele já tem fica como está.`); };

  PS.partesDoAnki.corpos.ajustes = ajustes;
})(window.PS);
