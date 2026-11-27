const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const LANCADOR = path.join(__dirname, 'anki-de-teste.py');
const PORTA_DO_DONO = 8766;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'anki-de-teste-t-'));
const temporaria = path.join(pasta, 'tmp');
fs.mkdirSync(temporaria);

const anki = path.join(pasta, 'anki-de-mentira.py');
fs.writeFileSync(anki, `
import http.server, json, os, signal, sys, threading, time
registro = os.environ["PM_TESTE_REGISTRO"]
base = os.environ["ANKI_BASE"]
modo = os.environ.get("PM_TESTE_MODO", "")
json.dump({
    "pid": os.getpid(), "porta": os.environ["PM_ANKI_DE_TESTE_PORTA"], "base": base,
    "marca": os.path.isfile(os.path.join(base, "anki-de-teste")),
    "manifesto": os.path.isfile(os.path.join(base, "addons21", "perpetualminer", "manifest.json")),
    "pareamento": os.path.isfile(os.path.join(base, "addons21", "perpetualminer", "user_files", "pareamento.json")),
    "home_dentro_da_pasta": os.environ["HOME"].startswith(os.path.dirname(base)),
    "qt": os.environ.get("QT_QPA_PLATFORM"), "instancia": os.environ.get("ANKI_SINGLE_INSTANCE_KEY"),
}, open(registro + "." + str(os.getpid()), "w"))
if modo == "morre": sys.exit(3)
if modo == "mudo": time.sleep(600)
class Saude(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        corpo = b'{"ok": true}'
        self.send_response(200); self.send_header("Content-Length", str(len(corpo))); self.end_headers(); self.wfile.write(corpo)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", int(os.environ["PM_ANKI_DE_TESTE_PORTA"])), Saude).serve_forever()
`);

const registro = path.join(pasta, 'registro');
const ambiente = (extra = {}) => ({
  ...process.env, TMPDIR: temporaria, PM_ANKI_TRAVA: path.join(pasta, 'trava'), PM_ANKI_COMANDO: `python3 ${anki}`,
  PM_TESTE_REGISTRO: registro, PM_ANKI_ESPERA_S: '20', ...extra,
});
const rodar = (args, extra) => spawnSync('python3', [LANCADOR, ...args], { env: ambiente(extra), encoding: 'utf8', timeout: 90000 });
const lancar = args => spawn('python3', [LANCADOR, ...args], { env: ambiente(), stdio: ['ignore', 'pipe', 'pipe'] });
const terminou = filho => new Promise(resolve => filho.on('close', resolve));
const registros = () => fs.readdirSync(pasta).filter(n => n.startsWith('registro.')).map(n => JSON.parse(fs.readFileSync(path.join(pasta, n), 'utf8')));
const vivo = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const restos = () => fs.readdirSync(temporaria);
const limparRegistros = () => fs.readdirSync(pasta).filter(n => n.startsWith('registro.')).forEach(n => fs.rmSync(path.join(pasta, n)));
const saude = porta => new Promise(resolve => http.get({ host: '127.0.0.1', port: porta, path: '/health' }, r => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(null)));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const nadaSobrou = () => { assert.deepEqual(restos(), [], 'a pasta descartável, o soquete da instância e o pronto não sobram'); limparRegistros(); };

const SONDAGEM = `import json, os, urllib.request; p = os.environ["PM_ANKI_PORTA"]; print(json.dumps({"porta": p, "pasta": os.environ["PM_ANKI_PASTA"], "saude": urllib.request.urlopen("http://127.0.0.1:" + p + "/health", timeout=5).status}))`;

