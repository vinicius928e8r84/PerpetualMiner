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

  async function doServiceWorker(manifesto, lerTexto) {
    const servico = manifesto.background?.service_worker;
    if (!servico) return [];
    return [servico, ...scriptsImportados(await lerTexto(servico))];
  }

  function dosScriptsDeConteudo(manifesto) {
    return (manifesto.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]);
  }

  function dosIcones(manifesto) {
    return Object.values({ ...manifesto.icons, ...manifesto.action?.default_icon });
  }

  function dosRecursosAcessiveis(manifesto) {
    return (manifesto.web_accessible_resources ?? [])
      .flatMap(grupo => grupo.resources)
      .filter(recurso => !recurso.includes('*'));
  }

  function dasPaginas(manifesto, recursos) {
    const popup = manifesto.action?.default_popup;
    return [...(popup ? [popup] : []), ...recursos.filter(recurso => recurso.endsWith('.html'))];
  }

  function pastaDaPagina(pagina) {
    return pagina.includes('/') ? pagina.slice(0, pagina.lastIndexOf('/') + 1) : '';
  }

  async function doQueAsPaginasReferenciam(paginas, lerTexto) {
    const referencias = [];
    for (const pagina of paginas) {
      referencias.push(pagina, ...referenciasDoHtml(await lerTexto(pagina), pastaDaPagina(pagina)));
    }
    return referencias;
  }

  async function arquivosDaExtensao(lerTexto) {
    const manifesto = JSON.parse(await lerTexto('manifest.json'));
    const recursos = dosRecursosAcessiveis(manifesto);
    const arquivos = new Set([
      'manifest.json',
      ...await doServiceWorker(manifesto, lerTexto),
      ...dosScriptsDeConteudo(manifesto),
      ...dosIcones(manifesto),
      ...recursos,
      ...await doQueAsPaginasReferenciam(dasPaginas(manifesto, recursos), lerTexto),
    ]);
    return [...arquivos].sort();
  }

  raiz.arquivosDaExtensao = arquivosDaExtensao;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
