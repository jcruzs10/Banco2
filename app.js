"use strict";

const API_BASE_URL = "https://bancocentroamericano.azurewebsites.net";

const endpoints = {
	login: "/api/Auth/login",
	bitacora: "/api/Bitacora/kardex/{idCuenta}",
	deposito: "/api/Operaciones/deposito",
	retiro: "/api/Operaciones/retiro",
	transferir: "/api/Operaciones/transferir",
	consultaSaldo: "/api/Operaciones/saldo/{idCuenta}",
	pagoValidar: "/api/Pagos/validar",
	pagoEjecutar: "/api/Pagos/ejecutar",
	consultarDeuda: "/api/Pagos/consultar-deuda/{tipoServicio}/{identificador}",
	// TODO: agrega el endpoint real para listar cuentas del usuario.
	cuentas: null
};

const dom = {
	loginForm: document.getElementById("loginForm"),
	loginUser: document.getElementById("loginUser"),
	loginPass: document.getElementById("loginPass"),
	btnUseDemo: document.getElementById("btnUseDemo"),
	btnLogout: document.getElementById("btnLogout"),
	btnRefresh: document.getElementById("btnRefresh"),
	btnLoadMov: document.getElementById("btnLoadMov"),
	btnLoadBitacora: document.getElementById("btnLoadBitacora"),
	userPill: document.getElementById("userPill"),
	userName: document.getElementById("userName"),
	navButtons: Array.from(document.querySelectorAll(".nav-btn")),
	viewPanels: Array.from(document.querySelectorAll("[data-view-panel]")),
	authCard: document.getElementById("authCard"),
	appShell: document.getElementById("appShell"),
	accountsList: document.getElementById("accountsList"),
	movCuenta: document.getElementById("movCuenta"),
	movimientosBody: document.getElementById("movimientosBody"),
	depositoForm: document.getElementById("depositoForm"),
	retiroForm: document.getElementById("retiroForm"),
	transferForm: document.getElementById("transferForm"),
	pagoServicioForm: document.getElementById("pagoServicioForm"),
	depCuenta: document.getElementById("depCuenta"),
	retCuenta: document.getElementById("retCuenta"),
	trfOrigen: document.getElementById("trfOrigen"),
	pagoCuenta: document.getElementById("pagoCuenta"),
	toast: document.getElementById("toast"),
	overlay: document.getElementById("overlay")
};

const state = {
	user: null,
	token: null,
	accounts: [],
	isDemo: false
};

const demoData = {
	user: "demo.usuario",
	accounts: [
		{
			idCuenta: 101,
			numero: "0001234501",
			tipo: "Monetaria",
			saldo: 12450.75,
			moneda: "GTQ"
		},
		{
			idCuenta: 202,
			numero: "0001234502",
			tipo: "Ahorro",
			saldo: 8900.0,
			moneda: "GTQ"
		}
	]
};

init();

function init() {
	bindEvents();
	restoreSession();
}

function bindEvents() {
	dom.loginForm.addEventListener("submit", handleLogin);
	dom.btnUseDemo.addEventListener("click", useDemo);
	dom.btnLogout.addEventListener("click", logout);
	dom.btnRefresh.addEventListener("click", refreshAll);
	dom.btnLoadMov.addEventListener("click", loadMovimientos);
	dom.btnLoadBitacora.addEventListener("click", loadBitacora);

	dom.navButtons.forEach((btn) => {
		btn.addEventListener("click", () => setView(btn.dataset.view));
	});

	dom.depositoForm.addEventListener("submit", submitDeposito);
	dom.retiroForm.addEventListener("submit", submitRetiro);
	dom.transferForm.addEventListener("submit", submitTransferencia);
	dom.pagoServicioForm.addEventListener("submit", submitPago);
}

function restoreSession() {
	const savedToken = localStorage.getItem("bank.token");
	const savedUser = localStorage.getItem("bank.user");
	if (savedToken && savedUser) {
		state.token = savedToken;
		state.user = savedUser;
		setSessionUI(true);
		refreshAll();
	}
}

function setSessionUI(isLogged) {
	dom.authCard.hidden = isLogged;
	dom.appShell.hidden = !isLogged;
	dom.userPill.hidden = !isLogged;
	dom.btnLogout.hidden = !isLogged;
	dom.navButtons.forEach((btn) => (btn.disabled = !isLogged));
	if (isLogged) {
		dom.userName.textContent = state.user || "Cliente";
		setView("resumen");
	}
}

