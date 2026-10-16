(() => {
  const STORAGE_KEY = 'wirtwerk-data-v1';
  const ORDER_CATEGORIES = ['Speisen', 'Getränke', 'Dessert', 'Sonstiges'];

  function normalizeCategoryOrder(order) {
    const validOrder = Array.isArray(order) ? order.filter((category) => ORDER_CATEGORIES.includes(category)) : [];
    return [...new Set(validOrder), ...ORDER_CATEGORIES.filter((category) => !validOrder.includes(category))];
  }

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.menu) && Number.isInteger(saved.tableCount)) {
        return {
          menu: saved.menu.filter((item) => !/^m[1-8]$/.test(item.id)),
          tableCount: Math.min(60, Math.max(1, saved.tableCount)),
          categoryOrder: normalizeCategoryOrder(saved.categoryOrder),
          changeCalculatorEnabled: saved.changeCalculatorEnabled !== false,
          orders: saved.orders && typeof saved.orders === 'object' ? saved.orders : {},
          payments: Array.isArray(saved.payments) ? saved.payments : [],
        };
      }
    } catch (error) {
      console.warn('Gespeicherte Daten konnten nicht geladen werden.', error);
    }
    return { menu: [], tableCount: 12, categoryOrder: [...ORDER_CATEGORIES], changeCalculatorEnabled: true, orders: {}, payments: [] };
  }

  const data = loadData();
  const ui = { view: 'tables', selectedTable: null, category: 'Alle', booking: null, checkout: null, resetDialog: false };
  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  let toastTimer;
  let longPressTimer;
  let longPressOrigin;
  let longPressTriggered = false;
  let suppressProductClick = false;

  const euro = (amount) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount || 0);
  const cents = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100);
  const fromCents = (amount) => Math.max(0, amount) / 100;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const tableName = (number) => `Tisch ${number}`;

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function linesFor(number) {
    return Array.isArray(data.orders[number]) ? data.orders[number] : [];
  }

  function normalizeLine(line) {
    const remainingCents = cents(line.remaining);
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const unitsValid = Array.isArray(line.units)
      && line.units.length === quantity
      && line.units.every((amount) => Number.isInteger(amount) && amount >= 0)
      && line.units.reduce((sum, amount) => sum + amount, 0) === remainingCents;
    if (!unitsValid) {
      const base = Math.floor(remainingCents / quantity);
      const extraCents = remainingCents % quantity;
      line.units = Array.from({ length: quantity }, (_, index) => base + (index < extraCents ? 1 : 0));
    }
    line.units = line.units.filter((amount) => amount > 0);
    line.quantity = line.units.length;
    line.remaining = fromCents(line.units.reduce((sum, amount) => sum + amount, 0));
  }

  function openLines(number) {
    return linesFor(number).filter((line) => {
      normalizeLine(line);
      return line.units.length > 0;
    });
  }

  function orderedOpenLines(number) {
    const order = normalizeCategoryOrder(data.categoryOrder);
    const rank = new Map(order.map((category, index) => [category, index]));
    return openLines(number)
      .map((line, index) => ({ line, index }))
      .sort((first, second) => {
        const firstCategory = first.line.category || data.menu.find((item) => item.id === first.line.menuId)?.category || 'Sonstiges';
        const secondCategory = second.line.category || data.menu.find((item) => item.id === second.line.menuId)?.category || 'Sonstiges';
        return (rank.get(firstCategory) ?? order.length) - (rank.get(secondCategory) ?? order.length) || first.index - second.index;
      })
      .map(({ line }) => line);
  }

  function checkoutLines(checkout, open) {
    const allSelected = checkout.mode === 'all' || checkout.mode === 'split';
    return open
      .filter((line) => allSelected || checkout.ids.includes(line.id))
      .map((line) => {
        const requested = allSelected ? line.units.length : Number(checkout.quantities?.[line.id] || 1);
        const units = line.units.slice(0, Math.max(1, Math.min(line.units.length, requested)));
        return { ...line, units, quantity: units.length, remaining: fromCents(units.reduce((sum, amount) => sum + amount, 0)) };
      });
  }

  function totalFor(number) {
    return fromCents(openLines(number).reduce((sum, line) => sum + cents(line.remaining), 0));
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function openBooking(itemId) {
    if (!data.menu.some((item) => item.id === itemId)) return;
    ui.booking = { itemId };
    render();
    document.querySelector('#booking-comment')?.focus();
  }

  function bookItem(product, comment = '') {
    if (!product || !ui.selectedTable) return;
    openLines(ui.selectedTable);
    const lines = linesFor(ui.selectedTable);
    const priceCents = cents(product.price);
    const existing = lines.find((line) => line.menuId === product.id
      && (line.comment || '') === comment
      && line.units.length > 0
      && line.units.every((amount) => amount === priceCents));
    if (existing) {
      existing.units.push(priceCents);
      existing.quantity = existing.units.length;
      existing.remaining = fromCents(existing.units.reduce((sum, amount) => sum + amount, 0));
    } else {
        lines.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, menuId: product.id, name: product.name, price: Number(product.price), category: product.category || 'Sonstiges', quantity: 1, remaining: Number(product.price), units: [priceCents], comment });
    }
    data.orders[ui.selectedTable] = lines;
    save();
    render();
    notify(`${product.name} zu ${tableName(ui.selectedTable)} hinzugefügt.`);
  }

  function render() {
    const dailyRevenue = data.payments
      .filter((payment) => new Date(payment.at).toDateString() === new Date().toDateString())
      .reduce((sum, payment) => sum + Number(payment.amount || 0) + Number(payment.tip || 0), 0);

    app.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <a class="brand" href="#tische" data-view="tables" aria-label="Wirtwerk Startseite">
            <span class="brand-mark" aria-hidden="true">w.</span>
            <span class="brand-copy"><strong>Wirtwerk</strong><small>Tischabrechnung</small></span>
          </a>
          <div class="topbar-meta"><span class="service-pill"><i></i> Service läuft</span><span class="daily-total"><small>Heute abgerechnet</small><strong>${euro(dailyRevenue)}</strong></span></div>
        </header>
        <main class="main-content">
          ${ui.view === 'settings' ? renderSettings() : renderTables()}
        </main>
        <nav class="bottom-nav" aria-label="Hauptnavigation">
          <button class="nav-item ${ui.view === 'tables' ? 'active' : ''}" data-view="tables"><span class="nav-icon">▦</span><span>Tische</span></button>
          <button class="nav-item ${ui.view === 'settings' ? 'active' : ''}" data-view="settings"><span class="nav-icon">⚙</span><span>Einstellungen</span></button>
        </nav>
        ${ui.booking ? renderBooking() : ''}
        ${ui.checkout ? renderCheckout() : ''}
        ${ui.resetDialog ? renderResetDialog() : ''}
      </div>`;
  }

  function renderResetDialog() {
    return `<div class="modal-backdrop reset-backdrop" data-action="reset-backdrop"><form id="reset-form" class="checkout-modal reset-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div class="modal-top"><div><p class="eyebrow reset-eyebrow">ACHTUNG · NICHT RÜCKGÄNGIG</p><h2 id="reset-title">Tagesdaten zurücksetzen?</h2></div><button class="close-button" type="button" data-action="cancel-reset" aria-label="Schließen">×</button></div>
      <p class="reset-description">Alle offenen Artikel auf sämtlichen Tischen und alle heutigen Abrechnungen inklusive Trinkgeld werden gelöscht. Speisekarte, Tischanzahl und Einstellungen bleiben erhalten.</p>
      <label class="field-label" for="reset-password">Passwort · heutiger Wochentag</label>
      <input id="reset-password" name="resetPassword" class="checkout-input" type="password" autocomplete="off" autocapitalize="words" required placeholder="Wochentag eingeben" />
      <div class="modal-actions"><button class="secondary-button" type="button" data-action="cancel-reset">Abbrechen</button><button class="danger-button" type="submit">Alles zurücksetzen</button></div>
    </form></div>`;
  }

  function renderBooking() {
    const item = data.menu.find((entry) => entry.id === ui.booking?.itemId);
    if (!item) return '';
    return `<div class="modal-backdrop" data-action="booking-backdrop"><form id="booking-form" class="checkout-modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <div class="modal-top"><div><p class="eyebrow">${tableName(ui.selectedTable).toUpperCase()} · NEUE BUCHUNG</p><h2 id="booking-title">${escapeHtml(item.name)}</h2></div><button class="close-button" type="button" data-action="cancel-booking" aria-label="Schließen">×</button></div>
      <p class="booking-price">${euro(item.price)} <span>pro Portion</span></p>
      <label class="field-label" for="booking-comment">Besonderheiten oder Wünsche <span>(optional)</span></label>
      <textarea id="booking-comment" name="comment" class="checkout-input booking-comment" maxlength="140" rows="3" placeholder="z. B. ohne Zwiebeln, Schorle mit stillem Wasser"></textarea>
      <small class="comment-hint">Der Kommentar erscheint direkt beim offenen Posten.</small>
      <div class="modal-actions"><button class="secondary-button" type="button" data-action="cancel-booking">Abbrechen</button><button class="primary-button" type="submit">Artikel buchen <span aria-hidden="true">→</span></button></div>
    </form></div>`;
  }

  function renderTables() {
    if (ui.selectedTable) return renderTableDetail(ui.selectedTable);
    const cards = Array.from({ length: data.tableCount }, (_, index) => {
      const number = index + 1;
      const due = totalFor(number);
      const orderCount = openLines(number).length;
      return `<button class="table-card ${due ? 'has-order' : ''}" data-table="${number}">
        <span class="table-card-top"><span class="table-number">${String(number).padStart(2, '0')}</span><span class="table-status ${due ? 'occupied' : ''}">${due ? 'Offen' : 'Frei'}</span></span>
        <strong>${tableName(number)}</strong>
        <span class="table-card-bottom"><span>${due ? `${orderCount} offene ${orderCount === 1 ? 'Position' : 'Positionen'}` : 'Noch keine Buchung'}</span><b>${due ? euro(due) : '–'}</b></span>
      </button>`;
    }).join('');
    return `<section class="page-heading"><div><p class="eyebrow">ÜBERSICHT</p><h1>Guten Dienst.</h1><p class="heading-subtitle">Wähle einen Tisch, um Bestellungen zu buchen oder abzurechnen.</p></div><div class="heading-stat"><span class="stat-dot"></span><span>${Array.from({ length: data.tableCount }, (_, i) => totalFor(i + 1) > 0).filter(Boolean).length} Tische mit offenen Posten</span></div></section>
      <section class="table-section"><div class="section-heading"><div><h2>Alle Tische</h2><span>${data.tableCount} Tische · Tippen zum Öffnen</span></div><button class="text-button" data-view="settings">Tische verwalten <span aria-hidden="true">↗</span></button></div><div class="table-grid">${cards}</div></section>`;
  }

  function renderTableDetail(number) {
    const open = orderedOpenLines(number);
    const categories = ['Alle', ...new Set(data.menu.map((item) => item.category || 'Sonstiges'))];
    const shownMenu = data.menu.filter((item) => ui.category === 'Alle' || item.category === ui.category);
    const productCards = shownMenu.map((item) => `<div class="product-card">
      <button class="product-quick-area" type="button" data-add-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} direkt buchen">
        <span class="product-category">${escapeHtml(item.category || 'Sonstiges')}</span><strong>${escapeHtml(item.name)}</strong>
        <span class="product-card-bottom"><b>${euro(item.price)}</b><span class="add-action"><span class="add-symbol" aria-hidden="true">+</span><span>Direkt</span></span></span>
      </button>
      <button class="product-note-button" type="button" data-add-note="${escapeHtml(item.id)}" aria-label="Kommentar für ${escapeHtml(item.name)} hinzufügen"><span aria-hidden="true">✎</span> Mit Notiz</button>
    </div>`).join('');
    const lineRows = open.map((line) => `<div class="order-row">
      <input type="checkbox" class="line-select" value="${escapeHtml(line.id)}" aria-label="${escapeHtml(line.name)} zur Abrechnung auswählen" />
      <span class="order-copy"><strong>${escapeHtml(line.name)}</strong><small>${line.quantity} × ${euro(line.price)}${cents(line.remaining) < cents(line.price * line.quantity) ? ` · Restwert ${euro(line.remaining)}` : ''}</small>${line.comment ? `<span class="order-comment">${escapeHtml(line.comment)}</span>` : ''}</span>
      ${line.quantity > 1 ? `<label class="order-select-count" hidden>Anzahl <input class="line-select-quantity" type="number" min="1" max="${line.quantity}" value="1" aria-label="Anzahl ${escapeHtml(line.name)} zur Abrechnung" /></label>` : ''}
      <b class="order-price">${euro(line.remaining)}</b>
      <button class="cancel-line-button" type="button" data-cancel-line="${escapeHtml(line.id)}" aria-label="Eine Portion ${escapeHtml(line.name)} stornieren" title="Eine Portion stornieren">×</button>
    </div>`).join('');
    return `<div class="detail-top"><button class="back-button" data-action="back"><span aria-hidden="true">←</span> Alle Tische</button><span class="date-label">${new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span></div>
      <section class="table-title-row"><div><p class="eyebrow">TISCHÜBERSICHT</p><h1>${tableName(number)}</h1><p class="heading-subtitle">Bestellungen direkt am Tisch ergänzen.</p></div><span class="table-badge ${open.length ? 'badge-open' : ''}"><i></i>${open.length ? 'Offen' : 'Noch frei'}</span></section>
      <div class="detail-layout">
        <section class="menu-panel"><div class="section-heading"><div><h2>Speisekarte</h2><span>Antippen zum Buchen · Notiz per Stift oder Langdruck</span></div><button class="icon-button" data-view="settings" aria-label="Speisekarte bearbeiten">⚙</button></div>
          <div class="category-tabs">${categories.map((category) => `<button class="category-tab ${category === ui.category ? 'selected' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('')}</div>
          <div class="product-grid">${productCards || `<div class="empty-menu">Noch keine Artikel in der Speisekarte.<br /><button class="text-button" data-view="settings">Jetzt Artikel konfigurieren →</button></div>`}</div>
        </section>
        <aside class="bill-panel"><div class="bill-heading"><div><p class="eyebrow">LAUFENDER BON</p><h2>Offene Posten</h2></div><span class="item-count">${open.length}</span></div>
          ${open.length ? `<div class="order-list">${lineRows}</div>` : `<div class="empty-order"><span class="empty-icon">＋</span><strong>Der Bon ist noch leer</strong><p>${data.menu.length ? 'Buche Speisen und Getränke über die Karte.' : 'Lege zuerst Artikel in den Einstellungen an.'}</p></div>`}
          <div class="bill-footer"><div class="bill-total"><span>Offener Betrag</span><strong>${euro(totalFor(number))}</strong></div>
            <button class="primary-button full-width" data-checkout="all" ${open.length ? '' : 'disabled'}><span>Alles abrechnen</span><span aria-hidden="true">→</span></button>
            <div class="secondary-actions"><button class="secondary-button" data-checkout="selected" ${open.length ? '' : 'disabled'}>Auswahl abrechnen</button><button class="secondary-button" data-checkout="split" ${open.length ? '' : 'disabled'}>Betrag teilen</button></div>
            <p class="bill-hint">Posten markieren; bei mehreren Stück kannst du die Auswahlmenge setzen.</p>
          </div>
        </aside>
      </div>`;
  }

  function renderSettings() {
    const menuRows = data.menu.map((item) => `<form class="menu-edit-row" data-edit-item="${escapeHtml(item.id)}">
      <label class="edit-name"><span>Name</span><input name="name" value="${escapeHtml(item.name)}" maxlength="50" required /></label>
      <label class="edit-price"><span>Preis (€)</span><input name="price" type="number" min="0.01" max="9999" step="0.01" value="${Number(item.price).toFixed(2)}" required /></label>
      <label class="edit-category"><span>Bereich</span><select name="category">${['Speisen', 'Getränke', 'Dessert', 'Sonstiges'].map((category) => `<option ${item.category === category ? 'selected' : ''}>${category}</option>`).join('')}</select></label>
      <button class="save-item-button" type="submit" aria-label="${escapeHtml(item.name)} speichern">Speichern</button>
      <button class="delete-item-button" type="button" data-delete-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} löschen">×</button>
    </form>`).join('');
    return `<section class="page-heading settings-heading"><div><p class="eyebrow">KONFIGURATION</p><h1>Einstellungen</h1><p class="heading-subtitle">Passe Tische, Speisekarte und Abrechnung an deinen Betrieb an.</p></div></section>
      <div class="settings-layout">
        <section class="settings-card table-config"><div class="card-title"><span class="settings-icon">▦</span><div><h2>Tischanzahl</h2><p>Lege fest, wie viele Tische im Service angezeigt werden.</p></div></div>
          <form id="table-count-form" class="table-count-form"><label for="table-count">Anzahl Tische</label><div class="input-action"><input id="table-count" name="tableCount" type="number" min="1" max="60" value="${data.tableCount}" required /><button class="primary-button" type="submit">Übernehmen</button></div><small>Zwischen 1 und 60 Tischen</small></form>
        </section>
        <section class="settings-card category-order-config"><div class="card-title"><span class="settings-icon">↕</span><div><h2>Reihenfolge auf dem Bon</h2><p>Lege fest, in welcher Reihenfolge Speisen und Getränke im laufenden Bon erscheinen.</p></div></div>
          <ol class="category-order-list">${normalizeCategoryOrder(data.categoryOrder).map((category, index, order) => `<li class="category-order-item"><span class="category-order-position">${index + 1}</span><strong>${category}</strong><div class="category-order-actions"><button class="order-move-button" type="button" data-move-category="${category}" data-direction="up" aria-label="${category} nach oben verschieben" ${index === 0 ? 'disabled' : ''}>↑</button><button class="order-move-button" type="button" data-move-category="${category}" data-direction="down" aria-label="${category} nach unten verschieben" ${index === order.length - 1 ? 'disabled' : ''}>↓</button></div></li>`).join('')}</ol>
        </section>
        <section class="settings-card change-config"><div class="card-title"><span class="settings-icon">€</span><div><h2>Wechselgeld- und Trinkgeldrechner</h2><p>Kundenbetrag inklusive Trinkgeld sowie erhaltenes Bargeld eingeben; Trinkgeld und Rückgeld werden getrennt berechnet.</p></div></div>
          <label class="switch-row"><span><strong>Rechner in der Abrechnung anzeigen</strong><small>Kann jederzeit ein- oder ausgeschaltet werden.</small></span><input id="change-toggle" type="checkbox" role="switch" ${data.changeCalculatorEnabled ? 'checked' : ''} /><span class="switch-track" aria-hidden="true"></span></label>
        </section>
        <section class="settings-card reset-config"><div class="card-title"><span class="settings-icon reset-icon">!</span><div><h2>Tagesdaten zurücksetzen</h2><p>Löscht offene Artikel von allen Tischen und die heutigen Abrechnungen. Speisekarte und Tischanzahl bleiben erhalten.</p></div></div>
          <button class="danger-button reset-open-button" type="button" data-action="open-reset">Reset öffnen</button>
          <small class="reset-password-hint">Der heutige Wochentag wird als einfache Bestätigung gegen versehentliches Zurücksetzen verlangt.</small>
        </section>
        <section class="settings-card menu-config"><div class="section-heading"><div><h2>Speisekarte</h2><span>${data.menu.length} Artikel in deiner Karte</span></div><span class="menu-count">${data.menu.length}</span></div>
          <div class="menu-list">${menuRows || '<div class="empty-menu">Noch keine Artikel angelegt.</div>'}</div>
          <form id="new-item-form" class="new-item-form"><h3>Artikel hinzufügen</h3><div class="new-item-fields"><label><span>Name</span><input name="name" placeholder="z. B. Tagesgericht" maxlength="50" required /></label><label><span>Preis (€)</span><input name="price" type="number" min="0.01" max="9999" step="0.01" placeholder="0,00" required /></label><label><span>Bereich</span><select name="category"><option>Speisen</option><option>Getränke</option><option>Dessert</option><option>Sonstiges</option></select></label><button class="primary-button" type="submit">+ Artikel anlegen</button></div></form>
        </section>
        <p class="privacy-note"><span aria-hidden="true">⌑</span> Deine Daten werden nur auf diesem Gerät gespeichert.</p>
      </div>`;
  }

  function renderCheckout() {
    const checkout = ui.checkout;
    const allOpen = orderedOpenLines(ui.selectedTable);
    const selected = checkoutLines(checkout, allOpen);
    const payableCents = selected.reduce((sum, line) => sum + cents(line.remaining), 0);
    const parts = Math.max(1, Number(checkout.parts) || 1);
    const amountCents = checkout.mode === 'split' ? Math.ceil(payableCents / parts) : payableCents;
    const amount = checkout.mode === 'amount' ? Number(checkout.amount) : fromCents(amountCents);
    const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    const changeEnabled = data.changeCalculatorEnabled;
    const tendered = Number(checkout.tendered) || 0;
    const customerTotalInput = Number(checkout.customerTotal);
    const customerTotal = checkout.customerTotal !== '' && Number.isFinite(customerTotalInput)
      ? Math.max(cents(safeAmount), cents(customerTotalInput))
      : cents(safeAmount);
    const tip = fromCents(customerTotal - cents(safeAmount));
    const change = Math.max(0, cents(tendered) - customerTotal) / 100;
    const isValid = safeAmount > 0 && cents(safeAmount) <= payableCents && (!changeEnabled || cents(tendered) >= customerTotal);
    const modeLabel = checkout.mode === 'all' ? 'Alles abrechnen' : checkout.mode === 'split' ? 'Betrag teilen' : checkout.mode === 'amount' ? 'Teilbetrag abrechnen' : 'Auswahl abrechnen';
    return `<div class="modal-backdrop" data-action="backdrop"><section class="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabindex="-1">
      <div class="modal-top"><div><p class="eyebrow">${tableName(ui.selectedTable).toUpperCase()}</p><h2 id="checkout-title">${modeLabel}</h2></div><button class="close-button" data-action="close-checkout" aria-label="Schließen">×</button></div>
      <div class="checkout-items">${selected.map((line) => `<div class="checkout-line"><span>${escapeHtml(line.name)} <small>${line.quantity} × ${euro(line.price)}</small>${line.comment ? `<small class="checkout-comment">${escapeHtml(line.comment)}</small>` : ''}</span><b>${euro(line.remaining)}</b></div>`).join('') || '<p class="no-selection">Keine offenen Posten ausgewählt.</p>'}</div>
      <div class="checkout-total"><span>${checkout.mode === 'split' ? `Anteil · ${parts} offene ${parts === 1 ? 'Person' : 'Personen'}` : 'Zu zahlen'}</span><strong>${euro(safeAmount)}</strong></div>
      <div class="checkout-controls">
        ${checkout.mode === 'split' ? `<label class="field-label" for="split-parts">In wie viele gleiche Anteile teilen?</label><input id="split-parts" class="checkout-input" type="number" min="1" max="99" value="${parts}" />` : ''}
        <button class="mode-switch" data-checkout-mode="amount">Teilbetrag eingeben <span aria-hidden="true">→</span></button>
        ${checkout.mode === 'amount' ? `<label class="field-label" for="custom-amount">Teilbetrag (€)</label><input id="custom-amount" class="checkout-input" type="number" min="0.01" max="${(payableCents / 100).toFixed(2)}" step="0.01" value="${Number(checkout.amount || payableCents / 100).toFixed(2)}" />` : ''}
        ${changeEnabled ? `<div class="change-box"><label class="field-label" for="customer-total">Kunde sagt (inkl. Trinkgeld, €)</label><input id="customer-total" class="checkout-input" type="number" min="${safeAmount.toFixed(2)}" step="0.01" placeholder="z. B. ${euro(safeAmount)}" value="${checkout.customerTotal || ''}" /><small class="cash-hint">Zum Beispiel „20 €“ bei einem offenen Betrag von 18 €: 2 € Trinkgeld.</small><div class="tip-result"><span>Enthaltenes Trinkgeld</span><strong>${euro(tip)}</strong></div><label class="field-label cash-received-label" for="cash-tendered">Bargeld tatsächlich erhalten (€)</label><input id="cash-tendered" class="checkout-input" type="number" min="0" step="0.01" placeholder="Gegebenen Betrag eingeben" value="${checkout.tendered || ''}" /><div class="change-result"><span>Rückgeld</span><strong>${euro(change)}</strong></div></div>` : ''}
      </div>
      <div class="modal-actions"><button class="secondary-button" data-action="close-checkout">Abbrechen</button><button class="primary-button" data-action="confirm-payment" ${isValid ? '' : 'disabled'}>Zahlung buchen <span aria-hidden="true">→</span></button></div>
      ${checkout.mode !== 'all' ? '<p class="modal-footnote">Der Restbetrag bleibt am Tisch offen und kann später abgerechnet werden.</p>' : ''}
    </section></div>`;
  }

  function openCheckout(mode) {
    const checkedRows = Array.from(document.querySelectorAll('.line-select:checked'));
    const selectedIds = checkedRows.map((input) => input.value);
    if (mode === 'selected' && selectedIds.length === 0) return notify('Markiere zuerst mindestens einen offenen Posten.');
    const open = orderedOpenLines(ui.selectedTable);
    const initialLines = mode === 'selected' ? open.filter((line) => selectedIds.includes(line.id)) : open;
    const quantities = Object.fromEntries(checkedRows.map((input) => {
      const selectedCount = input.closest('.order-row').querySelector('.line-select-quantity');
      return [input.value, mode === 'selected' ? Number(selectedCount?.value || 1) : open.find((line) => line.id === input.value)?.quantity || 1];
    }));
    if (mode !== 'selected') {
      for (const line of initialLines) quantities[line.id] = line.quantity;
    }
    const selection = { mode, ids: initialLines.map((line) => line.id), quantities };
    const selectedLines = checkoutLines(selection, initialLines);
    const total = fromCents(selectedLines.reduce((sum, line) => sum + cents(line.remaining), 0));
    ui.checkout = { ...selection, parts: 2, amount: total.toFixed(2), customerTotal: '', tendered: '' };
    render();
    document.querySelector('.checkout-modal')?.focus();
  }

  function settlePayment() {
    const checkout = ui.checkout;
    if (!checkout) return;
    const open = orderedOpenLines(ui.selectedTable);
    const selected = checkoutLines(checkout, open);
    const maxCents = selected.reduce((sum, line) => sum + cents(line.remaining), 0);
    let amountCents = checkout.mode === 'amount'
      ? cents(checkout.amount)
      : checkout.mode === 'split'
        ? Math.ceil(maxCents / Math.max(1, Number(checkout.parts) || 1))
        : maxCents;
    if (!Number.isFinite(amountCents) || amountCents < 1 || amountCents > maxCents) return notify('Der Zahlbetrag muss innerhalb der offenen Summe liegen.');
    const customerTotalInput = checkout.customerTotal === '' ? amountCents : cents(checkout.customerTotal);
    if (!Number.isFinite(customerTotalInput)) return notify('Bitte gib einen gültigen Kundenbetrag ein.');
    const customerTotalCents = Math.max(amountCents, customerTotalInput);
    if (data.changeCalculatorEnabled && cents(checkout.tendered) < customerTotalCents) return notify('Das erhaltene Bargeld reicht für den genannten Betrag noch nicht aus.');

    let outstanding = amountCents;
    for (const selectedLine of selected) {
      const line = open.find((entry) => entry.id === selectedLine.id);
      if (!line) continue;
      for (let index = 0; index < selectedLine.units.length && outstanding > 0; index += 1) {
        const applied = Math.min(line.units[index], outstanding);
        line.units[index] -= applied;
        outstanding -= applied;
      }
      line.units = line.units.filter((amount) => amount > 0);
      line.quantity = line.units.length;
      line.remaining = fromCents(line.units.reduce((sum, amount) => sum + amount, 0));
      if (outstanding === 0) break;
    }
    data.payments.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, table: ui.selectedTable, amount: fromCents(amountCents), tip: fromCents(customerTotalCents - amountCents), method: 'Bar', at: new Date().toISOString() });
    save();
    ui.checkout = null;
    notify(`${euro(fromCents(amountCents))} für ${tableName(ui.selectedTable)} gebucht.`);
    render();
  }

  document.addEventListener('pointerdown', (event) => {
    const quickButton = event.target.closest('.product-quick-area');
    if (!quickButton) return;
    longPressTriggered = false;
    longPressOrigin = { x: event.clientX, y: event.clientY };
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressOrigin = null;
      longPressTriggered = true;
      suppressProductClick = true;
      openBooking(quickButton.dataset.addItem);
    }, 550);
  });

  const cancelLongPress = () => {
    const openedNote = longPressTriggered;
    clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressOrigin = null;
    if (openedNote) {
      setTimeout(() => {
        longPressTriggered = false;
        suppressProductClick = false;
      }, 0);
    }
  };
  document.addEventListener('pointerup', cancelLongPress);
  document.addEventListener('pointercancel', cancelLongPress);
  document.addEventListener('pointermove', (event) => {
    if (!longPressTimer || !longPressOrigin) return;
    if (Math.hypot(event.clientX - longPressOrigin.x, event.clientY - longPressOrigin.y) > 12) cancelLongPress();
  });
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.product-quick-area')) event.preventDefault();
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a, .modal-backdrop');
    if (!target) return;
    if (suppressProductClick && target.matches('.product-quick-area')) {
      event.preventDefault();
      longPressTriggered = false;
      suppressProductClick = false;
      return;
    }
    if (target.dataset.view) {
      ui.booking = null;
      ui.resetDialog = false;
      ui.view = target.dataset.view;
      ui.selectedTable = null;
      ui.category = 'Alle';
      render();
    } else if (target.dataset.table) {
      ui.selectedTable = Number(target.dataset.table);
      ui.category = 'Alle';
      render();
    } else if (target.dataset.action === 'back' || target.dataset.action === 'close-checkout') {
      if (target.dataset.action === 'close-checkout') ui.checkout = null;
      else ui.selectedTable = null;
      render();
    } else if (target.dataset.action === 'cancel-booking' || (target.dataset.action === 'booking-backdrop' && event.target === target)) {
      ui.booking = null;
      render();
    } else if (target.dataset.action === 'open-reset') {
      ui.resetDialog = true;
      render();
      document.querySelector('#reset-password')?.focus();
    } else if (target.dataset.action === 'cancel-reset' || (target.dataset.action === 'reset-backdrop' && event.target === target)) {
      ui.resetDialog = false;
      render();
    } else if (target.dataset.action === 'backdrop' && event.target === target) {
      ui.checkout = null;
      render();
    } else if (target.dataset.addItem) {
      const product = data.menu.find((item) => item.id === target.dataset.addItem);
      bookItem(product);
    } else if (target.dataset.addNote) {
      openBooking(target.dataset.addNote);
    } else if (target.dataset.category) {
      ui.category = target.dataset.category;
      render();
    } else if (target.dataset.checkout) {
      openCheckout(target.dataset.checkout);
    } else if (target.dataset.checkoutMode) {
      if (!ui.checkout) return;
      const mode = target.dataset.checkoutMode;
      ui.checkout.mode = mode;
      if (mode === 'amount') ui.checkout.amount = Number(ui.checkout.amount || totalFor(ui.selectedTable)).toFixed(2);
      render();
    } else if (target.dataset.action === 'confirm-payment') {
      settlePayment();
    } else if (target.dataset.moveCategory) {
      const order = normalizeCategoryOrder(data.categoryOrder);
      const index = order.indexOf(target.dataset.moveCategory);
      const nextIndex = index + (target.dataset.direction === 'up' ? -1 : 1);
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      data.categoryOrder = order;
      save();
      render();
      notify('Bon-Reihenfolge gespeichert.');
    } else if (target.dataset.cancelLine) {
      const line = linesFor(ui.selectedTable).find((entry) => entry.id === target.dataset.cancelLine);
      if (!line) return;
      normalizeLine(line);
      if (!confirm(`Eine Portion „${line.name}“${line.quantity > 1 ? ` (von ${line.quantity})` : ''} auf ${tableName(ui.selectedTable)} stornieren?`)) return;
      line.units.pop();
      line.quantity = line.units.length;
      line.remaining = fromCents(line.units.reduce((sum, amount) => sum + amount, 0));
      save();
      render();
      notify(`Eine Portion ${line.name} wurde storniert.`);
    } else if (target.dataset.deleteItem) {
      const itemId = target.dataset.deleteItem;
      const inUse = Object.values(data.orders).flat().some((line) => line.menuId === itemId && cents(line.remaining) > 0);
      if (inUse) return notify('Artikel mit offenen Buchungen können nicht gelöscht werden.');
      const item = data.menu.find((entry) => entry.id === itemId);
      if (!item || !confirm(`„${item.name}“ wirklich aus der Speisekarte entfernen?`)) return;
      data.menu = data.menu.filter((entry) => entry.id !== itemId);
      save(); render(); notify('Artikel entfernt.');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ui.resetDialog) {
      ui.resetDialog = false;
      render();
      return;
    }
    if (event.key === 'Escape' && ui.booking) {
      ui.booking = null;
      render();
      return;
    }
    if (event.key === 'Escape' && ui.checkout) {
      ui.checkout = null;
      render();
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!ui.checkout) return;
    if (target.id === 'split-parts') {
      ui.checkout.parts = Math.max(1, Number(target.value) || 1);
      const partsLabel = document.querySelector('.checkout-total span');
      if (partsLabel) partsLabel.textContent = `Anteil · ${ui.checkout.parts} offene ${ui.checkout.parts === 1 ? 'Person' : 'Personen'}`;
      updateCheckoutSummary();
    } else if (target.id === 'custom-amount') {
      ui.checkout.amount = target.value;
      updateCheckoutSummary();
    } else if (target.id === 'customer-total') {
      ui.checkout.customerTotal = target.value;
      updateCheckoutSummary();
    } else if (target.id === 'cash-tendered') {
      ui.checkout.tendered = target.value;
      updateCheckoutSummary();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('.line-select')) {
      const row = event.target.closest('.order-row');
      const count = row.querySelector('.order-select-count');
      if (count) count.hidden = !event.target.checked;
      row.classList.toggle('is-selected', event.target.checked);
    } else if (event.target.matches('.line-select-quantity')) {
      const max = Number(event.target.max) || 1;
      event.target.value = String(Math.max(1, Math.min(max, Number(event.target.value) || 1)));
    } else if (event.target.id === 'change-toggle') {
      data.changeCalculatorEnabled = event.target.checked;
      save(); render();
      notify(`Wechselgeldrechner ${data.changeCalculatorEnabled ? 'aktiviert' : 'deaktiviert'}.`);
    }
  });

  function updateCheckoutSummary() {
    const modal = document.querySelector('.checkout-modal');
    if (!modal || !ui.checkout) return;
    const display = modal.querySelector('.checkout-total strong');
    const tipOutput = modal.querySelector('.tip-result strong');
    const changeOutput = modal.querySelector('.change-result strong');
    const open = orderedOpenLines(ui.selectedTable);
    const selected = checkoutLines(ui.checkout, open);
    const due = selected.reduce((sum, line) => sum + cents(line.remaining), 0);
    const amount = ui.checkout.mode === 'amount' ? Number(ui.checkout.amount) : ui.checkout.mode === 'split' ? fromCents(Math.ceil(due / Math.max(1, Number(ui.checkout.parts) || 1))) : fromCents(due);
    const amountCents = cents(amount);
    const statedInput = ui.checkout.customerTotal === '' ? amountCents : cents(ui.checkout.customerTotal);
    const customerTotalCents = Math.max(amountCents, statedInput);
    if (display) display.textContent = euro(amount);
    if (tipOutput) tipOutput.textContent = euro(fromCents(customerTotalCents - amountCents));
    if (changeOutput) changeOutput.textContent = euro(Math.max(0, cents(ui.checkout.tendered) - customerTotalCents) / 100);
    const button = modal.querySelector('[data-action="confirm-payment"]');
    if (button) button.disabled = !(Number.isFinite(amountCents) && Number.isFinite(customerTotalCents) && amount > 0 && amountCents <= due && (!data.changeCalculatorEnabled || cents(ui.checkout.tendered) >= customerTotalCents));
  }

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'reset-form') {
      event.preventDefault();
      const password = String(new FormData(event.target).get('resetPassword') || '').trim();
      const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(new Date());
      if (password.normalize('NFC').toLocaleLowerCase('de-DE') !== weekday.normalize('NFC').toLocaleLowerCase('de-DE')) {
        notify('Passwort nicht korrekt. Gib den heutigen Wochentag ein.');
        const passwordInput = event.target.querySelector('#reset-password');
        passwordInput.value = '';
        passwordInput.focus();
        return;
      }
      const today = new Date().toDateString();
      data.orders = {};
      data.payments = data.payments.filter((payment) => new Date(payment.at).toDateString() !== today);
      save();
      ui.selectedTable = null;
      ui.resetDialog = false;
      render();
      notify('Alle offenen Tischposten und heutigen Abrechnungen wurden zurückgesetzt.');
    } else if (event.target.id === 'booking-form') {
      event.preventDefault();
      const product = data.menu.find((item) => item.id === ui.booking?.itemId);
      if (!product || !ui.selectedTable) return;
      const comment = String(new FormData(event.target).get('comment') || '').trim();
      ui.booking = null;
      bookItem(product, comment);
    } else if (event.target.id === 'new-item-form') {
      event.preventDefault();
      const form = new FormData(event.target);
      const name = String(form.get('name') || '').trim();
      const price = Number(form.get('price'));
      if (!name || !Number.isFinite(price) || price <= 0) return notify('Bitte Name und einen gültigen Preis eingeben.');
      data.menu.push({ id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, price: Math.round(price * 100) / 100, category: String(form.get('category')) });
      save(); render(); notify(`${name} zur Speisekarte hinzugefügt.`);
    } else if (event.target.id === 'table-count-form') {
      event.preventDefault();
      const count = Number(new FormData(event.target).get('tableCount'));
      if (!Number.isInteger(count) || count < 1 || count > 60) return notify('Bitte eine Tischanzahl zwischen 1 und 60 eingeben.');
      const removedOpen = Array.from({ length: data.tableCount }, (_, index) => index + 1).some((number) => number > count && totalFor(number) > 0);
      if (removedOpen) return notify('Bitte rechne zuerst die offenen Posten auf den wegfallenden Tischen ab.');
      data.tableCount = count;
      save(); render(); notify(`Tischanzahl auf ${count} gesetzt.`);
    } else if (event.target.matches('[data-edit-item]')) {
      event.preventDefault();
      const form = event.target;
      const item = data.menu.find((entry) => entry.id === form.dataset.editItem);
      const values = new FormData(form);
      const name = String(values.get('name') || '').trim();
      const price = Number(values.get('price'));
      if (!item || !name || !Number.isFinite(price) || price <= 0) return notify('Bitte Name und einen gültigen Preis eingeben.');
      item.name = name;
      item.price = Math.round(price * 100) / 100;
      item.category = String(values.get('category'));
      save(); render(); notify('Artikel gespeichert.');
    }
  });

  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Offline-Modus konnte nicht aktiviert werden.', error)));
  }
})();
