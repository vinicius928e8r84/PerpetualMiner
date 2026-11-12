'use strict';

// Os pedidos que a extensão faz à Conexão com o Anki, um de cada, para `node test_contrato_fechado.js` pedir ao contrato um exemplo de cada
// (regra 13 de CODING_STANDARDS.md; complemento/contrato/LEIA-ME.md). Apoio de teste: não vai no pacote da extensão. Carregado depois de
// lib/pedido-ao-anki.js, com a mesma `PerpetualMiner`.

(function (raiz) {
  const { saude, comecarOPareamento, concluirOPareamento, conferirOPareamento, baralhos, estatisticas, vocabulario, previaDoCartao, tiposDeNota, previaDaNota, abrirNoAnki, estadoDoItemDeLogin, abrirComOComputador, perfisDoAnki, escolherOPerfil, abrirOPerfilMarcado, chaveDaOpenAI, estadoDaIA, apagarChaveDaOpenAI, sincronizarChaveDaOpenAI, vincularLegadoDaOpenAI, estadoDoChatGPT, entrarComOChatGPT, sairDoChatGPT, estadoDoModelo, escolherOModelo, trocarAFrente, criarEnvio, ouvirAVoz, falarAFrase, listarEnvios, verEnvio, tentarEnvioDeNovo, usarAChaveNoEnvio, pacoteDeDiagnostico, apagarFrasesDosEnvios, custosDosEnvios, tetoDoMes, definirOTeto, atualizarAConexao, reiniciarOAnki, LEITURAS_DOS_NUMEROS } = raiz.PedidoAoAnki;
  // O tipo de nota que a pessoa já tem, mapeado (#165): o que o contrato mostra no pedido.
  const TIPO_PROPRIO_DE_EXEMPLO = Object.freeze({ nome: 'Meu Inglês', mapa: Object.freeze({ frase: 'Pergunta', audio_da_frase: 'Som', resposta: 'Resposta' }) });

  /**
   * Todos os pedidos que a extensão pode fazer, para os Baralhos `baralhosPedidos` (um por idioma):
   * `[{ nome, pedido }]`; `chaveDeExemplo` é a chave que o pedido da IA leva e `envioDeExemplo` o corpo de um Envio
   * (o `jobId` dele é o que os outros pedidos do Envio levam). O teste do contrato confere um exemplo de cada.
   */
  function variantes(baralhosPedidos, chaveDeExemplo, envioDeExemplo) {
    return [
      { nome: 'saúde', pedido: saude() },
      { nome: 'pareamento: começar', pedido: comecarOPareamento() },
      { nome: 'pareamento: concluir', pedido: concluirOPareamento('K7M-4PX', 'cliente-de-exemplo', 'Chrome') },
      { nome: 'pareamento: conferir', pedido: conferirOPareamento('cliente-de-exemplo', 'desafio-de-exemplo') },
      { nome: 'Baralhos', pedido: baralhos() },
      ...LEITURAS_DOS_NUMEROS.map(leitura => ({
        nome: `números (${leitura.abrirOAnki ? 'de novo, abrindo o Anki' : leitura.deNovo ? 'de novo' : 'primeira leitura'})`,
        pedido: estatisticas(baralhosPedidos, leitura),
      })),
      ...baralhosPedidos.map(({ deckName, lang }) => ({ nome: `vocabulário (${lang})`, pedido: vocabulario(deckName, lang) })),
      { nome: 'prévia do Cartão: Iniciante do inglês', pedido: previaDoCartao('en', 'iniciante') },
      { nome: 'prévia do Cartão: Intermediário do inglês', pedido: previaDoCartao('en', 'intermediario') },
      { nome: 'prévia do Cartão: Avançado do inglês', pedido: previaDoCartao('en', 'avancado') },
      { nome: 'prévia do Cartão: Iniciante do russo', pedido: previaDoCartao('ru', 'iniciante') },
      { nome: 'prévia do Cartão: Intermediário do russo', pedido: previaDoCartao('ru', 'intermediario') },
      { nome: 'prévia do Cartão: Avançado do russo', pedido: previaDoCartao('ru', 'avancado') },
      { nome: 'prévia do Cartão: no tipo de nota que a pessoa já tem', pedido: previaDoCartao('en', 'iniciante', TIPO_PROPRIO_DE_EXEMPLO) },
      { nome: 'tipos de nota da pessoa', pedido: tiposDeNota() },
      { nome: 'prévia do Cartão: a nota gravada', pedido: previaDaNota('guid-de-exemplo') },
      { nome: 'Abrir no Anki: a nota gravada', pedido: abrirNoAnki('guid-de-exemplo') },
      { nome: 'item de login: estado', pedido: estadoDoItemDeLogin() },
      { nome: 'item de login: ligar', pedido: abrirComOComputador(true) },
      { nome: 'item de login: desligar', pedido: abrirComOComputador(false) },
      { nome: 'perfil: a lista', pedido: perfisDoAnki() },
      { nome: 'perfil: escolher outro', pedido: escolherOPerfil('Beto') },
      { nome: 'perfil: abrir o marcado', pedido: abrirOPerfilMarcado() },
      { nome: 'IA: entregar a chave', pedido: chaveDaOpenAI(chaveDeExemplo) },
      { nome: 'IA: estado', pedido: estadoDaIA() },
      { nome: 'IA: apagar a chave', pedido: apagarChaveDaOpenAI() },
      { nome: 'IA: sincronizar a chave', pedido: sincronizarChaveDaOpenAI('uid-teste', 'token-ficticio') },
      { nome: 'IA: migrar a remoção antiga', pedido: vincularLegadoDaOpenAI('', 'uid-teste', 100) },
      { nome: 'ChatGPT: estado', pedido: estadoDoChatGPT() },
      { nome: 'ChatGPT: entrar', pedido: entrarComOChatGPT() },
      { nome: 'ChatGPT: sair', pedido: sairDoChatGPT() },
      { nome: 'Modelo dos cartões: estado', pedido: estadoDoModelo() },
      { nome: 'Modelo dos cartões: escolher o Automático', pedido: escolherOModelo('automatico') },
      { nome: 'Frente do Cartão: trocar', pedido: trocarAFrente('en', 'lacuna') },
      { nome: 'Envio: criar', pedido: criarEnvio(envioDeExemplo) },
      { nome: 'Envio: criar com a Frase de teste', pedido: criarEnvio({ ...envioDeExemplo, teste: true }) },
      { nome: 'Envio: criar no Intermediário', pedido: criarEnvio({ ...envioDeExemplo, nivel: 'intermediario' }) },
      { nome: 'Envio: criar no Avançado', pedido: criarEnvio({ ...envioDeExemplo, nivel: 'avancado' }) },
      { nome: 'Envio: criar no tipo de nota que a pessoa já tem', pedido: criarEnvio({ ...envioDeExemplo, tipoProprio: TIPO_PROPRIO_DE_EXEMPLO }) },
      { nome: 'Envio: criar sem voz de reserva', pedido: criarEnvio({ ...envioDeExemplo, tts: { ...envioDeExemplo.tts, reserva: [] } }) },
      { nome: 'Ouvir: o sotaque do Google', pedido: ouvirAVoz('en', 'google', 'co.uk') },
      { nome: 'Ouvir: a voz da OpenAI', pedido: ouvirAVoz('en', 'openai') },
      { nome: 'Falar a frase do quiz', pedido: falarAFrase('en', 'co.uk', 'Could you tell me where the nearest pharmacy is?') },
      { nome: 'Envio: listar', pedido: listarEnvios() },
      { nome: 'Envio: ver', pedido: verEnvio(envioDeExemplo.jobId) },
      { nome: 'Envio: tentar de novo', pedido: tentarEnvioDeNovo(envioDeExemplo.jobId) },
      { nome: 'Envio: usar a minha chave', pedido: usarAChaveNoEnvio(envioDeExemplo.jobId) },
      { nome: 'Envio: pacote de diagnóstico', pedido: pacoteDeDiagnostico(envioDeExemplo.jobId) },
      { nome: 'Envio: apagar as Frases', pedido: apagarFrasesDosEnvios() },
      { nome: 'Custos: um período', pedido: custosDosEnvios({ de: '2026-10-12', ate: '2026-10-12' }) },
      { nome: 'Custos: todo o período', pedido: custosDosEnvios() },
      { nome: 'Teto do mês: ler', pedido: tetoDoMes() },
      { nome: 'Teto do mês: definir', pedido: definirOTeto(12) },
      { nome: 'Atualizar a Conexão agora', pedido: atualizarAConexao() },
      { nome: 'Reiniciar o Anki', pedido: reiniciarOAnki() },
    ];
  }

  raiz.VariantesDoPedidoAoAnki = Object.freeze({ variantes });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
