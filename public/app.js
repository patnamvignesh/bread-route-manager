const $ = selector => document.querySelector(selector);
const board = $('#board');
const summary = $('#summary');
const routeSelect = $('#routeSelect');
const workspace = $('#workspace');
const search = $('#search');
let token = localStorage.getItem('breadToken');
let user = JSON.parse(localStorage.getItem('breadUser') || 'null');
let routes = [];

async function api(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const response = await fetch(path, { ...options, headers });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showApp() {
  $('#loginView').hidden = true; $('#appView').hidden = false;
  $('#identity').textContent = `${user.name} · ${user.role}`;
  const allowed = user.role === 'MANAGER' ? ['packing','picking','driver','reports','upload'] : user.role === 'PACKER' ? ['packing'] : user.role === 'PICKER' ? ['picking'] : ['driver'];
  [...workspace.options].forEach(option => option.hidden = !allowed.includes(option.value));
  workspace.value = allowed[0];
  loadRoutes();
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value, password: $('#password').value }) });
    token = result.token; user = result.user;
    localStorage.setItem('breadToken', token); localStorage.setItem('breadUser', JSON.stringify(user));
    showApp();
  } catch (error) { $('#loginError').textContent = error.message; }
});

$('#logout').onclick = () => { localStorage.clear(); location.reload(); };

async function loadRoutes() {
  try {
    routes = await api('/api/routes');
    routeSelect.innerHTML = routes.map(route => `<option value="${route.id}">Route ${route.routeCode}</option>`).join('');
    $('#apiStatus').textContent = 'Online'; $('#apiStatus').classList.add('online');
    renderWorkspace();
  } catch (error) { if (error.message.includes('Authentication')) return $('#logout').click(); board.innerHTML = `<p class="error">${error.message}</p>`; }
}

function metrics(items) { summary.innerHTML = items.map(([label,value]) => `<div class="metric card"><span>${label}</span><strong>${value}</strong></div>`).join(''); }

async function renderPacking() {
  const data = await api(`/api/routes/${routeSelect.value}/packing-board`);
  const term = search.value.toLowerCase();
  const products = data.products.filter(p => p.productName.toLowerCase().includes(term) || p.customers.some(c => c.customerName.toLowerCase().includes(term)));
  const totals = data.products.reduce((a,p) => ({ required:a.required+p.required, packed:a.packed+p.packed, short:a.short+p.short }), { required:0,packed:0,short:0 });
  metrics([['Required',totals.required],['Packed',totals.packed],['Short',totals.short],['Progress',`${totals.required ? Math.round((totals.packed+totals.short)/totals.required*100) : 0}%`]]);
  board.innerHTML = products.map(product => `<article class="product card"><div class="product-header"><div><p class="eyebrow">Product</p><h2>${product.productName}</h2></div><b>${product.packed}/${product.required} packed · ${product.short} short</b></div><div class="customers">${product.customers.map(c => `<div class="customer-row ${c.status.toLowerCase()}"><div><strong>${c.customerName}</strong><span>Needs ${c.quantity}</span></div><div class="actions"><button data-pack="done" data-id="${c.itemId}" data-qty="${c.quantity}">Done</button><button class="secondary" data-pack="short" data-id="${c.itemId}" data-qty="${c.quantity}">Short</button></div></div>`).join('')}</div></article>`).join('');
}

async function renderPicking() {
  const route = await api(`/api/routes/${routeSelect.value}/picking-board`);
  const done = route.customers.filter(c => c.pickStatus === 'DONE').length;
  metrics([['Stops',route.customers.length],['Picked',done],['Remaining',route.customers.length-done]]);
  board.innerHTML = route.customers.map(c => `<article class="card"><p class="eyebrow">Stop ${c.stopOrder}</p><h2>${c.name}</h2><p>${c.address || ''}</p><p>${c.items.map(i => `${i.product.name}: ${i.quantity}`).join(' · ')}</p><button data-pick="${c.id}" ${c.pickStatus==='DONE'?'disabled':''}>${c.pickStatus==='DONE'?'Picked':'Mark picked'}</button></article>`).join('');
}

