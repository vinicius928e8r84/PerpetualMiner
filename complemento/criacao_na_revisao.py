from .baralhos import ColecaoIndisponivel
from .tipo_de_nota import MENSAGEM_DA_CRIACAO


def gancho(colecao):
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
                pass
            except Exception:
                pass
        return True, None

    return ao_receber


def ao_receber_mensagem(funcao):
    from aqt import gui_hooks

    gui_hooks.webview_did_receive_js_message.append(funcao)


def ligar(colecao, ao_receber=ao_receber_mensagem):
    try:
        ao_receber(gancho(colecao))
    except Exception:
        pass
