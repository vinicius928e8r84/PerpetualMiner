'use strict';

// Os sons do quiz de nível (#171): feitos na hora com o WebAudio, sem arquivo. Nada toca antes do primeiro toque: o `AudioContext` só nasce quando um som é pedido, e
// os sons só são pedidos por quem responde ao clique da pessoa. Errar não tem som (sem buzina); “Não sei” tem um tom neutro e baixo. O botão de som liga e desliga tudo.

(function (raiz) {
  /** Um som por sessão do quiz. `ligado` é só da tela aberta: nada é guardado. */
  function criar() {
    let contexto = null;
    let ligado = true;

    function ouvir() {
      if (!ligado) return null;
      const Contexto = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Contexto) return null;
      contexto ||= new Contexto();
      if (contexto.state === 'suspended') contexto.resume?.();
      return contexto;
    }

    /** Uma nota de `hz` que começa `depois` segundos adiante e dura `duracao`, com ataque curto e queda suave para não estalar. */
    function nota(hz, { depois = 0, duracao = 0.18, volume = 0.16, tipo = 'sine' } = {}) {
      const c = ouvir();
      if (!c) return;
      const inicio = c.currentTime + depois;
      const oscilador = c.createOscillator();
      const ganho = c.createGain();
      oscilador.type = tipo;
      oscilador.frequency.value = hz;
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.015);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
      oscilador.connect(ganho);
      ganho.connect(c.destination);
      oscilador.start(inicio);
      oscilador.stop(inicio + duracao + 0.02);
    }

    return {
      ligado: () => ligado,
      alternar() { ligado = !ligado; return ligado; },
      /** O acerto: a nota da escala e a oitava dela logo depois, curtas. */
      acerto(hz) { nota(hz, { duracao: 0.14 }); nota(hz * 2, { depois: 0.07, duracao: 0.18, volume: 0.09 }); },
      /** “Não sei”: um tom baixo e neutro, sem subir nem descer. */
      naoSei() { nota(330, { duracao: 0.16, volume: 0.08, tipo: 'triangle' }); },
      /** O rufar da Revelação: `batidas` toques que aceleram em `duracao` segundos. */
      rufar(batidas, duracao) {
        for (let i = 0; i < batidas; i++) nota(160 + i * 6, { depois: (i / batidas) ** 0.8 * duracao, duracao: 0.07, volume: 0.1, tipo: 'triangle' });
      },
      /** O acorde de dó maior que fecha a Revelação, `depois` segundos adiante. */
      acorde(depois) { [523.25, 659.25, 783.99, 1046.5].forEach(hz => nota(hz, { depois, duracao: 0.9, volume: 0.1 })); },
    };
  }

  raiz.SomDoQuiz = Object.freeze({ criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
