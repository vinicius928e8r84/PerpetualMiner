'use strict';

// Configurações, as chaves: IA dos cartões (a chave da OpenAI e a conta do ChatGPT, CFG-35) e a Chave do Gemini
// (CFG-15, CFG-16). A conferência da chave é de mentira: aceita o que começa com `sk-`.

(function (PS) {
  const { ic } = PS;
  const d = PS.dados;
  const { visao, mascara } = PS.cfg;
  const A = PS.acoes;

  // ---------- IA dos cartões ----------
  function resumoDaIa() {
    if (visao.chatgpt === 'dentro') return { texto: 'Plano do ChatGPT', ponto: 'sucesso' };
    if (d.openai) return { texto: mascara(d.openai, 0), mono: true };
    return { texto: 'Sem chave', ponto: 'perigo', perigo: true };   // CFG-28
  }
  function corpoDaIa() {
    let chave;
    if (d.openai && visao.openai !== 'trocando') {
      chave = `<p class="com-controle"><span class="ponto ponto--sucesso"></span>Chave conferida <span class="mono campo-ajuda">${mascara(d.openai, 0)}</span></p><p class="campo-ajuda">${d.conta.entrou ? 'Vai junto com a sua conta Google: chega sozinha aos seus outros computadores, na Conexão com o Anki de cada um.' : 'Fica neste computador, na Conexão com o Anki. Para levá-la à conta Google, entre e confira a chave de novo.'}</p>`
        + `<div class="com-acao"><button type="button" class="botao botao--contorno botao--p" data-acao="cfg.trocarOpenai" data-foco="openai-trocar">Trocar chave</button><button type="button" class="botao botao--perigo botao--p" data-acao="cfg.apagarOpenai" data-foco="openai-apagar">Apagar chave</button></div>`;
    } else {
      const conferindo = visao.openai === 'conferindo';
      chave = `<p class="campo-ajuda">Você paga à OpenAI pelo uso, direto na sua conta.</p><form class="campo-grupo" data-ao-enviar="cfg.conferirOpenai"><input class="campo campo--mono" id="openai-chave" type="password" autocomplete="off" placeholder="Cole a chave (começa com sk-)" aria-label="Chave da OpenAI" ${visao.erroDaOpenai ? 'aria-invalid="true"' : ''} ${conferindo ? 'disabled' : ''}>`
        + `${visao.erroDaOpenai ? `<span class="campo-erro" role="alert">${visao.erroDaOpenai}</span>` : ''}<div class="com-acao"><button type="submit" class="botao botao--p" data-foco="openai-conferir" aria-busy="${conferindo}" ${conferindo ? 'disabled' : ''}>${conferindo ? `${ic('carregando')}Conferindo a chave…` : 'Conferir e salvar'}</button>`
        + `${d.openai ? '<button type="button" class="botao botao--fantasma botao--p" data-acao="cfg.cancelarOpenai">Cancelar</button>' : ''}</div></form>`
        + `<p class="campo-ajuda">Crie a chave num projeto próprio da OpenAI, com limite de gasto por mês. Para desligar de verdade, revogue a chave na OpenAI. <button type="button" class="botao botao--link" data-acao="cfg.linkDeFora" data-valor="a página de chaves da OpenAI">Onde criar a chave</button></p>`;
    }
    const chatgpt = {
      fora: `<p class="campo-ajuda">Use o seu plano em vez de pagar por cartão.</p><div><button type="button" class="botao botao--secundario botao--p" data-acao="cfg.entrarNoChatgpt" data-foco="chatgpt">Continuar com o ChatGPT</button></div><p class="campo-ajuda">O login fica só neste computador, na Conexão com o Anki: nunca no navegador nem na nuvem.</p>`,
      esperando: `<p class="com-controle" role="status">${ic('carregando', 'girando')}Esperando o ChatGPT…</p><p class="campo-ajuda">Termine a entrada na aba do ChatGPT que abriu.</p>`,
      dentro: `<p class="com-controle"><span class="ponto ponto--sucesso"></span>Usando o plano do ChatGPT</p><p class="campo-ajuda">O texto dos cartões gasta o uso do seu plano, e não a sua chave. A imagem gerada por IA continua saindo pela chave.</p><div class="com-acao"><button type="button" class="botao botao--contorno botao--p" data-acao="cfg.linkDeFora" data-valor="Gerenciar uso, no ChatGPT">Gerenciar uso${ic('externo')}</button><button type="button" class="botao botao--fantasma botao--p" data-acao="cfg.sairDoChatgpt" data-foco="chatgpt">Sair do ChatGPT</button></div>`,
    }[visao.chatgpt];
    return `<div class="duas-colunas"><div class="cartao cartao--p cartao--plano"><div class="cartao__corpo pilha-interna"><h3 class="rotulo">Chave da OpenAI</h3>${chave}</div></div>`
      + `<div class="cartao cartao--p cartao--plano"><div class="cartao__corpo pilha-interna"><h3 class="rotulo com-controle">Conta do ChatGPT <span class="selo selo--contorno">Plus ou Pro</span></h3>${chatgpt}</div></div></div>`
      + '<p class="campo-ajuda">A imagem gerada por IA sempre sai pela chave, mesmo com o plano do ChatGPT.</p>';
  }

  // ---------- Chave do Gemini ----------
  function corpoDoGemini() {
    if (d.gemini && !visao.geminiTrocando) {
      return `<div class="linha-ajuste"><div><p class="com-controle"><span class="ponto ponto--sucesso"></span>Chave salva <span class="mono campo-ajuda">${mascara(d.gemini)}</span></p><p class="campo-ajuda">Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador.</p></div><button type="button" class="botao botao--contorno botao--p" data-acao="cfg.trocarGemini" data-foco="gemini-trocar">Trocar chave</button></div>`;
    }
    return `<p class="campo-ajuda">Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador.${d.gemini ? '' : ' Sem a chave, Minerar de uma foto não consegue ler as fotos.'}</p>`
      + `<form class="com-acao" data-ao-enviar="cfg.salvarGemini"><input class="campo campo--mono" id="gemini-chave" type="password" autocomplete="off" placeholder="Cole a chave (começa com AIza)" aria-label="Chave do Gemini" ${visao.erroDoGemini ? 'aria-invalid="true"' : ''}>`
      + `<button type="submit" class="botao" data-foco="gemini-salvar">Salvar chave</button>${d.gemini ? '<button type="button" class="botao botao--fantasma" data-acao="cfg.cancelarGemini">Cancelar</button>' : ''}</form>${visao.erroDoGemini ? `<p class="campo-erro" role="alert">${visao.erroDoGemini}</p>` : ''}`;   // CFG-15, CFG-16
  }

  A['cfg.conferirOpenai'] = () => {
    const chave = document.getElementById('openai-chave').value.trim();
    if (!chave) { visao.erroDaOpenai = 'Cole a chave antes de conferir'; PS.desenhar(); document.getElementById('openai-chave').focus(); return; }
    if (!chave.startsWith('sk-')) { visao.erroDaOpenai = 'A OpenAI recusou a chave. Confira se ela está inteira e cole de novo.'; PS.desenhar(); document.getElementById('openai-chave').focus(); return; }
    visao.erroDaOpenai = '';
    visao.openai = 'conferindo';
    PS.desenhar();
    setTimeout(() => { d.openai = chave; visao.openai = 'salva'; PS.desenhar(); PS.avisar('Chave da OpenAI conferida e salva'); }, 1100);
  };
  A['cfg.trocarOpenai'] = () => { visao.openai = 'trocando'; PS.desenhar(); document.getElementById('openai-chave').focus(); };
  A['cfg.cancelarOpenai'] = () => { visao.openai = 'salva'; visao.erroDaOpenai = ''; PS.desenhar(); };
  A['cfg.apagarOpenai'] = () => PS.abrirCamada({
    tipo: 'alerta', rotulo: 'Apagar a chave da OpenAI?',
    conteudo: PS.dialogo({
      semFechar: true, titulo: 'Apagar a chave da OpenAI?',
      descricao: d.conta.entrou ? 'Ela sai da Conexão com o Anki e da sua conta Google, em todos os seus computadores. Para desligar de verdade, revogue a chave na OpenAI.' : 'Ela sai da Conexão com o Anki deste computador. Nenhuma chave da conta Google é apagada. Ao entrar, a chave da conta pode voltar. Para desligar de verdade, revogue a chave na OpenAI.',
      pe: '<button type="button" class="botao botao--contorno" data-acao="camada.fechar" data-foco-inicial>Cancelar</button><button type="button" class="botao botao--perigo-cheio" data-acao="cfg.confirmarApagarOpenai">Apagar chave</button>',
    }),
  });
  A['cfg.confirmarApagarOpenai'] = () => { d.openai = ''; visao.openai = 'vazia'; PS.fecharCamada(); PS.desenhar(); PS.avisar('Chave da OpenAI apagada'); };
  A['cfg.entrarNoChatgpt'] = () => { visao.chatgpt = 'esperando'; PS.desenhar(); setTimeout(() => { visao.chatgpt = 'dentro'; PS.desenhar(); }, 1500); };
  A['cfg.sairDoChatgpt'] = () => { visao.chatgpt = 'fora'; PS.desenhar(); PS.avisar('Você saiu do ChatGPT neste computador'); };
  A['cfg.linkDeFora'] = botao => PS.avisar(`No painel, isto abre ${botao.dataset.valor} (fora deste protótipo)`);
  A['cfg.trocarGemini'] = () => { visao.geminiTrocando = true; PS.desenhar(); document.getElementById('gemini-chave').focus(); };
  A['cfg.cancelarGemini'] = () => { visao.geminiTrocando = false; visao.erroDoGemini = ''; PS.desenhar(); };
  A['cfg.salvarGemini'] = () => {
    const chave = document.getElementById('gemini-chave').value.trim();
    if (!chave) { visao.erroDoGemini = 'Cole a chave antes de salvar'; PS.desenhar(); document.getElementById('gemini-chave').focus(); return; }
    d.gemini = chave;
    visao.geminiTrocando = false;
    visao.erroDoGemini = '';
    PS.desenhar();
    PS.avisar('Chave do Gemini salva');
  };

  Object.assign(PS.cfg, { resumoDaIa, corpoDaIa, corpoDoGemini });
})(window.PS);
