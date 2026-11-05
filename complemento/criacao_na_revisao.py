"""O gancho da revisão da frente Criação (#168): a página do Cartão (o script de `modelo_da_criacao.js`) manda a frase que a pessoa escreveu com
`pycmd`, e a Conexão a grava no campo “Frase escrita” da nota que está sendo revisada. Só existe no Anki do computador: no AnkiMobile e no AnkiDroid a
página não tem `pycmd`, e o “✓ usou a palavra” continua funcionando, porque quem o confere é o próprio Cartão. Não chama a IA nem a rede."""

from .baralhos import ColecaoIndisponivel
from .tipo_de_nota import MENSAGEM_DA_CRIACAO


def gancho(colecao):
    """A função do gancho `webview_did_receive_js_message` do Anki: `(tratada, mensagem, contexto) -> (tratada, retorno)`. `contexto` é o revisor
    (`reviewer.card` é o Cartão em revisão); mensagem de outro complemento ou de outra tela passa sem ser tocada."""
    def ao_receber(tratada, mensagem, contexto):
        if tratada[0] if isinstance(tratada, tuple) else tratada:
            return tratada
        if not isinstance(mensagem, str) or not mensagem.startswith(MENSAGEM_DA_CRIACAO):
            return tratada
        cartao = getattr(contexto, "card", None)
        if cartao is not None:
            try:
                colecao.gravar_frase_escrita(cartao.note().guid, mensagem[len(MENSAGEM_DA_CRIACAO):])
            except ColecaoIndisponivel:
                pass  # o Anki sincronizando ou noutro perfil: a frase fica só na página (o “✓ usou a palavra” não precisa do campo)
            except Exception:  # o gancho nunca derruba a revisão da pessoa
                pass
        return True, None

    return ao_receber


def ao_receber_mensagem(funcao):
    """Roda `funcao(tratada, mensagem, contexto)` para cada mensagem que uma página do Anki manda (`pycmd`): o gancho `webview_did_receive_js_message`."""
    from aqt import gui_hooks

    gui_hooks.webview_did_receive_js_message.append(funcao)


def ligar(colecao, ao_receber=ao_receber_mensagem):
    """Liga o gancho ao Anki. Sem ele (um Anki que o mudou), a frente Criação só não grava a frase no campo; o “✓ usou a palavra” não depende dele."""
    try:
        ao_receber(gancho(colecao))
    except Exception:
        pass
