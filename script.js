const STORAGE_KEY = 'invoiceCraftData';
const AUTO_SAVE_INTERVAL = 6000;
let autoSaveTimer = null;
let revenueChart = null;

const defaultState = () => ({
  lastInvoiceNumber: 1000,
  company: {
    name: '',
    address: '',
    phone: '',
    email: '',
    logo: ''
  },
  clients: [],
  products: [],
  invoices: [],
  settings: {
    accent: '#6366f1',
    font: "'Inter', sans-serif",
    currency: { symbol: '$', code: 'USD', locale: 'en-US' },
    theme: 'classic',
    autoSave: true,
    footer: 'Thank you for your business.'
  },
  historyCache: []
});

let state = loadState();
let currentInvoice = createEmptyInvoice();

function createEmptyInvoice() {
  const today = new Date().toISOString().split('T')[0];
  const due = new Date();
  due.setDate(due.getDate() + 14);
  return {
    id: crypto.randomUUID(),
    number: '',
    issueDate: today,
    dueDate: due.toISOString().split('T')[0],
    status: 'draft',
    sender: { ...state.company },
    clientId: null,
    client: { name: '', address: '', phone: '', email: '' },
    lineItems: [],
    discount: { type: 'flat', value: 0 },
    taxRate: 0,
    notes: '',
    totals: {
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function loadState() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('state')) {
      const decoded = decodeURIComponent(params.get('state'));
      const fromUrl = JSON.parse(decoded);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
      window.history.replaceState({}, document.title, window.location.pathname);
      showToast('State restored from link');
      return fromUrl;
    }
  } catch (error) {
    console.error('Failed to parse state from URL', error);
    showToast('Invalid shared link. Using local data.');
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!parsed.settings) parsed.settings = defaultState().settings;
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse stored state', error);
  }
  return defaultState();
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateLastSaved();
}

function updateLastSaved() {
  const el = document.getElementById('last-saved');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString();
}

function init() {
  bindNavigation();
  bindEditorEvents();
  bindGlobalActions();
  populateClientSelect();
  populateProductSelect();
  applySettings();
  loadLastInvoiceMeta();
  updateInvoiceForm();
  updatePreview();
  renderClientTable();
  renderProductTable();
  refreshDashboard();
  renderHistory();
  if (state.settings.autoSave) startAutoSave();
}

document.addEventListener('DOMContentLoaded', init);

function bindNavigation() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const panel = btn.dataset.target;
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      document.getElementById(panel).classList.add('active');
      if (panel === 'dashboard') refreshDashboard();
      if (panel === 'history') renderHistory();
      if (panel === 'clients') renderClientTable();
      if (panel === 'products') renderProductTable();
    });
  });

  document.querySelectorAll('[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) {
        document.querySelector(`.nav-btn[data-target="${target}"]`)?.click();
      }
    });
  });
}

