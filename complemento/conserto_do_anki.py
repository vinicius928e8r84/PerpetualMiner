import shlex
from collections import namedtuple

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


class ConexaoEsperada(namedtuple("ConexaoEsperada", "porta espera_s", defaults=(PORTA, ESPERA_PADRAO_S))):
    @property
    def url(self):
        return "http://%s:%d/anki/responde" % (ENDERECO, self.porta)

    @property
    def origem(self):
        return ORIGENS_ACEITAS[0]


class Conserto:
    def __init__(self, *, executavel=None, complemento=None, conexao=ConexaoEsperada(), programas=None):
        self.executavel = executavel
        self.complemento = complemento
        self.conexao = conexao
        self.programas = dict(PROGRAMAS_DO_MAC, **(programas or {}))


def variaveis_do_mac(conserto, pasta_do_abridor):
    valores = [
        ("EXECUTAVEL", conserto.executavel or ""),
        ("COMPLEMENTO", conserto.complemento or ""),
        ("COPIA", pasta_do_abridor + "/" + NOME_DA_COPIA),
        ("URL", conserto.conexao.url),
        ("ORIGEM", conserto.conexao.origem),
        ("ESPERA", str(int(conserto.conexao.espera_s))),
        ("PORTA", str(int(conserto.conexao.porta))),
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
    return "\n".join([
        "$programaDoAnki = " + texto_do_powershell(conserto.executavel or ""),
        "$complemento = " + texto_do_powershell(conserto.complemento or ""),
        "$copia = " + texto_do_powershell(pasta_do_abridor + "\\" + NOME_DA_COPIA),
        "$url = " + texto_do_powershell(conserto.conexao.url),
        "$origem = " + texto_do_powershell(conserto.conexao.origem),
        "$espera = " + str(int(conserto.conexao.espera_s)),
        "$porta = " + str(int(conserto.conexao.porta)),
    ])
