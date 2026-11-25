'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const contrato = require('../../complemento/contrato/carregar.js');

const HOST = contrato.abridor.host;
const PROGRAMA_DO_HOST = path.join(__dirname, 'abridor-host.js');
const CONTEXTO_DA_SITUACAO = { achei: 'no_lugar', nao_achei: 'sumiu', achei_sem_abrir: 'nao_abre' };
const SEM_RESPOSTA = 'sem_resposta';
const NO_WINDOWS = process.platform === 'win32';
const CHAVE_DO_REGISTRO = `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST}`;

function exemplosDa(situacao) {
  return contrato.abridor.exemplos.filter(e => e.contexto.anki === CONTEXTO_DA_SITUACAO[situacao]);
}

const exemplosDoConserto = situacao => contrato.conserto.exemplos.filter(e => e.contexto.conserto === situacao);

function criarFakeAbridor() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-abridor-'));
  const programa = path.join(pasta, NO_WINDOWS ? 'abridor-de-mentira.cmd' : 'abridor-de-mentira');
  const aspas = texto => `'${texto.replace(/'/g, `'\\''`)}'`;
  // O Chrome roda o `path` do manifesto direto: um script que chama o Node deste processo com o programa do fake.
  // No Windows um `.cmd` (o `#!/bin/sh` não roda lá); o Chrome o chama com a origem como argumento, que o `%*` repassa.
  if (NO_WINDOWS) {
    fs.writeFileSync(programa, `@echo off\r\n"${process.execPath}" "${PROGRAMA_DO_HOST}" "${pasta}" %*\r\n`);
  } else {
    fs.writeFileSync(programa, `#!/bin/sh\nexec ${aspas(process.execPath)} ${aspas(PROGRAMA_DO_HOST)} ${aspas(pasta)} "$@"\n`, { mode: 0o755 });
  }
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
      if (NO_WINDOWS) execFileSync('reg', ['add', CHAVE_DO_REGISTRO, '/ve', '/t', 'REG_SZ', '/d', manifesto, '/f'], { stdio: 'ignore' });
    },
    desregistrar() {
      if (NO_WINDOWS) throw new Error('desregistrar() não existe no Windows: o Chromium cairia no abridor real do usuário (veja e2e/fakes/abridor.js)');
      for (const manifesto of manifestos) fs.rmSync(manifesto, { force: true });
    },
    pedidos() {
      const arquivo = path.join(pasta, 'pedidos.jsonl');
      if (!fs.existsSync(arquivo)) return [];
      return fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map(linha => JSON.parse(linha));
    },
    limpar() {
      if (NO_WINDOWS && manifestos.length) {
        try { execFileSync('reg', ['delete', CHAVE_DO_REGISTRO, '/f'], { stdio: 'ignore' }); } catch { }
      }
      fs.rmSync(pasta, { recursive: true, force: true });
    },
  };
}

const SEM_ABRIDOR_IMPOSSIVEL = NO_WINDOWS;

module.exports = { criarFakeAbridor, SEM_ABRIDOR_IMPOSSIVEL };