function bindEditorEvents() {
  document.getElementById('sender-name').addEventListener('input', (e) => {
    state.company.name = e.target.value;
    currentInvoice.sender.name = e.target.value;
    persistState();
    updatePreview();
  });
  document.getElementById('sender-address').addEventListener('input', (e) => {
    state.company.address = e.target.value;
    currentInvoice.sender.address = e.target.value;
    persistState();
    updatePreview();
  });
  document.getElementById('sender-phone').addEventListener('input', (e) => {
    state.company.phone = e.target.value;
    currentInvoice.sender.phone = e.target.value;
    persistState();
    updatePreview();
  });
  document.getElementById('sender-email').addEventListener('input', (e) => {
    state.company.email = e.target.value;
    currentInvoice.sender.email = e.target.value;
    persistState();
    updatePreview();
  });

  document.getElementById('logo-upload').addEventListener('change', handleLogoUpload);

  document.getElementById('client-select').addEventListener('change', (e) => {
    const id = e.target.value;
    if (id === 'new') {
      currentInvoice.clientId = null;
      fillClientFields({ name: '', address: '', phone: '', email: '' });
      return;
    }
    const client = state.clients.find((c) => c.id === id);
    if (client) {
      currentInvoice.clientId = client.id;
      currentInvoice.client = { ...client };
      fillClientFields(client);
    }
    updatePreview();
  });

  ['client-name', 'client-address', 'client-phone', 'client-email'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      currentInvoice.client = {
        name: document.getElementById('client-name').value,
        address: document.getElementById('client-address').value,
        phone: document.getElementById('client-phone').value,
        email: document.getElementById('client-email').value
      };
      updatePreview();
    });
  });

  document.getElementById('invoice-number').addEventListener('input', (e) => {
    currentInvoice.number = e.target.value;
    updatePreview();
  });
  document.getElementById('issue-date').addEventListener('input', (e) => {
    currentInvoice.issueDate = e.target.value;
    updatePreview();
  });
  document.getElementById('due-date').addEventListener('input', (e) => {
    currentInvoice.dueDate = e.target.value;
    updatePreview();
  });
  document.getElementById('invoice-status').addEventListener('change', (e) => {
    currentInvoice.status = e.target.value;
    updatePreview();
  });
  document.getElementById('invoice-notes').addEventListener('input', (e) => {
    currentInvoice.notes = e.target.value;
    updatePreview();
  });

  document.getElementById('discount-type').addEventListener('change', (e) => {
    currentInvoice.discount.type = e.target.value;
    updateTotals();
  });
  document.getElementById('discount-value').addEventListener('input', (e) => {
    currentInvoice.discount.value = parseFloat(e.target.value) || 0;
    updateTotals();
  });
  document.getElementById('tax-rate').addEventListener('input', (e) => {
    currentInvoice.taxRate = parseFloat(e.target.value) || 0;
    updateTotals();
  });

  document.getElementById('add-line-item').addEventListener('click', () => {
    currentInvoice.lineItems.push({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      quantity: 1,
      rate: 0,
      total: 0
    });
    renderLineItems();
  });

  document.getElementById('add-from-product').addEventListener('click', () => {
    const select = document.getElementById('product-preset');
    const id = select.value;
    if (!id) return;
    const product = state.products.find((p) => p.id === id);
    if (!product) return;
    currentInvoice.lineItems.push({
      id: crypto.randomUUID(),
      name: product.name,
      description: product.description,
      quantity: 1,
      rate: product.rate,
      total: product.rate
    });
    renderLineItems();
  });

  document.getElementById('generate-number').addEventListener('click', () => {
    const nextNumber = ++state.lastInvoiceNumber;
    currentInvoice.number = `INV-${nextNumber}`;
    document.getElementById('invoice-number').value = currentInvoice.number;
    persistState();
    updatePreview();
  });
}

function bindGlobalActions() {
  document.getElementById('new-invoice').addEventListener('click', () => {
    currentInvoice = createEmptyInvoice();
    updateInvoiceForm();
    updatePreview();
    showToast('New invoice started');
  });

  document.getElementById('save-invoice').addEventListener('click', () => {
    saveCurrentInvoice();
  });

  document.getElementById('download-pdf').addEventListener('click', exportPdf);
  document.getElementById('print-invoice').addEventListener('click', () => window.print());
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('export-invoice-json').addEventListener('click', exportCurrentInvoiceJson);
  document.getElementById('refresh-dashboard').addEventListener('click', refreshDashboard);
  document.getElementById('preview-toggle').addEventListener('click', togglePreview);

  document.getElementById('accent-color').addEventListener('input', (e) => {
    state.settings.accent = e.target.value;
    applySettings();
    updatePreview();
    persistState();
  });
  document.getElementById('font-choice').addEventListener('change', (e) => {
    state.settings.font = e.target.value;
    applySettings();
    updatePreview();
    persistState();
  });
  document.getElementById('currency-choice').addEventListener('change', (e) => {
    state.settings.currency = JSON.parse(e.target.value);
    updateTotals();
    updatePreview();
    persistState();
  });

  document.getElementById('auto-save').addEventListener('change', (e) => {
    state.settings.autoSave = e.target.checked;
    if (state.settings.autoSave) {
      startAutoSave();
    } else {
      stopAutoSave();
    }
    persistState();
  });

  document.getElementById('footer-text').addEventListener('input', (e) => {
    state.settings.footer = e.target.value;
    updatePreview();
    persistState();
  });

  document.getElementById('export-json').addEventListener('click', exportState);
  document.getElementById('import-json').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', importStateFromFile);

  document.getElementById('export-encrypted').addEventListener('click', encryptedExport);
  document.getElementById('share-url').addEventListener('click', shareUrl);

  document.getElementById('add-client').addEventListener('click', () => openClientModal());
  document.getElementById('add-product').addEventListener('click', () => openProductModal());

  document.getElementById('history-filter').addEventListener('change', renderHistory);
  document.getElementById('history-search').addEventListener('input', renderHistory);

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.theme = btn.dataset.theme;
      document.querySelectorAll('.theme-btn').forEach((b) => b.classList.remove('primary-btn'));
      btn.classList.add('primary-btn');
      applySettings();
      updatePreview();
      persistState();
    });
  });
}

function handleLogoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.company.logo = reader.result;
    currentInvoice.sender.logo = reader.result;
    updatePreview();
    persistState();
  };
  reader.readAsDataURL(file);
}

function fillClientFields(client) {
  document.getElementById('client-name').value = client.name || '';
  document.getElementById('client-address').value = client.address || '';
  document.getElementById('client-phone').value = client.phone || '';
  document.getElementById('client-email').value = client.email || '';
}

function loadLastInvoiceMeta() {
  document.getElementById('accent-color').value = state.settings.accent;
  document.getElementById('font-choice').value = state.settings.font;
  document.getElementById('currency-choice').value = JSON.stringify(state.settings.currency);
  document.getElementById('auto-save').checked = state.settings.autoSave;
  document.getElementById('footer-text').value = state.settings.footer;
  document.querySelector(`.theme-btn[data-theme="${state.settings.theme}"]`)?.classList.add('primary-btn');
}

function updateInvoiceForm() {
  document.getElementById('sender-name').value = currentInvoice.sender.name || '';
  document.getElementById('sender-address').value = currentInvoice.sender.address || '';
  document.getElementById('sender-phone').value = currentInvoice.sender.phone || '';
  document.getElementById('sender-email').value = currentInvoice.sender.email || '';

  if (!currentInvoice.clientId) {
    document.getElementById('client-select').value = 'new';
  }
  fillClientFields(currentInvoice.client);

  document.getElementById('invoice-number').value = currentInvoice.number || '';
  document.getElementById('issue-date').value = currentInvoice.issueDate;
  document.getElementById('due-date').value = currentInvoice.dueDate;
  document.getElementById('invoice-status').value = currentInvoice.status;
  document.getElementById('invoice-notes').value = currentInvoice.notes;
  document.getElementById('discount-type').value = currentInvoice.discount.type;
  document.getElementById('discount-value').value = currentInvoice.discount.value;
  document.getElementById('tax-rate').value = currentInvoice.taxRate;
  renderLineItems();
  updateTotals();
}

