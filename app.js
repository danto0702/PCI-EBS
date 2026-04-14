// ============================================================
// PCI APP · app.js v3.0
// ESE Hospital Regional Noroccidental
// Toda la lógica de autenticación y usuarios pasa por GAS
// ============================================================
'use strict';

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const GAS_URL     = 'https://script.google.com/macros/s/AKfycbw5qIea5dvWcb_bJmNXOyvDb0cYCYSoW_qcgHdsGuwQ-2HAm7thdOXJP5MPQfoXXIMOuA/exec';
const STORAGE_KEY = 'pci_pendientes';   // registros offline
const SESSION_KEY = 'pci_session';      // sesión activa (sessionStorage)

// ─── SERVICE WORKER ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(r => console.log('[SW] Registrado:', r.scope))
      .catch(e => console.warn('[SW] Error:', e));
  });
}

// ─── HASH SHA-256 (Web Crypto nativa) ────────────────────────
async function hashPwd(pwd) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── PETICIONES AL BACKEND GAS ───────────────────────────────
// GAS con mode:'no-cors' no devuelve JSON legible, por eso
// usamos mode:'cors' para GET y para POST necesitamos el truco
// de enviar como form-encoded o aceptar opaque response.
// La solución estándar para GAS es usar fetch con redirect:'follow'.

async function gasPost(payload) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' }, // GAS acepta text/plain y lo parsea
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function gasGet(params) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${GAS_URL}?${qs}`, { redirect: 'follow' });
  return res.json();
}

// ─── SESIÓN ───────────────────────────────────────────────────
function getSession()      { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
function setSession(u)     { sessionStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
function clearSession()    { sessionStorage.removeItem(SESSION_KEY); }

// ═══════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════

document.getElementById('form-login').addEventListener('submit', async function (e) {
  e.preventDefault();
  const usrVal = document.getElementById('login-usuario').value.trim();
  const pwdVal = document.getElementById('login-password').value;
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('btn-login');

  errEl.classList.add('hidden');
  btn.innerHTML = '<div class="spinner"></div>&nbsp;Verificando...';
  btn.disabled  = true;

  try {
    const hash = await hashPwd(pwdVal);
    const data = await gasPost({ action: 'login', usuario: usrVal, passwordHash: hash });

    if (!data.ok) {
      errEl.textContent = data.error || 'Credenciales incorrectas';
      errEl.classList.remove('hidden');
      btn.innerHTML = 'Ingresar';
      btn.disabled  = false;
      return;
    }

    // Guardar el hash en la sesión para usarlo como token en peticiones admin
    const sesion = { ...data.usuario, _hash: hash };
    setSession(sesion);
    mostrarApp(sesion);

  } catch (err) {
    console.error(err);
    errEl.textContent = 'No se pudo conectar con el servidor. Verifique la URL del backend.';
    errEl.classList.remove('hidden');
    btn.innerHTML = 'Ingresar';
    btn.disabled  = false;
  }
});

function logout() {
  clearSession();
  document.getElementById('view-app').classList.remove('active');
  document.getElementById('view-login').classList.add('active');
  document.getElementById('panel-admin').classList.add('hidden');
  document.getElementById('panel-usuario').classList.add('hidden');
  document.getElementById('nav-admin').classList.add('hidden');
  document.getElementById('login-usuario').value  = '';
  document.getElementById('login-password').value = '';
  showToast('Sesión cerrada', 'info');
}

// ─── MOSTRAR APP SEGÚN ROL ────────────────────────────────────
function mostrarApp(usr) {
  document.getElementById('view-login').classList.remove('active');
  document.getElementById('view-app').classList.add('active');
  document.getElementById('header-username').textContent = usr.nombre;
  document.getElementById('header-ebs').textContent =
    usr.rol === 'admin' ? '⚙ Administrador' : `EBS: ${usr.codigoEBS}`;

  if (usr.rol === 'admin') {
    document.getElementById('nav-admin').classList.remove('hidden');
    document.getElementById('panel-admin').classList.remove('hidden');
    document.getElementById('panel-usuario').classList.add('hidden');
    cargarTablaUsuarios();
    poblarSelectoresEBS();
  } else {
    document.getElementById('nav-admin').classList.add('hidden');
    document.getElementById('panel-usuario').classList.remove('hidden');
    document.getElementById('panel-admin').classList.add('hidden');
    document.getElementById('btn-sync').style.display = 'flex';
    document.getElementById('user-ebs-display').textContent = usr.codigoEBS;
    document.getElementById('fecha_atencion').value = hoy();
    actualizarContadores();
  }
}

// ═══════════════════════════════════════════════════════════════
// GESTIÓN DE USUARIOS (Admin)
// ═══════════════════════════════════════════════════════════════

// Token de autenticación admin — usa el hash guardado al hacer login
function adminPayload() {
  const s = getSession();
  if (!s) return {};
  return { _adminId: s.id, _adminToken: s._hash };
}

let _tablaUsuariosCache = [];

async function cargarTablaUsuarios() {
  const tbody = document.getElementById('tabla-usuarios-body');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8"><div class="spinner" style="border-top-color:#0f4c81;border-color:#e2e8f0;margin:auto"></div></td></tr>`;

  try {
    const s    = getSession();
    const data = await gasPost({ action: 'listar_usuarios', _adminId: s.id, _adminToken: s._hash });

    if (!data.ok) { tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red-400 py-6 text-sm">${escHtml(data.error)}</td></tr>`; return; }

    _tablaUsuariosCache = data.usuarios || [];
    renderTablaUsuarios(_tablaUsuariosCache);
    poblarSelectoresEBS();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red-400 py-6 text-sm">Error de conexión: ${escHtml(String(err))}</td></tr>`;
  }
}

