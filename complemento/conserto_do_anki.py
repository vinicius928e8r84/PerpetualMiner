"""O que o abridor faz quando a Conexão não responde: consertar sem clique (#152, #102).

`{"acao": "consertar"}` (`abridor.py` escreve o script; aqui moram os trechos dele e o que ele precisa saber). A resposta é
sempre `{"situacao": …}`:

- `fechado`: o Anki não está rodando quando o `consertar` começa. A pessoa o fechou, e **um Anki fechado continua fechado**: nada é
  fechado, e a extensão, que o pediu, é quem decide abrir.
- `fechou`: o Anki rodava quando o `consertar` começou e a pessoa o fechou durante a espera (ou ele saiu antes de o abridor
  conseguir sinalizá-lo): nada é aberto, nem a extensão deve abrir.
- `respondeu`: a Conexão respondeu antes dos 30 s. Nada a consertar.
- `reiniciado`: o Anki não respondeu em 30 s; o abridor o fechou à força e o abriu de novo.
- `ligado`: o Anki tinha desativado a Conexão (`disabled` no `meta.json`); o abridor fechou o Anki pelo caminho normal, ligou
  o complemento e abriu o Anki.
- `sumiu`: a pasta do complemento não tem mais o complemento.
- `falhou`, com `motivo`: `nao_fechou`, `nao_abriu`, `meta_ilegivel`, `meta_nao_gravou` ou `conexao_fora` (o Anki roda e não é ele
  quem ouve a porta da Conexão: outro programa a ocupa, ou a Conexão não subiu. O Anki está saudável e **nada é fechado**).

O que o abridor sabe do Anki vem do próprio Anki: quem escreve o script é o complemento, dentro do Anki, e anota o programa
(`sys.executable`) que roda o Anki. Só os processos que rodam exatamente esse programa **agora** (a lista de processos, lida a
cada passo, só os da própria pessoa) são fechados e, no Windows do instalador novo, também o filho CPython desse programa
(`FilhosDoAnki`, pela árvore de processos). Nunca se procura por nome (`pkill anki`), e um `pid` anotado não serviria,
porque com a Conexão desativada o Anki reabre sem o complemento e o `pid` do script já é de um Anki que saiu. Só se fecha à força
o Anki que **trava de verdade**: todo processo que ouve a porta da Conexão tem que ser do Anki (Mac: `lsof`; Windows:
`Get-NetTCPConnection`), senão é `conexao_fora` e nada é morto (também quando outro programa divide a porta com o Anki), e a força
vai só aos pids que ouvem a porta, não a todo processo que roda o programa do Anki. E só se abre o Anki depois que ao menos um
processo recebeu o sinal (no Windows, `CloseMainWindow()` devolveu verdadeiro): se nenhum recebeu porque o Anki já tinha saído, é
`fechou`. Perguntar se a Conexão responde é `POST /anki/responde`, que só volta com a thread principal do Anki viva (o `/health` responde
mesmo com o Anki travado). O script não é um navegador pareado e não assina: por isso a rota é uma das que dispensam a assinatura, e só diz
`{"ok": true}` (nada de perfil, nada muda). Pedir a lista de perfis (`/anki/profiles`) não serve: sem assinatura é 401 para qualquer Anki,
e o Anki saudável seria fechado à força.

No Windows do instalador novo o Anki fechado à força deixa vivo o launcher (`anki.exe`, o programa que o abridor abre), sem
filhos, para sempre (#540): depois de o Anki sair, o `reiniciado` encerra o launcher que era pai direto do Anki fechado, se ele ainda é
o mesmo processo e não tem filho vivo, e só ele. O Anki que o abridor abre nasce na pasta da pessoa, nunca no diretório corrente do
abridor (`user_files\\abridor`), que ele seguraria aberta: o Remover da Conexão e a atualização falhavam com WinError 32 (#539).

O `meta.json` só tem uma marca mexida, a `disabled` do topo: o resto fica como estava. O de antes fica em
`user_files/abridor/meta.json.antes`, e a troca é de uma vez (escreve ao lado e troca). Fechar o Anki **antes** de mexer no
arquivo evita que ele regrave o dele por cima.

Custo aceito pelo dono: fechar à força pode perder o Cartão que a pessoa estava editando. Fechar à força e ligar pelo
`meta.json` não foram testados num Mac nem num Windows de verdade (risco 3 do #138): os testes (`test_conserto.py`) rodam o
script do Mac com programas de mentira, e o `.ps1` do Windows só se confere por inspeção.
"""