function aProvaNasceNumAnkiDeTesteNaPortaDada() {
  const r = rodar(['--pronto', path.join(pasta, 'pronto.json'), '--', 'python3', '-c', SONDAGEM]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const visto = JSON.parse(r.stdout);
  assert.notEqual(Number(visto.porta), PORTA_DO_DONO, 'a prova nunca usa a 8766');
  assert.equal(visto.saude, 200, 'a Conexão responde na porta dada enquanto o comando roda');
  assert.match(visto.pasta, /pm-anki-de-teste-\w+\/base\/addons21\/perpetualminer\/user_files$/, 'o user_files do complemento fica dentro da pasta descartável');
  const [a] = registros();
  assert.deepEqual([a.marca, a.manifesto, a.pareamento, a.home_dentro_da_pasta, a.qt, a.porta], [true, true, true, true, 'offscreen', visto.porta],
    'o Anki de teste nasce marcado, com o complemento instalado e pareado, sem tela, com o HOME dentro da pasta e na porta dada');
  assert.match(a.instancia, /^so-pm-anki-de-teste-/, 'a chave de instância é só dele');
  assert.ok(!vivo(a.pid), 'o Anki de teste foi fechado no fim');
  assert.ok(!fs.existsSync(path.join(pasta, 'pronto.json')), 'o arquivo pronto é apagado no fim');
  nadaSobrou();
}

function cadaProvaPegaUmaPortaLivreSua() {
  const portas = new Set();
  for (let i = 0; i < 3; i += 1) {
    const r = rodar(['--', 'python3', '-c', 'import os; print(os.environ["PM_ANKI_PORTA"])']);
    assert.equal(r.status, 0, r.stderr);
    portas.add(r.stdout.trim());
  }
  assert.ok(![...portas].includes(String(PORTA_DO_DONO)));
  limparRegistros();
}

function aSaidaDoComandoValeEOAnkiFechaMesmoAssim() {
  const r = rodar(['--', 'sh', '-c', 'exit 7']);
  assert.equal(r.status, 7, 'a saída do comando vale');
  assert.ok(registros().every(x => !vivo(x.pid)));
  nadaSobrou();
}

function umAnkiQueNaoRespondeOuCaiParaAProvaComACausa() {
  let r = rodar(['--', 'sh', '-c', 'echo rodou'], { PM_TESTE_MODO: 'mudo', PM_ANKI_ESPERA_S: '2' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Conexão não respondeu na porta \d+ em 2 s/);
  assert.ok(!r.stdout.includes('rodou'), 'o comando não roda sem o Anki');
  assert.ok(registros().every(x => !vivo(x.pid)), 'o Anki mudo é fechado');
  nadaSobrou();
  r = rodar(['--', 'sh', '-c', 'echo rodou'], { PM_TESTE_MODO: 'morre' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /fechou sozinho \(saída 3\)/);
  nadaSobrou();
}

async function umSigtermNoMeioDaProvaFechaOAnkiEApagaAPasta() {
  const filho = lancar(['--', 'sleep', '60']);
  let conversa = '';
  filho.stderr.on('data', d => { conversa += d; });
  for (let i = 0; i < 100 && !/Anki de teste na porta/.test(conversa); i += 1) await esperar(200);
  assert.match(conversa, /Anki de teste na porta/, 'subiu');
  const [a] = registros();
  assert.ok(vivo(a.pid));
  filho.kill('SIGTERM');
  assert.equal(await terminou(filho), 143);
  assert.ok(!vivo(a.pid), 'o Anki fecha com o SIGTERM do lançador');
  assert.equal(await saude(Number(a.porta)), null, 'a porta ficou livre');
  nadaSobrou();
}

async function umAnkiDeTestePorVezEEsperaSemLimite() {
  const marcas = path.join(pasta, 'marcas');
  const prova = path.join(pasta, 'a-prova.py');
  fs.writeFileSync(prova, `import sys, time
for passo in sys.argv[1:]:
    if passo.isdigit(): time.sleep(int(passo))
    else: open(${JSON.stringify(marcas)}, "a").write(passo + "\\n")
`);
  const primeira = lancar(['--', 'python3', prova, 'A-comeca', '4', 'A-acaba']);
  for (let i = 0; i < 100 && !fs.existsSync(marcas); i += 1) await esperar(200);
  const segunda = lancar(['--', 'python3', prova, 'B-comeca']);
  let falaDaSegunda = '';
  segunda.stderr.on('data', d => { falaDaSegunda += d; });
  await Promise.all([terminou(primeira), terminou(segunda)]);
  assert.deepEqual(fs.readFileSync(marcas, 'utf8').trim().split('\n'), ['A-comeca', 'A-acaba', 'B-comeca'], 'a segunda prova só começa depois que a primeira fecha o Anki dela');
  assert.match(falaDaSegunda, /esperando a vez/, 'quem espera diz que espera');
  assert.equal(registros().length, 2);
  nadaSobrou();
}

async function main() {
  let tocaram = 0;
  const isca = http.createServer((req, res) => { tocaram += 1; res.end(); });
  const iscaNoAr = await new Promise(resolve => { isca.once('error', () => resolve(false)); isca.listen(PORTA_DO_DONO, '127.0.0.1', () => resolve(true)); });
  aProvaNasceNumAnkiDeTesteNaPortaDada();
  cadaProvaPegaUmaPortaLivreSua();
  aSaidaDoComandoValeEOAnkiFechaMesmoAssim();
  umAnkiQueNaoRespondeOuCaiParaAProvaComACausa();
  await umSigtermNoMeioDaProvaFechaOAnkiEApagaAPasta();
  await umAnkiDeTestePorVezEEsperaSemLimite();
  if (iscaNoAr) assert.equal(tocaram, 0, 'ninguém bateu na 8766');
  else console.log('a 8766 já tinha dono nesta máquina: a isca não subiu; nada aqui fala com ela');
  isca.close();
  console.log('anki-de-teste: ok');
}

main().then(() => fs.rmSync(pasta, { recursive: true, force: true }), erro => { console.error(erro); fs.rmSync(pasta, { recursive: true, force: true }); process.exit(1); });
