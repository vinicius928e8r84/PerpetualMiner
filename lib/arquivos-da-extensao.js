'use strict';

(function (raiz) {
  function referenciasDoHtml(html, pasta) {
    const caminhos = [];
    for (const [, valor] of html.matchAll(/\b(?:src|href)="([^"#?]+)"/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(valor)) continue;
      caminhos.push(new URL(valor, `http://x/${pasta}`).pathname.slice(1));
    }
    return caminhos;
  }

  function scriptsImportados(codigo) {
    const arquivos = [];
    for (const [, lista] of codigo.matchAll(/importScripts\(([^)]*)\)/g)) {
      for (const [, arquivo] of lista.matchAll(/'([^']+)'/g)) arquivos.push(arquivo);
    }
    return arquivos;
  }

  async function arquivosDaExtensao(lerTexto) {
    const manifesto = JSON.parse(await lerTexto('manifest.json'));
    const arquivos = new Set(['manifest.json']);
    const paginas = [];

    const servico = manifesto.background?.service_worker;
    if (servico) {
      arquivos.add(servico);
      for (const arquivo of scriptsImportados(await lerTexto(servico))) arquivos.add(arquivo);
    }
    for (const script of manifesto.content_scripts ?? []) {
      for (const arquivo of [...(script.js ?? []), ...(script.css ?? [])]) arquivos.add(arquivo);
    }
    for (const icone of Object.values({ ...manifesto.icons, ...manifesto.action?.default_icon })) arquivos.add(icone);
    if (manifesto.action?.default_popup) paginas.push(manifesto.action.default_popup);
    for (const grupo of manifesto.web_accessible_resources ?? []) {
      for (const recurso of grupo.resources) {
        if (recurso.includes('*')) continue;
        arquivos.add(recurso);
        if (recurso.endsWith('.html')) paginas.push(recurso);
      }
    }
    for (const pagina of paginas) {
      arquivos.add(pagina);
      const pasta = pagina.includes('/') ? pagina.slice(0, pagina.lastIndexOf('/') + 1) : '';
      for (const arquivo of referenciasDoHtml(await lerTexto(pagina), pasta)) arquivos.add(arquivo);
    }
    return [...arquivos].sort();
  }

  raiz.arquivosDaExtensao = arquivosDaExtensao;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
