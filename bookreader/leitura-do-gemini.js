'use strict';

(function (raiz) {
  const { textoDaVoz } = raiz;

  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

  const SENTINEL_VAZIO = 'NENHUM_TRECHO';

  const PROMPT = `Analise a foto desta página de livro ou texto impresso.

TAREFA: encontre e transcreva APENAS os trechos que foram marcados manualmente pelo leitor.

Tipos de marcação a identificar:
1. Texto entre barras oblíquas → /texto marcado aqui/
2. Texto entre underscores → _texto marcado aqui_
3. Texto com sublinhado físico desenhado à mão abaixo das palavras
4. Texto circulado, entre colchetes [] ou com marcação lateral

REGRAS — siga à risca:
- Retorne APENAS o texto limpo de cada trecho, sem os símbolos de marcação
- Um trecho por linha, sem numeração, sem bullet points, sem explicações
- Preserve a frase exatamente como está, incluindo pontuação e capitalização
- Se não houver absolutamente nenhum trecho marcado, responda exatamente: ${SENTINEL_VAZIO}

Exemplo de saída correta (para uma página com 3 trechos marcados):
The quick brown fox jumps over the lazy dog
All that glitters is not gold
To be or not to be, that is the question`;

  const TIPO_POR_EXTENSAO = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
  };
  const TIPOS_ACEITOS = new Set(Object.values(TIPO_POR_EXTENSAO));

  const STATUS_DA_CHAVE_RECUSADA = new Set([401, 403]);

  const ehChaveRecusada = erro => STATUS_DA_CHAVE_RECUSADA.has(erro.status) || /api[ _]?key/i.test(erro.message);
  const ehLimite = erro => erro.status === 429 || erro.estadoDaApi === 'RESOURCE_EXHAUSTED';
  const ehSemRede = erro => erro.semRede;
  const qualquerOutra = () => true;

  const CAUSAS_EM_ORDEM = [
    { aplica: ehSemRede, id: 'FOT-11.causaRede' },
    { aplica: ehLimite, id: 'FOT-11.causaLimite' },
    { aplica: ehChaveRecusada, id: 'FOT-11.causaChave' },
    { aplica: qualquerOutra, id: 'GLB-01' },
  ];

  function tipoDaFoto(arquivo) {
    if (TIPOS_ACEITOS.has(arquivo.type)) return arquivo.type;
    const extensao = arquivo.name.split('.').pop().toLowerCase();
    return TIPO_POR_EXTENSAO[extensao] || null;
  }

  function pedidoDaFoto(chave, foto, sinal) {
    return {
      method: 'POST',
      signal: sinal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: foto.tipo, data: foto.base64 } },
          { text: PROMPT },
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    };
  }

  async function enviarAoGemini(pedido) {
    try {
      return await fetch(GEMINI_URL, pedido);
    } catch (causa) {
      const erro = new Error(causa.message);
      erro.semRede = true;
      throw erro;
    }
  }

  async function recusaDaApi(resposta) {
    const corpo = await resposta.json().catch(() => ({}));
    const falha = corpo?.error || {};
    const erro = new Error(falha.message || `HTTP ${resposta.status}`);
    erro.status = resposta.status;
    erro.estadoDaApi = falha.status;
    return erro;
  }

  const primeiraParteDaResposta = dados => dados?.candidates?.[0]?.content?.parts?.[0];
  const textoDaResposta = dados => primeiraParteDaResposta(dados)?.text?.trim() || '';
  const ehTrecho = linha => linha.length > 0 && !linha.startsWith(SENTINEL_VAZIO);

  function trechosDoTexto(texto) {
    return texto
      .split('\n')
      .map(linha => linha.trim())
      .filter(ehTrecho);
  }

  async function lerAsMarcacoes(chave, foto, sinal) {
    const resposta = await enviarAoGemini(pedidoDaFoto(chave, foto, sinal));
    if (!resposta.ok) throw await recusaDaApi(resposta);
    const dados = await resposta.json();
    const texto = textoDaResposta(dados);
    if (!texto) throw new Error(JSON.stringify(dados));
    return trechosDoTexto(texto);
  }

  function classificarFalha(erro) {
    const { id } = CAUSAS_EM_ORDEM.find(({ aplica }) => aplica(erro));
    return { causa: textoDaVoz(id), chaveRecusada: ehChaveRecusada(erro) };
  }

  raiz.LeituraDoGemini = Object.freeze({ tipoDaFoto, lerAsMarcacoes, classificarFalha });
})(globalThis.PerpetualMiner);
