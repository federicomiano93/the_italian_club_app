const MARKET_CLIENTS = [
  {
    name: 'Bone&Block',
    products: [
      ['f-ciabatta',   'Ciabatta'],
      ['b-burgerbuns', 'Seeded burger buns'],
      ['b-subrolls',   'Brioche rolls'],
    ],
  },
  {
    name: 'Club Fish',
    products: [
      ['f-trayfocaccia', 'Tray focaccia'],
      ['b-bun',          'Buns'],
      ['b-rolls',        'Rolls'],
    ],
  },
  {
    name: 'Cahita',
    products: [
      ['f-panini', 'Panini'],
    ],
  },
];

export function shareMarketOrder() {
  document.getElementById('loaf-qty-input').value = '0';
  document.getElementById('loaf-modal').classList.add('visible');
  setTimeout(() => { document.getElementById('loaf-qty-input').select(); }, 100);
}

export function closeLoafModal() {
  document.getElementById('loaf-modal').classList.remove('visible');
}

export function sendWithLoaves() {
  const loaves = +document.getElementById('loaf-qty-input').value || 0;
  closeLoafModal();

  const sections = MARKET_CLIENTS
    .map(client => {
      const lines = client.products
        .map(([id, label]) => ({ label, val: +document.getElementById(id).value || 0 }))
        .filter(p => p.val > 0)
        .map(p => `- ${p.label}: ${p.val}`);
      if (client.name === 'Club Fish' && loaves > 0) lines.push(`- Loaf of bread: ${loaves}`);
      return lines.length ? `*${client.name}*\n` + lines.join('\n') : null;
    })
    .filter(Boolean);

  if (!sections.length) { alert('No orders to share'); return; }

  const text = '📋 *Duke Street Market order*\n\n' + sections.join('\n\n');
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
