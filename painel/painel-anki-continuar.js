'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, EnvioAcompanhado } = raiz;
  const { elemento } = Veio;

  function criar({ estado, ler, desenhar, marcarIndisponivel }) {
    const acompanhados = new Map();

    function acompanhado(jobId) {
      if (!acompanhados.has(jobId)) {
        const envio = EnvioAcompanhado.acompanhar({ jobId });
        envio.aoMudar(() => ler({ calado: true }));
        acompanhados.set(jobId, envio);
      }
      return acompanhados.get(jobId);
    }

    async function retomar(jobId, acao) {
      if (acao.getAttribute('aria-disabled') === 'true') return;
      const desfecho = await acompanhado(jobId).tentarDeNovo();
      estado.falhasAoRetomar.delete(jobId);
      if (desfecho.ok) {
        Veio.mostrarToastDeSucesso(textoDaVoz('ENV-14.sucesso'));
        return ler();
      }
      if (desfecho.apagado) estado.apagados.add(jobId);
      else estado.falhasAoRetomar.set(jobId, desfecho.falha);
      desenhar();
    }

    function montar(envio) {
      const acao = elemento('button', 'veio-botao veio-botao--contorno veio-botao--compacto', textoDaVoz('ENV-13.continuar'));
      acao.type = 'button';
      acao.dataset.foco = `continuar:${envio.jobId}`;
      acao.addEventListener('click', () => retomar(envio.jobId, acao));
      const dica = elemento('span', 'veio-dica', textoDaVoz('BRG-33.continuar'));
      dica.id = 'anki-continuar-indisponivel';
      dica.setAttribute('role', 'tooltip');
      marcarIndisponivel(acao, dica.id);
      return elemento('div', 'anki-acao', elemento('span', 'veio-com-dica', acao, dica));
    }

    return Object.freeze({ montar });
  }

  raiz.ContinuarEnvioNosCustos = Object.freeze({ criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
