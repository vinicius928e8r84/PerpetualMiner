'use strict';

// A Boas-vindas (docs/design/painel/boas-vindas/, variante C; item 8 da lista
// fechada): uma página do Painel sem a sidebar, em #boas-vindas, que a
// instalação abre sozinha (background.js, onInstalled com `install`).
//
//   #boas-vindas                 a abertura: o que é o produto e os 6 passos
//   #boas-vindas/<passo>         minerar · atalho · conta · anki · automatica · chave
//   #boas-vindas/pronto          Tudo pronto: o resumo de cada passo e Abrir painel
//
// À esquerda, a lista dos 8 itens (dá para clicar em qualquer um), com a marca
// de cada passo: o número, o ✓ ouro quando feito, o tracejado quando “agora
// não”. À direita, o card do passo atual, com Voltar · Agora não (só nos
// opcionais) · Continuar.
//
// Um passo está feito pelo estado real, lido do que já está gravado: a frase
// no histórico, o atalho de Minerar seleção, a conta, a Conexão com o Anki
// respondendo, um idioma da mineração automática ligado, a chave do Gemini. O
// que a pessoa fez fora da página já aparece feito. Só o “agora não” (e se ela
// chegou a Abrir painel) é desta página, gravado neste computador em
// `pm_boas_vindas`. “Continuar” num passo obrigatório segue sem marcar nada:
// ele fica “falta” no resumo.
//
// O passo 1 tem a mineração rápida do popup (SALVAR_HISTORICO com a Fonte
// `manual`) e o passo 2 o gravador de Configurações › Atalhos
// (painel-atalhos.js), o mesmo, com o mesmo storage. Os controles dos passos 3
// a 6 entram no #43; aqui eles já aparecem na lista com o estado real. Toda
// cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, Atalhos, Veio, IDIOMAS, detectarIdioma } = raiz;

  const PROGRESSO = 'pm_boas_vindas';
  const ABERTURA = 'abertura';
  const PRONTO = 'pronto';

  /** Os 6 passos, na ordem travada (valor primeiro; a Conexão antes da mineração automática). */
  const PASSOS = [
    { id: 'minerar', opcional: false },
    { id: 'atalho', opcional: false },
    { id: 'conta', opcional: true },
    { id: 'anki', opcional: false },
    { id: 'automatica', opcional: true },
    { id: 'chave', opcional: true },
  ];
  const TELAS = [ABERTURA, ...PASSOS.map(p => p.id), PRONTO];

  /** O que cada passo diz na tela: o texto dele no catálogo. */
  const TEXTO_DO_PASSO = {
    conta: 'ONB-07',
    anki: 'ONB-08.corpo',
    automatica: 'ONB-09.corpo',
    chave: 'ONB-11.corpo',
  };

  const SITUACAO = Object.freeze({ FEITO: 'feito', AGORA_NAO: 'agoraNao', FALTA: 'falta' });

  const estado = {
    tela: ABERTURA,
    totalDeFrases: 0,
    atalhos: { ...Atalhos.ATALHOS_PADRAO },
    conta: null,           // { displayName } com uma conta conectada
    conexaoLigada: false,
    automatica: { en: false, ru: false },
    chave: '',
    progresso: { agoraNao: [], concluida: false },
    minerando: false,
  };

  const porId = id => document.getElementById(id);
  const itensDaLista = new Map();   // tela → { botao, marca, situacao }
  const telas = new Map();          // tela → o corpo dela no card
  let teclaDoPasso1 = null;
  let assinaturaDoRodape = null;

  // ─── Início ────────────────────────────────────────────────────────────────

  function iniciarBoasVindas() {
    montarLista();
    montarTelas();
    lerEstadoGravado();
    raiz.Shell.aoMudarAConexao(situacao => {
      estado.conexaoLigada = situacao === raiz.Shell.CONEXAO.LIGADA;
      desenhar();
    });
    window.addEventListener('hashchange', () => mostrarTelaDoEndereco({ focar: true }));
    mostrarTelaDoEndereco({ focar: false });
  }

  /** A tela que o endereço pede; fora de #boas-vindas, nada muda. */
  function mostrarTelaDoEndereco({ focar }) {
    const [area, parte] = location.hash.replace(/^#/, '').split('/');
    if (area !== 'boas-vindas') return;
    estado.tela = TELAS.includes(parte) ? parte : ABERTURA;
    desenhar();
    window.scrollTo(0, 0);
    if (focar) porId('bv-titulo').focus();
  }

  function irPara(tela) {
    location.hash = tela === ABERTURA ? '#boas-vindas' : `#boas-vindas/${tela}`;
  }

  // ─── O que já está gravado ─────────────────────────────────────────────────

  function lerEstadoGravado() {
    chrome.storage.local.get({
      frases: [],
      pm_user_info: null,
      pm_firebase_auth: null,
      pm_auto_miner_settings: null,
      geminiApiKey: '',
      [PROGRESSO]: null,
    }, dados => {
      aplicarGravado(dados);
      desenhar();
    });
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local') return;
      const novos = {};
      for (const [chave, { newValue }] of Object.entries(mudancas)) novos[chave] = newValue;
      if ('pm_user_info' in novos || 'pm_firebase_auth' in novos) {
        chrome.storage.local.get({ pm_user_info: null, pm_firebase_auth: null }, dados => {
          aplicarGravado(dados);
          desenhar();
        });
        return;
      }
      aplicarGravado(novos);
      desenhar();
    });
    Atalhos.acompanharAtalhos(atalhos => {
      estado.atalhos = atalhos;
      desenhar();
    });
  }

  function aplicarGravado(dados) {
    if ('frases' in dados) estado.totalDeFrases = (dados.frases || []).length;
    if ('pm_user_info' in dados) {
      estado.conta = dados.pm_user_info && dados.pm_firebase_auth ? dados.pm_user_info : null;
    }
    if ('pm_auto_miner_settings' in dados) {
      const ajustes = dados.pm_auto_miner_settings || {};
      estado.automatica = { en: Boolean(ajustes.en?.enabled), ru: Boolean(ajustes.ru?.enabled) };
    }
    if ('geminiApiKey' in dados) estado.chave = dados.geminiApiKey || '';
    if (PROGRESSO in dados) {
      const gravado = dados[PROGRESSO] || {};
      estado.progresso = {
        agoraNao: Array.isArray(gravado.agoraNao) ? gravado.agoraNao : [],
        concluida: Boolean(gravado.concluida),
      };
    }
  }

  function gravarProgresso(mudanca) {
    estado.progresso = { ...estado.progresso, ...mudanca };
    chrome.storage.local.set({ [PROGRESSO]: estado.progresso });
  }

  // ─── Os passos ─────────────────────────────────────────────────────────────

  function estaFeito(id) {
    switch (id) {
      case 'minerar': return estado.totalDeFrases > 0;
      case 'atalho': return Boolean(estado.atalhos[Atalhos.ACOES.SELECAO]);
      case 'conta': return Boolean(estado.conta);
      case 'anki': return estado.conexaoLigada;
      case 'automatica': return estado.automatica.en || estado.automatica.ru;
      case 'chave': return Boolean(estado.chave);
      default: return false;
    }
  }

  /** Feito vale sobre “agora não”: o que a pessoa fez depois de pular conta. */
  function situacaoDo(id) {
    if (estaFeito(id)) return SITUACAO.FEITO;
    if (estado.progresso.agoraNao.includes(id)) return SITUACAO.AGORA_NAO;
    return SITUACAO.FALTA;
  }

  /** O valor de um passo feito no resumo (ONB-13): “1 frase”, “Alt+Q”, “ligada”… */
  function valorDoPasso(id) {
    switch (id) {
      case 'minerar': return textoDaVoz('PAI-05', { n: estado.totalDeFrases });
      case 'atalho': return Atalhos.rotuloDoAtalho(estado.atalhos[Atalhos.ACOES.SELECAO]);
      case 'conta': return estado.conta.displayName || textoDaVoz('CFG-10');
      case 'anki': return textoDaVoz('ONB-13.ligada');
      case 'automatica':
        return [estado.automatica.en && IDIOMAS.INGLES, estado.automatica.ru && IDIOMAS.RUSSO]
          .filter(Boolean).join(' · ');
      case 'chave': return textoDaVoz('ONB-13.salva');
      default: return '';
    }
  }

  const tituloDaTela = tela => (tela === PRONTO ? textoDaVoz('ONB-12.titulo') : textoDaVoz(`ONB-03.${tela}`));

  // ─── A lista ───────────────────────────────────────────────────────────────

  function montarLista() {
    const nav = porId('bv-lista');
    nav.setAttribute('aria-label', textoDaVoz('ONB-03.lista'));
    const ol = elemento('ol', 'bv-lista__itens');
    TELAS.forEach((tela, i) => {
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = tela === ABERTURA ? '·' : tela === PRONTO ? '✓' : String(i);
      const situacao = elemento('span', 'veio-so-leitor');
      const botao = elemento('button', 'bv-lista__item', marca,
        elemento('span', 'bv-lista__rotulo', tela === ABERTURA ? textoDaVoz('ONB-03.abertura') : tituloDaTela(tela)),
        situacao);
      botao.type = 'button';
      botao.addEventListener('click', () => irPara(tela));
      itensDaLista.set(tela, { botao, marca, situacao });
      ol.append(elemento('li', null, botao));
    });
    nav.append(ol);
  }

  function desenharLista() {
    for (const [tela, { botao, marca, situacao }] of itensDaLista) {
      const atual = tela === estado.tela;
      if (atual) botao.setAttribute('aria-current', 'step');
      else botao.removeAttribute('aria-current');

      const passo = PASSOS.find(p => p.id === tela);
      const agora = passo ? situacaoDo(tela) : null;
      desenharMarca(marca, agora, atual);
      // O nome do item diz a situação ao leitor de tela: “…, feito”.
      situacao.textContent = agora && agora !== SITUACAO.FALTA ? `, ${textoDaVoz(`ONB-13.${agora}`)}` : '';
    }
  }

  /**
   * O número (ou o tracejado) sai do CSS, pelo `data-numero`: a marca é só
   * desenho, e o texto do item continua sendo o título do passo.
   */
  function desenharMarca(marca, situacao, atual) {
    marca.dataset.situacao = situacao || '';
    marca.classList.toggle('bv-marca--atual', atual);
    marca.replaceChildren(...(situacao === SITUACAO.FEITO ? [Veio.iconeVeio('certo')] : []));
  }

  // ─── O card ────────────────────────────────────────────────────────────────

  function montarTelas() {
    const lugar = porId('bv-telas');
    const montar = {
      [ABERTURA]: montarAbertura,
      minerar: montarPasso1,
      atalho: montarPasso2,
      [PRONTO]: () => elemento('div', null,
        elemento('p', 'bv-texto', textoDaVoz('ONB-12.corpo')),
        elemento('ul', 'bv-resumo')),
    };
    for (const tela of TELAS) {
      const corpo = (montar[tela] || montarPassoSoTexto)(tela);
      corpo.hidden = true;
      telas.set(tela, corpo);
      lugar.append(corpo);
    }
  }

  function montarAbertura() {
    const lista = elemento('ul', 'bv-resumo', ...PASSOS.map(({ id, opcional }, i) => {
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = String(i + 1);
      const item = elemento('li', 'bv-resumo__item', marca, elemento('span', null, tituloDaTela(id)));
      if (opcional) item.append(elemento('span', 'veio-selo bv-resumo__lado', textoDaVoz('ONB-03.opcional')));
      return item;
    }));
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-01.corpo')), lista);
  }

  function montarPassoSoTexto(tela) {
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz(TEXTO_DO_PASSO[tela])));
  }

  // ─── Passo 1: minerar a primeira frase ─────────────────────────────────────

  function montarPasso1() {
    teclaDoPasso1 = elemento('p', 'bv-texto');
    const selecao = elemento('p', 'bv-texto', textoDaVoz('ONB-05.selecao'));

    // A legenda marcada, parada: a linha ouro, a Palavra grifada e o chip.
    const legenda = elemento('span', 'bv-ilustracao__legenda');
    Veio.escreverFrase(legenda, textoDaVoz('ONB-05.exemplo'), textoDaVoz('ONB-05.exemploPalavra'));
    const ilustracao = elemento('div', 'bv-ilustracao', legenda,
      Veio.montarChipDaPalavra(textoDaVoz('ONB-05.exemploPalavra')));
    ilustracao.setAttribute('aria-hidden', 'true');
    // Uma tela de vídeo: escura nos dois temas, como o overlay.
    ilustracao.dataset.tema = 'escuro';

    const campo = elemento('input', 'veio-campo');
    campo.type = 'text';
    campo.id = 'bv-frase-rapida';
    campo.autocomplete = 'off';
    campo.placeholder = textoDaVoz('POP-03');
    campo.setAttribute('aria-label', textoDaVoz('POP-03'));
    campo.setAttribute('aria-describedby', 'bv-erro-rapida');
    const botao = elemento('button', 'veio-botao veio-botao--secundario', textoDaVoz('POP-04'));
    botao.type = 'submit';
    const erro = elemento('div', 'bv-rapida__erro');
    erro.id = 'bv-erro-rapida';
    erro.setAttribute('role', 'alert');

    const formulario = elemento('form', 'bv-rapida', elemento('div', 'bv-rapida__campo', campo, botao), erro);
    formulario.noValidate = true;
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      minerarFraseRapida(campo, erro);
    });
    campo.addEventListener('input', () => limparErro(campo, erro));

    const controle = elemento('div', 'bv-controle',
      elemento('p', 'bv-nota', textoDaVoz('ONB-05.colar')), formulario);
    return elemento('div', null, teclaDoPasso1, selecao, ilustracao, controle);
  }

  /**
   * “Num vídeo com legenda, aperte [Alt+S]. …”, com o atalho de legenda
   * gravado num `kbd`. Sem atalho, o `kbd` tracejado “Sem atalho” e Definir
   * atalho, que aqui leva ao passo 2 (fora da Boas-vindas, a Configurações).
   */
  function desenharAtalhoDoPasso1() {
    const rotulo = Atalhos.rotuloDoAtalho(estado.atalhos[Atalhos.ACOES.LEGENDA]);
    const marcador = '\u0000';
    const [antes, depois] = textoDaVoz('ONB-05.video', { atalho: marcador }).split(marcador);
    const partes = [antes, Veio.montarTecla(rotulo, { seVazia: textoDaVoz('GLB-02.semAtalho') }), depois];
    if (!rotulo) {
      const definir = elemento('button', 'veio-botao veio-botao--link', textoDaVoz('GLB-02.definir'));
      definir.type = 'button';
      definir.addEventListener('click', () => irPara('atalho'));
      partes.push(' ', definir);
    }
    teclaDoPasso1.replaceChildren(...partes);
  }

  function minerarFraseRapida(campo, erro) {
    const texto = campo.value.trim();
    if (!texto || estado.minerando) return;
    estado.minerando = true;
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'manual',
      idioma: detectarIdioma(texto),
      contexto: { fonte: 'manual', titulo: '', detalhe: '' },
    }, resposta => {
      estado.minerando = false;
      if (chrome.runtime.lastError || !resposta?.ok) {
        // POP-06: o texto fica no campo, para tentar de novo.
        const linha = elemento('p', 'bv-falha', Veio.iconeVeio('alerta'), textoDaVoz('POP-06'));
        erro.replaceChildren(linha);
        campo.setAttribute('aria-invalid', 'true');
        return;
      }
      // POP-05: sem texto. O campo limpa e o passo fica feito pelo histórico.
      campo.value = '';
      limparErro(campo, erro);
    });
  }

  function limparErro(campo, erro) {
    erro.replaceChildren();
    campo.removeAttribute('aria-invalid');
  }

  // ─── Passo 2: o atalho de Minerar seleção ──────────────────────────────────

  function montarPasso2() {
    const controle = elemento('div', 'bv-controle bv-controle--atalhos');
    raiz.GravadorDeAtalhos.montar(controle, { prefixo: 'bv' });
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-06')), controle);
  }

  // ─── Tudo pronto ───────────────────────────────────────────────────────────

  function desenharResumo() {
    const lista = telas.get(PRONTO).querySelector('.bv-resumo');
    lista.replaceChildren(...PASSOS.map(({ id }, i) => {
      const situacao = situacaoDo(id);
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = String(i + 1);
      desenharMarca(marca, situacao, false);
      const lado = situacao === SITUACAO.FEITO
        ? elemento('span', 'bv-resumo__lado', elemento('span', 'veio-so-leitor', `${textoDaVoz('ONB-13.feito')}: `), valorDoPasso(id))
        : elemento('span', 'bv-resumo__lado', textoDaVoz(`ONB-13.${situacao}`));
      return elemento('li', 'bv-resumo__item', marca, elemento('span', null, tituloDaTela(id)), lado);
    }));
  }

  // ─── Desenho ───────────────────────────────────────────────────────────────

  function desenhar() {
    const { tela } = estado;
    const passo = PASSOS.find(p => p.id === tela);

    porId('bv-sobretitulo').textContent = sobretituloDa(tela, passo);
    porId('bv-titulo').textContent = tela === ABERTURA ? textoDaVoz('ONB-01.titulo') : tituloDaTela(tela);
    for (const [nome, corpo] of telas) corpo.hidden = nome !== tela;

    desenharLista();
    desenharAtalhoDoPasso1();
    desenharResumo();
    desenharRodape(tela, passo);
  }

  function sobretituloDa(tela, passo) {
    if (tela === ABERTURA) return textoDaVoz('ONB-03.abertura');
    if (tela === PRONTO) return textoDaVoz('ONB-12.sobretitulo');
    const n = PASSOS.indexOf(passo) + 1;
    return textoDaVoz(passo.opcional ? 'ONB-03.passoOpcional' : 'ONB-03.passo', { n, total: PASSOS.length });
  }

  function desenharRodape(tela, passo) {
    // Refeito só quando muda o que ele mostra: um redesenho pelo storage não
    // tira o foco do botão em que a pessoa está.
    const assinatura = `${tela}|${Boolean(passo?.opcional && !estaFeito(passo.id))}`;
    if (assinatura === assinaturaDoRodape) return;
    assinaturaDoRodape = assinatura;
    const rodape = porId('bv-rodape');
    const espaco = elemento('span', 'bv-rodape__espaco');
    const anterior = TELAS[TELAS.indexOf(tela) - 1];
    const seguinte = TELAS[TELAS.indexOf(tela) + 1];

    if (tela === ABERTURA) {
      rodape.replaceChildren(
        botaoDoRodape('ONB-02.pular', 'fantasma', () => { location.hash = '#frases'; }),
        espaco,
        botaoDoRodape('ONB-02.comecar', 'primario', () => irPara(seguinte)));
      return;
    }

    const voltar = botaoDoRodape('ONB-04.voltar', 'secundario', () => irPara(anterior));
    if (tela === PRONTO) {
      rodape.replaceChildren(voltar, espaco, botaoDoRodape('ONB-12.abrirPainel', 'primario', () => {
        gravarProgresso({ concluida: true });
        location.hash = '#frases';
      }));
      return;
    }

    const botoes = [voltar, espaco];
    if (passo.opcional && !estaFeito(passo.id)) {
      botoes.push(botaoDoRodape('ONB-04.agoraNao', 'fantasma', () => {
        if (!estado.progresso.agoraNao.includes(passo.id)) {
          gravarProgresso({ agoraNao: [...estado.progresso.agoraNao, passo.id] });
        }
        irPara(seguinte);
      }));
    }
    botoes.push(botaoDoRodape('ONB-04.continuar', 'primario', () => irPara(seguinte)));
    rodape.replaceChildren(...botoes);
  }

  function botaoDoRodape(id, variante, aoClicar) {
    const botao = elemento('button', `veio-botao veio-botao--${variante}`, textoDaVoz(id));
    botao.type = 'button';
    botao.addEventListener('click', aoClicar);
    return botao;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciarBoasVindas);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