function renderLineItems() {
  const tbody = document.getElementById('line-items');
  tbody.innerHTML = '';
  if (!currentInvoice.lineItems.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="muted">No items yet. Add line items.</td>';
    tbody.appendChild(row);
    updateTotals();
    return;
  }

  currentInvoice.lineItems.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="text" value="${item.name || ''}" aria-label="Item name" /></td>
      <td><textarea rows="2" aria-label="Item description">${item.description || ''}</textarea></td>
      <td><input type="number" min="0" step="0.01" value="${item.quantity}" aria-label="Quantity" /></td>
      <td><input type="number" min="0" step="0.01" value="${item.rate}" aria-label="Rate" /></td>
      <td class="item-total">${formatCurrency(item.total)}</td>
      <td><button type="button" class="secondary-btn">✕</button></td>
    `;

    const [nameInput, descInput, qtyInput, rateInput] = row.querySelectorAll('input, textarea');
    const removeBtn = row.querySelector('button');

    nameInput.addEventListener('input', (e) => {
      item.name = e.target.value;
      updatePreview();
    });
    descInput.addEventListener('input', (e) => {
      item.description = e.target.value;
      updatePreview();
    });
    qtyInput.addEventListener('input', (e) => {
      item.quantity = parseFloat(e.target.value) || 0;
      item.total = item.quantity * item.rate;
      row.querySelector('.item-total').textContent = formatCurrency(item.total);
      updateTotals();
    });
    rateInput.addEventListener('input', (e) => {
      item.rate = parseFloat(e.target.value) || 0;
      item.total = item.quantity * item.rate;
      row.querySelector('.item-total').textContent = formatCurrency(item.total);
      updateTotals();
    });
    removeBtn.addEventListener('click', () => {
      currentInvoice.lineItems = currentInvoice.lineItems.filter((line) => line.id !== item.id);
      renderLineItems();
    });
    tbody.appendChild(row);
  });

  updateTotals();
}

function updateTotals() {
  const subtotal = currentInvoice.lineItems.reduce((acc, item) => acc + (item.total || 0), 0);
  let discountValue = 0;
  if (currentInvoice.discount.type === 'percent') {
    discountValue = subtotal * (currentInvoice.discount.value / 100);
  } else {
    discountValue = currentInvoice.discount.value;
  }
  discountValue = Math.min(discountValue, subtotal);
  const taxable = subtotal - discountValue;
  const tax = taxable * (currentInvoice.taxRate / 100);
  const total = taxable + tax;

  currentInvoice.totals = {
    subtotal,
    discount: discountValue,
    tax,
    total
  };

  document.getElementById('subtotal-display').textContent = formatCurrency(subtotal);
  document.getElementById('discount-display').textContent = `-${formatCurrency(discountValue)}`;
  document.getElementById('tax-display').textContent = formatCurrency(tax);
  document.getElementById('total-display').textContent = formatCurrency(total);

  updatePreview();
}

function formatCurrency(value) {
  const { locale, code } = state.settings.currency;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(value || 0);
  } catch (error) {
    return `${state.settings.currency.symbol}${Number(value || 0).toFixed(2)}`;
  }
}

function updatePreview() {
  const container = document.getElementById('invoice-preview');
  if (!container) return;

  container.className = `invoice theme-${state.settings.theme}`;
  container.style.setProperty('--accent', state.settings.accent);
  container.style.setProperty('--invoice-font', state.settings.font);

  const badge = `<span class="badge ${currentInvoice.status}">${currentInvoice.status}</span>`;
  const logo = currentInvoice.sender.logo
    ? `<img src="${currentInvoice.sender.logo}" alt="Company logo" class="logo" />`
    : '';

  const lineItems = currentInvoice.lineItems
    .map(
      (item) => `
        <tr>
          <td>${item.name || ''}</td>
          <td>${item.description || ''}</td>
          <td>${item.quantity || 0}</td>
          <td>${formatCurrency(item.rate || 0)}</td>
          <td>${formatCurrency(item.total || 0)}</td>
        </tr>`
    )
    .join('') ||
    '<tr><td colspan="5">No items added yet.</td></tr>';

  container.innerHTML = `
    <header>
      <div>
        ${logo}
        <div>
          <h1>${currentInvoice.sender.name || 'Your Company'}</h1>
          <p>${(currentInvoice.sender.address || '').replace(/\n/g, '<br />')}</p>
          <p>${currentInvoice.sender.phone || ''}</p>
          <p>${currentInvoice.sender.email || ''}</p>
        </div>
      </div>
      <div class="invoice-meta">
        ${badge}
        <p><strong>Invoice #</strong> ${currentInvoice.number || '—'}</p>
        <p><strong>Issued</strong> ${formatDate(currentInvoice.issueDate)}</p>
        <p><strong>Due</strong> ${formatDate(currentInvoice.dueDate)}</p>
      </div>
    </header>

    <section class="details">
      <h2>Bill To</h2>
      <p><strong>${currentInvoice.client.name || 'Client Name'}</strong></p>
      <p>${(currentInvoice.client.address || '').replace(/\n/g, '<br />')}</p>
      <p>${currentInvoice.client.phone || ''}</p>
      <p>${currentInvoice.client.email || ''}</p>
    </section>

    <section class="items">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems}
        </tbody>
      </table>
    </section>

    <section class="summary">
      <table>
        <tbody>
          <tr>
            <td style="text-align:right">Subtotal</td>
            <td style="text-align:right">${formatCurrency(currentInvoice.totals.subtotal)}</td>
          </tr>
          <tr>
            <td style="text-align:right">Discount</td>
            <td style="text-align:right">-${formatCurrency(currentInvoice.totals.discount)}</td>
          </tr>
          <tr>
            <td style="text-align:right">Tax</td>
            <td style="text-align:right">${formatCurrency(currentInvoice.totals.tax)}</td>
          </tr>
          <tr>
            <td style="text-align:right"><strong>Total Due</strong></td>
            <td style="text-align:right"><strong>${formatCurrency(currentInvoice.totals.total)}</strong></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="notes">
      <h3>Notes</h3>
      <p>${(currentInvoice.notes || 'Add a cheerful thank you message and payment instructions.').replace(/\n/g, '<br />')}</p>
    </section>

    <footer>
      <p>${(state.settings.footer || '').replace(/\n/g, '<br />')}</p>
    </footer>
  `;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString();
  } catch (error) {
    return value;
  }
}

function saveCurrentInvoice() {
  if (!currentInvoice.number) {
    showToast('Invoice number required. Generate or enter manually.');
    return;
  }
  currentInvoice.updatedAt = Date.now();
  updateTotals();

  state.invoices = state.invoices.filter((inv) => !(inv.isDraft && inv.id === currentInvoice.id));

  const existingIndex = state.invoices.findIndex((inv) => inv.id === currentInvoice.id);
  const snapshot = JSON.parse(JSON.stringify(currentInvoice));
  delete snapshot.isDraft;
  delete snapshot.savedAt;
  if (existingIndex >= 0) {
    state.invoices[existingIndex] = snapshot;
  } else {
    state.invoices.push(snapshot);
  }

  if (currentInvoice.clientId) {
    const client = state.clients.find((c) => c.id === currentInvoice.clientId);
    if (client) {
      client.lastUsed = Date.now();
    }
  } else if (currentInvoice.client.name) {
    const newClient = {
      id: crypto.randomUUID(),
      ...currentInvoice.client,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };
    state.clients.push(newClient);
    currentInvoice.clientId = newClient.id;
    populateClientSelect();
  }

  state.historyCache.unshift({
    invoiceId: currentInvoice.id,
    number: currentInvoice.number,
    client: currentInvoice.client.name,
    total: currentInvoice.totals.total,
    status: currentInvoice.status,
    dueDate: currentInvoice.dueDate,
    updatedAt: currentInvoice.updatedAt
  });
  state.historyCache = state.historyCache.slice(0, 10);

  persistState();
  renderHistory();
  populateClientSelect();
  refreshDashboard();
  showToast('Invoice saved to browser');
}

function populateClientSelect() {
  const select = document.getElementById('client-select');
  select.innerHTML = '<option value="new">New client</option>';
  state.clients
    .slice()
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .forEach((client) => {
      const option = document.createElement('option');
      option.value = client.id;
      option.textContent = client.name;
      select.appendChild(option);
    });
  if (currentInvoice.clientId) {
    select.value = currentInvoice.clientId;
  }
}

function populateProductSelect() {
  const select = document.getElementById('product-preset');
  select.innerHTML = '<option value="">Select a product</option>';
  state.products.forEach((product) => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = `${product.name} (${formatCurrency(product.rate)})`;
    select.appendChild(option);
  });
}

function startAutoSave() {
  stopAutoSave();
  autoSaveTimer = setInterval(() => {
    saveDraft();
  }, AUTO_SAVE_INTERVAL);
}

function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

function saveDraft() {
  if (!state.settings.autoSave) return;
  const draft = JSON.parse(JSON.stringify(currentInvoice));
  draft.isDraft = true;
  draft.savedAt = Date.now();
  state.invoices = state.invoices.filter((inv) => !(inv.isDraft && inv.id === draft.id));
  state.invoices.push(draft);
  persistState();
  showToast('Auto-saved draft');
}

function renderHistory() {
  const tbody = document.getElementById('history-table');
  const filter = document.getElementById('history-filter').value;
  const search = document.getElementById('history-search').value.toLowerCase();
  tbody.innerHTML = '';

  const invoices = state.invoices
    .map((invoice) => updateStatus(invoice))
    .filter((invoice) => {
      if (filter !== 'all' && invoice.status !== filter) return false;
      if (search) {
        return (
          invoice.number.toLowerCase().includes(search) ||
          (invoice.client?.name || '').toLowerCase().includes(search)
        );
      }
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!invoices.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6">No invoices yet. Create your first invoice!</td>';
    tbody.appendChild(row);
    return;
  }

  invoices.forEach((invoice) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${invoice.number}</td>
      <td>${invoice.client?.name || '—'}</td>
      <td>${formatCurrency(invoice.totals?.total || 0)}</td>
      <td><span class="status-pill ${invoice.status}">${invoice.status}</span></td>
      <td>${formatDate(invoice.dueDate)}</td>
      <td><button class="secondary-btn" data-id="${invoice.id}">Load</button></td>
    `;
    row.querySelector('button').addEventListener('click', () => {
      currentInvoice = JSON.parse(JSON.stringify(invoice));
      updateInvoiceForm();
      updatePreview();
      document.querySelector('.nav-btn[data-target="editor"]').click();
      showToast(`Loaded ${invoice.number}`);
    });
    tbody.appendChild(row);
  });
}

