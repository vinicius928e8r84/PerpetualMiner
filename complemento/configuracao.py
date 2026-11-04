"""O que a Conexão com o Anki sabe de si, num lugar só."""

VERSAO = "0.3.8"
NOME_DO_LOGGER = "perpetualminer"

ENDERECO = "127.0.0.1"
PORTA = 8766

# O ID da extensão é fixo (a "key" do manifest.json da extensão o prende; ver
# e2e/tests/id-fixo.spec.js). É a única origem que o complemento atende, porque
# é ele quem gasta a chave da OpenAI.
ID_DA_EXTENSAO = "ohpoogiccjmdgilgegholdidgfhjkadf"
ORIGENS_ACEITAS = ("chrome-extension://" + ID_DA_EXTENSAO,)

# Onde a Conexão confere uma chave da OpenAI. Só o código muda isto (a Conexão recebe o endereço de
# `inicio.iniciar`): nada no ambiente, na configuração ou num pedido pode desviar a chave para outro lugar.
OPENAI_BASE = "https://api.openai.com"

# De onde vêm as fotos reais do Cartão (a busca; o arquivo de cada foto vem do endereço que a busca dá). Só o código muda isto.
OPENVERSE_BASE = "https://api.openverse.org"

# De onde vem a voz do Cartão: `{tld}` é o sotaque dos Ajustes de envio (`com`, `co.uk`, `ru`…), como o gTTS da Conexão de
# hoje monta o endereço. Só o código muda isto, como o `OPENAI_BASE`.
VOZ_BASE = "https://translate.google.{tld}"
