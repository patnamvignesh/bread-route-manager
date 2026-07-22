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
    routeSelect.innerHTML = routes.map(route => `<option value="${route.id}">Route ${route.routeCode}${route.routeName ? ` · ${route.routeName}` : ''}</option>`).join('');
    $('#apiStatus').textContent = 'Online'; $('#apiStatus').classList.add('online');
    renderWorkspace();
  } catch (error) { if (error.message.includes('Authentication')) return $('#logout').click(); board.innerHTML = `<p class="error">${error.message}</p>`; }
}

function metrics(items) { summary.innerHTML = items.map(([label,value]) => `<div class="metric card"><span>${label}</span><strong>${value}</strong></div>`).join(''); }
const displayQty = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

async function renderPacking() {
  const data = await api(`/api/routes/${routeSelect.value}/packing-board`);
  const term = search.value.toLowerCase();
  const products = data.products.filter(p => p.productName.toLowerCase().includes(term) || p.customers.some(c => c.customerName.toLowerCase().includes(term)));
  const totals = data.products.reduce((a,p) => ({ required:a.required+p.required, packed:a.packed+p.packed, short:a.short+p.short }), { required:0,packed:0,short:0 });
  metrics([['Required',displayQty(totals.required)],['Packed',displayQty(totals.packed)],['Short',displayQty(totals.short)],['Progress',`${totals.required ? Math.round((totals.packed+totals.short)/totals.required*100) : 0}%`]]);
  board.innerHTML = products.map(product => `<article class="product card"><div class="product-header"><div><p class="eyebrow">${product.sku || 'Product'} · ${product.uom}</p><h2>${product.productName}</h2></div><b>${displayQty(product.packed)}/${displayQty(product.required)} packed · ${displayQty(product.short)} short</b></div><div class="customers">${product.customers.map(c => `<div class="customer-row ${c.status.toLowerCase()}"><div><strong>${c.customerName}</strong><span>Needs ${displayQty(c.quantity)} ${c.uom}</span></div><div class="actions"><button data-pack="done" data-id="${c.itemId}" data-qty="${c.quantity}">Done</button><button class="secondary" data-pack="short" data-id="${c.itemId}" data-qty="${c.quantity}">Short</button></div></div>`).join('')}</div></article>`).join('');
}

async function renderPicking() {
  const route = await api(`/api/routes/${routeSelect.value}/picking-board`);
  const done = route.customers.filter(c => c.pickStatus === 'DONE').length;
  metrics([['Stops',route.customers.length],['Picked',done],['Remaining',route.customers.length-done]]);
  board.innerHTML = route.customers.map(c => `<article class="card"><p class="eyebrow">Stop ${c.stopOrder} · Ticket ${c.externalTicketId || '—'}</p><h2>${c.name}</h2><p>${c.address || ''}</p><p>${c.items.map(i => `${i.product.name}: ${displayQty(i.quantity)} ${i.uom}`).join(' · ')}</p><button data-pick="${c.id}" ${c.pickStatus==='DONE'?'disabled':''}>${c.pickStatus==='DONE'?'Picked':'Mark picked'}</button></article>`).join('');
}

async function renderDriver() {
  const route = await api(`/api/routes/${routeSelect.value}/driver-board`);
  const delivered = route.customers.filter(c => c.deliveryStatus === 'DELIVERED').length;
  metrics([['Stops',route.customers.length],['Delivered',delivered],['Remaining',route.customers.length-delivered]]);
  board.innerHTML = route.customers.map(c => `<article class="card"><p class="eyebrow">Stop ${c.stopOrder} · ${c.deliveryStatus} · Ticket ${c.externalTicketId || '—'}</p><h2>${c.name}</h2><p>${c.address || ''}</p><p>${c.contactName || ''} ${c.phone || ''}</p><p><b>${c.instructions || ''}</b></p><div class="actions"><a class="button" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address||c.name)}">Navigate</a><button data-delivery="ARRIVED" data-id="${c.id}">Arrived</button><button data-delivery="DELIVERED" data-id="${c.id}">Delivered</button><button class="secondary" data-delivery="ISSUE" data-id="${c.id}">Issue</button></div><label>Proof photo<input data-proof="${c.id}" type="file" accept="image/*" capture="environment"></label>${c.proofPhotoPath?`<a href="${c.proofPhotoPath}" target="_blank">View proof</a>`:''}</article>`).join('');
}

async function renderReports() {
  const [dashboard, shortages] = await Promise.all([api('/api/reports/dashboard'), api('/api/reports/shortages')]);
  metrics([['Routes',dashboard.routes],['Customers',dashboard.customers],['Documents',dashboard.documents],['Delivered',dashboard.delivered],['Completion',`${dashboard.deliveryCompletion}%`],['Shortages',dashboard.shortages]]);
  board.innerHTML = `<article class="card"><div class="product-header"><h2>Shortage report</h2><a class="button" href="/api/reports/export.csv" data-export>Export CSV</a></div>${shortages.length ? shortages.map(s=>`<div class="shortage"><strong>${s.product}</strong><span>Route ${s.route} · ${s.customer}</span><b>${displayQty(s.short)} ${s.uom} short</b></div>`).join(''):'<p>No shortages recorded.</p>'}</article>`;
  $('[data-export]').onclick = async e => { e.preventDefault(); const csv = await api('/api/reports/export.csv'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='bread-route-report.csv'; a.click(); };
}

function extractionMarkup(document) {
  const extraction = document.extraction;
  if (!extraction?.tickets) return `<p class="error">${extraction?.error || 'No extraction available'}</p>`;
  return `<div class="product-header"><div><p class="eyebrow">Extraction preview</p><h2>${extraction.ticketCount} tickets · ${extraction.routeCount} routes</h2></div><b>${extraction.averageConfidence}% average confidence</b></div>
    ${extraction.routes.map(route => `<section class="card"><h3>Route ${route.routeCode} ${route.routeName || ''}</h3>${route.tickets.map(ticket => `<details ${ticket.confidence < 80 ? 'open' : ''}><summary><b>${ticket.customer?.name || 'Unknown customer'}</b> · Ticket ${ticket.ticketNumber || 'unknown'} · ${ticket.confidence}%</summary><p>${ticket.customer?.address || ''}</p><p>${ticket.customer?.instructions || ''}</p><ul>${ticket.items.map(item => `<li>${displayQty(item.quantity)} ${item.uom} — ${item.description} (${item.itemCode})</li>`).join('')}</ul>${ticket.warnings?.length ? `<p class="error">${ticket.warnings.join(' · ')}</p>` : ''}</details>`).join('')}</section>`).join('')}
    <button data-import-document="${document.id}">Approve and import all valid tickets</button>`;
}

async function renderUpload() {
  summary.innerHTML = '';
  const documents = await api('/api/documents');
  board.innerHTML = `<form id="uploadForm" class="card"><p class="eyebrow">Rockland Bakery importer</p><h2>Upload delivery tickets by route</h2><p>Upload the original text-based PDF. The system detects routes, tickets, customers, delivery instructions, item codes, units, and fractional quantities.</p><input id="document" type="file" accept="application/pdf" required><button>Extract tickets</button><p id="uploadResult"></p></form>
    <section id="documentList">${documents.map(document => `<article class="card"><p class="eyebrow">${document.status}</p><h2>${document.originalName}</h2><p>${new Date(document.createdAt).toLocaleString()}</p>${document.status === 'REVIEW_REQUIRED' ? extractionMarkup(document) : ''}</article>`).join('')}</section>`;
  $('#uploadForm').onsubmit = async e => {
    e.preventDefault(); const form = new FormData(); form.append('document',$('#document').files[0]);
    try { $('#uploadResult').textContent='Extracting 57-page ticket packets may take a moment…'; await api('/api/documents/upload',{method:'POST',body:form}); await renderUpload(); }
    catch(error) { $('#uploadResult').textContent=error.message; }
  };
}

async function renderWorkspace() {
  if (!routeSelect.value && !['upload','reports'].includes(workspace.value)) return;
  board.innerHTML = '<p>Loading…</p>';
  try {
    if (workspace.value === 'packing') await renderPacking();
    if (workspace.value === 'picking') await renderPicking();
    if (workspace.value === 'driver') await renderDriver();
    if (workspace.value === 'reports') await renderReports();
    if (workspace.value === 'upload') await renderUpload();
  } catch (error) { board.innerHTML = `<p class="error">${error.message}</p>`; }
}

board.addEventListener('click', async event => {
  const pack = event.target.closest('[data-pack]');
  const pick = event.target.closest('[data-pick]');
  const delivery = event.target.closest('[data-delivery]');
  const importButton = event.target.closest('[data-import-document]');
  try {
    if (pack) { const quantity=Number(pack.dataset.qty); let shortQty=0; if(pack.dataset.pack==='short') shortQty=Number(prompt(`How many short? Maximum ${quantity}`,'1')); if(!Number.isFinite(shortQty)||shortQty<0||shortQty>quantity)return; await api(`/api/order-items/${pack.dataset.id}`,{method:'PATCH',body:JSON.stringify({status:shortQty?'SHORT':'DONE',packedQty:quantity-shortQty,shortQty,notes:shortQty?prompt('Shortage note',''):null})}); }
    if (pick) await api(`/api/customers/${pick.dataset.pick}/pick-status`,{method:'PATCH',body:JSON.stringify({status:'DONE'})});
    if (delivery) await api(`/api/customers/${delivery.dataset.id}/delivery-status`,{method:'PATCH',body:JSON.stringify({status:delivery.dataset.delivery,notes:delivery.dataset.delivery==='ISSUE'?prompt('Describe issue',''):null})});
    if (importButton) { if (!confirm('Import every valid ticket shown in this extraction?')) return; const result=await api(`/api/documents/${importButton.dataset.importDocument}/import`,{method:'POST',body:'{}'}); alert(`Imported ${result.customers} customers and ${result.items} product lines. Skipped ${result.skipped}.`); await loadRoutes(); workspace.value='upload'; }
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
