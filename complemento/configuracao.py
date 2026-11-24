"""O que a Conexão com o Anki sabe de si, num lugar só."""

VERSAO = "0.4.40"
ATUALIZACAO_AUTOMATICA = True
NOME_DO_LOGGER = "perpetualminer"

ENDERECO = "127.0.0.1"
PORTA = 8766

ID_DA_EXTENSAO = "ohpoogiccjmdgilgegholdidgfhjkadf"
ORIGENS_ACEITAS = ("chrome-extension://" + ID_DA_EXTENSAO,)

OPENAI_BASE = "https://api.openai.com"

OPENVERSE_BASE = "https://api.openverse.org"

VOZ_BASE = "https://translate.google.{tld}"

FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents"
