'use strict';

// O abridor de mentira: o host de Native Messaging que a Conexão com o Anki escreve e registra (#147,
// complemento/abridor.py), no lugar do script de verdade. O fixture o registra no perfil de teste do
// Chromium (`<perfil>/NativeMessagingHosts/<host>.json`: com um perfil próprio, é ali que o Chromium do
// Linux procura os hosts do usuário), e o Chromium o roda como rodaria o de verdade, pela mensagem de
// 4 bytes de tamanho + JSON. Ele responde pelos exemplos do contrato (complemento/contrato/exemplos.json ›
// abridor), os mesmos que complemento/test_abridor.py confere no script de verdade; `node test_fake_abridor.js`
// confere este fake contra eles.
//
//   definir('achei' | 'nao_achei' | 'achei_sem_abrir' | 'sem_resposta')  o que o abridor encontra (padrão:
//                                                    'achei'); `achei_sem_abrir` é o Anki no lugar e o sistema sem
//                                                    conseguir abri-lo; sem resposta, ele lê a mensagem e fica quieto
//   definirConserto(situacao, { atrasoMs })          o que o `consertar` encontra (#152): uma `contexto.conserto` do contrato
//                                                    (`complemento/contrato/exemplos-do-conserto.json`); o padrão é 'anki_fechado', a pessoa
//                                                    fechou o Anki, que continua fechado. `atrasoMs` demora a resposta (a espera dos 30 s)
//   registrarNoPerfil(perfil) / desregistrar()       o manifesto do host no perfil, em cada perfil que o registrou (sem ele:
//                                                    uma Conexão antiga, que ainda não escrevia o abridor)
//   pedidos()                                        as mensagens que chegaram, com a origem que o Chrome passou
//                                                    (transporte: o que a extensão pediu, não o que ficou guardado)
//
// A permissão `nativeMessaging` é do Chrome, não do fake: o fixture a dá (`permissaoDoAbridor`) como o Chrome
// a guarda quando a pessoa aperta Permitir no aviso dele, que o Playwright não alcança.

const fs = require('fs');
const os = require('os');
const path = require('path');

const contrato = require('../../complemento/contrato/carregar.js');

const HOST = contrato.abridor.host;
const PROGRAMA_DO_HOST = path.join(__dirname, 'abridor-host.js');
// A situação do fake e o contexto dos exemplos do contrato que ela escolhe.
const CONTEXTO_DA_SITUACAO = { achei: 'no_lugar', nao_achei: 'sumiu', achei_sem_abrir: 'nao_abre' };
const SEM_RESPOSTA = 'sem_resposta';

/** Os exemplos do contrato que o abridor responde numa situação. */
function exemplosDa(situacao) {
  return contrato.abridor.exemplos.filter(e => e.contexto.anki === CONTEXTO_DA_SITUACAO[situacao]);
}

const exemplosDoConserto = situacao => contrato.conserto.exemplos.filter(e => e.contexto.conserto === situacao);

function criarFakeAbridor() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-abridor-'));
  const programa = path.join(pasta, 'abridor-de-mentira');
  const aspas = texto => `'${texto.replace(/'/g, `'\\''`)}'`;
  // O Chrome roda o `path` do manifesto direto: um script que chama o Node deste processo com o programa do fake.
  fs.writeFileSync(programa, `#!/bin/sh\nexec ${aspas(process.execPath)} ${aspas(PROGRAMA_DO_HOST)} ${aspas(pasta)} "$@"\n`, { mode: 0o755 });
  const manifestos = [];   // um por perfil que o registrou (o segundo perfil do teste também)

  let atual = { situacao: 'achei', conserto: 'anki_fechado', atrasoMs: 0 };
  function gravar() {
    fs.writeFileSync(path.join(pasta, 'situacao.json'), JSON.stringify({
      situacao: atual.situacao,
      atrasoMs: atual.atrasoMs,
      exemplos: atual.situacao === SEM_RESPOSTA ? [] : [...exemplosDa(atual.situacao), ...exemplosDoConserto(atual.conserto)],
    }));
  }

  function definir(situacao) {
    if (situacao !== SEM_RESPOSTA && !exemplosDa(situacao).length) {
      throw new Error(`O contrato (complemento/contrato/exemplos.json › abridor) não tem essa situação: ${situacao}. `
        + 'Escreva os exemplos dela antes; o script de verdade e este fake leem o mesmo arquivo.');
    }
    atual = { ...atual, situacao };
    gravar();
  }

  function definirConserto(conserto, { atrasoMs = 0 } = {}) {
    if (!exemplosDoConserto(conserto).length) {
      throw new Error(`O contrato (complemento/contrato/exemplos-do-conserto.json) não tem essa situação do consertar: ${conserto}.`);
    }
    atual = { ...atual, conserto, atrasoMs };
    gravar();
  }
  gravar();

  return {
    host: HOST,
    programa,
    definir,
    definirConserto,
    registrarNoPerfil(perfil) {
      const hosts = path.join(perfil, 'NativeMessagingHosts');
      fs.mkdirSync(hosts, { recursive: true });
      const manifesto = path.join(hosts, `${HOST}.json`);
      manifestos.push(manifesto);
      fs.writeFileSync(manifesto, JSON.stringify({
        name: HOST,
        description: 'PerpetualMiner: o abridor de mentira do e2e',
        path: programa,
        type: 'stdio',
        allowed_origins: [`${contrato.origemDaExtensao}/`],
      }));
    },
    desregistrar() {
      for (const manifesto of manifestos) fs.rmSync(manifesto, { force: true });
    },
    pedidos() {
      const arquivo = path.join(pasta, 'pedidos.jsonl');
      if (!fs.existsSync(arquivo)) return [];
      return fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map(linha => JSON.parse(linha));
    },
    limpar() {
      fs.rmSync(pasta, { recursive: true, force: true });
    },
  };
}

module.exports = { criarFakeAbridor };