function renderTablaUsuarios(usuarios) {
  const tbody = document.getElementById('tabla-usuarios-body');
  if (!usuarios.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-slate-400 py-8 text-sm">No hay usuarios registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td><span class="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">${escHtml(u.usuario)}</span></td>
      <td class="font-medium">${escHtml(u.nombre)}</td>
      <td><span class="badge ${u.rol === 'admin' ? 'badge-admin' : 'badge-usuario'}">${u.rol === 'admin' ? '⚙ Admin' : '👤 Usuario'}</span></td>
      <td><span class="font-mono text-xs font-semibold text-hospital-800">${escHtml(u.codigoEBS)}</span></td>
      <td><span class="badge ${u.estado === 'activo' ? 'badge-activo' : 'badge-inactivo'}">${u.estado === 'activo' ? '● Activo' : '○ Inactivo'}</span></td>
      <td class="text-xs text-slate-400">${u.ultimoAcceso ? new Date(u.ultimoAcceso).toLocaleString('es-CO') : '—'}</td>
      <td>
        <div class="flex gap-1 flex-wrap">
          <button onclick="abrirModalEditar('${escHtml(u.id)}')" class="text-xs font-semibold text-hospital-700 hover:text-hospital-900 px-2 py-1 rounded hover:bg-hospital-50 transition">Editar</button>
          <button onclick="toggleEstadoUsuario('${escHtml(u.id)}')" class="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition">${u.estado === 'activo' ? 'Desactivar' : 'Activar'}</button>
          <button onclick="confirmarEliminar('${escHtml(u.id)}','${escHtml(u.nombre)}')" class="text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition">Eliminar</button>
        </div>
      </td>
    </tr>`).join('');
}

// ── Modal crear/editar usuario
function abrirModalUsuario() { abrirModal(null); }
function abrirModalEditar(id) {
  const u = _tablaUsuariosCache.find(u => u.id === id);
  abrirModal(u || null);
}

function abrirModal(usr) {
  document.getElementById('modal-titulo').textContent = usr ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('usr-id').value      = usr ? usr.id      : '';
  document.getElementById('usr-nombre').value  = usr ? usr.nombre  : '';
  document.getElementById('usr-usuario').value = usr ? usr.usuario : '';
  document.getElementById('usr-password').value = '';
  document.getElementById('usr-rol').value     = usr ? usr.rol     : 'usuario';
  document.getElementById('usr-ebs').value     = usr ? usr.codigoEBS : '';
  document.getElementById('usr-estado').value  = usr ? usr.estado  : 'activo';
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('pwd-hint').textContent = usr
    ? 'Dejar en blanco para no cambiar la contraseña'
    : 'Obligatoria para nuevos usuarios (mínimo 6 caracteres)';
  document.getElementById('modal-usuario').classList.remove('modal-hidden');
}

function cerrarModalUsuario() { document.getElementById('modal-usuario').classList.add('modal-hidden'); }
function cerrarModalSiOverlay(e) { if (e.target === document.getElementById('modal-usuario')) cerrarModalUsuario(); }

document.getElementById('form-usuario').addEventListener('submit', async function (e) {
  e.preventDefault();
  const errEl   = document.getElementById('modal-error');
  errEl.classList.add('hidden');

  const id      = document.getElementById('usr-id').value;
  const nombre  = document.getElementById('usr-nombre').value.trim();
  const usuario = document.getElementById('usr-usuario').value.trim().toLowerCase();
  const pwd     = document.getElementById('usr-password').value;
  const rol     = document.getElementById('usr-rol').value;
  const ebs     = document.getElementById('usr-ebs').value.trim().toUpperCase();
  const estado  = document.getElementById('usr-estado').value;

  if (!nombre || !usuario || !rol || !ebs) {
    errEl.textContent = 'Complete todos los campos obligatorios.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!id && (!pwd || pwd.length < 6)) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    errEl.classList.remove('hidden');
    return;
  }
  if (pwd && pwd.length > 0 && pwd.length < 6) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    errEl.classList.remove('hidden');
    return;
  }

  const s    = getSession();
  const btn  = e.submitter;
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }

  try {
    const payload = {
      _adminId: s.id, _adminToken: s._hash,
      nombre, usuario, rol, codigoEBS: ebs, estado
    };
    if (pwd) payload.passwordHash = await hashPwd(pwd);

    let data;
    if (id) {
      payload.action = 'editar_usuario';
      payload.id     = id;
      data = await gasPost(payload);
    } else {
      payload.action = 'crear_usuario';
      data = await gasPost(payload);
    }

    if (!data.ok) {
      errEl.textContent = data.error || 'Error al guardar';
      errEl.classList.remove('hidden');
      if (btn) { btn.textContent = orig; btn.disabled = false; }
      return;
    }

    cerrarModalUsuario();
    showToast(id ? 'Usuario actualizado ✓' : 'Usuario creado ✓', 'success');
    await cargarTablaUsuarios();

  } catch (err) {
    errEl.textContent = 'Error de conexión: ' + String(err);
    errEl.classList.remove('hidden');
    if (btn) { btn.textContent = orig; btn.disabled = false; }
  }
});

async function toggleEstadoUsuario(id) {
  const s = getSession();
  try {
    const data = await gasPost({ action: 'toggle_estado', id, _adminId: s.id, _adminToken: s._hash });
    if (data.ok) {
      showToast(`Estado cambiado a: ${data.nuevoEstado}`, 'info');
      await cargarTablaUsuarios();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (err) { showToast('Error de conexión', 'error'); }
}

// ── Confirmación eliminar
let _cbConfirmar = null;
function confirmarEliminar(id, nombre) {
  document.getElementById('confirmar-msg').textContent = `¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`;
  document.getElementById('modal-confirmar').classList.remove('modal-hidden');
  _cbConfirmar = async () => {
    const s = getSession();
    try {
      const data = await gasPost({ action: 'eliminar_usuario', id, adminId: s.id, _adminId: s.id, _adminToken: s._hash });
      if (data.ok) {
        showToast('Usuario eliminado', 'success');
        await cargarTablaUsuarios();
      } else {
        showToast(data.error || 'Error al eliminar', 'error');
      }
    } catch (err) { showToast('Error de conexión', 'error'); }
    cerrarModalConfirmar();
  };
  document.getElementById('btn-confirmar-ok').onclick = _cbConfirmar;
}
function cerrarModalConfirmar() { document.getElementById('modal-confirmar').classList.add('modal-hidden'); _cbConfirmar = null; }

// ─── Poblar selectores EBS ────────────────────────────────────
function poblarSelectoresEBS() {
  const ebs = [...new Set(_tablaUsuariosCache.filter(u => u.rol === 'usuario').map(u => u.codigoEBS))].sort();
  ['admin-filtro-ebs', 'export-ebs-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const primer = id === 'admin-filtro-ebs' ? '<option value="">Todos los EBS</option>' : '<option value="">Seleccionar EBS...</option>';
    sel.innerHTML = primer + ebs.map(e => `<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('');
  });
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: REGISTROS
// ═══════════════════════════════════════════════════════════════

let _adminRegistros = [];

async function cargarRegistrosAdmin() {
  const cont = document.getElementById('admin-registros-table');
  cont.innerHTML = '<div class="text-center py-12"><div class="spinner" style="border-top-color:#0f4c81;border-color:#e2e8f0;margin:auto"></div><p class="text-slate-400 text-sm mt-3">Cargando registros...</p></div>';

  if (!navigator.onLine) { cont.innerHTML = '<div class="text-center text-slate-400 py-12 text-sm">Sin conexión a internet.</div>'; return; }

  try {
    const data = await gasGet({ action: 'get_registros' });
    _adminRegistros = data.registros || [];
    renderRegistrosAdmin(_adminRegistros);
    actualizarStatsAdmin(_adminRegistros);
  } catch (err) {
    cont.innerHTML = `<div class="text-center text-red-400 py-12 text-sm">Error: ${escHtml(String(err))}</div>`;
  }
}

function filtrarRegistrosAdmin() {
  const filtro   = document.getElementById('admin-filtro-ebs').value;
  const filtrados = filtro ? _adminRegistros.filter(r => r.codigo_ebs === filtro) : _adminRegistros;
  renderRegistrosAdmin(filtrados);
}

function renderRegistrosAdmin(registros) {
  const cont = document.getElementById('admin-registros-table');
  if (!registros.length) { cont.innerHTML = '<div class="text-center text-slate-400 py-12 text-sm">No hay registros para mostrar.</div>'; return; }
  const cols   = ['fecha_atencion','nombre_apellido','documento','municipio','codigo_ebs','ciclo_vital_label','eps','_usuario','_status'];
  const labels = { fecha_atencion:'Fecha', nombre_apellido:'Paciente', documento:'Doc.', municipio:'Municipio', codigo_ebs:'EBS', ciclo_vital_label:'Ciclo', eps:'EPS', _usuario:'Registró', _status:'Estado' };
  cont.innerHTML = `
    <table class="table-admin">
      <thead><tr>${cols.map(c => `<th>${labels[c]||c}</th>`).join('')}</tr></thead>
      <tbody>${registros.map(r => `<tr>${cols.map(c => `<td>${escHtml(String(r[c]||'—'))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

function actualizarStatsAdmin(registros) {
  const ebsCount = {};
  registros.forEach(r => { const e = r.codigo_ebs||'Sin EBS'; ebsCount[e] = (ebsCount[e]||0)+1; });
  const cont = document.getElementById('admin-stats');
  const top  = Object.entries(ebsCount).sort((a,b) => b[1]-a[1]).slice(0,4);
  cont.innerHTML = top.map(([e,n]) => `
    <div class="card p-4 text-center">
      <div class="text-2xl font-bold text-hospital-800">${n}</div>
      <div class="text-xs text-slate-500 mt-1 font-semibold">${escHtml(e)}</div>
      <div class="text-xs text-slate-400">registros</div>
    </div>`).join('');
}

function exportarRegistrosAdmin() {
  if (!_adminRegistros.length) { showToast('Primero cargue los registros', 'error'); return; }
  const filtro   = document.getElementById('admin-filtro-ebs').value;
  const datos    = filtro ? _adminRegistros.filter(r => r.codigo_ebs === filtro) : _adminRegistros;
  descargarCSV(datos, `PCI_Registros_${filtro||'todos'}_${hoy()}.csv`);
}

async function exportarPorEBS() {
  const ebs = document.getElementById('export-ebs-select').value;
  if (!ebs) { showToast('Seleccione un EBS', 'error'); return; }

  showToast('Descargando...', 'info');
  try {
    let datos = _adminRegistros.filter(r => r.codigo_ebs === ebs);
    if (!datos.length) {
      const resp = await gasGet({ action: 'get_registros', ebs });
      datos = resp.registros || [];
    }
    if (!datos.length) { showToast('No hay registros para este EBS', 'error'); return; }
    descargarCSV(datos, `PCI_EBS_${ebs}_${hoy()}.csv`);
    showToast(`${datos.length} registros descargados`, 'success');
  } catch (err) { showToast('Error al descargar: ' + String(err), 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// USUARIO: DESCARGAR MIS REGISTROS
// ═══════════════════════════════════════════════════════════════

async function descargarMisRegistros() {
  const s = getSession();
  if (!s) return;
  showToast('Descargando...', 'info');
  try {
    const resp    = await gasGet({ action: 'get_registros', ebs: s.codigoEBS });
    const remotos = resp.registros || [];
    const locales  = getPendientes();
    const todos    = [...remotos, ...locales];
    if (!todos.length) { showToast('No hay registros aún', 'info'); return; }
    descargarCSV(todos, `PCI_MisRegistros_${s.codigoEBS}_${hoy()}.csv`);
    showToast(`${todos.length} registros descargados`, 'success');
  } catch {
    const locales = getPendientes();
    if (!locales.length) { showToast('Sin conexión y sin registros locales', 'error'); return; }
    descargarCSV(locales, `PCI_Local_${s.codigoEBS}_${hoy()}.csv`);
    showToast(`${locales.length} registros locales descargados`, 'info');
  }
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE: ALMACENAMIENTO LOCAL
// ═══════════════════════════════════════════════════════════════

function getPendientes()    { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); } catch { return []; } }
function setPendientes(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

function actualizarContadores() {
  const n  = getPendientes().length;
  const pc = document.getElementById('pending-count');
  const rc = document.getElementById('registros-count');
  if (pc) pc.textContent = `${n} pend.`;
  if (rc) rc.textContent = `${n} registro${n!==1?'s':''}`;
  renderHistorial(getPendientes());
}

function renderHistorial(pend) {
  const cont = document.getElementById('historial-container');
  if (!cont) return;
  if (!pend.length) { cont.innerHTML = '<p class="text-slate-400 text-sm text-center py-6">No hay registros pendientes de sincronizar.</p>'; return; }
  cont.innerHTML = pend.map((r, i) => `
    <div class="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <div>
        <div class="font-medium text-sm text-slate-700">${escHtml(r.nombre_apellido||'(sin nombre)')}</div>
        <div class="text-xs text-slate-400">${escHtml(r.documento||'')} · ${escHtml(r.ciclo_vital_label||'')} · ${escHtml(r.fecha_atencion||'')}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="pending-badge">${escHtml(r._status||'Pendiente')}</span>
        <button onclick="eliminarLocal(${i})" class="text-red-400 hover:text-red-600 text-xs" title="Eliminar">✕</button>
      </div>
    </div>`).join('');
}

function eliminarLocal(idx) {
  const p = getPendientes(); p.splice(idx,1); setPendientes(p);
  actualizarContadores(); showToast('Eliminado', 'info');
}

// ─── SINCRONIZACIÓN ───────────────────────────────────────────
async function syncPendingRecords() {
  if (!navigator.onLine) { showToast('Sin conexión', 'error'); return; }
  const pend = getPendientes();
  if (!pend.length) { showToast('Sin registros pendientes', 'info'); return; }

  const btn = document.getElementById('btn-sync');
  if (btn) btn.innerHTML = '<div class="spinner"></div><span>Sincronizando...</span>';

  let ok = 0; const fallidos = [];

  for (const reg of pend) {
    try {
      const data = await gasPost({ ...reg, action: 'guardar_registro' });
      if (data.ok) ok++; else fallidos.push(reg);
    } catch { fallidos.push(reg); }
  }

  setPendientes(fallidos);
  actualizarContadores();
  if (btn) btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg><span id="pending-count">${fallidos.length} pend.</span>`;
  showToast(fallidos.length===0 ? `✓ ${ok} registros sincronizados` : `${ok} OK · ${fallidos.length} fallaron`, fallidos.length===0?'success':'error');
}

// ═══════════════════════════════════════════════════════════════
// FORMULARIO PCI
// ═══════════════════════════════════════════════════════════════

document.getElementById('pci-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const s = getSession();
  if (!s) { logout(); return; }

  const reqs = ['fecha_atencion','eps','nombre_apellido','documento','fecha_nacimiento','municipio','ciclo_vital'];
  let ok = true;
  reqs.forEach(id => {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) { el && el.classList.add('border-red-400'); ok = false; }
    else el && el.classList.remove('border-red-400');
  });
  if (!ok) { showToast('Complete los campos obligatorios (*)', 'error'); return; }

  const cicloVal   = document.getElementById('ciclo_vital').value;
  const cicloLabel = document.getElementById('ciclo_vital').options[document.getElementById('ciclo_vital').selectedIndex].text.replace(/^[^\w]+/,'').trim();

  const registro = {
    action:                 'guardar_registro',
    _id:                    Date.now() + Math.random().toString(36).slice(2),
    _timestamp:             new Date().toISOString(),
    _status:                'Sincronizado',
    _sincronizado:          'Sí',
    _usuario:               s.usuario,
    fecha_atencion:         document.getElementById('fecha_atencion').value,
    eps:                    document.getElementById('eps').value,
    nombre_apellido:        document.getElementById('nombre_apellido').value,
    documento:              document.getElementById('documento').value,
    fecha_nacimiento:       document.getElementById('fecha_nacimiento').value,
    edad:                   document.getElementById('edad').value,
    direccion:              document.getElementById('direccion').value,
    celular:                document.getElementById('celular').value,
    municipio:              document.getElementById('municipio').value,
    codigo_microterritorio: document.getElementById('codigo_microterritorio').value,
    codigo_familia:         document.getElementById('codigo_familia').value,
    codigo_ebs:             s.codigoEBS,
    ciclo_vital:            cicloVal,
    ciclo_vital_label:      cicloLabel,
    otras_intervenciones:   document.getElementById('otras_intervenciones').value,
  };

  // Checkboxes de intervenciones
  (INTERVENCIONES[cicloVal] || []).forEach(iv => {
    const cb = document.getElementById(iv.id);
    registro[iv.id] = cb && cb.checked ? 'Sí' : 'No';
  });

  // Intentar enviar directamente si hay conexión
  if (navigator.onLine) {
    const btn = document.getElementById('btn-guardar') || e.submitter;
    if (btn) { btn.innerHTML = '<div class="spinner"></div>&nbsp;Guardando...'; btn.disabled = true; }
    try {
      const data = await gasPost(registro);
      if (data.ok) {
        showToast('✓ Registro guardado en servidor', 'success');
        limpiarFormulario();
        if (btn) { btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg> Guardar Registro'; btn.disabled = false; }
        return;
      }
    } catch (err) {
      console.warn('[PCI] Error al guardar online, guardando offline:', err);
    }
    if (btn) { btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg> Guardar Registro'; btn.disabled = false; }
  }

  // Guardar offline
  registro._status       = 'Pendiente';
  registro._sincronizado = 'No';
  const pend = getPendientes();
  pend.push(registro);
  setPendientes(pend);
  actualizarContadores();
  showToast('Guardado localmente – se sincronizará al recuperar conexión', 'info');
  limpiarFormulario();
});

// ═══════════════════════════════════════════════════════════════
// INTERVENCIONES POR CICLO VITAL (Res. 3280 – Anexos 23-29)
// ═══════════════════════════════════════════════════════════════

const INTERVENCIONES = {
  primera_infancia: [
    { id:'pi_consulta_control',       label:'Consulta de Control de Programa',                                           profesional:'med' },
    { id:'pi_vacunacion',             label:'Vacunación',                                                                profesional:'med' },
    { id:'pi_desparasitacion',        label:'Desparasitación',                                                           profesional:'med' },
    { id:'pi_consulta_odontologia',   label:'Consulta por Odontología',                                                  profesional:'odo' },
    { id:'pi_barniz_fluor',           label:'Aplicación de Barniz Fluor',                                                profesional:'odo' },
    { id:'pi_profilaxis',             label:'Profilaxis y remoción de placa (2 veces al año)',                           profesional:'odo' },
    { id:'pi_tamizaje_salud_mental',  label:'Tamizaje en Salud Mental (RQC)',                                            profesional:'psi' },
    { id:'pi_lactancia_materna',      label:'Promoción y apoyo a Lactancia Materna',                                     profesional:'enf' },
    { id:'pi_tamizaje_hemoglobina',   label:'Tamizaje de Hemoglobina (Según Riesgo)',                                    profesional:'enf' },
    { id:'pi_micronutrientes_polvo',  label:'Fortificación casera de Micronutrientes en Polvo',                          profesional:'enf' },
    { id:'pi_suplementacion_micro',   label:'Suplementación con Micronutrientes (≥2 años, 2 veces/año)',                 profesional:'enf' },
    { id:'pi_suplementacion_hierro',  label:'Suplementación con hierro (bajo peso al nacer o delgadez en lactancia)',    profesional:'enf' },
    { id:'pi_atencion_psicologia',    label:'Atención por Psicología (de acuerdo al riesgo)',                            profesional:'psi' },
    { id:'pi_atencion_nutricion',     label:'Atención por Nutrición (de acuerdo al riesgo)',                             profesional:'nut' },
    { id:'pi_edu_med',                label:'Educación individual Medicina General',                                     profesional:'med' },
    { id:'pi_edu_psi',                label:'Educación individual Psicología',                                           profesional:'psi' },
    { id:'pi_edu_enf',                label:'Educación individual Enfermería',                                           profesional:'enf' },
    { id:'pi_edu_odo',                label:'Educación individual Odontología',                                          profesional:'odo' },
    { id:'pi_edu_nut',                label:'Educación individual Nutrición',                                            profesional:'nut' },
  ],
  infancia: [
    { id:'inf_consulta_control',      label:'Consulta de Control de Programa',                                           profesional:'med' },
    { id:'inf_vacunacion',            label:'Vacunación',                                                                profesional:'aux' },
    { id:'inf_desparasitacion',       label:'Desparasitación',                                                           profesional:'aux' },
    { id:'inf_consulta_odontologia',  label:'Consulta por Odontología',                                                  profesional:'odo' },
    { id:'inf_barniz_fluor',          label:'Aplicación de Barniz Fluor',                                                profesional:'odo' },
    { id:'inf_profilaxis',            label:'Profilaxis y remoción de placa (2 veces al año)',                           profesional:'odo' },
    { id:'inf_tamizaje_salud_mental', label:'Tamizaje en Salud Mental (RQC)',                                            profesional:'psi' },
    { id:'inf_tamizaje_hemoglobina',  label:'Tamizaje de Hemoglobina (Según Riesgo)',                                    profesional:'enf' },
    { id:'inf_atencion_psicologia',   label:'Atención por Psicología (de acuerdo al riesgo)',                            profesional:'psi' },
    { id:'inf_atencion_nutricion',    label:'Atención por Nutrición (de acuerdo al riesgo)',                             profesional:'nut' },
    { id:'inf_edu_med',               label:'Educación individual Medicina General',                                     profesional:'med' },
    { id:'inf_edu_psi',               label:'Educación individual Psicología',                                           profesional:'psi' },
    { id:'inf_edu_enf',               label:'Educación individual Enfermería',                                           profesional:'enf' },
    { id:'inf_edu_odo',               label:'Educación individual Odontología',                                          profesional:'odo' },
    { id:'inf_edu_nut',               label:'Educación individual Nutrición',                                            profesional:'nut' },
  ],
  adolescencia: [
    { id:'ado_consulta_control',      label:'Consulta de Control de Programa',                                           profesional:'med' },
    { id:'ado_vacunacion',            label:'Vacunación',                                                                profesional:'aux' },
    { id:'ado_desparasitacion',       label:'Desparasitación',                                                           profesional:'aux' },
    { id:'ado_consulta_odontologia',  label:'Consulta por Odontología',                                                  profesional:'odo' },
    { id:'ado_barniz_fluor',          label:'Aplicación de Barniz Fluor',                                                profesional:'odo' },
    { id:'ado_profilaxis',            label:'Profilaxis y remoción de placa (2 veces al año)',                           profesional:'odo' },
    { id:'ado_tamizaje_salud_mental', label:'Tamizaje en Salud Mental (SRQ)',                                            profesional:'psi' },
    { id:'ado_tamizaje_hemoglobina',  label:'Tamizaje de Hemoglobina (Según Riesgo)',                                    profesional:'enf' },
    { id:'ado_atencion_psicologia',   label:'Atención por Psicología (de acuerdo al riesgo)',                            profesional:'psi' },
    { id:'ado_atencion_nutricion',    label:'Atención por Nutrición (de acuerdo al riesgo)',                             profesional:'nut' },
    { id:'ado_preservativos',         label:'Suministro de preservativos',                                               profesional:'enf' },
    { id:'ado_edu_med',               label:'Educación individual Medicina General',                                     profesional:'med' },
    { id:'ado_edu_psi',               label:'Educación individual Psicología',                                           profesional:'psi' },
    { id:'ado_edu_enf',               label:'Educación individual Enfermería',                                           profesional:'enf' },
    { id:'ado_edu_odo',               label:'Educación individual Odontología',                                          profesional:'odo' },
    { id:'ado_edu_nut',               label:'Educación individual Nutrición',                                            profesional:'nut' },
  ],
  juventud: [
    { id:'juv_consulta_med',          label:'Consulta Medicina General',                                                 profesional:'med' },
    { id:'juv_tamizaje_salud_mental', label:'Tamizaje en Salud Mental (SRQ)',                                            profesional:'psi' },
    { id:'juv_odontologia',           label:'Atención Odontología (1 vez cada 2 años)',                                  profesional:'odo' },
    { id:'juv_profilaxis',            label:'Profilaxis y remoción de placa (1 vez al año)',                             profesional:'odo' },
    { id:'juv_tamizaje_cardiovasc',   label:'Tamizaje riesgo cardiovascular: glicemia, perfil lipídico, creatinina, uroanálisis', profesional:'med' },
    { id:'juv_prueba_treponem',       label:'Prueba rápida treponémica (Según exposición a riesgo)',                     profesional:'enf' },
    { id:'juv_prueba_vih',            label:'Prueba rápida VIH (Según exposición a riesgo)',                             profesional:'enf' },
    { id:'juv_asesoria_vih',          label:'Asesoría Pre y Post VIH',                                                   profesional:'enf' },
    { id:'juv_prueba_hb',             label:'Prueba Rápida HB (Según exposición a riesgo)',                              profesional:'enf' },
    { id:'juv_prueba_hc',             label:'Prueba Rápida HC (Según exposición a riesgo)',                              profesional:'enf' },
    { id:'juv_prueba_embarazo',       label:'Prueba de embarazo (Según exposición a riesgo)',                            profesional:'enf' },
    { id:'juv_citologia',             label:'Citología',                                                                 profesional:'med' },
    { id:'juv_colposcopia',           label:'Colposcopia',                                                               profesional:'med' },
    { id:'juv_biopsia_cervico',       label:'Biopsia cervicouterina',                                                   profesional:'med' },
    { id:'juv_vacunacion',            label:'Vacunación',                                                                profesional:'aux' },
    { id:'juv_atencion_psicologia',   label:'Atención por Psicología (de acuerdo al riesgo)',                            profesional:'psi' },
    { id:'juv_atencion_nutricion',    label:'Atención por Nutrición (de acuerdo al riesgo)',                             profesional:'nut' },
    { id:'juv_preservativos',         label:'Suministro de preservativos',                                               profesional:'enf' },
    { id:'juv_edu_med',               label:'Educación individual Medicina General',                                     profesional:'med' },
    { id:'juv_edu_psi',               label:'Educación individual Psicología',                                           profesional:'psi' },
    { id:'juv_edu_enf',               label:'Educación individual Enfermería',                                           profesional:'enf' },
    { id:'juv_edu_odo',               label:'Educación individual Odontología',                                          profesional:'odo' },
    { id:'juv_edu_nut',               label:'Educación individual Nutrición',                                            profesional:'nut' },
  ],
  adultez: [
    { id:'adu_consulta_med',          label:'Consulta Medicina General',                                                 profesional:'med' },
    { id:'adu_tamizaje_salud_mental', label:'Tamizaje en Salud Mental (SRQ)',                                            profesional:'psi' },
    { id:'adu_odontologia',           label:'Atención Odontología (1 vez cada 2 años)',                                  profesional:'odo' },
    { id:'adu_profilaxis',            label:'Profilaxis y remoción de placa (1 vez cada 2 años)',                        profesional:'odo' },
    { id:'adu_tamizaje_cardiovasc',   label:'Tamizaje riesgo cardiovascular: glicemia, perfil lipídico, creatinina, uroanálisis (Cada 5 años)', profesional:'med' },
    { id:'adu_prueba_treponem',       label:'Prueba rápida treponémica (Según exposición a riesgo)',                     profesional:'enf' },
    { id:'adu_prueba_vih',            label:'Prueba rápida VIH (Según exposición a riesgo)',                             profesional:'enf' },
    { id:'adu_asesoria_vih',          label:'Asesoría Pre y Post VIH',                                                   profesional:'enf' },
    { id:'adu_prueba_hb',             label:'Prueba Rápida HB (Según exposición a riesgo)',                              profesional:'enf' },
    { id:'adu_prueba_hc',             label:'Prueba Rápida HC (Según exposición a riesgo)',                              profesional:'enf' },
    { id:'adu_prueba_embarazo',       label:'Prueba de embarazo (Según exposición a riesgo)',                            profesional:'enf' },
    { id:'adu_citologia',             label:'Citología',                                                                 profesional:'med' },
    { id:'adu_adn_vph',               label:'ADN – VPH',                                                                 profesional:'med' },
    { id:'adu_colposcopia',           label:'Colposcopia',                                                               profesional:'med' },
    { id:'adu_biopsia_cervico',       label:'Biopsia cervicouterina',                                                   profesional:'med' },
    { id:'adu_valoracion_mama',       label:'Valoración clínica de Mama (Anual)',                                        profesional:'med' },
    { id:'adu_mamografia',            label:'Mamografía (Cada dos años)',                                                profesional:'med' },
    { id:'adu_tamizaje_psa',          label:'Tamizaje CA Próstata PSA (Cada 5 años)',                                    profesional:'med' },
    { id:'adu_tamizaje_tacto',        label:'Tamizaje CA Próstata Tacto (Cada 5 años)',                                  profesional:'med' },
    { id:'adu_biopsia_prostata',      label:'Biopsia de próstata (Según hallazgo)',                                      profesional:'med' },
    { id:'adu_tamizaje_colon',        label:'Tamizaje CA Colon, sangre oculta (Cada 2 años)',                           profesional:'med' },
    { id:'adu_colonoscopia',          label:'Colonoscopia y biopsia (Según hallazgo)',                                   profesional:'med' },
    { id:'adu_atencion_psicologia',   label:'Atención por Psicología (de acuerdo al riesgo)',                            profesional:'psi' },
    { id:'adu_atencion_nutricion',    label:'Atención por Nutrición (de acuerdo al riesgo)',                             profesional:'nut' },
    { id:'adu_preservativos',         label:'Suministro de preservativos',                                               profesional:'enf' },
    { id:'adu_vacunacion',            label:'Vacunación',                                                                profesional:'aux' },
    { id:'adu_edu_psi',               label:'Educación individual Psicología',                                           profesional:'psi' },
    { id:'adu_edu_med',               label:'Educación individual Medicina General',                                     profesional:'med' },
    { id:'adu_edu_odo',               label:'Educación individual Odontología',                                          profesional:'odo' },
    { id:'adu_edu_nut',               label:'Educación individual Nutrición',                                            profesional:'nut' },
  ],
  vejez: [
    { id:'vej_consulta_med',          label:'Consulta Medicina General',                                                 profesional:'med' },
    { id:'vej_tamizaje_salud_mental', label:'Tamizaje en Salud Mental (SRQ)',                                            profesional:'psi' },
    { id:'vej_odontologia',           label:'Atención Odontología (1 vez cada 2 años)',                                  profesional:'odo' },
    { id:'vej_profilaxis',            label:'Profilaxis y remoción de placa (1 vez cada 2 años)',                        profesional:'odo' },
    { id:'vej_tamizaje_cardiovasc',   label:'Tamizaje riesgo cardiovascular: glicemia, perfil lipídico, creatinina, uroanálisis (Cada 5 años)', profesional:'med' },
    { id:'vej_prueba_treponem',       label:'Prueba rápida treponémica (Según exposición a riesgo)',                     profesional:'enf' },
    { id:'vej_prueba_vih',            label:'Prueba rápida VIH (Según exposición a riesgo)',                             profesional:'enf' },
    { id:'vej_asesoria_vih',          label:'Asesoría Pre y Post VIH',                                                   profesional:'enf' },
    { id:'vej_prueba_hb',             label:'Prueba Rápida HB (Según exposición a riesgo)',                              profesional:'enf' },
    { id:'vej_prueba_hc',             label:'Prueba Rápida HC (Según exposición a riesgo)',                              profesional:'enf' },
    { id:'vej_citologia',             label:'Citología',                                                                 profesional:'med' },
    { id:'vej_adn_vph',               label:'ADN – VPH',                                                                 profesional:'med' },
    { id:'vej_colposcopia',           label:'Colposcopia',                                                               profesional:'med' },
    { id:'vej_biopsia_cervico',       label:'Biopsia cervicouterina',                                                   profesional:'med' },
    { id:'vej_valoracion_mama',       label:'Valoración clínica de Mama (Cada 2 años)',                                  profesional:'med' },
    { id:'vej_mamografia',            label:'Mamografía (Cada dos años)',                                                profesional:'med' },
    { id:'vej_biopsia_mama',          label:'Biopsia de mama (Según hallazgo)',                                          profesional:'med' },
    { id:'vej_tamizaje_psa',          label:'Tamizaje CA Próstata PSA (Cada 5 años)',                                    profesional:'med' },
    { id:'vej_tamizaje_tacto',        label:'Tamizaje CA Próstata Tacto (Cada 5 años)',                                  profesional:'med' },
    { id:'vej_biopsia_prostata',      label:'Biopsia de próstata (Según hallazgo)',                                      profesional:'med' },
    { id:'vej_tamizaje_colon',        label:'Tamizaje CA Colon, sangre oculta (Cada 2 años)',                           profesional:'med' },
    { id:'vej_colonoscopia',          label:'Colonoscopia y biopsia (Según hallazgo)',                                   profesional:'med' },
    { id:'vej_atencion_psicologia',   label:'Atención por Psicología (de acuerdo al riesgo)',                            profesional:'psi' },
    { id:'vej_atencion_nutricion',    label:'Atención por Nutrición (de acuerdo al riesgo)',                             profesional:'nut' },
    { id:'vej_preservativos',         label:'Suministro de preservativos',                                               profesional:'enf' },
    { id:'vej_vacunacion',            label:'Vacunación',                                                                profesional:'aux' },
    { id:'vej_edu_med',               label:'Educación individual Medicina General',                                     profesional:'med' },
    { id:'vej_edu_psi',               label:'Educación individual Psicología',                                           profesional:'psi' },
    { id:'vej_edu_enf',               label:'Educación individual Enfermería',                                           profesional:'enf' },
    { id:'vej_edu_odo',               label:'Educación individual Odontología',                                          profesional:'odo' },
    { id:'vej_edu_nut',               label:'Educación individual Nutrición',                                            profesional:'nut' },
  ],
  materno_perinatal: [
    { id:'mat_preconcepcional',       label:'Atención Preconcepcional (Mujeres)',                                        profesional:'med' },
    { id:'mat_consulta_med',          label:'Consulta Medicina General',                                                 profesional:'med' },
    { id:'mat_controles',             label:'Controles',                                                                 profesional:'enf' },
    { id:'mat_laboratorios',          label:'Laboratorios',                                                              profesional:'med' },
    { id:'mat_asesoria_ive',          label:'Asesoría IVE',                                                              profesional:'med' },
    { id:'mat_control_prenatal',      label:'Control Prenatal',                                                          profesional:'med' },
    { id:'mat_ginecologia',           label:'Ginecología',                                                               profesional:'med' },
    { id:'mat_curso_maternidad',      label:'Curso de preparación en maternidad y paternidad',                           profesional:'enf' },
    { id:'mat_odontologia',           label:'Atención por Odontología',                                                  profesional:'odo' },
    { id:'mat_nutricion',             label:'Atención por Nutrición',                                                    profesional:'nut' },
    { id:'mat_trabajo_social',        label:'Atención por Trabajo Social (Referencia)',                                  profesional:'enf' },
    { id:'mat_psicologia',            label:'Atención por Psicología',                                                   profesional:'psi' },
    { id:'mat_micronutrientes',       label:'Gestante: suplementación con micronutrientes',                              profesional:'enf' },
    { id:'mat_seguimiento_parto',     label:'Seguimiento al Parto',                                                      profesional:'med' },
    { id:'mat_puerperio',             label:'Atención al Puerperio',                                                     profesional:'enf' },
    { id:'mat_recien_nacido',         label:'Control Recién Nacido',                                                     profesional:'med' },
    { id:'mat_educacion_familiar',    label:'Educación Familiar',                                                        profesional:'enf' },
    { id:'mat_edu_med',               label:'Educación individual Medicina General',                                     profesional:'med' },
    { id:'mat_edu_psi',               label:'Educación individual Psicología',                                           profesional:'psi' },
    { id:'mat_edu_enf',               label:'Educación individual Enfermería',                                           profesional:'enf' },
    { id:'mat_edu_odo',               label:'Educación individual Odontología',                                          profesional:'odo' },
    { id:'mat_edu_nut',               label:'Educación individual Nutrición',                                            profesional:'nut' },
  ],
};

const PROF_META = {
  med: { color:'var(--col-med)', label:'Medicina General', bg:'#eff6ff', text:'#1e40af' },
  enf: { color:'var(--col-enf)', label:'Enfermería',       bg:'#fefce8', text:'#854d0e' },
  psi: { color:'var(--col-psi)', label:'Psicología',       bg:'#faf5ff', text:'#6b21a8' },
  odo: { color:'var(--col-odo)', label:'Odontología',      bg:'#fff7ed', text:'#9a3412' },
  nut: { color:'var(--col-nut)', label:'Nutrición',        bg:'#fef2f2', text:'#991b1b' },
  aux: { color:'var(--col-aux)', label:'Auxiliares Enf.',  bg:'#f0fdf4', text:'#14532d' },
};

function calcularEdad() {
  const fn = document.getElementById('fecha_nacimiento').value;
  const el = document.getElementById('edad');
  if (!fn) { el.value = ''; return; }
  const hoyD = new Date(), fnD = new Date(fn + 'T00:00:00');
  let a = hoyD.getFullYear() - fnD.getFullYear();
  let m = hoyD.getMonth() - fnD.getMonth();
  if (hoyD.getDate() < fnD.getDate()) m--;
  if (m < 0) { a--; m += 12; }
  el.value = a === 0
    ? (m === 0 ? `${Math.floor((hoyD-fnD)/86400000)} día(s)` : `${m} mes(es)`)
    : `${a} año(s)`;
}

function renderIntervenciones() {
  const ciclo = document.getElementById('ciclo_vital').value;
  const cont  = document.getElementById('intervenciones-container');
  const ley   = document.getElementById('leyenda');
  const otras = document.getElementById('otras-container');

  if (!ciclo || !INTERVENCIONES[ciclo]) {
    cont.innerHTML = `<div class="flex flex-col items-center justify-center py-12 text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg><p class="text-sm">Seleccione un ciclo vital</p></div>`;
    ley.classList.add('hidden'); otras.classList.add('hidden'); return;
  }
  ley.classList.remove('hidden'); otras.classList.remove('hidden');

  const grupos = {};
  INTERVENCIONES[ciclo].forEach(iv => { if (!grupos[iv.profesional]) grupos[iv.profesional]=[]; grupos[iv.profesional].push(iv); });

  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  ['med','enf','aux','psi','odo','nut'].forEach(prof => {
    if (!grupos[prof]) return;
    const m = PROF_META[prof];
    html += `<div class="prof-group border border-slate-100 rounded-xl p-3"><div class="prof-group-title" style="background:${m.bg};color:${m.text}">${m.label}</div><div>`;
    grupos[prof].forEach(iv => {
      html += `<div class="intervencion-item" onclick="toggleCheck('${iv.id}')"><div class="dot" style="background:${m.color};border:1.5px solid rgba(0,0,0,.08)"></div><input type="checkbox" id="${iv.id}" name="${iv.id}" value="1"/><label for="${iv.id}">${iv.label}</label></div>`;
    });
    html += `</div></div>`;
  });
  html += '</div>';
  cont.innerHTML = html;
}

function toggleCheck(id) { const cb = document.getElementById(id); if (cb) cb.checked = !cb.checked; }

function limpiarFormulario() {
  document.getElementById('pci-form').reset();
  document.getElementById('edad').value = '';
  document.getElementById('ciclo_vital').value = '';
  document.getElementById('fecha_atencion').value = hoy();
  renderIntervenciones();
  document.querySelectorAll('.border-red-400').forEach(el => el.classList.remove('border-red-400'));
}

// ═══════════════════════════════════════════════════════════════
// ADMIN TABS
// ═══════════════════════════════════════════════════════════════
function switchAdminTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════
function descargarCSV(registros, filename) {
  if (!registros.length) return;
  const omitir = ['passwordHash','_action','action'];
  const keys   = Object.keys(registros[0]).filter(k => !omitir.includes(k));
  const bom    = '\uFEFF';
  const csv    = bom + [
    keys.join(';'),
    ...registros.map(r => keys.map(k => {
      const v = String(r[k]===null||r[k]===undefined?'':r[k]);
      return v.includes(';')||v.includes('"')||v.includes('\n') ? `"${v.replace(/"/g,'""')}"` : v;
    }).join(';'))
  ].join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function hoy()       { return new Date().toISOString().split('T')[0]; }
function escHtml(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function togglePwd(id) { const el=document.getElementById(id); el.type=el.type==='password'?'text':'password'; }

function showToast(msg, type='success') {
  const toast = document.getElementById('toast');
  const cls   = { success:'bg-slate-800', error:'bg-red-600', info:'bg-blue-700' };
  toast.className = `${cls[type]||cls.success} text-white text-sm px-5 py-3 rounded-full shadow-xl flex items-center gap-2`;
  document.getElementById('toast-icon').textContent = type==='success'?'✓':type==='error'?'✕':'ℹ';
  document.getElementById('toast-msg').textContent  = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3400);
}

function actualizarConexion() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (navigator.onLine) {
    dot.className = 'w-2 h-2 rounded-full bg-green-400';
    text.textContent = 'En línea';
    if (getPendientes().length) syncPendingRecords();
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-yellow-400 animate-pulse';
    text.textContent = 'Sin conexión';
    showToast('Modo offline activado', 'info');
  }
}
window.addEventListener('online',  actualizarConexion);
window.addEventListener('offline', actualizarConexion);

// ─── INIT ─────────────────────────────────────────────────────
(function init() {
  actualizarConexion();
  // Restaurar sesión si el usuario no cerró la pestaña
  const session = getSession();
  if (session) mostrarApp(session);
})();
