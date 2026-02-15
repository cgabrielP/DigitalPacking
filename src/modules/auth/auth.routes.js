import { Router } from "express";
import { loginMercadoLibre, callbackMercadoLibre } from "./auth.controller.js";

const router = Router();

router.get("/mercadolibre", loginMercadoLibre);
router.get("/callback", callbackMercadoLibre);

export default router;
