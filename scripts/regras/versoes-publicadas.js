'use strict';

// `complemento/versoes.json` guarda o hash das fontes do pacote por `VERSAO` (complemento/test_pacote.py). O
// teste só compara o hash da VERSAO de hoje com o de hoje: reescrever o hash da 0.2.0 em vez de subir a versão
// também passa nele, e a Conexão que o dono já instalou como 0.2.0 deixa de ser a que o arquivo diz. Esta
// regra compara com a base (a ponta da branch-alvo): uma versão que a base já registra não muda de hash nem
// some; só entra versão nova.
//
// A versão é dada no merge (complemento/versao_no_merge.py, num commit só): numa PR (GITHUB_EVENT_NAME=pull_request, ou
// REGRAS_PR=1 para rodar à mão) a regra também barra mexer à mão na `VERSAO`, no `versoes.json` ou no `.ankiaddon`. Passam o
// commit de versão (assunto `Conexão X.Y.Z: versão dada no merge`, tocando só os arquivos da versão) e os números que as PRs
// abertas de 11/11 já escreveram, listados em complemento/versoes-reservadas.json (lido da base: uma PR não amplia a lista).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const id = 'versoes-publicadas';

const ARQUIVO = 'complemento/versoes.json';

const CONFIGURACAO = 'complemento/configuracao.py';
const PACOTE = 'conexao/perpetualminer.ankiaddon';
const ASSUNTO_DA_VERSAO = /^Conexão \d+\.\d+\.\d+: versão dada no merge/;
const RESERVADAS = 'complemento/versoes-reservadas.json';
// O que o commit de versão (complemento/versao_no_merge.py) pode tocar.
const DO_COMMIT_DE_VERSAO = /^(complemento\/(configuracao\.py|versoes\.json|contrato\/[^/]+\.json)|conexao\/perpetualminer\.ankiaddon)$/;

const conserto = 'Volte o hash da versão publicada como está na base; a versão é dada no merge: numa PR não mexa em `VERSAO`, '
  + `${ARQUIVO} nem em ${PACOTE} (depois do merge, python3 complemento/versao_no_merge.py dá o número, o hash e o arquivo num commit só).`;

const seAplica = arquivo => arquivo === ARQUIVO;

function daBase(raiz, base) {
  try {
    const texto = execFileSync('git', ['show', `${base}:${ARQUIVO}`], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(texto);
  } catch {
    return null; // a base ainda não tem o arquivo (ou ele não é JSON): não há o que comparar
  }
}

const linhaDaChave = (fonte, chave) => {
  const indice = fonte.indexOf(`${JSON.stringify(chave)}:`);
  return indice < 0 ? 1 : fonte.slice(0, indice).split('\n').length;
};

const emPr = () => process.env.GITHUB_EVENT_NAME === 'pull_request' || process.env.REGRAS_PR === '1';

const git = (raiz, args) => {
  try {
    return { texto: execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }), ok: true };
  } catch (erro) {
    return { texto: '', ok: false, status: erro.status };
  }
};

// Os números que as PRs abertas quando a versão passou a ser dada no merge já levavam (#381, #387, #389, #363): a lista da base.
function reservadasDaBase(raiz, base) {
  const lida = git(raiz, ['show', `${base}:${RESERVADAS}`]);
  try {
    return lida.ok ? JSON.parse(lida.texto) : [];
  } catch {
    return [];
  }
}

const ehCommitDeVersao = (raiz, sha, assunto) => ASSUNTO_DA_VERSAO.test(assunto)
  && git(raiz, ['show', '--name-only', '--format=', sha]).texto.split('\n').filter(Boolean).every(arquivo => DO_COMMIT_DE_VERSAO.test(arquivo));

const versaoDe = texto => (/^VERSAO = "([^"]+)"/m.exec(texto) || [])[1];

// O que esta PR mexeu à mão da versão, ou [] (sem git, sem base, ou nada mexido).
function mexidoAMao(raiz, base, publicadas, hoje) {
  const origem = git(raiz, ['merge-base', base, 'HEAD']);
  if (!origem.ok) return [];
  const desde = origem.texto.trim();
  const mexidos = [];
  const novos = [];
  const antes = git(raiz, ['show', `${desde}:${CONFIGURACAO}`]);
  const agora = versaoDe(fs.readFileSync(path.join(raiz, CONFIGURACAO), 'utf8'));
  if (antes.ok && agora && versaoDe(antes.texto) !== agora) {
    mexidos.push('na `VERSAO` de complemento/configuracao.py');
    novos.push(agora);
  }
  const antigas = git(raiz, ['show', `${desde}:${ARQUIVO}`]);
  const registradas = antigas.ok ? JSON.parse(antigas.texto) : publicadas;
  const novasChaves = Object.keys(hoje).filter(versao => !(versao in registradas));
  if (novasChaves.length) {
    mexidos.push(`no ${ARQUIVO}`);
    novos.push(...novasChaves);
  }
  if (git(raiz, ['diff', '--quiet', desde, '--', PACOTE]).status === 1) mexidos.push(`no ${PACOTE}`);
  if (!mexidos.length) return [];
  const log = git(raiz, ['log', '--no-merges', '--format=%H %s', `${desde}..HEAD`, '--', CONFIGURACAO, ARQUIVO, PACOTE]);
  const commits = log.texto.split('\n').filter(Boolean).map(linha => [linha.slice(0, linha.indexOf(' ')), linha.slice(linha.indexOf(' ') + 1)]);
  if (commits.length && commits.every(([sha, assunto]) => ehCommitDeVersao(raiz, sha, assunto))) return [];
  const reservadas = reservadasDaBase(raiz, base);
  if (novos.length && novos.every(versao => reservadas.includes(versao))) return [];
  return mexidos;
}

function verificar(arquivo, fonte, raiz, base) {
  if (!base) return [];
  const publicadas = daBase(raiz, base);
  if (!publicadas) return [];
  let hoje;
  try {
    hoje = JSON.parse(fonte);
  } catch {
    return [{ linha: 1, detalhe: `${ARQUIVO} não é um JSON válido` }];
  }
  const achados = [];
  const aMao = emPr() ? mexidoAMao(raiz, base, publicadas, hoje) : [];
  if (aMao.length) {
    achados.push({ linha: 1, detalhe: `a versão é dada no merge: esta PR mexe à mão ${aMao.join(', ')}` });
  }
  for (const [versao, hash] of Object.entries(publicadas)) {
    if (!(versao in hoje)) {
      achados.push({ linha: 1, detalhe: `a versão ${versao} já estava registrada na base e sumiu do arquivo` });
    } else if (hoje[versao] !== hash) {
      achados.push({ linha: linhaDaChave(fonte, versao), detalhe: `o hash da versão ${versao}, já registrado na base, foi reescrito` });
    }
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
