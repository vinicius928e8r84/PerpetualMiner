'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const PAGINA = path.join(RAIZ, 'bookreader/bookreader.html');

const IDS_DA_PAGINA = [
  'foto-livro', 'foto-voltar', 'foto-fotos-total', 'foto-envio-formatos', 'foto-cancelar', 'foto-progresso',
  'foto-progresso-barra', 'foto-progresso-texto', 'foto-sem-chave', 'foto-envio', 'foto-envio-texto', 'foto-escolher',
  'foto-arquivo', 'foto-fila', 'foto-marcacoes', 'foto-avisos', 'foto-estado', 'foto-lista', 'foto-todas',
  'foto-contagem', 'foto-recomecar', 'foto-grupos', 'foto-minerar',
];

function scriptsDaPagina() {
  const html = fs.readFileSync(PAGINA, 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(achado => achado[1])
    .filter(src => !src.startsWith('../'))
    .map(src => path.join(RAIZ, 'bookreader', src));
}

class No {
  constructor(documento, tag, classe = '') {
    this.documento = documento;
    this.tag = tag;
    this.className = classe;
    this.filhos = [];
    this.pai = null;
    this.ouvintes = {};
    this.atributos = {};
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.classList = {
      add: nome => this.trocarClasse(nome, true),
      remove: nome => this.trocarClasse(nome, false),
      toggle: (nome, ligada) => this.trocarClasse(nome, ligada === undefined ? !this.temClasse(nome) : ligada),
      contains: nome => this.temClasse(nome),
    };
  }

  classes() {
    return this.className.split(/\s+/).filter(Boolean);
  }

  temClasse(nome) {
    return this.classes().includes(nome);
  }

  trocarClasse(nome, ligada) {
    const outras = this.classes().filter(classe => classe !== nome);
    this.className = (ligada ? [...outras, nome] : outras).join(' ');
  }

  adotar(filhos) {
    for (const filho of filhos) {
      if (filho instanceof No) {
        filho.remove();
        filho.pai = this;
      }
    }
    return filhos.map(filho => (filho instanceof No ? filho : String(filho)));
  }

  append(...filhos) {
    this.filhos.push(...this.adotar(filhos));
  }

  prepend(...filhos) {
    this.filhos.unshift(...this.adotar(filhos));
  }

  replaceChildren(...filhos) {
    for (const filho of this.filhos) if (filho instanceof No) filho.pai = null;
    this.filhos = [];
    this.append(...filhos);
  }

  replaceWith(outro) {
    if (!this.pai) return;
    const pai = this.pai;
    const [adotado] = pai.adotar([outro]);
    pai.filhos.splice(pai.filhos.indexOf(this), 1, adotado);
    this.pai = null;
  }

  remove() {
    if (!this.pai) return;
    this.pai.filhos.splice(this.pai.filhos.indexOf(this), 1);
    this.pai = null;
  }

  get textContent() {
    return this.filhos.map(filho => (filho instanceof No ? filho.textContent : filho)).join('');
  }

  set textContent(texto) {
    this.replaceChildren(String(texto));
  }

  setAttribute(nome, valor) {
    this.atributos[nome] = String(valor);
  }

  getAttribute(nome) {
    return nome in this.atributos ? this.atributos[nome] : null;
  }

  querySelector(seletor) {
    const classe = seletor.replace(/^\./, '');
    for (const filho of this.filhos) {
      if (!(filho instanceof No)) continue;
      if (filho.temClasse(classe)) return filho;
      const dentro = filho.querySelector(seletor);
      if (dentro) return dentro;
    }
    return null;
  }

  nos() {
    return this.filhos.filter(filho => filho instanceof No);
  }

  addEventListener(tipo, ouvinte) {
    (this.ouvintes[tipo] = this.ouvintes[tipo] || []).push(ouvinte);
  }

  disparar(tipo, evento = {}) {
    const completo = { target: this, relatedTarget: null, preventDefault() {}, stopPropagation() {}, ...evento };
    for (const ouvinte of [...(this.ouvintes[tipo] || [])]) ouvinte(completo);
  }

  click() {
    this.disparar('click');
  }

  focus() {
    this.documento.activeElement = this;
  }
}

function textoPlano(no) {
  if (!(no instanceof No)) return String(no);
  if (no.icone) return `«${no.icone}»`;
  return no.filhos.map(textoPlano).join('');
}

const copia = valor => JSON.parse(JSON.stringify(valor));

const textoDaVoz = (id, valores) => (valores ? `${id}${JSON.stringify(valores)}` : id);

const esperar = async (voltas = 20) => {
  for (let i = 0; i < voltas; i++) await new Promise(resolve => setImmediate(resolve));
};

function adiado() {
  let resolver;
  let rejeitar;
  const promessa = new Promise((sim, nao) => {
    resolver = sim;
    rejeitar = nao;
  });
  return { promessa, resolver, rejeitar };
}

const respostaDoGemini = texto => ({
  ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
});
const respostaComCorpo = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo });
const respostaSemJson = status => ({ ok: false, status, json: async () => { throw new SyntaxError('sem json'); } });

