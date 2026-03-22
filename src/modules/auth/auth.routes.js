import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
    register,
    login,
    loginMercadoLibre,
    callbackMercadoLibre,
    getMlAccounts,
    getMLUser,
} from "./auth.controller.js";
import { authenticate, authenticateQuery, requireRole } from "./auth.middleware.js";

const router = Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Demasiados registros, intentá de nuevo en 1 hora" },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Demasiados intentos de login, intentá de nuevo en 15 minutos" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth propio ──────────────────────────────────────────────────────────────
router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);

// ── Mercado Libre OAuth ──────────────────────────────────────────────────────
// Requiere JWT: el tenantId viaja en el `state` de OAuth
router.get("/mercadolibre", authenticateQuery, loginMercadoLibre)
router.get("/callback", callbackMercadoLibre);

// ── Cuentas ML del tenant ────────────────────────────────────────────────────
router.get("/ml/accounts", authenticate, getMlAccounts);
router.get("/ml/user", authenticate, getMLUser);

export default router;