async function renderDriver() {
  const route = await api(`/api/routes/${routeSelect.value}/driver-board`);
  const delivered = route.customers.filter(c => c.deliveryStatus === 'DELIVERED').length;
  metrics([['Stops',route.customers.length],['Delivered',delivered],['Remaining',route.customers.length-delivered]]);
  board.innerHTML = route.customers.map(c => `<article class="card"><p class="eyebrow">Stop ${c.stopOrder} · ${c.deliveryStatus}</p><h2>${c.name}</h2><p>${c.address || ''}</p><p>${c.instructions || ''}</p><div class="actions"><a class="button" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address||c.name)}">Navigate</a><button data-delivery="ARRIVED" data-id="${c.id}">Arrived</button><button data-delivery="DELIVERED" data-id="${c.id}">Delivered</button><button class="secondary" data-delivery="ISSUE" data-id="${c.id}">Issue</button></div><label>Proof photo<input data-proof="${c.id}" type="file" accept="image/*" capture="environment"></label>${c.proofPhotoPath?`<a href="${c.proofPhotoPath}" target="_blank">View proof</a>`:''}</article>`).join('');
}

async function renderReports() {
  const [dashboard, shortages] = await Promise.all([api('/api/reports/dashboard'), api('/api/reports/shortages')]);
  metrics([['Routes',dashboard.routes],['Customers',dashboard.customers],['Delivered',dashboard.delivered],['Completion',`${dashboard.deliveryCompletion}%`],['Shortages',dashboard.shortages]]);
  board.innerHTML = `<article class="card"><div class="product-header"><h2>Shortage report</h2><a class="button" href="/api/reports/export.csv" data-export>Export CSV</a></div>${shortages.length ? shortages.map(s=>`<div class="shortage"><strong>${s.product}</strong><span>Route ${s.route} · ${s.customer}</span><b>${s.short} short</b></div>`).join(''):'<p>No shortages recorded.</p>'}</article>`;
  $('[data-export]').onclick = async e => { e.preventDefault(); const csv = await api('/api/reports/export.csv'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='bread-route-report.csv'; a.click(); };
}

function renderUpload() {
  summary.innerHTML = '';
  board.innerHTML = `<form id="uploadForm" class="card"><p class="eyebrow">Manager tool</p><h2>Upload daily invoice or loading sheet</h2><p>PDF and image files up to 12 MB are stored for extraction review.</p><input id="document" type="file" accept="application/pdf,image/*" required><button>Upload document</button><pre id="uploadResult"></pre></form>`;
  $('#uploadForm').onsubmit = async e => { e.preventDefault(); const form = new FormData(); form.append('document',$('#document').files[0]); try { $('#uploadResult').textContent=JSON.stringify(await api('/api/documents/upload',{method:'POST',body:form}),null,2); } catch(error) { $('#uploadResult').textContent=error.message; } };
}

async function renderWorkspace() {
  if (!routeSelect.value && workspace.value !== 'upload') return;
  board.innerHTML = '<p>Loading…</p>';
  try {
    if (workspace.value === 'packing') await renderPacking();
    if (workspace.value === 'picking') await renderPicking();
    if (workspace.value === 'driver') await renderDriver();
    if (workspace.value === 'reports') await renderReports();
    if (workspace.value === 'upload') renderUpload();
  } catch (error) { board.innerHTML = `<p class="error">${error.message}</p>`; }
}

board.addEventListener('click', async event => {
  const pack = event.target.closest('[data-pack]');
  const pick = event.target.closest('[data-pick]');
  const delivery = event.target.closest('[data-delivery]');
  try {
    if (pack) { const quantity=Number(pack.dataset.qty); let shortQty=0; if(pack.dataset.pack==='short') shortQty=Number(prompt(`How many short? Maximum ${quantity}`,'1')); if(!Number.isInteger(shortQty)||shortQty<0||shortQty>quantity)return; await api(`/api/order-items/${pack.dataset.id}`,{method:'PATCH',body:JSON.stringify({status:shortQty?'SHORT':'DONE',packedQty:quantity-shortQty,shortQty,notes:shortQty?prompt('Shortage note',''):null})}); }
    if (pick) await api(`/api/customers/${pick.dataset.pick}/pick-status`,{method:'PATCH',body:JSON.stringify({status:'DONE'})});
    if (delivery) await api(`/api/customers/${delivery.dataset.id}/delivery-status`,{method:'PATCH',body:JSON.stringify({status:delivery.dataset.delivery,notes:delivery.dataset.delivery==='ISSUE'?prompt('Describe issue',''):null})});
    await renderWorkspace();
  } catch(error) { alert(error.message); }
});

board.addEventListener('change', async event => {
  const input = event.target.closest('[data-proof]'); if(!input?.files[0]) return;
  const form = new FormData(); form.append('photo',input.files[0]);
  try { await api(`/api/customers/${input.dataset.proof}/proof`,{method:'POST',body:form}); await renderWorkspace(); } catch(error) { alert(error.message); }
});

routeSelect.onchange = renderWorkspace; workspace.onchange = renderWorkspace; search.oninput = () => workspace.value==='packing'&&renderPacking();
if (token && user) showApp();
