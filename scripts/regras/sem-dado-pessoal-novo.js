'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { NENHUMA_LINHA, linhasNovas, textoNaBase } = require('./apoio-linhas-novas');
const segredo = require('./sem-segredo-novo');

const id = 'sem-dado-pessoal-novo';

const guarda = 'nenhum dado pessoal nas linhas que a mudança acrescenta (e-mail fora do noreply, IP real, caminho `C:\\Users\\<nome>` ou `/Users/<nome>`, nome de uma lista guardada fora do repositório; o valor nunca é impresso; a exceção é por arquivo, com motivo, em `EXCECOES` na regra)';

const conserto = 'Troque o dado por um exemplo: e-mail @example.com (ou o noreply do GitHub), IP de documentação (192.0.2.x, 198.51.100.x, 203.0.113.x) ou 127.0.0.1, '
  + 'caminho com <usuário>, $USER, ~ ou %USERPROFILE% no lugar do nome. O valor não é mostrado de propósito: este repositório é público e o log do CI também. '
  + 'Se o dado já foi publicado numa branch, apagar o commit depois não o recupera. '
  + 'Os nomes vêm de uma lista fora do repositório: o arquivo apontado por FREIOS_NOMES ou ~/.config/freios/nomes.txt, um nome por linha (# comenta). '
  + 'Um caso que precisa ficar (um IP de rede privada que um teste confere, por exemplo) entra em EXCECOES de scripts/regras/sem-dado-pessoal-novo.js: '
  + 'o arquivo, com o motivo, por PR de regras (atenção ALTA). Nenhuma faixa de IP privado vale para o repositório inteiro.';

const EXCECOES = [];

const arquivoDaExcecao = arquivo => EXCECOES.some(excecao => excecao.arquivo.test(arquivo));

const VARIAVEL_DA_LISTA = 'FREIOS_NOMES';
const LISTA_PADRAO = ['.config', 'freios', 'nomes.txt'];
const AVISO_SEM_LISTA = `${id}: sem lista de nomes (aponte ${VARIAVEL_DA_LISTA} para um arquivo ou crie ~/.config/freios/nomes.txt, `
  + 'um nome por linha); nesta máquina só e-mail, IP e caminho são conferidos';

const seAplica = segredo.seAplica;

const LETRA = '\\p{L}\\p{N}_';

const EMAIL = new RegExp(`(?<![${LETRA}.%+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@((?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,})(?![${LETRA}-])`, 'gu');
const ENDERECOS_SEM_DONO = new Set(['noreply', 'no-reply', 'git']);
const DOMINIOS_DE_EXEMPLO = ['example.com', 'example.net', 'example.org', 'exemplo.com', 'exemplo.com.br', 'noreply.github.com'];
const FINAIS_RESERVADOS = new Set(['example', 'test', 'invalid', 'localhost']);

const IP = new RegExp(`(?<![${LETRA}.])(?<!(?:Chrome|Chromium|Edg|OPR|Version)/)([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})(?![${LETRA}]|\\.[0-9])`, 'gu');
const PRIMEIROS_OCTETOS_DE_EXEMPLO = new Set([0, 127, 255]);
const FAIXAS_DE_DOCUMENTACAO = new Set(['192.0.2', '198.51.100', '203.0.113']);

