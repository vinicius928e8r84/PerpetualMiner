const { test, expect } = require('../fixtures');
test('debug', async ({ page, context, paginas }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
  await page.goto(paginas.url('player.html'));
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();
  await page.keyboard.press('Alt+KeyS');
  await expect(page.locator('perpetualminer-overlay .pm-chip')).toBeVisible();
  await page.waitForTimeout(300);
  console.log(JSON.stringify(await page.evaluate(() => {
    const h = document.querySelector('perpetualminer-overlay');
    const r = x => { const b = x.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
    const l = h.shadowRoot.querySelector('.pm-linha');
    const t = document.createRange(); t.selectNodeContents(document.querySelector('#legenda'));
    return { host: r(h), linha: r(l), style: l.getAttribute('style'), texto: r(t), chip: r(h.shadowRoot.querySelector('.pm-chip')), marca: r(h.shadowRoot.querySelector('.pm-marca')), grifos: h.shadowRoot.querySelectorAll('.pm-grifo').length };
  })));
});