function updateStatus(invoice) {
  if (invoice.status === 'paid') return invoice;
  const dueDate = new Date(invoice.dueDate);
  if (invoice.status === 'sent' && Date.now() > dueDate.getTime()) {
    invoice.status = 'overdue';
  }
  return invoice;
}

function refreshDashboard() {
  const totals = {
    paid: 0,
    outstanding: 0,
    overdue: 0,
    drafts: 0
  };

  const now = Date.now();
  state.invoices.forEach((inv) => {
    updateStatus(inv);
    if (inv.status === 'paid') totals.paid += inv.totals.total || 0;
    if (inv.status === 'sent') totals.outstanding += inv.totals.total || 0;
    if (inv.status === 'draft') totals.drafts += 1;
    if (inv.status === 'overdue') {
      totals.overdue += inv.totals.total || 0;
      if (new Date(inv.dueDate).getTime() < now) inv.status = 'overdue';
    }
  });

  document.getElementById('stat-total-paid').textContent = formatCurrency(totals.paid);
  document.getElementById('stat-outstanding').textContent = formatCurrency(totals.outstanding);
  document.getElementById('stat-overdue').textContent = formatCurrency(totals.overdue);
  document.getElementById('stat-drafts').textContent = `${totals.drafts}`;

  renderRevenueChart();
  renderRecentInvoices();
}

