// ═══════════════════════════════════════════
//  SIGOO — app.js
//  Sin autenticación de Google; todo en Netlify (frontend estático)
// ═══════════════════════════════════════════

const API = 'https://sigoo.onrender.com'; // Cambia a tu URL de backend en producción

let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');

// ─── Referencias DOM ───────────────────────
const authSection      = document.getElementById('auth-section');
const dashboard        = document.getElementById('dashboard');
const loginForm        = document.getElementById('login-form');
const registerForm     = document.getElementById('register-form');
const showLoginBtn     = document.getElementById('show-login');
const showRegisterBtn  = document.getElementById('show-register');
const authMessage      = document.getElementById('auth-message');
const logoutBtn        = document.getElementById('logout-btn');
const newOrderForm     = document.getElementById('new-order-form');
const addInventoryForm = document.getElementById('add-inventory-form');

// ═══════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════

/** Muestra un toast temporal */
function toast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 3400);
}

/** Muestra error bajo un campo */
function fieldErr(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
}
function clearFieldErrs(...ids) {
    ids.forEach(id => fieldErr(id, ''));
}

/** Activa / desactiva botón de submit mientras carga */
function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const text    = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled  = loading;
    if (text)    text.style.display    = loading ? 'none'   : '';
    if (spinner) spinner.classList[loading ? 'remove' : 'add']('hidden');
}

/** Muestra / oculta mensaje de auth */
function showAuthMsg(msg, type = 'error') {
    authMessage.textContent = msg;
    authMessage.className = `auth-message ${type}`;
    authMessage.classList.remove('hidden');
}
function hideAuthMsg() {
    authMessage.classList.add('hidden');
}

/** Fetch con Authorization header y manejo de errores */
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    const res  = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Error en la operación');
    }
    return data;
}

/** Convierte estado a clase CSS */
function statusClass(status) {
    return { Recibido: 'recibido', Diagnostico: 'diagnostico', Reparado: 'reparado', Entregado: 'entregado' }[status] || '';
}

// ═══════════════════════════════════════════
//  NAVEGACIÓN ENTRE VISTAS
// ═══════════════════════════════════════════
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('active', v.id === `view-${viewId}`);
    });
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const v = btn.dataset.view;
        switchView(v);
        if (v === 'orders')    loadOrders();
        if (v === 'inventory') loadInventory();
        if (v === 'my-orders') loadClientOrders();
    });
});

// ═══════════════════════════════════════════
//  TOGGLE LOGIN / REGISTRO
// ═══════════════════════════════════════════
showLoginBtn.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    showLoginBtn.classList.add('active');
    showRegisterBtn.classList.remove('active');
    hideAuthMsg();
});
showRegisterBtn.addEventListener('click', () => {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    showRegisterBtn.classList.add('active');
    showLoginBtn.classList.remove('active');
    hideAuthMsg();
});

// ═══════════════════════════════════════════
//  TOGGLE OJO CONTRASEÑA
// ═══════════════════════════════════════════
document.querySelectorAll('.eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
});

// ═══════════════════════════════════════════
//  FORTALEZA DE CONTRASEÑA
// ═══════════════════════════════════════════
document.getElementById('reg-password').addEventListener('input', function () {
    const v = this.value;
    const fill = document.getElementById('strength-fill');
    let score = 0;
    if (v.length >= 6)  score++;
    if (v.length >= 10) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const pct = (score / 5) * 100;
    fill.style.width = pct + '%';
    fill.style.background = score <= 2 ? 'var(--red)' : score <= 3 ? 'var(--orange)' : 'var(--green)';
});

