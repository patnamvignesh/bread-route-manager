const routeSelect = document.querySelector('#routeSelect');
const board = document.querySelector('#board');
const summary = document.querySelector('#summary');
const search = document.querySelector('#search');
const apiStatus = document.querySelector('#apiStatus');
const shortageDialog = document.querySelector('#shortageDialog');
let currentBoard = null;

async function api(path, options) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadRoutes() {
  try {
    await api('/api/health');
    apiStatus.textContent = 'Online';
    apiStatus.classList.add('online');
    const routes = await api('/api/routes');
    routeSelect.innerHTML = routes.map(route => `<option value="${route.id}">Route ${route.routeCode}</option>`).join('');
    if (routes.length) await loadBoard(routes[0].id);
  } catch (error) {
    apiStatus.textContent = 'Offline';
    board.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

async function loadBoard(routeId) {
  currentBoard = await api(`/api/routes/${routeId}/packing-board`);
  render();
}

function render() {
  if (!currentBoard) return;
  const term = search.value.trim().toLowerCase();
  const products = currentBoard.products.filter(product =>
    product.productName.toLowerCase().includes(term) ||
    product.customers.some(customer => customer.customerName.toLowerCase().includes(term))
  );

  const totals = currentBoard.products.reduce((acc, p) => ({
    required: acc.required + p.required,
    packed: acc.packed + p.packed,
    short: acc.short + p.short
  }), { required: 0, packed: 0, short: 0 });

  summary.innerHTML = [
    ['Required', totals.required], ['Packed', totals.packed], ['Short', totals.short],
    ['Progress', `${totals.required ? Math.round(((totals.packed + totals.short) / totals.required) * 100) : 0}%`]
  ].map(([label, value]) => `<div class="metric card"><span>${label}</span><strong>${value}</strong></div>`).join('');

  board.innerHTML = '';
  for (const product of products) {
    const node = document.querySelector('#productTemplate').content.cloneNode(true);
    node.querySelector('h2').textContent = product.productName;
    node.querySelector('.totals').textContent = `${product.packed}/${product.required} packed · ${product.short} short`;
    const customers = node.querySelector('.customers');
    customers.innerHTML = product.customers.map(customer => `
      <div class="customer-row ${customer.status.toLowerCase()}">
        <div><strong>${customer.customerName}</strong><span>Needs ${customer.quantity}</span></div>
        <div class="actions">
          <button data-action="done" data-id="${customer.itemId}" data-qty="${customer.quantity}">Done</button>
          <button class="secondary" data-action="short" data-id="${customer.itemId}" data-qty="${customer.quantity}">Short</button>
        </div>
      </div>`).join('');
    board.appendChild(node);
  }
}

board.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const quantity = Number(button.dataset.qty);
  try {
    if (button.dataset.action === 'done') {
      await api(`/api/order-items/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'DONE', packedQty: quantity, shortQty: 0 }) });
    } else {
      const shortQty = Number(prompt(`How many are short? Maximum ${quantity}`, '1'));
      if (!Number.isInteger(shortQty) || shortQty < 0 || shortQty > quantity) return;
      const notes = prompt('Optional shortage note', '') || null;
      await api(`/api/order-items/${id}`, { method: 'PATCH', body: JSON.stringify({ status: shortQty ? 'SHORT' : 'DONE', packedQty: quantity - shortQty, shortQty, notes }) });
    }
    await loadBoard(routeSelect.value);
  } catch (error) {
    alert(error.message);
  }
});

routeSelect.addEventListener('change', () => loadBoard(routeSelect.value));
search.addEventListener('input', render);
document.querySelector('#shortageButton').addEventListener('click', async () => {
  const shortages = await api('/api/reports/shortages');
  document.querySelector('#shortageList').innerHTML = shortages.length ? shortages.map(item => `
    <div class="shortage"><strong>${item.product}</strong><span>Route ${item.route} · ${item.customer}</span><b>${item.short} short</b></div>`).join('') : '<p>No shortages recorded.</p>';
  shortageDialog.showModal();
});
document.querySelector('#closeDialog').addEventListener('click', () => shortageDialog.close());

loadRoutes();