function renderRevenueChart() {
  const ctx = document.getElementById('revenue-chart');
  if (!ctx) return;
  const months = [];
  const dataPaid = [];
  const dataOutstanding = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = date.toLocaleDateString(undefined, { month: 'short' });
    months.push(label);
    const monthInvoices = state.invoices.filter((inv) => {
      const issued = new Date(inv.issueDate);
      return issued.getMonth() === date.getMonth() && issued.getFullYear() === date.getFullYear();
    });
    const paid = monthInvoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum, inv) => sum + (inv.totals.total || 0), 0);
    const outstanding = monthInvoices
      .filter((inv) => inv.status !== 'paid')
      .reduce((sum, inv) => sum + (inv.totals.total || 0), 0);
    dataPaid.push(paid);
    dataOutstanding.push(outstanding);
  }

  if (revenueChart) revenueChart.destroy();

  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Paid',
          data: dataPaid,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.2)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Outstanding',
          data: dataOutstanding,
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.2)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#cbd5f5' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#cbd5f5' },
          grid: { color: 'rgba(148, 163, 184, 0.2)' }
        },
        y: {
          ticks: {
            color: '#cbd5f5',
            callback: (value) => formatCurrency(value)
          },
          grid: { color: 'rgba(148, 163, 184, 0.2)' }
        }
      }
    }
  });
}

