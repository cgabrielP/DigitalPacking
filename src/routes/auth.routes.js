import { Router } from "express";
import { redirectToML, handleCallback } from "../controllers/auth.controller.js";

const router = Router();

// 1️⃣ Redirige a Mercado Libre
router.get("/mercadolibre", redirectToML);

// 2️⃣ Callback que recibe el code
router.get("/callback", handleCallback);

export default router;
