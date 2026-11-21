'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lerDaLib = arquivo => fs.readFileSync(path.join(__dirname, '..', 'lib', arquivo), 'utf8');
const comoValor = valor => JSON.parse(JSON.stringify(valor));

const SITUACAO_DA_CONEXAO = { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' };

function carregarAConfiguracao(gravado = {}) {
  const noDisco = { ...gravado };
  const aoMudarOStorage = [];
  const retratos = [];
  const contexto = vm.createContext({
    chrome: {
      storage: {
        local: {
          get(padroes, responder) {
            const dados = {};
            for (const [chave, padrao] of Object.entries(padroes)) dados[chave] = chave in noDisco ? noDisco[chave] : padrao;
            responder(dados);
          },
        },
        onChanged: { addListener: ouvinte => aoMudarOStorage.push(ouvinte) },
      },
    },
  });
  contexto.globalThis = contexto;
  vm.runInContext(lerDaLib('ajustes-de-envio.js'), contexto);
  Object.assign(contexto.PerpetualMiner, {
    Atalhos: { ACOES: { SELECAO: 'selecao' }, acompanharAtalhos: ouvinte => ouvinte({ selecao: 'Alt+M' }) },
    ConexaoAnki: {
      SITUACAO: SITUACAO_DA_CONEXAO,
      acompanhar: ouvinte => ouvinte(SITUACAO_DA_CONEXAO.CONECTANDO),
      apresentada: () => SITUACAO_DA_CONEXAO.CONECTANDO,
      situacao: () => SITUACAO_DA_CONEXAO.CONECTANDO,
    },
  });
  vm.runInContext(lerDaLib('configuracao.js'), contexto);
  contexto.PerpetualMiner.Configuracao.acompanhar(retrato => retratos.push(comoValor(retrato.estado)));
  const avisar = (mudancas, area = 'local') => {
    for (const ouvinte of aoMudarOStorage) ouvinte(mudancas, area);
  };
  const mudar = (novos, area = 'local') => {
    const mudancas = {};
    for (const [chave, valor] of Object.entries(novos)) {
      mudancas[chave] = { newValue: valor };
      if (valor === undefined) delete noDisco[chave];
      else noDisco[chave] = valor;
    }
    avisar(mudancas, area);
  };
  return { retratos, avisar, mudar, noDisco, CHAVE_DO_NIVEL: contexto.PerpetualMiner.AjustesDeEnvio.CHAVE };
}

const ESTADO_SEM_NADA_GRAVADO = {
  totalDeFrases: 0,
  atalhoDeSelecao: 'Alt+M',
  conta: null,
  conexaoLigada: null,
  conexaoPareada: false,
  automatica: { en: false, ru: false },
  nivelSalvo: { en: false, ru: false },
  chave: '',
  chaveDaOpenAI: '',
  progresso: null,
};

const CHAVE_DO_NIVEL = carregarAConfiguracao().CHAVE_DO_NIVEL;
assert.strictEqual(CHAVE_DO_NIVEL, 'ankiBridgePresets');

const LEITURAS = [
  ['nada gravado', {}, {}],
  ['3 Frases', { frases: [{ id: 1 }, { id: 2 }, { id: 3 }] }, { totalDeFrases: 3 }],
  ['frases nulas contam 0', { frases: null }, { totalDeFrases: 0 }],
  ['a conta', { pm_user_info: { email: 'a@b.c', uid: 'u1' } }, { conta: { email: 'a@b.c', uid: 'u1' } }],
  ['conta vazia vira null', { pm_user_info: '' }, { conta: null }],
  ['mineração automática só em inglês', { pm_auto_miner_settings: { en: { enabled: true }, ru: { enabled: 0 } } }, { automatica: { en: true, ru: false } }],
  ['mineração automática em russo, ligada por valor verdadeiro', { pm_auto_miner_settings: { ru: { enabled: 'sim' } } }, { automatica: { en: false, ru: true } }],
  ['mineração automática sem idioma', { pm_auto_miner_settings: { en: null } }, { automatica: { en: false, ru: false } }],
  ['nível salvo só em inglês', { [CHAVE_DO_NIVEL]: { en: { versao: 2 }, ru: { versao: 0 } } }, { nivelSalvo: { en: true, ru: false } }],
  ['nível salvo pela versão em texto', { [CHAVE_DO_NIVEL]: { ru: { versao: '3' } } }, { nivelSalvo: { en: false, ru: true } }],
  ['nível com versão zero em inglês', { [CHAVE_DO_NIVEL]: { en: { versao: 0 } } }, { nivelSalvo: { en: false, ru: false } }],
  ['nível com versão negativa', { [CHAVE_DO_NIVEL]: { en: { versao: -1 } } }, { nivelSalvo: { en: false, ru: false } }],
  ['a chave do Gemini', { geminiApiKey: 'AIza-chave' }, { chave: 'AIza-chave' }],
  ['a chave do Gemini nula', { geminiApiKey: null }, { chave: '' }],
  ['a chave da OpenAI pelos últimos 4', { pm_chave_openai: { ultimos4: 'x9Z1', chave: 'sk-nunca' } }, { chaveDaOpenAI: 'x9Z1' }],
  ['a chave da OpenAI sem os últimos 4', { pm_chave_openai: {} }, { chaveDaOpenAI: '' }],
  ['o progresso normalizado', { pm_boas_vindas: { agoraNao: 'conta', concluida: 1, lembreteOculto: true } },
    { progresso: { agoraNao: [], concluida: true, lembreteOculto: true } }],
  ['o progresso com o que já foi deixado para depois', { pm_boas_vindas: { agoraNao: ['conta', 'ia'], primeiroEnvio: { chegou: true } } },
    { progresso: { agoraNao: ['conta', 'ia'], primeiroEnvio: { chegou: true }, concluida: false } }],
  ['o progresso que não é objeto', { pm_boas_vindas: 'texto' }, { progresso: null }],
  ['tudo junto', {
    frases: [{ id: 9 }],
    pm_user_info: { uid: 'u2' },
    pm_auto_miner_settings: { en: { enabled: true }, ru: { enabled: true } },
    [CHAVE_DO_NIVEL]: { en: { versao: 1 }, ru: { versao: 1 } },
    geminiApiKey: 'g',
    pm_chave_openai: { ultimos4: 'abcd' },
    pm_boas_vindas: { agoraNao: [], concluida: false },
  }, {
    totalDeFrases: 1,
    conta: { uid: 'u2' },
    automatica: { en: true, ru: true },
    nivelSalvo: { en: true, ru: true },
    chave: 'g',
    chaveDaOpenAI: 'abcd',
    progresso: { agoraNao: [], concluida: false },
  }],
];

function cadaChaveGravadaChegaAoEstadoAoAbrir() {
  for (const [nome, gravado, muda] of LEITURAS) {
    const { retratos } = carregarAConfiguracao(gravado);
    assert.deepStrictEqual(retratos.at(-1), { ...ESTADO_SEM_NADA_GRAVADO, ...muda }, `ao abrir: ${nome}`);
  }
}

const GRAVADO_INICIAL = {
  frases: [{ id: 1 }, { id: 2 }],
  pm_user_info: { uid: 'u1' },
  pm_auto_miner_settings: { en: { enabled: true } },
  [CHAVE_DO_NIVEL]: { en: { versao: 1 } },
  geminiApiKey: 'g1',
  pm_chave_openai: { ultimos4: '1111' },
  pm_boas_vindas: { agoraNao: ['ia'], concluida: false },
};
const ESTADO_INICIAL = {
  ...ESTADO_SEM_NADA_GRAVADO,
  totalDeFrases: 2,
  conta: { uid: 'u1' },
  automatica: { en: true, ru: false },
  nivelSalvo: { en: true, ru: false },
  chave: 'g1',
  chaveDaOpenAI: '1111',
  progresso: { agoraNao: ['ia'], concluida: false },
};

const MUDANCAS = [
  ['só a chave do Gemini muda, o resto fica', { geminiApiKey: 'g2' }, { chave: 'g2' }],
  ['as frases apagadas contam 0', { frases: undefined }, { totalDeFrases: 0 }],
  ['a mineração automática desligada', { pm_auto_miner_settings: undefined }, { automatica: { en: false, ru: false } }],
  ['o nível apagado', { [CHAVE_DO_NIVEL]: undefined }, { nivelSalvo: { en: false, ru: false } }],
  ['a chave da OpenAI apagada', { pm_chave_openai: undefined }, { chaveDaOpenAI: '' }],
  ['o progresso apagado', { pm_boas_vindas: undefined }, { progresso: null }],
  ['duas chaves de uma vez', { frases: [{ id: 1 }], geminiApiKey: '' }, { totalDeFrases: 1, chave: '' }],
  ['uma chave que a configuração não lê', { pm_outra_coisa: 1 }, {}],
];

function soOQueMudouNoStorageMudaNoEstado() {
  for (const [nome, novos, muda] of MUDANCAS) {
    const { retratos, mudar } = carregarAConfiguracao(GRAVADO_INICIAL);
    assert.deepStrictEqual(retratos.at(-1), ESTADO_INICIAL, `antes de mudar: ${nome}`);
    const antes = retratos.length;
    mudar(novos);
    assert.deepStrictEqual(retratos.at(-1), { ...ESTADO_INICIAL, ...muda }, `ao mudar: ${nome}`);
    assert.strictEqual(retratos.length, antes + 1, `um aviso por mudança: ${nome}`);
  }
}

function aMudancaForaDoStorageLocalNaoConta() {
  const { retratos, mudar } = carregarAConfiguracao(GRAVADO_INICIAL);
  const antes = retratos.length;
  mudar({ geminiApiKey: 'g-sync' }, 'sync');
  assert.strictEqual(retratos.length, antes, 'a mudança no storage sync não avisa');
  assert.deepStrictEqual(retratos.at(-1), ESTADO_INICIAL);
}

function aContaNovaELidaDoStorage() {
  const { retratos, avisar, noDisco } = carregarAConfiguracao(GRAVADO_INICIAL);
  noDisco.pm_user_info = { uid: 'do-disco' };
  const antes = retratos.length;
  avisar({ pm_user_info: { newValue: { uid: 'do-aviso' } } });
  assert.strictEqual(retratos.length, antes + 1, 'a conta sozinha dá um aviso só, o da leitura');
  assert.deepStrictEqual(retratos.at(-1), { ...ESTADO_INICIAL, conta: { uid: 'do-disco' } }, 'a conta é lida de novo do storage, não do aviso');
}

function aContaComOutraChaveAvisaDuasVezes() {
  const { retratos, avisar, noDisco } = carregarAConfiguracao(GRAVADO_INICIAL);
  noDisco.pm_user_info = null;
  const antes = retratos.length;
  avisar({ pm_user_info: { newValue: { uid: 'do-aviso' } }, geminiApiKey: { newValue: 'g4' } });
  assert.strictEqual(retratos.length, antes + 2, 'a conta com outra chave dá dois avisos: o da chave e o da leitura');
  assert.deepStrictEqual(retratos.at(-2), { ...ESTADO_INICIAL, chave: 'g4' }, 'primeiro o que veio no aviso, sem a conta');
  assert.deepStrictEqual(retratos.at(-1), { ...ESTADO_INICIAL, chave: 'g4', conta: null }, 'depois a conta lida do storage');
}

cadaChaveGravadaChegaAoEstadoAoAbrir();
soOQueMudouNoStorageMudaNoEstado();
aMudancaForaDoStorageLocalNaoConta();
aContaNovaELidaDoStorage();
aContaComOutraChaveAvisaDuasVezes();
console.log('configuracao tests passed');