import shlex

from .configuracao import ENDERECO, ORIGENS_ACEITAS, PORTA
from .conserto_do_anki_windows import FUNCOES_DO_PS1  # noqa: F401

ESPERA_PADRAO_S = 30
PROGRAMAS_DO_MAC = {
    "ps": "/bin/ps",
    "curl": "/usr/bin/curl",
    "kill": "/bin/kill",
    "sleep": "/bin/sleep",
    "date": "/bin/date",
    "lsof": "/usr/sbin/lsof",
    "id": "/usr/bin/id",
}
NOME_DA_COPIA = "meta.json.antes"


class Conserto:
    """O que o abridor precisa saber do Anki que o escreveu para consertá-lo. Sem `executavel`, ele nunca fecha nada.

    `espera_s` é a espera sem resposta antes de fechar à força (os testes passam menos, com o relógio de mentira);
    `programas` troca `ps`, `curl`, `kill`, `sleep`, `date`, `lsof` e `id` do Mac (os testes passam os de mentira).
    """

    def __init__(self, *, executavel=None, complemento=None, porta=PORTA, espera_s=ESPERA_PADRAO_S, programas=None):
        self.executavel = executavel
        self.complemento = complemento
        self.porta = porta
        self.espera_s = espera_s
        self.programas = dict(PROGRAMAS_DO_MAC, **(programas or {}))

    @property
    def url(self):
        return "http://%s:%d/anki/responde" % (ENDERECO, self.porta)

    @property
    def origem(self):
        return ORIGENS_ACEITAS[0]


def variaveis_do_mac(conserto, pasta_do_abridor):
    """As linhas `NOME=valor` do script do Mac."""
    valores = [
        ("EXECUTAVEL", conserto.executavel or ""),
        ("COMPLEMENTO", conserto.complemento or ""),
        ("COPIA", pasta_do_abridor + "/" + NOME_DA_COPIA),
        ("URL", conserto.url),
        ("ORIGEM", conserto.origem),
        ("ESPERA", str(int(conserto.espera_s))),
        ("PORTA", str(int(conserto.porta))),
    ] + [(nome.upper(), caminho) for nome, caminho in sorted(conserto.programas.items())]
    return "\n".join("%s=%s" % (nome, shlex.quote(valor)) for nome, valor in valores) + '\nMETA="$COMPLEMENTO/meta.json"'