function montarVeio(documento, registro) {
  const elemento = (tag, classe, ...filhos) => {
    const no = new No(documento, tag, classe || '');
    no.append(...filhos);
    return no;
  };
  return {
    elemento,
    botao: (variante, ...filhos) => {
      const no = elemento('button', `veio-botao ${variante}`, ...filhos);
      no.type = 'button';
      return no;
    },
    iconeVeio: nome => {
      const no = elemento('svg', 'veio-icone');
      no.icone = nome;
      return no;
    },
    montarAviso: conteudo => {
      const no = elemento('div', 'veio-aviso');
      no.conteudo = conteudo;
      return no;
    },
    mostrarToastDeSucesso: texto => registro.toasts.push(texto),
    refletirSelecao: (caixa, marcadas, total) => {
      caixa.selecao = `${marcadas}/${total}`;
    },
    abrirConfirmacao: opcoes => registro.confirmacoes.push(opcoes),
  };
}

function montarChrome(dados, registro) {
  const ouvintes = [];
  return {
    ouvintes,
    chrome: {
      storage: {
        local: {
          get: (padrao, devolver) => setImmediate(() => devolver({ ...padrao, ...dados })),
          set: valores => registro.gravados.push(copia(valores)),
        },
        onChanged: { addListener: ouvinte => ouvintes.push(ouvinte) },
      },
      runtime: {
        getURL: caminho => `chrome-extension://pm/${caminho}`,
        sendMessage: (mensagem, devolver) => {
          registro.mensagens.push(copia(mensagem));
          devolver();
        },
        lastError: undefined,
      },
      tabs: {
        query: (filtro, devolver) => devolver(registro.abas),
        create: opcoes => registro.abasCriadas.push(copia(opcoes)),
        update: (id, opcoes) => registro.abasMudadas.push(copia({ id, ...opcoes })),
      },
      windows: { update: (id, opcoes) => registro.janelas.push(copia({ id, ...opcoes })) },
    },
  };
}

class LeitorDeArquivo {
  readAsDataURL(arquivo) {
    setImmediate(() => {
      this.result = `data:${arquivo.type || 'application/octet-stream'};base64,${arquivo.dados}`;
      this.onload();
    });
  }
}

function montarContexto({ documento, veio, chrome, registro, gemini, gravar }) {
  const contexto = vm.createContext({
    document: documento,
    chrome,
    AbortController,
    FileReader: LeitorDeArquivo,
    URL: {
      createObjectURL: arquivo => `blob:${arquivo.name}`,
      revokeObjectURL: url => registro.revogadas.push(url),
    },
    fetch: (url, opcoes) => {
      registro.pedidos.push({ url, ...opcoes, headers: copia(opcoes.headers), corpo: JSON.parse(opcoes.body) });
      return gemini({ url, ...opcoes });
    },
    PerpetualMiner: {
      textoDaVoz,
      Mineracao: {
        gravar: pedido => {
          registro.gravacoes.push(copia(pedido));
          return gravar(pedido);
        },
      },
      Veio: veio,
    },
  });
  for (const arquivo of scriptsDaPagina()) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
  return contexto;
}

function montarDocumento() {
  const documento = { ouvintes: {}, title: '' };
  documento.corpo = new No(documento, 'body');
  documento.activeElement = documento.corpo;
  documento.nos = {};
  for (const id of IDS_DA_PAGINA) {
    const no = new No(documento, id === 'foto-marcacoes' ? 'ul' : 'div');
    no.id = id;
    documento.corpo.append(no);
    documento.nos[id] = no;
  }
  documento.getElementById = id => documento.nos[id] || null;
  documento.querySelectorAll = () => [];
  documento.addEventListener = (tipo, ouvinte) => (documento.ouvintes[tipo] = documento.ouvintes[tipo] || []).push(ouvinte);
  documento.disparar = (tipo, evento = {}) => {
    const completo = { relatedTarget: null, preventDefault() {}, ...evento };
    for (const ouvinte of documento.ouvintes[tipo] || []) ouvinte(completo);
  };
  return documento;
}

