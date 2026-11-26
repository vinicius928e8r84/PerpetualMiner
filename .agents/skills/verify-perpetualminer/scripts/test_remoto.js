const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPTS = __dirname;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'remoto-'));
const bin = path.join(pasta, 'bin');
const mac = path.join(pasta, 'mac');
const discoC = path.join(pasta, 'c');
const verificacao = path.join(pasta, 'verify');
const sshLog = path.join(pasta, 'ssh.log');
fs.mkdirSync(bin); fs.mkdirSync(mac); fs.mkdirSync(path.join(discoC, 'Temp'), { recursive: true });

const escrever = (nome, texto) => fs.writeFileSync(path.join(bin, nome), texto, { mode: 0o755 });
escrever('ssh', `#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -o|-F|-i) shift 2 ;; -*) shift ;; *) break ;; esac; done
echo "$1" >> ${JSON.stringify(sshLog)}; shift
exec bash -c "$*"
`);
escrever('wslpath', `#!/usr/bin/env bash
case "$1" in
  -u) printf '%s\\n' "$2" | sed 's#^C:\\\\#${discoC}/#; s#\\\\#/#g' ;;
  -w) printf '%s\\n' "$2" | sed 's#^${discoC}/#C:\\\\#; s#/#\\\\#g' ;;
esac
`);
escrever('powershell.exe', `#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in *GetTempPath*) printf 'C:\\\\Temp\\\\\\r\\n'; exit 0 ;; esac
done
while [ $# -gt 0 ]; do [ "$1" = -File ] && { sed 's/$/\\r/' "$(wslpath -u "$2")"; exit 0; }; shift; done
exit 9
`);

const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PM_MAC_SSH: 'mac-de-teste', PM_MAC_TMP: mac, PM_PC_SSH: 'pc-de-teste', PM_PC_POWERSHELL: path.join(bin, 'powershell.exe'), PM_VERIFY_ROOT: verificacao, PM_MAC_TRAVA: path.join(pasta, 'mac.lock') };
const rodar = (script, args, entrada) => spawnSync('bash', [path.join(SCRIPTS, script), ...args], { env, encoding: 'utf8', input: entrada ?? '' });
const vivos = marca => spawnSync('pgrep', ['-f', marca], { encoding: 'utf8' }).stdout.trim();
const restos = () => fs.readdirSync(mac);

