"use strict";

const API_BASE_URL = "https://bancocentroamericano.azurewebsites.net";

const endpoints = {
	login: "/api/Auth/login",
	cuentas: "/api/Cuentahabientes/{idCliente}/cuentas",
	bitacora: "/api/Bitacora/kardex/{idCuenta}",
	deposito: "/api/Operaciones/deposito",
	retiro: "/api/Operaciones/retiro",
	transferir: "/api/Operaciones/transferir",
	consultaSaldo: "/api/Operaciones/saldo/{idCuenta}",
	pagoValidar: "/api/Pagos/validar",
	pagoEjecutar: "/api/Pagos/ejecutar",
	consultarDeuda: "/api/Pagos/consultar-deuda/{tipoServicio}/{identificador}"
};

const dom = {
	loginForm: document.getElementById("loginForm"),
	loginUser: document.getElementById("loginUser"),
	loginPass: document.getElementById("loginPass"),
	btnUseDemo: document.getElementById("btnUseDemo"),
	btnLogout: document.getElementById("btnLogout"),
	apiBaseInput: document.getElementById("apiBaseInput"),
	btnSaveApi: document.getElementById("btnSaveApi"),
	btnAddCuenta: document.getElementById("btnAddCuenta"),
	addCuentaId: document.getElementById("addCuentaId"),
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
	idCliente: null,
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
	seedApiBaseInput();
	restoreSession();
}

function bindEvents() {
	dom.loginForm.addEventListener("submit", handleLogin);
	dom.btnUseDemo.addEventListener("click", useDemo);
	dom.btnLogout.addEventListener("click", logout);
	dom.btnSaveApi.addEventListener("click", saveApiBase);
	dom.btnAddCuenta.addEventListener("click", addCuenta);
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
	const savedCliente = localStorage.getItem("bank.idCliente");
	if (savedUser && (savedToken || savedCliente)) {
		state.token = savedToken;
		state.user = savedUser;
		state.idCliente = savedCliente ? Number(savedCliente) : null;
		state.isDemo = false;
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
		state.idCliente = idCliente;
		state.isDemo = false;
		localStorage.setItem("bank.user", credencial);
		if (idCliente) {
			localStorage.setItem("bank.idCliente", String(idCliente));
		} else {
			localStorage.removeItem("bank.idCliente");
		}
		if (token) {
			localStorage.setItem("bank.token", token);
		} else {
			localStorage.removeItem("bank.token");
		}
		if (!idCliente && !token) {
			showToast("Login sin IdCliente ni token en la respuesta.", "error");
			return;
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
	state.idCliente = null;
	state.accounts = demoData.accounts.slice();
	localStorage.setItem("bank.user", state.user);
	localStorage.removeItem("bank.token");
	localStorage.removeItem("bank.idCliente");
	setSessionUI(true);
	paintAccounts();
	fillAccountSelects();
	showToast("Modo demo activo. No se hace llamada real a la API.");
}

function logout() {
	state.user = null;
	state.token = null;
	state.idCliente = null;
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
	if (!state.idCliente) {
		await loadAccountsByIds();
		return;
	}
	setLoading(true);
	try {
		const path = endpoints.cuentas.replace("{idCliente}", String(state.idCliente));
		const data = await apiRequest(path);
		state.accounts = normalizeAccounts(data);
		if (state.accounts.length) {
			state.accounts.forEach((acc) => persistAccountId(acc.idCuenta));
		}
		paintAccounts();
		fillAccountSelects();
		if (!state.accounts.length) {
			showToast("No hay cuentas activas para este cliente.");
		}
	} catch (err) {
		showToast(err.message || "No se pudieron cargar cuentas.", "error");
		await loadAccountsByIds();
	} finally {
		setLoading(false);
	}
}

async function loadAccountsByIds() {
	const accountIds = readAccountIds();
	if (!accountIds.length) {
		showToast("Agrega el ID de una cuenta para consultar saldo.");
		return;
	}
	setLoading(true);
	try {
		const results = await Promise.all(
			accountIds.map(async (idCuenta) => {
				const saldo = await fetchSaldo(idCuenta);
				return {
					idCuenta,
					numero: idCuenta,
					tipo: "Cuenta",
					saldo,
					moneda: "GTQ"
				};
			})
		);
		state.accounts = results;
		paintAccounts();
		fillAccountSelects();
	} catch (err) {
		showToast(err.message || "No se pudo consultar saldo.", "error");
	} finally {
		setLoading(false);
	}
}

async function addCuenta() {
	const idCuenta = dom.addCuentaId.value.trim();
	if (!idCuenta) {
		showToast("Ingresa un ID de cuenta.");
		return;
	}
	if (state.isDemo) {
		showToast("Modo demo: no se consulta saldo real.");
		return;
	}
	setLoading(true);
	try {
		const saldo = await fetchSaldo(idCuenta);
		upsertAccount({
			idCuenta,
			numero: idCuenta,
			tipo: "Cuenta",
			saldo,
			moneda: "GTQ"
		});
		persistAccountId(idCuenta);
		dom.addCuentaId.value = "";
		paintAccounts();
		fillAccountSelects();
		showToast("Cuenta agregada.");
	} catch (err) {
		showToast(err.message || "No se pudo agregar la cuenta.", "error");
	} finally {
		setLoading(false);
	}
}

async function fetchSaldo(idCuenta) {
	const url = endpoints.consultaSaldo.replace("{idCuenta}", String(idCuenta));
	const data = await apiRequest(url);
	if (typeof data === "number") {
		return data;
	}
	if (typeof data === "string" && data.trim()) {
		const numeric = Number(data);
		return Number.isNaN(numeric) ? 0 : numeric;
	}
	return Number(
		data?.saldoDisponible ??
			data?.SaldoDisponible ??
			data?.saldo ??
			data?.Saldo ??
			0
	);
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
		const url = withQueryParams(
			endpoints.bitacora.replace("{idCuenta}", accountId),
			getBitacoraFilters()
		);
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
		referenciaCliente: referenciaCliente || null
	});
}

