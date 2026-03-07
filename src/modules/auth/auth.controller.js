import * as authService from "./auth.service.js";

// ─────────────────────────────────────────
//  REGISTRO
// ─────────────────────────────────────────

export const register = async (req, res) => {
  try {
    const { name, email, password, tenantName } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email y password son requeridos" });

    const result = await authService.registerUser({ name, email, password, tenantName });
    res.status(201).json(result);
  } catch (error) {
    const isKnown = error.message === "El email ya está registrado";
    res.status(isKnown ? 409 : 500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "email y password son requeridos" });

    const result = await authService.loginUser({ email, password });
    res.json(result);
  } catch (error) {
    const isKnown = error.message === "Credenciales inválidas";
    res.status(isKnown ? 401 : 500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────
//  MERCADO LIBRE — iniciar OAuth
//  Requiere autenticación: lee tenantId del JWT
// ─────────────────────────────────────────

export const loginMercadoLibre = (req, res) => {
  const url = authService.getMercadoLibreAuthUrl(req.tenantId);
  res.redirect(url);
};

// ─────────────────────────────────────────
//  MERCADO LIBRE — callback
// ─────────────────────────────────────────

export const callbackMercadoLibre = async (req, res) => {
  try {
    const { code, state } = req.query;
    await authService.handleMercadoLibreCallback(code, state);
    res.redirect(`${process.env.FRONTEND_URL}/settings/accounts?connected=true`);
  } catch (error) {
    console.error("Error en callback ML:", error.message);
    res.redirect(`${process.env.FRONTEND_URL}/settings/accounts?connected=false`);
  }
};

// ─────────────────────────────────────────
//  LISTAR CUENTAS ML DEL TENANT
// ─────────────────────────────────────────

export const getMlAccounts = async (req, res) => {
  try {
    const accounts = await authService.getMlAccounts(req.tenantId);
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMLUser = async (req, res) => {
  try {
    const user = await authService.getMercadoLibreUser(req.tenantId);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};