function renderRecentInvoices() {
  const tbody = document.getElementById('recent-invoices');
  tbody.innerHTML = '';
  const recent = state.invoices
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  if (!recent.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5">No invoices yet.</td>';
    tbody.appendChild(row);
    return;
  }

  recent.forEach((invoice) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${invoice.number}</td>
      <td>${invoice.client?.name || '—'}</td>
      <td>${formatCurrency(invoice.totals?.total || 0)}</td>
      <td><span class="status-pill ${invoice.status}">${invoice.status}</span></td>
      <td>${formatDate(invoice.dueDate)}</td>
    `;
    tbody.appendChild(row);
  });
}

function exportPdf() {
  const previewNode = document.getElementById('invoice-preview');
  if (!previewNode) return;
  const { jsPDF } = window.jspdf;
  html2canvas(previewNode).then((canvas) => {
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imgWidth = canvas.width * ratio;
    const imgHeight = canvas.height * ratio;
    const x = (pageWidth - imgWidth) / 2;
    const y = 20;
    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    pdf.save(`${currentInvoice.number || 'invoice'}.pdf`);
    showToast('PDF downloaded');
  });
}

function exportCsv() {
  const headers = ['Item', 'Description', 'Quantity', 'Rate', 'Total'];
  const rows = currentInvoice.lineItems.map((item) => [
    item.name,
    item.description,
    item.quantity,
    item.rate,
    item.total
  ]);
  const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
  downloadBlob(csv, `${currentInvoice.number || 'invoice'}-items.csv`, 'text/csv');
  showToast('Line items exported as CSV');
}

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function exportCurrentInvoiceJson() {
  const json = JSON.stringify(currentInvoice, null, 2);
  downloadBlob(json, `${currentInvoice.number || 'invoice'}.json`, 'application/json');
  showToast('Invoice exported as JSON');
}

function exportState() {
  const json = JSON.stringify(state, null, 2);
  downloadBlob(json, 'invoiceCraftData.json', 'application/json');
  showToast('Data exported');
}

async function encryptedExport() {
  const password = prompt('Enter a password to encrypt your export');
  if (!password) return;
  try {
    const data = JSON.stringify(state);
    const { cipher, salt, iv } = await encrypt(password, data);
    const payload = JSON.stringify({ cipher, salt, iv });
    downloadBlob(payload, 'invoiceCraftData.encrypted.json', 'application/json');
    showToast('Encrypted export ready');
  } catch (error) {
    console.error(error);
    showToast('Encryption failed');
  }
}

async function encrypt(password, data) {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(data));
  return {
    cipher: arrayBufferToBase64(encrypted),
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv)
  };
}

async function decrypt(password, payload) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const salt = base64ToArrayBuffer(payload.salt);
  const iv = base64ToArrayBuffer(payload.iv);
  const cipher = base64ToArrayBuffer(payload.cipher);
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return dec.decode(decrypted);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function applySettings() {
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  document.documentElement.style.setProperty('--invoice-font', state.settings.font);
}

function togglePreview() {
  const preview = document.querySelector('.preview');
  if (preview.classList.contains('show')) {
    preview.classList.remove('show');
    document.getElementById('preview-toggle').textContent = 'Show Preview';
  } else {
    preview.classList.add('show');
    document.getElementById('preview-toggle').textContent = 'Hide Preview';
  }
}

function importStateFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      let parsed = JSON.parse(reader.result);
      if (parsed.cipher && parsed.salt) {
        const password = prompt('Enter password to decrypt');
        if (!password) return;
        const decrypted = await decrypt(password, parsed);
        parsed = JSON.parse(decrypted);
      }
      state = parsed;
      currentInvoice = createEmptyInvoice();
      persistState();
      populateClientSelect();
      populateProductSelect();
      loadLastInvoiceMeta();
      updateInvoiceForm();
      updatePreview();
      refreshDashboard();
      renderHistory();
      showToast('Data imported');
    } catch (error) {
      console.error('Import error', error);
      showToast('Import failed');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function openClientModal(client = null) {
  const modal = document.getElementById('modal');
  const isEdit = Boolean(client);
  const data = client || { name: '', email: '', phone: '', address: '' };
  modal.innerHTML = `
    <form>
      <h2>${isEdit ? 'Edit Client' : 'Add Client'}</h2>
      <label>Name<input type="text" value="${data.name || ''}" required /></label>
      <label>Email<input type="email" value="${data.email || ''}" /></label>
      <label>Phone<input type="tel" value="${data.phone || ''}" /></label>
      <label>Address<textarea rows="3">${data.address || ''}</textarea></label>
      <div class="header-actions">
        <button type="submit" class="primary-btn">Save</button>
        <button type="button" class="secondary-btn" id="modal-close">Cancel</button>
      </div>
    </form>
  `;
  modal.showModal();
  modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
  modal.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const [name, email, phone, address] = e.target.querySelectorAll('input, textarea');
    if (!name.value.trim()) {
      showToast('Client name required');
      return;
    }
    if (isEdit) {
      client.name = name.value;
      client.email = email.value;
      client.phone = phone.value;
      client.address = address.value;
      client.lastUsed = Date.now();
    } else {
      state.clients.push({
        id: crypto.randomUUID(),
        name: name.value,
        email: email.value,
        phone: phone.value,
        address: address.value,
        createdAt: Date.now(),
        lastUsed: Date.now()
      });
    }
    persistState();
    populateClientSelect();
    renderClientTable();
    modal.close();
    showToast('Client saved');
  });
}

function openProductModal(product = null) {
  const modal = document.getElementById('modal');
  const isEdit = Boolean(product);
  const data = product || { name: '', description: '', rate: 0 };
  modal.innerHTML = `
    <form>
      <h2>${isEdit ? 'Edit Item' : 'Add Item'}</h2>
      <label>Name<input type="text" value="${data.name || ''}" required /></label>
      <label>Description<textarea rows="3">${data.description || ''}</textarea></label>
      <label>Rate<input type="number" min="0" step="0.01" value="${data.rate || 0}" required /></label>
      <div class="header-actions">
        <button type="submit" class="primary-btn">Save</button>
        <button type="button" class="secondary-btn" id="modal-close">Cancel</button>
      </div>
    </form>
  `;
  modal.showModal();
  modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
  modal.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const [name, description, rate] = e.target.querySelectorAll('input, textarea');
    if (!name.value.trim()) {
      showToast('Item name required');
      return;
    }
    if (isEdit) {
      product.name = name.value;
      product.description = description.value;
      product.rate = parseFloat(rate.value) || 0;
    } else {
      state.products.push({
        id: crypto.randomUUID(),
        name: name.value,
        description: description.value,
        rate: parseFloat(rate.value) || 0,
        createdAt: Date.now()
      });
    }
    persistState();
    populateProductSelect();
    renderProductTable();
    modal.close();
    showToast('Item saved');
  });
}

function renderClientTable() {
  const tbody = document.getElementById('client-table');
  tbody.innerHTML = '';
  if (!state.clients.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5">No clients yet.</td>';
    tbody.appendChild(row);
    return;
  }
  state.clients
    .slice()
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .forEach((client) => {
      const invoiceCount = state.invoices.filter((inv) => inv.clientId === client.id).length;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${client.name}</td>
        <td>${client.email || '—'}</td>
        <td>${client.phone || '—'}</td>
        <td>${invoiceCount}</td>
        <td>
          <button class="secondary-btn" data-id="${client.id}">Edit</button>
        </td>
      `;
      row.querySelector('button').addEventListener('click', () => openClientModal(client));
      tbody.appendChild(row);
    });
}