async function postOperacion(url, payload) {
	setLoading(true);
	try {
		await apiRequest(url, { method: "POST", body: normalizeApiPayload(payload) });
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
			const saldo = mov.saldo ?? mov.Saldo;
			const tipo =
				mov.tipo ||
				mov.Tipo ||
				mov.codigoTipoTransaccion ||
				mov.CodigoTipoTransaccion ||
				"";
			const detalle =
				mov.detalle ||
				mov.Detalle ||
				mov.descripcionTipoTransaccion ||
				mov.DescripcionTipoTransaccion ||
				"";
			return `
				<tr>
					<td>${formatDate(mov.fecha || mov.Fecha || mov.fechaUtc || mov.FechaUtc)}</td>
					<td>${escapeHtml(tipo)}</td>
					<td class="right money">${formatMoney(monto)}</td>
					<td class="right money">${saldo != null ? formatMoney(saldo) : "—"}</td>
					<td>${escapeHtml(detalle)}</td>
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
			const accion =
				item.accion ||
				item.Accion ||
				item.codigoTipoTransaccion ||
				item.CodigoTipoTransaccion ||
				"";
			const detalle =
				item.detalle ||
				item.Detalle ||
				item.descripcionTipoTransaccion ||
				item.DescripcionTipoTransaccion ||
				"";
			return `
				<tr>
					<td>${formatDate(item.fecha || item.Fecha || item.fechaUtc || item.FechaUtc)}</td>
					<td>${escapeHtml(accion)}</td>
					<td>${escapeHtml(detalle)}</td>
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
		numero:
			account.numero ??
			account.NumeroCuenta ??
			account.noCuenta ??
			account.NoCuenta ??
			account.cuenta,
		tipo:
			account.tipo ??
			account.TipoCuenta ??
			account.descripcionTipoCuenta ??
			account.DescripcionTipoCuenta ??
			account.descripcion,
		saldo: Number(
			account.saldo ??
				account.Saldo ??
				account.saldoDisponible ??
				account.SaldoDisponible ??
				0
		),
		moneda: account.moneda ?? account.Moneda ?? "GTQ"
	}));
}

