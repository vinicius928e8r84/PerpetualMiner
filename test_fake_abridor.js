'use strict';

// O abridor de mentira do e2e (e2e/fakes/abridor.js) responde pelos exemplos do contrato
// (complemento/contrato/exemplos.json › abridor), os mesmos que o script de verdade responde em
// complemento/test_abridor.py. Ele é um programa: aqui ele roda como o Chrome o roda, com a mensagem
// em 4 bytes de tamanho + JSON na entrada e a origem da extensão no primeiro argumento.

const assert = require('assert');
const { spawn } = require('child_process');

const { criarFakeAbridor } = require('./e2e/fakes/abridor');
const contrato = require('./complemento/contrato/carregar.js');

const ORIGEM = `${contrato.origemDaExtensao}/`;

/** Roda o host do fake como o Chrome: devolve a resposta (ou null se ele não respondeu em `espera` ms). */
function conversar(fake, mensagem, espera = 5000) {
  return new Promise((resolve, reject) => {
    const host = spawn(fake.programa, [ORIGEM]);
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

  // O consertar (#152): cada exemplo do contrato, na situação que o nome dele diz, e o padrão é o Anki que a pessoa fechou.
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

  // Sem resposta: o host lê a mensagem e fica quieto (a extensão é que desiste).
  const quieto = criarFakeAbridor();
  try {
    quieto.definir('sem_resposta');
    assert.strictEqual(await conversar(quieto, { acao: 'conferir' }, 700), null);
  } finally {
    quieto.limpar();
  }

  // Uma situação que o contrato não tem não vira resposta inventada.
  const semExemplo = criarFakeAbridor();
  try {
    assert.throws(() => semExemplo.definir('abriu_outro_programa'), /não tem essa situação/);
  } finally {
    semExemplo.limpar();
  }

  // Registrado num perfil, o manifesto do host só aceita a extensão e aponta para o programa do fake.
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