function renderProductTable() {
  const tbody = document.getElementById('product-table');
  tbody.innerHTML = '';
  if (!state.products.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4">No products yet.</td>';
    tbody.appendChild(row);
    return;
  }
  state.products.forEach((product) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.description || '—'}</td>
      <td>${formatCurrency(product.rate)}</td>
      <td><button class="secondary-btn" data-id="${product.id}">Edit</button></td>
    `;
    row.querySelector('button').addEventListener('click', () => openProductModal(product));
    tbody.appendChild(row);
  });
}

function shareUrl() {
  const encoded = encodeURIComponent(JSON.stringify(state));
  const url = `${window.location.origin}${window.location.pathname}?state=${encoded}`;
  navigator.clipboard
    .writeText(url)
    .then(() => showToast('Shareable link copied to clipboard'))
    .catch(() => {
      showToast('Copy failed. URL shown in prompt.');
      alert(url);
    });
}

renderClientTable();
renderProductTable();

function saveClientFromInvoice() {
  if (!currentInvoice.client.name) return;
  const existing = state.clients.find((c) => c.name === currentInvoice.client.name);
  if (!existing) {
    state.clients.push({
      id: crypto.randomUUID(),
      ...currentInvoice.client,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });
    populateClientSelect();
  }
}

function downloadPreview() {
  exportPdf();
}

function shareInvoiceLink() {
  shareUrl();
}

function printInvoice() {
  window.print();
}

function saveInvoice() {
  saveCurrentInvoice();
}

function updateCompanyFromInvoice() {
  state.company = { ...currentInvoice.sender };
  persistState();
}

function updateAfterLoad() {
  populateClientSelect();
  populateProductSelect();
  renderClientTable();
  renderProductTable();
  refreshDashboard();
  renderHistory();
  updatePreview();
}

updateAfterLoad();