function normalizeApiPayload(payload) {
	const out = { ...payload };
	for (const key of ["idCuenta", "idCuentaOrigen", "idCuentaDestino"]) {
		if (out[key] !== undefined && out[key] !== "") {
			out[key] = Number(out[key]);
		}
	}
	if (out.tipoServicio !== undefined && out.tipoServicio !== "") {
		out.tipoServicio = Number(out.tipoServicio);
	}
	if (out.monto !== undefined) {
		out.monto = Number(out.monto);
	}
	return out;
}

function extractIdCliente(data) {
	if (!data || typeof data !== "object") {
		return null;
	}
	const raw = data.idCliente ?? data.IdCliente ?? null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readAccountIds() {
	const raw = localStorage.getItem("bank.accountIds");
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function persistAccountId(idCuenta) {
	const list = readAccountIds();
	if (!list.includes(idCuenta)) {
		list.push(idCuenta);
		localStorage.setItem("bank.accountIds", JSON.stringify(list));
	}
}

function upsertAccount(account) {
	const index = state.accounts.findIndex(
		(item) => String(item.idCuenta) === String(account.idCuenta)
	);
	if (index >= 0) {
		state.accounts[index] = { ...state.accounts[index], ...account };
		return;
	}
	state.accounts.push(account);
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

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

	let response;
	try {
		response = await fetch(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: controller.signal
		});
	} catch (err) {
		if (err.name === "AbortError") {
			throw new Error(
				`La API no respondió a tiempo (${API_TIMEOUT_MS / 1000}s). Verifica que el backend esté en ${API_BASE_URL}`
			);
		}
		throw new Error(
			`No se pudo conectar con ${API_BASE_URL}. ¿Está el API en ejecución? (${err.message || err})`
		);
	} finally {
		clearTimeout(timeoutId);
	}

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

async function apiRequestWithResponse(path, options = {}) {
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
	let data = null;
	if (contentType.includes("application/json")) {
		data = await response.json();
	} else {
		const text = await response.text();
		data = text ? text : null;
	}
	return { data, response };
}

async function safeText(response) {
	try {
		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			const data = await response.json();
			if (typeof data === "string") {
				return data;
			}
			if (data.title) {
				const detail = formatValidationErrors(data.errors);
				return detail ? `${data.title}: ${detail}` : data.title;
			}
			if (data.error) {
				return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
			}
			return data.message || data.mensaje || JSON.stringify(data);
		}
		return await response.text();
	} catch {
		return "";
	}
}

function formatValidationErrors(errors) {
	if (!errors || typeof errors !== "object") {
		return "";
	}
	return Object.entries(errors)
		.flatMap(([, messages]) => (Array.isArray(messages) ? messages : [messages]))
		.filter(Boolean)
		.join(" ");
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

function getBitacoraFilters() {
	const desde = document.getElementById("bitDesde").value;
	const hasta = document.getElementById("bitHasta").value;
	const params = {};
	if (desde) {
		params.desde = new Date(desde).toISOString();
	}
	if (hasta) {
		params.hasta = new Date(hasta).toISOString();
	}
	return params;
}

function withQueryParams(path, params) {
	if (!params || Object.keys(params).length === 0) {
		return path;
	}
	const search = new URLSearchParams(params);
	return `${path}?${search.toString()}`;
}

function resolveApiBase() {
	const params = new URLSearchParams(window.location.search);
	const fromQuery = params.get("api");
	if (fromQuery) {
		const trimmed = fromQuery.trim().replace(/\/$/, "");
		localStorage.setItem("bank.apiBase", trimmed);
		return trimmed;
	}
	const stored = localStorage.getItem("bank.apiBase");
	if (stored) {
		return stored.replace(/\/$/, "");
	}
	return DEFAULT_API_BASE_URL;
}

function seedApiBaseInput() {
	if (dom.apiBaseInput) {
		dom.apiBaseInput.value = API_BASE_URL;
	}
}

function saveApiBase() {
	const value = dom.apiBaseInput.value.trim().replace(/\/$/, "");
	if (!value) {
		showToast("Ingresa una URL valida.", "error");
		return;
	}
	localStorage.setItem("bank.apiBase", value);
	showToast("API base actualizada. Recarga la pagina.");
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