FUNCOES_DO_MAC = r"""
# consertar: os processos da própria pessoa que rodam agora o programa que a Conexão anotou (EXECUTAVEL, o do Anki), e só eles.
anki_pids() {
  [ -n "$EXECUTAVEL" ] || return 0
  "$PS" -x -U "$("$ID" -u)" -ww -o pid= -o command= 2>/dev/null | while read -r pid comando; do
    case "$comando" in
      "$EXECUTAVEL"|"$EXECUTAVEL "*) echo "$pid" ;;
    esac
  done
}
anki_rodando() { [ -n "$(anki_pids)" ]; }
# Manda o sinal ($1) aos pids que vierem depois; só dá certo (0) se algum recebeu.
sinalizar() {
  sinal=$1; shift; recebeu=1
  for pid in "$@"; do "$KILL" "$sinal" "$pid" >/dev/null 2>&1 && recebeu=0; done
  return $recebeu
}
# Os pids que ouvem a porta da Conexão, se TODOS são do Anki. Outro programa na porta (mesmo dividindo-a com o Anki), ou ninguém,
# não é um Anki travado: sem saída, e nada é morto.
donos_da_conexao() {
  pids=$(anki_pids); donos=
  for ouvinte in $("$LSOF" -nP -iTCP:"$PORTA" -sTCP:LISTEN -t 2>/dev/null); do
    do_anki=1
    for pid in $pids; do [ "$ouvinte" = "$pid" ] && do_anki=0; done
    [ $do_anki = 0 ] || return 1
    case " $donos " in *" $ouvinte "*) ;; *) donos="$donos $ouvinte" ;; esac
  done
  [ -n "$donos" ] && echo $donos
}
agora() { "$DATE" +%s; }
# Só volta 200 com a thread principal do Anki viva (o /health responde mesmo com o Anki travado).
conexao_responde() {
  "$CURL" -s -f -m 3 -o /dev/null -X POST -H "Origin: $ORIGEM" -H 'Content-Type: application/json' -d '{}' "$URL" </dev/null >/dev/null 2>&1
}
esperar_o_anki_sair() {
  inicio=$(agora)
  while anki_rodando; do
    [ $(( $(agora) - inicio )) -ge "$1" ] && return 1
    "$SLEEP" 2
  done
  return 0
}
falhou() { responder "{\"situacao\":\"falhou\",\"motivo\":\"$1\"}"; }
fechou() { responder '{"situacao":"fechou"}'; }
# Nenhum processo recebeu o sinal: ou o Anki já tinha saído (a pessoa o fechou) ou o sinal não o alcança.
ninguem_recebeu() { if anki_rodando; then falhou nao_fechou; else fechou; fi; }
# O meta.json do Anki: "ligado" (nada a ligar), vazio (ilegível) ou o conteúdo novo, só com o disabled do topo desligado.
estado_do_meta() {
  [ -f "$META" ] || { printf ligado; return; }
  "$LER_JSON" -l JavaScript - "$(cat "$META" 2>/dev/null)" 2>/dev/null <<'JSON'
function run(argumentos) {
  try {
    var meta = JSON.parse(argumentos[0]);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return '';
    if (meta.disabled !== true) return 'ligado';
    meta.disabled = false;
    return JSON.stringify(meta, null, 2);
  } catch (erro) {}
  return '';
}
JSON
}
guardar_o_meta() {
  cat "$META" > "$COPIA.novo" 2>/dev/null && mv -f "$COPIA.novo" "$COPIA" \
    && printf '%s\n' "$novo" > "$META.novo" && mv -f "$META.novo" "$META" && return 0
  rm -f "$COPIA.novo" "$META.novo"
  return 1
}
# O complemento desativado: fecha o Anki pelo caminho normal (nunca à força), liga e abre.
ligar_e_reiniciar() {
  sinalizar -TERM $(anki_pids) || { ninguem_recebeu; return; }
  esperar_o_anki_sair "$ESPERA" || { falhou nao_fechou; return; }
  guardar_o_meta || { falhou meta_nao_gravou; return; }
  abrir_o_anki || { falhou nao_abriu; return; }
  responder '{"situacao":"ligado"}'
}
# Sem resposta por ESPERA segundos: fecha à força e abre, mas só os pids que são donos da porta da Conexão (o Anki travado de verdade).
# Um Anki que a pessoa fechou no meio da espera continua fechado (fechou).
reiniciar_o_que_travou() {
  inicio=$(agora)
  while :; do
    anki_rodando || { fechou; return; }
    conexao_responde && { responder '{"situacao":"respondeu"}'; return; }
    [ $(( $(agora) - inicio )) -ge "$ESPERA" ] && break
    "$SLEEP" 2
  done
  anki_rodando || { fechou; return; }
  donos=$(donos_da_conexao) || { if anki_rodando; then falhou conexao_fora; else fechou; fi; return; }
  sinalizar -KILL $donos || { ninguem_recebeu; return; }
  esperar_o_anki_sair 10 || { falhou nao_fechou; return; }
  abrir_o_anki || { falhou nao_abriu; return; }
  responder '{"situacao":"reiniciado"}'
}
consertar() {
  anki_rodando || { responder '{"situacao":"fechado"}'; return; }
  [ -f "$COMPLEMENTO/__init__.py" ] || { responder '{"situacao":"sumiu"}'; return; }
  novo=$(estado_do_meta)
  case "$novo" in
    '') falhou meta_ilegivel ;;
    ligado) reiniciar_o_que_travou ;;
    *) ligar_e_reiniciar ;;
  esac
}
"""


def variaveis_do_ps1(conserto, pasta_do_abridor, texto_do_powershell):
    """As linhas `$nome = valor` do `.ps1`; `texto_do_powershell` põe um texto entre aspas simples."""
    return "\n".join([
        "$programaDoAnki = " + texto_do_powershell(conserto.executavel or ""),
        "$complemento = " + texto_do_powershell(conserto.complemento or ""),
        "$copia = " + texto_do_powershell(pasta_do_abridor + "\\" + NOME_DA_COPIA),
        "$url = " + texto_do_powershell(conserto.url),
        "$origem = " + texto_do_powershell(conserto.origem),
        "$espera = " + str(int(conserto.espera_s)),
        "$porta = " + str(int(conserto.porta)),
    ])