try {
  let r = rodar('no-mac.sh', ['../fora', '--', 'true']);
  assert.equal(r.status, 2, r.stderr);
  assert.ok(!fs.existsSync(sshLog), 'a refused run-id reaches no machine');

  r = rodar('no-mac.sh', ['m1', '--', 'sh', '-c', 'test -f manifest.json && git ls-files --error-unmatch manifest.json >/dev/null && test -z "$(git status --porcelain)" && echo "DENTRO $PWD" && echo "TMP $TMPDIR"']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`DENTRO ${mac}/pm-m1-\\w{6}/repo\\n`), 'the command runs inside a fresh copy of HEAD, a clean git repository');
  assert.match(r.stdout, /TMP \S+\/pm-m1-\w{6}\/tmp\n/, 'TMPDIR lives inside the copy, so cleanup finds what the run started');
  assert.deepEqual(restos(), [], 'the copy is gone after a passing run');
  assert.match(fs.readFileSync(path.join(verificacao, 'm1', 'evidence', 'remoto.log'), 'utf8'), /DENTRO /, 'the output is kept as evidence');
  assert.equal(fs.readFileSync(path.join(verificacao, 'm1', 'evidence', 'exit-code'), 'utf8').trim(), '0');
  assert.match(fs.readFileSync(sshLog, 'utf8'), /^mac-de-teste$/m, 'PM_MAC_SSH names the host');

  r = rodar('no-mac.sh', ['m1', '--', 'true']);
  assert.equal(r.status, 2, 'a run-id that already holds evidence is refused');

  r = rodar('no-mac.sh', ['m2', '--trazer', 'saida', '--', 'sh', '-c', 'mkdir saida && echo feito > saida/r.txt; exit 7']);
  assert.equal(r.status, 7, 'the command\'s exit code comes back');
  assert.equal(fs.readFileSync(path.join(verificacao, 'm2', 'evidence', 'trazido', 'saida', 'r.txt'), 'utf8'), 'feito\n', '--trazer brings the path back before the copy is deleted');
  assert.deepEqual(restos(), [], 'the copy is gone after a failing run');

  r = rodar('no-mac.sh', ['m3', '--', 'sh', '-c', 'sleep 3171 & $(command -v setsid) sh -c "while :; do sleep 1; done" "$TMPDIR/navegador" & echo ok']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  spawnSync('sleep', ['0.5']);
  assert.equal(vivos('sleep 3171'), '', 'a child left in the run\'s process group is stopped');
  assert.equal(vivos(`${mac}/pm-m3-`), '', 'a detached process whose command line names the copy is stopped');
  assert.deepEqual(restos(), []);

  const kills = path.join(pasta, 'kills.log');
  r = spawnSync('bash', [path.join(SCRIPTS, 'no-mac.sh'), 'm4', '--', 'sh', '-c', 'sleep 0.3; echo 1 > ../.grupo'],
    { env: { ...env, 'BASH_FUNC_kill%%': `() { echo "kill $*" >> ${JSON.stringify(kills)}; }` }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!/ -- -1\b/.test(fs.existsSync(kills) ? fs.readFileSync(kills, 'utf8') : ''), 'a .grupo that says 1 never becomes kill -- -1, a signal to every process of the user');
  assert.deepEqual(restos(), []);

  const ordem = path.join(pasta, 'ordem.log');
  const no = (id, comando) => `bash ${JSON.stringify(path.join(SCRIPTS, 'no-mac.sh'))} ${id} -- sh -c ${JSON.stringify(comando)}`;
  r = spawnSync('bash', ['-c', `${no('t1', `echo A-comeca >> ${ordem}; sleep 3; echo A-acaba >> ${ordem}`)} & until [ -s ${ordem} ]; do sleep 0.1; done; ${no('t2', `echo B-comeca >> ${ordem}`)}; wait`],
    { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(fs.readFileSync(ordem, 'utf8').trim().split('\n'), ['A-comeca', 'A-acaba', 'B-comeca'], 'the second run waits for the Mac lock until the first one is done and cleaned up, with no limit');
  assert.equal(r.stderr.match(/esperando a vez do Mac/g).length, 1, 'only the one that waits says so');
  assert.deepEqual(restos(), []);
  r = spawnSync('bash', [path.join(SCRIPTS, 'no-mac.sh'), 't3', '--', 'true'], { env: { ...env, PM_MAC_TRAVA: path.join(pasta, 'sem', 'pasta', 'mac.lock') }, encoding: 'utf8' });
  assert.equal(r.status, 0, 'the lock folder is made when it is missing');
  assert.ok(fs.existsSync(path.join(pasta, 'sem', 'pasta', 'mac.lock')));

  r = rodar('no-pc.sh', ['p1', '-'], 'Write-Output "olá"\n');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const ps1 = fs.readdirSync(path.join(discoC, 'Temp', 'pm-p1', 'ps'));
  assert.equal(ps1.length, 1);
  const enviado = fs.readFileSync(path.join(discoC, 'Temp', 'pm-p1', 'ps', ps1[0]));
  assert.deepEqual([...enviado.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'the script goes with a BOM, so PowerShell 5 reads it as UTF-8');
  assert.match(enviado.toString(), /Set-Location 'C:\\Temp\\pm-p1'/, 'it runs in the run\'s own folder under the PC\'s temp');
  assert.match(r.stdout, /Write-Output "olá"/);
  assert.ok(!r.stdout.includes('\r'), 'the output comes back without CR');
  assert.match(fs.readFileSync(sshLog, 'utf8'), /^pc-de-teste$/m, 'PM_PC_SSH names the host');

  const levado = path.join(pasta, 'pacote.ankiaddon');
  fs.writeFileSync(levado, 'zip');
  r = rodar('no-pc.sh', ['p1', '--levar', levado]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(discoC, 'Temp', 'pm-p1', 'pacote.ankiaddon'), 'utf8'), 'zip');

  r = rodar('no-pc.sh', ['p1', '--limpar']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(discoC, 'Temp', 'pm-p1')), '--limpar deletes the run\'s folder');
  assert.ok(fs.existsSync(path.join(discoC, 'Temp')), 'and only it');

  r = rodar('no-pc.sh', ['a/b', '--limpar']);
  assert.equal(r.status, 2, 'a run-id that is not one plain segment is refused');
} finally {
  spawnSync('pkill', ['-f', `${mac}/pm-`]);
  fs.rmSync(pasta, { recursive: true, force: true });
}
console.log('remoto: no-mac.sh and no-pc.sh ok');