function setView(viewName) {
	dom.navButtons.forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.view === viewName);
	});
	dom.viewPanels.forEach((panel) => {
		panel.hidden = panel.id !== `view${capitalize(viewName)}`;
	});
}

async function handleLogin(event) {
	event.preventDefault();
	const credencial = dom.loginUser.value.trim();
	const password = dom.loginPass.value;
	if (!credencial || !password) {
		showToast("Completa usuario y contraseña.", "error");
		return;
	}

	setLoading(true);
	try {
		const payload = { credencial, password };
		const data = await apiRequest(endpoints.login, {
			method: "POST",
			body: payload,
			auth: false
		});
		const token = extractToken(data);
		state.user = credencial;
		state.token = token;
		state.isDemo = false;
		localStorage.setItem("bank.user", credencial);
		if (token) {
			localStorage.setItem("bank.token", token);
		} else {
			localStorage.removeItem("bank.token");
			showToast("Login OK, pero no llego token. Revisa la respuesta.");
		}
		setSessionUI(true);
		await refreshAll();
	} catch (err) {
		showToast(err.message || "Error al iniciar sesión.", "error");
	} finally {
		setLoading(false);
	}
}

function useDemo() {
	state.isDemo = true;
	state.user = demoData.user;
	state.token = null;
	state.accounts = demoData.accounts.slice();
	localStorage.setItem("bank.user", state.user);
	localStorage.removeItem("bank.token");
	setSessionUI(true);
	paintAccounts();
	fillAccountSelects();
	showToast("Modo demo activo. No se hace llamada real a la API.");
}

function logout() {
	state.user = null;
	state.token = null;
	state.accounts = [];
	state.isDemo = false;
	localStorage.removeItem("bank.token");
	localStorage.removeItem("bank.user");
	setSessionUI(false);
	resetTables();
}

async function refreshAll() {
	if (state.isDemo) {
		paintAccounts();
		fillAccountSelects();
		return;
	}
	await loadAccounts();
}

async function loadAccounts() {
	if (!endpoints.cuentas) {
		showToast("Define endpoints.cuentas para listar cuentas.", "error");
		return;
	}
	setLoading(true);
	try {
		const data = await apiRequest(endpoints.cuentas);
		state.accounts = normalizeAccounts(data);
		paintAccounts();
		fillAccountSelects();
	} catch (err) {
		showToast(err.message || "No se pudieron cargar cuentas.", "error");
	} finally {
		setLoading(false);
	}
}

async function loadMovimientos() {
	const accountId = dom.movCuenta.value;
	if (!accountId) {
		showToast("Selecciona una cuenta.");
		return;
	}
	if (state.isDemo) {
		renderMovimientos([]);
		showToast("Demo: sin movimientos reales.");
		return;
	}
	setLoading(true);
	try {
		const url = endpoints.bitacora.replace("{idCuenta}", accountId);
		const data = await apiRequest(url);
		renderMovimientos(Array.isArray(data) ? data : data?.items || []);
	} catch (err) {
		showToast(err.message || "Error al cargar movimientos.", "error");
	} finally {
		setLoading(false);
	}
}

async function loadBitacora() {
	const accountId = dom.movCuenta.value;
	if (!accountId) {
		showToast("Selecciona una cuenta para la bitacora.");
		return;
	}
	if (state.isDemo) {
		renderBitacora([]);
		return;
	}
	setLoading(true);
	try {
		const url = endpoints.bitacora.replace("{idCuenta}", accountId);
		const data = await apiRequest(url);
		renderBitacora(Array.isArray(data) ? data : data?.items || []);
	} catch (err) {
		showToast(err.message || "Error al cargar bitacora.", "error");
	} finally {
		setLoading(false);
	}
}

async function submitDeposito(event) {
	event.preventDefault();
	const idCuenta = dom.depCuenta.value;
	const monto = Number(document.getElementById("depMonto").value || 0);
	const referencia = document.getElementById("depRef").value || "";
	if (!idCuenta || !monto) {
		showToast("Completa cuenta y monto.");
		return;
	}
	if (state.isDemo) {
		applyDemoBalance(idCuenta, monto);
		showToast("Demo: deposito aplicado.");
		return;
	}
	await postOperacion(endpoints.deposito, { idCuenta, monto, referencia });
}

async function submitRetiro(event) {
	event.preventDefault();
	const idCuenta = dom.retCuenta.value;
	const monto = Number(document.getElementById("retMonto").value || 0);
	const referencia = document.getElementById("retRef").value || "";
	if (!idCuenta || !monto) {
		showToast("Completa cuenta y monto.");
		return;
	}
	if (state.isDemo) {
		applyDemoBalance(idCuenta, -monto);
		showToast("Demo: retiro aplicado.");
		return;
	}
	await postOperacion(endpoints.retiro, { idCuenta, monto, referencia });
}

async function submitTransferencia(event) {
	event.preventDefault();
	const idCuentaOrigen = dom.trfOrigen.value;
	const idCuentaDestino = document.getElementById("trfDestino").value.trim();
	const monto = Number(document.getElementById("trfMonto").value || 0);
	const descripcion = document.getElementById("trfDesc").value || "Transferencia";
	if (!idCuentaOrigen || !idCuentaDestino || !monto) {
		showToast("Completa cuentas y monto.");
		return;
	}
	if (state.isDemo) {
		applyDemoBalance(idCuentaOrigen, -monto);
		showToast("Demo: transferencia aplicada.");
		return;
	}
	await postOperacion(endpoints.transferir, {
		idCuentaOrigen,
		idCuentaDestino,
		monto,
		descripcion
	});
}

async function submitPago(event) {
	event.preventDefault();
	const idCuenta = dom.pagoCuenta.value;
	const tipoServicio = Number(document.getElementById("pagoServicio").value);
	const identificador = document.getElementById("pagoIdentificador").value.trim();
	const numeroTarjeta = document.getElementById("pagoTarjeta").value.trim();
	const pin = document.getElementById("pagoPin").value.trim();
	const monto = Number(document.getElementById("pagoMonto").value || 0);
	const referenciaCliente = document.getElementById("pagoRef").value || "";

	if (!idCuenta || !tipoServicio || !identificador || !numeroTarjeta || !pin || !monto) {
		showToast("Completa todos los datos del pago.");
		return;
	}
	if (state.isDemo) {
		applyDemoBalance(idCuenta, -monto);
		showToast("Demo: pago aplicado.");
		return;
	}

	await postOperacion(endpoints.pagoEjecutar, {
		numeroTarjeta,
		pin,
		tipoServicio,
		identificador,
		monto,
		referenciaCliente
	});
}

async function postOperacion(url, payload) {
	setLoading(true);
	try {
		await apiRequest(url, { method: "POST", body: payload });
		showToast("Operacion completada.");
		await refreshAll();
	} catch (err) {
		showToast(err.message || "Error en la operacion.", "error");
	} finally {
		setLoading(false);
	}
}

function paintAccounts() {
	const items = state.accounts;
	dom.accountsList.innerHTML = "";
	if (!items.length) {
		dom.accountsList.innerHTML = "<div class=\"hint\">Sin cuentas para mostrar.</div>";
		return;
	}
	items.forEach((account) => {
		const card = document.createElement("div");
		card.className = "mini-card";
		card.innerHTML = `
			<div class="mini-card-title">
				<div class="mini-card-name">${escapeHtml(account.tipo || "Cuenta")}</div>
				<div class="mini-card-meta">${escapeHtml(account.numero || account.idCuenta)}</div>
			</div>
			<div class="money">${formatMoney(account.saldo, account.moneda)}</div>
		`;
		dom.accountsList.appendChild(card);
	});
}

function fillAccountSelects() {
	const selects = [dom.movCuenta, dom.depCuenta, dom.retCuenta, dom.trfOrigen, dom.pagoCuenta];
	selects.forEach((select) => {
		select.innerHTML = "";
		const placeholder = document.createElement("option");
		placeholder.value = "";
		placeholder.textContent = "Selecciona";
		select.appendChild(placeholder);
	});

	state.accounts.forEach((account) => {
		selects.forEach((select) => {
			const option = document.createElement("option");
			option.value = account.idCuenta;
			option.textContent = `${account.numero || account.idCuenta} · ${account.tipo || "Cuenta"}`;
			select.appendChild(option);
		});
	});
}

function renderMovimientos(items) {
	if (!Array.isArray(items)) {
		items = [];
	}
	const rows = items
		.map((mov) => {
			const monto = Number(mov.monto ?? mov.Monto ?? 0);
			const saldo = Number(mov.saldo ?? mov.Saldo ?? 0);
			return `
				<tr>
					<td>${formatDate(mov.fecha || mov.Fecha)}</td>
					<td>${escapeHtml(mov.tipo || mov.Tipo || "")}</td>
					<td class="right money">${formatMoney(monto)}</td>
					<td class="right money">${formatMoney(saldo)}</td>
					<td>${escapeHtml(mov.detalle || mov.Descripcion || "")}</td>
				</tr>
			`;
		})
		.join("");
	dom.movimientosBody.innerHTML = rows || "<tr><td colspan=\"5\">Sin movimientos.</td></tr>";
}

function renderBitacora(items) {
	if (!Array.isArray(items)) {
		items = [];
	}
	const rows = items
		.map((item) => {
			const monto = Number(item.monto ?? item.Monto ?? 0);
			return `
				<tr>
					<td>${formatDate(item.fecha || item.Fecha)}</td>
					<td>${escapeHtml(item.accion || item.Accion || "")}</td>
					<td>${escapeHtml(item.detalle || item.Detalle || "")}</td>
					<td class="right money">${formatMoney(monto)}</td>
				</tr>
			`;
		})
		.join("");
	const body = document.getElementById("bitacoraBody");
	body.innerHTML = rows || "<tr><td colspan=\"4\">Sin registros.</td></tr>";
}

function resetTables() {
	dom.accountsList.innerHTML = "";
	dom.movimientosBody.innerHTML = "";
	const body = document.getElementById("bitacoraBody");
	body.innerHTML = "";
	fillAccountSelects();
}

function normalizeAccounts(data) {
	if (!data) {
		return [];
	}
	const list = Array.isArray(data) ? data : data.items || data.cuentas || [];
	return list.map((account) => ({
		idCuenta: account.idCuenta ?? account.IdCuenta ?? account.id ?? account.Id,
		numero: account.numero ?? account.NumeroCuenta ?? account.cuenta,
		tipo: account.tipo ?? account.TipoCuenta ?? account.descripcion,
		saldo: Number(account.saldo ?? account.Saldo ?? 0),
		moneda: account.moneda ?? account.Moneda ?? "GTQ"
	}));
}

function extractToken(data) {
	if (!data || typeof data !== "object") {
		return null;
	}
	return data.token || data.accessToken || data.jwt || data.bearerToken || null;
}

async function apiRequest(path, options = {}) {
	const { method = "GET", body, auth = true } = options;
	const url = `${API_BASE_URL}${path}`;
	const headers = { Accept: "application/json" };
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}
	if (auth && state.token) {
		headers.Authorization = `Bearer ${state.token}`;
	}

	const response = await fetch(url, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined
	});

	if (!response.ok) {
		const errText = await safeText(response);
		throw new Error(errText || `HTTP ${response.status}`);
	}

	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		return response.json();
	}
	const text = await response.text();
	return text ? text : null;
}

async function safeText(response) {
	try {
		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			const data = await response.json();
			return data.message || data.error || JSON.stringify(data);
		}
		return await response.text();
	} catch {
		return "";
	}
}

function showToast(message, type) {
	dom.toast.textContent = message;
	dom.toast.classList.toggle("error", type === "error");
	dom.toast.hidden = false;
	setTimeout(() => {
		dom.toast.hidden = true;
	}, 2800);
}

function setLoading(isLoading) {
	dom.overlay.hidden = !isLoading;
	dom.overlay.setAttribute("aria-hidden", String(!isLoading));
}

function formatMoney(value, currency = "GTQ") {
	const amount = Number(value || 0);
	return amount.toLocaleString("es-GT", {
		style: "currency",
		currency,
		minimumFractionDigits: 2
	});
}

function formatDate(value) {
	if (!value) {
		return "-";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return String(value);
	}
	return date.toLocaleString("es-GT");
}

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function applyDemoBalance(accountId, delta) {
	const target = state.accounts.find((acc) => String(acc.idCuenta) === String(accountId));
	if (!target) {
		return;
	}
	target.saldo = Number(target.saldo || 0) + Number(delta || 0);
	paintAccounts();
}

function capitalize(value) {
	return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}