// ═══════════════════════════════════════════
//  1. REGISTRO
// ═══════════════════════════════════════════
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrs('err-reg-name', 'err-reg-email', 'err-reg-password');
    hideAuthMsg();

    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const role     = document.getElementById('reg-role').value;

    // ── Validaciones frontend ──
    let valid = true;
    if (!name || name.length < 2) {
        fieldErr('err-reg-name', 'El nombre debe tener al menos 2 caracteres.');
        valid = false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fieldErr('err-reg-email', 'Ingresa un correo electrónico válido.');
        valid = false;
    }
    if (!password || password.length < 6) {
        fieldErr('err-reg-password', 'La contraseña debe tener al menos 6 caracteres.');
        valid = false;
    }
    if (!valid) return;

    setLoading('register-submit', true);
    try {
        await apiFetch(`${API}/register`, {
            method: 'POST',
            body: JSON.stringify({ name, email, password, role })
        });
        showAuthMsg('✔ Cuenta creada correctamente. Ahora inicia sesión.', 'success');
        registerForm.reset();
        document.getElementById('strength-fill').style.width = '0';
        showLoginBtn.click();
    } catch (err) {
        showAuthMsg(err.message);
    } finally {
        setLoading('register-submit', false);
    }
});

// ═══════════════════════════════════════════
//  2. LOGIN
// ═══════════════════════════════════════════
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrs('err-login-email', 'err-login-password');
    hideAuthMsg();

    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    // ── Validaciones frontend ──
    let valid = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fieldErr('err-login-email', 'Ingresa un correo electrónico válido.');
        valid = false;
    }
    if (!password) {
        fieldErr('err-login-password', 'La contraseña es obligatoria.');
        valid = false;
    }
    if (!valid) return;

    setLoading('login-submit', true);
    try {
        const data = await apiFetch(`${API}/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        token       = data.token;
        currentUser = data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(currentUser));
        showDashboard();
    } catch (err) {
        showAuthMsg(err.message);
    } finally {
        setLoading('login-submit', false);
    }
});

// ═══════════════════════════════════════════
//  CIERRE DE SESIÓN
// ═══════════════════════════════════════════
logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    token = null;
    currentUser = null;
    authSection.classList.remove('hidden');
    dashboard.classList.add('hidden');
    loginForm.reset();
    registerForm.reset();
    hideAuthMsg();
});

// ═══════════════════════════════════════════
//  MOSTRAR DASHBOARD SEGÚN ROL
// ═══════════════════════════════════════════
function showDashboard() {
    authSection.classList.add('hidden');
    dashboard.classList.remove('hidden');

    // Datos del usuario en sidebar
    document.getElementById('user-name').textContent  = currentUser.name;
    document.getElementById('user-role').textContent  = currentUser.role === 'admin' ? 'Administrador' : 'Cliente';
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

    if (currentUser.role === 'admin') {
        document.querySelector('.nav-admin').classList.remove('hidden');
        document.querySelector('.nav-client').classList.add('hidden');
        switchView('orders');
        loadOrders();
    } else {
        document.querySelector('.nav-client').classList.remove('hidden');
        document.querySelector('.nav-admin').classList.add('hidden');
        switchView('my-orders');
        loadClientOrders();
    }
}

// ═══════════════════════════════════════════
//  3. ALTA DE ORDEN (admin)
// ═══════════════════════════════════════════
newOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrs('err-order-client', 'err-order-desc');

    const client_id      = document.getElementById('order-client-id').value.trim();
    const description    = document.getElementById('order-description').value.trim();
    const estimated_cost = parseFloat(document.getElementById('order-cost').value) || 0;
    const feedback       = document.getElementById('new-order-feedback');
    feedback.classList.add('hidden');

    // ── Validaciones frontend ──
    let valid = true;
    if (!client_id || isNaN(parseInt(client_id)) || parseInt(client_id) <= 0) {
        fieldErr('err-order-client', 'Ingresa un ID de cliente válido (número positivo).');
        valid = false;
    }
    if (!description || description.length < 5) {
        fieldErr('err-order-desc', 'La descripción debe tener al menos 5 caracteres.');
        valid = false;
    }
    if (estimated_cost < 0) {
        toast('El presupuesto no puede ser negativo.', 'error');
        valid = false;
    }
    if (!valid) return;

    try {
        const order = await apiFetch(`${API}/orders`, {
            method: 'POST',
            body: JSON.stringify({
                client_id: parseInt(client_id),
                description,
                estimated_cost
            })
        });
        feedback.textContent = `✔ Orden creada con folio ${order.folio}`;
        feedback.className   = 'feedback-box success';
        feedback.classList.remove('hidden');
        newOrderForm.reset();
        setTimeout(() => feedback.classList.add('hidden'), 4000);
        toast(`Folio ${order.folio} generado`, 'success');
    } catch (err) {
        feedback.textContent = err.message;
        feedback.className   = 'feedback-box error';
        feedback.classList.remove('hidden');
    }
});

// ═══════════════════════════════════════════
//  4. CONSULTA DE ÓRDENES (kanban, admin)
// ═══════════════════════════════════════════
async function loadOrders() {
    try {
        const orders = await apiFetch(`${API}/orders`);
        document.querySelectorAll('.card-container').forEach(c => c.innerHTML = '');

        const emptyState = document.getElementById('orders-empty');
        emptyState.classList.toggle('hidden', orders.length > 0);

        orders.forEach(order => {
            const container = document.querySelector(`.card-container[data-status="${order.status}"]`);
            if (!container) return;
            container.appendChild(buildOrderCard(order));
        });
    } catch (err) {
        toast(err.message, 'error');
    }
}

function buildOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    const isAuth    = order.authorized === 1 || order.authorized === true;
    const hasCost   = parseFloat(order.estimated_cost) > 0;

    const nextStatusMap = {
        Recibido: 'Diagnostico',
        Diagnostico: 'Reparado',
        Reparado: 'Entregado'
    };
    const next = nextStatusMap[order.status];

    card.innerHTML = `
        <div class="order-card-folio">${order.folio}</div>
        <div class="order-card-desc">${escapeHtml(order.description)}</div>
        <div class="order-card-meta">
            ${hasCost ? `<span>$${parseFloat(order.estimated_cost).toFixed(2)}</span>` : '<span>Sin presupuesto</span>'}
            <span class="${isAuth ? 'badge-auth' : 'badge-auth badge-pending'}">
                ${isAuth ? '✔ Autorizado' : 'Pendiente auth.'}
            </span>
        </div>
        ${next ? `<button class="btn-advance" onclick="advanceOrder(${order.id}, '${next}')">→ ${next}</button>` : ''}
    `;
    return card;
}

// ═══════════════════════════════════════════
//  5. ACTUALIZACIÓN DE ESTADO (admin)
// ═══════════════════════════════════════════
async function advanceOrder(orderId, newStatus) {
    try {
        await apiFetch(`${API}/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        toast(`Orden actualizada → ${newStatus}`, 'success');
        loadOrders();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ═══════════════════════════════════════════
//  INVENTARIO — Alta
// ═══════════════════════════════════════════
addInventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrs('err-inv-name', 'err-inv-qty');

    const name     = document.getElementById('inv-name').value.trim();
    const qtyRaw   = document.getElementById('inv-qty').value;
    const quantity = parseInt(qtyRaw, 10);

    let valid = true;
    if (!name || name.length < 2) {
        fieldErr('err-inv-name', 'El nombre debe tener al menos 2 caracteres.');
        valid = false;
    }
    if (isNaN(quantity) || quantity < 0) {
        fieldErr('err-inv-qty', 'Ingresa una cantidad válida (0 o mayor).');
        valid = false;
    }
    if (!valid) return;

    try {
        await apiFetch(`${API}/inventory`, {
            method: 'POST',
            body: JSON.stringify({ name, quantity })
        });
        addInventoryForm.reset();
        toast(`"${name}" agregado al inventario`, 'success');
        loadInventory();
    } catch (err) {
        toast(err.message, 'error');
    }
});