const CAMINHO_NO_WINDOWS = /(?<![A-Za-z])[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}([^\\/\s"'`:]+)/giu;
const CAMINHO_NO_MAC = new RegExp(`(?<![${LETRA}:.~$%}-])/Users/([^\\\\/\\s"'\`:]+)`, 'gu');
const INICIO_DE_MARCADOR = ['<', '$', '%', '{', '[', '(', '*', '~', '.', '…'];
const PASTAS_GENERICAS = new Set(['public', 'default', 'shared', 'all', 'user', 'username', 'usuario', 'usuário', 'nome', 'name']);

const dominioDeExemplo = dominio => FINAIS_RESERVADOS.has(dominio.split('.').pop())
  || DOMINIOS_DE_EXEMPLO.some(base => dominio === base || dominio.endsWith(`.${base}`));

const emailPessoal = ([endereco, dominio]) => !ENDERECOS_SEM_DONO.has(endereco.split('@')[0].toLowerCase()) && !dominioDeExemplo(dominio.toLowerCase());

const emailsPessoais = linha => [...linha.matchAll(EMAIL)].filter(emailPessoal).map(achado => achado[0].toLowerCase());

function ipReal(achado) {
  const octetos = achado.slice(1, 5).map(Number);
  return Math.max(...octetos) <= 255
    && !PRIMEIROS_OCTETOS_DE_EXEMPLO.has(octetos[0])
    && !FAIXAS_DE_DOCUMENTACAO.has(octetos.slice(0, 3).join('.'));
}

const ipsReais = linha => [...linha.matchAll(IP)].filter(ipReal).map(achado => achado[0]);

const nomeDePessoa = nome => !INICIO_DE_MARCADOR.some(inicio => nome.startsWith(inicio)) && !PASTAS_GENERICAS.has(nome.toLowerCase());

const caminhosPessoais = linha => [...linha.matchAll(CAMINHO_NO_WINDOWS), ...linha.matchAll(CAMINHO_NO_MAC)]
  .filter(achado => nomeDePessoa(achado[1])).map(achado => achado[1].toLowerCase());

const dobrar = texto => texto.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function padraoDosNomes(nomes) {
  if (!nomes.length) return null;
  return new RegExp(`(?<![${LETRA}])(?:${nomes.map(nome => escapar(dobrar(nome))).join('|')})(?![${LETRA}])`, 'gu');
}

const caminhoDaLista = () => process.env[VARIAVEL_DA_LISTA] || path.join(os.homedir(), ...LISTA_PADRAO);

function memoria(calcular) {
  let pronto = false;
  let valor;
  return () => {
    if (!pronto) {
      valor = calcular();
      pronto = true;
    }
    return valor;
  };
}

function lerNomes() {
  try {
    const linhas = fs.readFileSync(caminhoDaLista(), 'utf8').split(/\r?\n/);
    return linhas.map(linha => linha.trim()).filter(linha => linha && !linha.startsWith('#'));
  } catch {
    return null;
  }
}

const aviso = () => (lerNomes() === null ? AVISO_SEM_LISTA : null);

function tiposDaLinha(linha, nomes) {
  const tipos = [
    ['e-mail', linha.includes('@') ? emailsPessoais(linha) : []],
    ['endereço IP', linha.includes('.') ? ipsReais(linha) : []],
    ['caminho com o nome de um usuário', /users/i.test(linha) ? caminhosPessoais(linha) : []],
    ['nome da lista de nomes proibidos', nomes ? [...dobrar(linha).matchAll(nomes)].map(achado => achado[0]) : []],
  ];
  return tipos.filter(([, valores]) => valores.length);
}

const grupoDoDado = (tipo, valores) => `${tipo}#${[...new Set(valores)].sort().join(' ')}`;

function gruposDaBase(arquivo, raiz, base, nomes) {
  const grupos = new Set();
  const texto = textoNaBase(arquivo, raiz, base);
  for (const linha of texto === null ? [] : texto.split(/\r?\n/)) {
    for (const [tipo, valores] of tiposDaLinha(linha, nomes)) grupos.add(grupoDoDado(tipo, valores));
  }
  return grupos;
}

function verificar(arquivo, fonte, raiz, base) {
  if (arquivoDaExcecao(arquivo)) return [];
  const novas = linhasNovas(arquivo, raiz, base);
  if (novas === NENHUMA_LINHA) return [];
  const nomes = padraoDosNomes(lerNomes() || []);
  const daBase = memoria(() => gruposDaBase(arquivo, raiz, base, nomes));
  const achados = [];
  fonte.split(/\r?\n/).forEach((texto, indice) => {
    if (!novas.has(indice + 1)) return;
    for (const [tipo, valores] of tiposDaLinha(texto, nomes)) {
      if (!daBase().has(grupoDoDado(tipo, valores))) achados.push({ linha: indice + 1, detalhe: `${tipo} (o valor não é mostrado)` });
    }
  });
  return achados;
}

module.exports = { id, guarda, conserto, seAplica, verificar, aviso, tiposDaLinha, padraoDosNomes, EXCECOES };
