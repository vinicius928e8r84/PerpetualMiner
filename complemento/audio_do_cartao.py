from . import custos, voz, voz_da_openai

RESERVA_PADRAO = ["openai"]

FRASE_APAGADA = "phrase_wiped"


def aplicar_os_sotaques(config, lang, tts):
    perfis = config.setdefault("tts", {}).setdefault("profiles", {}).setdefault(lang, {})
    for campo, chave in (("word", "wordTld"), ("phrase", "phraseTld")):
        if voz.sotaque_valido(tts.get(chave)):
            perfil = perfis.setdefault(campo, {})
            perfil["tld"] = tts[chave]
            perfil.setdefault("lang", lang)


class VozDoGoogle:
    def __init__(self, base, esperas):
        self.base, self.esperas = base, esperas

    def audio(self, texto, lang, sotaque):
        for _ in self.esperas.tentativas():
            try:
                return voz.pedir_o_audio(self.base, texto, lang, sotaque)
            except voz.ErroDaVoz as erro:
                if erro.codigo not in voz.PASSAGEIROS:
                    raise
                ultimo = erro
        raise ultimo


class VozDeReserva:
    def __init__(self, base, tranca, logger):
        self.base, self.tranca, self.logger = base, tranca, logger

    def audio(self, nome, texto, cartao, ia):
        if nome != "openai":
            return None
        chave = ia.para_a_fala()
        if not chave:
            return None
        try:
            audio = voz_da_openai.pedir_o_audio(self.base, chave, texto)
        except voz.ErroDaVoz as erro:
            self.logger.warning("Envio %s: a voz de reserva (%s) do Cartão %s falhou (%s)", cartao.job_id, nome, cartao.id, erro.codigo)
            return None
        with self.tranca:
            custos.anotar_a_voz(cartao.config["paths"]["log_dir"], voz_da_openai.MODELO, len(texto), voz_da_openai.DOLARES_POR_MIL_LETRAS)
        self.logger.info("Envio %s: o áudio do Cartão %s veio da voz de reserva (%s)", cartao.job_id, cartao.id, nome)
        return audio


class AudioDoCartao:
    def __init__(self, motor, logger, voz_do_google, voz_de_reserva):
        self.motor, self.logger, self.voz_do_google, self.voz_de_reserva = motor, logger, voz_do_google, voz_de_reserva

    def _a_voz(self, fala, reserva, cartao, ia):
        texto, lang, sotaque = fala
        try:
            return self.voz_do_google.audio(texto, lang, sotaque)
        except voz.ErroDaVoz:
            for nome in reserva:
                audio = self.voz_de_reserva.audio(nome, texto, cartao, ia)
                if audio:
                    return audio
            raise

    def vozes(self, cartao, texto, ia, avisar):
        config = cartao.config
        entrada = self.motor.parser.parse_line(config["estilo"]["entrada"], cartao.linha)
        trabalho = self.motor.parser.get_card_jobs(entrada)[int(cartao.id.rsplit("-", 1)[1])]
        palavra, frase = self.motor.generate_audio.voices(trabalho, texto, config)
        reserva = cartao.pedido["tts"].get("reserva", RESERVA_PADRAO)
        avisar("generate_audio")
        da_palavra, da_frase = cartao.guid + "_word.mp3", cartao.guid + "_phrase.mp3"
        arquivos = {}
        for nome, fala in ((da_palavra, palavra), (da_frase, frase)):
            try:
                arquivos[nome] = self._a_voz(fala, reserva, cartao, ia)
            except voz.ErroDaVoz as erro:
                self.logger.warning("Envio %s: o áudio do Cartão %s não veio (%s)", cartao.job_id, cartao.id, erro.codigo)
                raise
        return arquivos, da_frase, da_palavra, self.motor.generate_audio.word_from_card_text(texto) or trabalho.keyword