// ═══════════════════════════════════════════
//  INVENTARIO — Consulta y Actualización
// ═══════════════════════════════════════════
async function loadInventory() {
    try {
        const items = await apiFetch(`${API}/inventory`);
        const tbody = document.getElementById('inventory-body');
        const empty = document.getElementById('inventory-empty');
        const table = document.getElementById('inventory-table');
        tbody.innerHTML = '';

        if (items.length === 0) {
            empty.classList.remove('hidden');
            table.style.display = 'none';
            return;
        }
        empty.classList.add('hidden');
        table.style.display = '';

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code style="font-family:var(--font-mono);font-size:12px;color:var(--text-3)">${item.id}</code></td>
                <td>${escapeHtml(item.name)}</td>
                <td>
                    <div class="qty-edit">
                        <input
                            type="number" min="0"
                            class="qty-input"
                            id="qty-${item.id}"
                            value="${item.quantity}"
                            aria-label="Cantidad de ${escapeHtml(item.name)}"
                        >
                        <button
                            class="btn-save-qty"
                            onclick="updateInventoryItem(${item.id}, '${escapeHtml(item.name)}')"
                        >Guardar</button>
                    </div>
                </td>
                <td>
                    <span style="font-size:12px;color:${item.quantity === 0 ? 'var(--red)' : 'var(--green)'}; font-weight:600;">
                        ${item.quantity === 0 ? '⚠ Agotado' : '✔ En stock'}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        toast(err.message, 'error');
    }
}

