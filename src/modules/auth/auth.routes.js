import { Router } from "express";
import { loginMercadoLibre, callbackMercadoLibre, getMLUser } from "./auth.controller.js";
import { authenticate } from "./auth.middleware.js";

const router = Router();

router.get("/mercadolibre", loginMercadoLibre);
router.get("/callback", callbackMercadoLibre);
router.get("/ml/user", authenticate,getMLUser);


export default router;