async function abrirPagina({
  chave = 'chave-de-teste', livro = '', gemini = async () => respostaDoGemini('NENHUM_TRECHO'),
  gravar = async () => ({ ok: true }), abas = [],
} = {}) {
  const registro = {
    pedidos: [], gravacoes: [], toasts: [], confirmacoes: [], gravados: [], revogadas: [], mensagens: [],
    abas, abasCriadas: [], abasMudadas: [], janelas: [],
  };
  const documento = montarDocumento();
  const veio = montarVeio(documento, registro);
  const { chrome, ouvintes } = montarChrome({ geminiApiKey: chave, bookTitleDefault: livro }, registro);
  montarContexto({ documento, veio, chrome, registro, gemini, gravar });
  documento.disparar('DOMContentLoaded');
  await esperar();

  const no = id => documento.nos[id];
  const pagina = {
    registro,
    documento,
    no,
    async escolher(arquivos) {
      no('foto-arquivo').files = arquivos;
      no('foto-arquivo').disparar('change');
      await esperar();
    },
    async soltar(arquivos) {
      documento.disparar('drop', { dataTransfer: { files: arquivos } });
      await esperar();
    },
    async clicar(alvo) {
      (typeof alvo === 'string' ? no(alvo) : alvo).click();
      await esperar();
    },
    async mudarChave(nova) {
      await pagina.mudarArmazenamento({ geminiApiKey: { newValue: nova } }, 'local');
    },
    async mudarArmazenamento(mudancas, area) {
      for (const ouvinte of ouvintes) ouvinte(mudancas, area);
      await esperar();
    },
    cartoes: () => no('foto-fila').nos(),
    linhas: () => no('foto-grupos').nos().flatMap(grupo => grupo.querySelector('.foto-grupo__frases').nos()),
    avisos: () => no('foto-avisos').nos().map(aviso => aviso.conteudo),
    botoesDaColuna: () => buscarBotoes(no('foto-estado')),
    retrato: () => retratoDa(pagina),
  };
  return pagina;
}

function buscarBotoes(no) {
  return no.nos().flatMap(filho => (filho.tag === 'button' ? [filho] : buscarBotoes(filho)));
}

const resumoDoAviso = conteudo => {
  const resumo = { ...conteudo };
  if (conteudo.acao) resumo.acao = conteudo.acao.rotulo;
  return resumo;
};

function retratoDoCartao(cartao) {
  const selo = cartao.querySelector('.foto-cartao__status').nos()[0];
  const causa = cartao.querySelector('.foto-cartao__causa');
  return {
    status: cartao.dataset.status,
    selo: `${selo.className}|${textoPlano(selo)}`,
    causa: causa.hidden ? null : causa.textContent,
    deNovo: !cartao.querySelector('.foto-cartao__de-novo').hidden,
  };
}

function retratoDaLinha(linha) {
  const marcar = linha.querySelector('.foto-frase__marcar');
  const texto = linha.querySelector('.foto-frase__texto');
  return {
    texto: texto.textContent,
    marcada: marcar.checked,
    desligada: marcar.disabled,
    rotulo: marcar.getAttribute('aria-label'),
    editavel: texto.contentEditable,
    soLeitura: texto.getAttribute('aria-readonly'),
    classes: linha.className,
    minerada: !linha.querySelector('.foto-frase__minerada').hidden,
  };
}

function retratoDaLista(pagina) {
  const { no } = pagina;
  if (no('foto-lista').hidden) return null;
  const minerar = no('foto-minerar');
  return {
    grupos: no('foto-grupos').nos().map(grupo => ({
      titulo: textoPlano(grupo.querySelector('.foto-grupo__titulo')),
      frases: grupo.querySelector('.foto-grupo__frases').nos().map(retratoDaLinha),
    })),
    todas: `${no('foto-todas').selecao}${no('foto-todas').disabled ? '|desligada' : ''}`,
    contagem: no('foto-contagem').textContent,
    minerar: `${textoPlano(minerar)}${minerar.disabled ? '|desligado' : ''}`,
  };
}

function retratoDa(pagina) {
  const { no, documento } = pagina;
  const progresso = no('foto-progresso').hidden ? null
    : `${no('foto-progresso-texto').textContent}|${no('foto-progresso-barra').style.width}`;
  return {
    semChave: !no('foto-sem-chave').hidden,
    envio: no('foto-envio').hidden ? null : `${no('foto-envio-texto').textContent}|${no('foto-envio').className}`,
    formatos: !no('foto-envio-formatos').hidden,
    total: no('foto-fotos-total').textContent,
    progresso,
    cancelar: !no('foto-cancelar').hidden,
    cartoes: pagina.cartoes().map(retratoDoCartao),
    coluna: no('foto-estado').nos().map(textoPlano).join(''),
    avisos: pagina.avisos().map(resumoDoAviso),
    lista: retratoDaLista(pagina),
    foco: documento.activeElement.id || documento.activeElement.className,
  };
}

const foto = (name, type = 'image/jpeg') => ({ name, type, dados: Buffer.from(name).toString('base64') });

module.exports = { abrirPagina, adiado, esperar, foto, respostaDoGemini, respostaComCorpo, respostaSemJson, textoPlano };
