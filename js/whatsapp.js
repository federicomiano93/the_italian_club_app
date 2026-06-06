const MARKET_CLIENTS = [
  {
    name: 'Bone&Block',
    products: [
      ['om-ciabatta',   'Ciabatta'],
      ['om-burgerbuns', 'Seeded burger buns'],
      ['om-subrolls',   'Brioche rolls'],
    ],
  },
  {
    name: 'Club Fish',
    products: [
      ['om-trayfocaccia', 'Tray focaccia'],
      ['om-bun',          'Buns'],
      ['om-rolls',        'Rolls'],
      ['om-loaves',       'Loaf of bread'],
    ],
  },
  {
    name: 'Cahita',
    products: [
      ['om-panini', 'Panini'],
    ],
  },
];

export function shareMarketOrder() {
  document.querySelectorAll('.order-qty-input').forEach(input => { input.value = '0'; });
  document.getElementById('loaf-modal').classList.add('visible');
}

export function closeLoafModal() {
  document.getElementById('loaf-modal').classList.remove('visible');
}

export function sendWithLoaves() {
  closeLoafModal();

  const sections = MARKET_CLIENTS
    .map(client => {
      const lines = client.products
        .map(([id, label]) => ({ label, val: +document.getElementById(id).value || 0 }))
        .filter(p => p.val > 0)
        .map(p => `- ${p.label}: ${p.val}`);
      return lines.length ? `*${client.name}*\n` + lines.join('\n') : null;
    })
    .filter(Boolean);

  if (!sections.length) { alert('No orders to share'); return; }

  const text = '📋 *Duke Street Market order*\n\n' + sections.join('\n\n');
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
