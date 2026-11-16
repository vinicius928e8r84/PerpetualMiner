'use strict';

const assert = require('assert');
const { spawn } = require('child_process');

const { criarFakeAbridor } = require('./e2e/fakes/abridor');
const contrato = require('./complemento/contrato/carregar.js');

const ORIGEM = `${contrato.origemDaExtensao}/`;

function conversar(fake, mensagem, espera = 5000) {
  return new Promise((resolve, reject) => {
    // No Windows o programa é um `.cmd`, que o Node só roda por um shell.
    const host = process.platform === 'win32' ? spawn(`"${fake.programa}"`, [ORIGEM], { shell: true }) : spawn(fake.programa, [ORIGEM]);
    let saida = Buffer.alloc(0);
    const tempo = setTimeout(() => { host.kill(); resolve(null); }, espera);
    host.stdout.on('data', dados => {
      saida = Buffer.concat([saida, dados]);
      if (saida.length >= 4 && saida.length >= 4 + saida.readUInt32LE(0)) {
        clearTimeout(tempo);
        resolve(JSON.parse(saida.subarray(4, 4 + saida.readUInt32LE(0)).toString('utf8')));
      }
    });
    host.on('error', reject);
    const corpo = Buffer.from(JSON.stringify(mensagem));
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32LE(corpo.length);
    host.stdin.write(Buffer.concat([tamanho, corpo]));
  });
}

const SITUACAO_DO_CONTEXTO = { no_lugar: 'achei', sumiu: 'nao_achei', nao_abre: 'achei_sem_abrir' };

async function main() {
  const doAbridor = contrato.abridor.exemplos.filter(e => e.daExtensao);
  assert.ok(doAbridor.length >= 2, 'o contrato tem os exemplos de conferir que a extensão manda');

  for (const exemplo of doAbridor) {
    const fake = criarFakeAbridor();
    try {
      fake.definir(SITUACAO_DO_CONTEXTO[exemplo.contexto.anki]);
      const resposta = await conversar(fake, exemplo.mensagem);
      assert.deepStrictEqual(resposta, exemplo.resposta,
        `O fake do abridor e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json › abridor).`);
      assert.deepStrictEqual(fake.pedidos(), [{ mensagem: exemplo.mensagem, origem: ORIGEM }]);
    } finally {
      fake.limpar();
    }
  }

  for (const exemplo of contrato.conserto.exemplos.filter(e => e.daExtensao)) {
    const fake = criarFakeAbridor();
    try {
      fake.definirConserto(exemplo.contexto.conserto);
      assert.deepStrictEqual(await conversar(fake, exemplo.mensagem), exemplo.resposta,
        `O fake do abridor e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos-do-conserto.json).`);
    } finally {
      fake.limpar();
    }
  }
  const padrao = criarFakeAbridor();
  try {
    assert.deepStrictEqual(await conversar(padrao, { acao: 'consertar' }), { situacao: 'fechado' });
    assert.throws(() => padrao.definirConserto('o_anki_virou_passaro'), /não tem essa situação do consertar/);
  } finally {
    padrao.limpar();
  }

  const quieto = criarFakeAbridor();
  try {
    quieto.definir('sem_resposta');
    assert.strictEqual(await conversar(quieto, { acao: 'conferir' }, 700), null);
  } finally {
    quieto.limpar();
  }

  const semExemplo = criarFakeAbridor();
  try {
    assert.throws(() => semExemplo.definir('abriu_outro_programa'), /não tem essa situação/);
  } finally {
    semExemplo.limpar();
  }

  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-perfil-'));
  const registrado = criarFakeAbridor();
  try {
    registrado.registrarNoPerfil(perfil);
    const manifesto = JSON.parse(fs.readFileSync(path.join(perfil, 'NativeMessagingHosts', `${contrato.abridor.host}.json`), 'utf8'));
    assert.deepStrictEqual(manifesto.allowed_origins, [ORIGEM]);
    assert.strictEqual(manifesto.path, registrado.programa);
    registrado.desregistrar();
    assert.ok(!fs.existsSync(path.join(perfil, 'NativeMessagingHosts', `${contrato.abridor.host}.json`)));
  } finally {
    registrado.limpar();
    fs.rmSync(perfil, { recursive: true, force: true });
  }

  console.log('fake do abridor tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });
