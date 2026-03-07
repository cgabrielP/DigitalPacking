import { Router } from "express";
import {
  register,
  login,
  loginMercadoLibre,
  callbackMercadoLibre,
  getMlAccounts,
  getMLUser,
} from "./auth.controller.js";
import { authenticate, requireRole } from "./auth.middleware.js";

const router = Router();

// ── Auth propio ──────────────────────────────────────────────────────────────
router.post("/register", register);
router.post("/login",    login);

// ── Mercado Libre OAuth ──────────────────────────────────────────────────────
// Requiere JWT: el tenantId viaja en el `state` de OAuth
router.get("/mercadolibre", authenticate, loginMercadoLibre);
router.get("/callback",     callbackMercadoLibre);          

// ── Cuentas ML del tenant ────────────────────────────────────────────────────
router.get("/ml/accounts", authenticate, getMlAccounts);
router.get("/ml/user",     authenticate, getMLUser);

export default router;