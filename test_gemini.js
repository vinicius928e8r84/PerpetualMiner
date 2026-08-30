'use strict';

const API_KEY = 'AIzaSyA6eA-qtMadDT-hE5E0TI0Mvagw4qVXXWE';

async function listarModelos() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}&pageSize=200`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    console.error('Erro:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const modelos = data.models || [];
  console.log(`\nTotal de modelos disponíveis: ${modelos.length}\n`);

  console.log('=== TODOS OS MODELOS ===');
  modelos.forEach(m => console.log(m.name));

  console.log('\n=== MODELOS GEMINI (filtrado) ===');
  modelos
    .filter(m => m.name.toLowerCase().includes('gemini'))
    .forEach(m => {
      const suporta = (m.supportedGenerationMethods || []).join(', ');
      console.log(`${m.name}  |  ${m.displayName}  |  métodos: ${suporta}`);
    });

  console.log('\n=== MODELOS COM generateContent ===');
  modelos
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .forEach(m => console.log(m.name));
}

listarModelos().catch(console.error);