/** Actualiza la cantidad de un producto en inventario */
async function updateInventoryItem(itemId, name) {
    const input   = document.getElementById(`qty-${itemId}`);
    const newQty  = parseInt(input.value, 10);

    if (isNaN(newQty) || newQty < 0) {
        toast('Cantidad inválida. Debe ser 0 o mayor.', 'error');
        return;
    }
    try {
        await apiFetch(`${API}/inventory/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity: newQty })
        });
        toast(`"${name}" actualizado a ${newQty} unidades`, 'success');
        loadInventory();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ═══════════════════════════════════════════
//  MIS ÓRDENES (cliente)
// ═══════════════════════════════════════════
async function loadClientOrders() {
    try {
        const orders    = await apiFetch(`${API}/orders`);
        const container = document.getElementById('client-orders');
        const empty     = document.getElementById('client-empty');
        container.innerHTML = '';

        if (orders.length === 0) {
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        orders.forEach(order => {
            const isAuth  = order.authorized === 1 || order.authorized === true;
            const hasCost = parseFloat(order.estimated_cost) > 0;
            const div     = document.createElement('div');
            div.className = 'client-order-card';

            div.innerHTML = `
                <div class="client-order-main">
                    <div class="client-order-folio">${order.folio}</div>
                    <div class="client-order-desc">${escapeHtml(order.description)}</div>
                    <span class="status-pill ${statusClass(order.status)}">${order.status}</span>
                </div>
                <div class="client-order-side">
                    ${hasCost
                        ? `<div class="cost-amount">$${parseFloat(order.estimated_cost).toFixed(2)}</div>`
                        : `<div class="cost-amount" style="color:var(--text-3);font-size:14px">Sin presupuesto</div>`
                    }
                    ${hasCost && !isAuth
                        ? `<button class="btn-authorize" onclick="authorizeOrder(${order.id})">Autorizar</button>`
                        : isAuth
                            ? `<span style="font-size:12px;color:var(--green);font-weight:600;">✔ Autorizado</span>`
                            : ''
                    }
                </div>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        toast(err.message, 'error');
    }
}

/** Autoriza el presupuesto de una orden (cliente) */
async function authorizeOrder(orderId) {
    try {
        await apiFetch(`${API}/orders/${orderId}/authorize`, { method: 'PUT' });
        toast('Presupuesto autorizado correctamente', 'success');
        loadClientOrders();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ═══════════════════════════════════════════
//  HELPER — escapar HTML
// ═══════════════════════════════════════════
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════
//  AUTO-LOGIN si hay sesión guardada
// ═══════════════════════════════════════════
if (token && currentUser) {
    showDashboard();
} else {
    authSection.classList.remove('hidden');
}