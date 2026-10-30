"""O áudio do Cartão dentro do Envio (#143): o que o Cartão fala e com que sotaque (o motor), o pedido à voz (`voz.py`) e o
nome do arquivo que a nota cita. Quem usa é `envio.Trabalho`, que herda daqui; nada do áudio fica na pasta de dados: ele
vai do Google à coleção do Anki na mesma volta, e o nome vem do `guid` do Cartão (um por Cartão, igual a cada volta)."""

from . import voz

# As Frases foram apagadas (Apagar tudo) antes de este Cartão ter o texto: não há de onde gerá-lo.
FRASE_APAGADA = "phrase_wiped"


def aplicar_os_sotaques(config, lang, tts):
    """Os sotaques dos Ajustes de envio valem sobre o perfil do idioma, como na Conexão de hoje (`bridge/envio.py`)."""
    perfis = config.setdefault("tts", {}).setdefault("profiles", {}).setdefault(lang, {})
    for campo, chave in (("word", "wordTld"), ("phrase", "phraseTld")):
        if voz.sotaque_valido(tts.get(chave)):
            perfil = perfis.setdefault(campo, {})
            perfil["tld"] = tts[chave]
            perfil.setdefault("lang", lang)


class AudioDoCartao:
    """O que o `Trabalho` faz para o Cartão ganhar voz; usa `fila`, `motor`, `logger`, `voz_base`, `esperas_da_openai`, `_dormir` e `_etapa` dele."""

    def _a_voz(self, texto, lang, sotaque):
        """O áudio de um texto, pedido de novo (nas esperas da OpenAI) enquanto a voz falha por um motivo passageiro."""
        for espera in (None,) + self.esperas_da_openai:
            if espera is not None:
                self._dormir(espera)
            try:
                return voz.pedir_o_audio(self.voz_base, texto, lang, sotaque)
            except voz.ErroDaVoz as erro:
                if erro.codigo not in voz.PASSAGEIROS:
                    raise
                ultimo = erro
        raise ultimo

    def _o_audio(self, job_id, pedido, config, cartao_id, guid, conteudo):
        """O áudio da Palavra e o da Frase do Cartão: ({nome: bytes}, nome do da Frase, nome do da Palavra, a Palavra); levanta `ErroDaVoz`."""
        phrase_id, posicao = cartao_id.rsplit("-", 1)
        linha = self.fila.linha_do_cartao(job_id, int(phrase_id))
        if linha is None:
            raise voz.ErroDaVoz(FRASE_APAGADA)
        entrada = self.motor.parser.parse_line(config["estilo"]["entrada"], linha)
        trabalho = self.motor.parser.get_card_jobs(entrada)[int(posicao)]
        palavra, frase = self.motor.generate_audio.voices(trabalho, conteudo, config)
        self._etapa(job_id, "generate_audio")
        da_palavra, da_frase = guid + "_word.mp3", guid + "_phrase.mp3"
        arquivos = {}
        for nome, (texto, lang, sotaque) in ((da_palavra, palavra), (da_frase, frase)):
            try:
                arquivos[nome] = self._a_voz(texto, lang, sotaque)
            except voz.ErroDaVoz as erro:
                self.logger.warning("Envio %s: o áudio do Cartão %s não veio (%s)", job_id, cartao_id, erro.codigo)
                raise
        return arquivos, da_frase, da_palavra, trabalho.keyword
