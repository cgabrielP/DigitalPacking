import { Router } from "express";
import { getDBOrders, packOrderController, scanOrderController, syncOrdersController } from "./orders.controller.js";
import { authenticate } from "../auth/auth.middleware.js";

const router = Router();

router.get("/", authenticate, getDBOrders);
router.post("/scan", authenticate, scanOrderController);
router.post("/sync", authenticate, syncOrdersController);
router.post("/pack/:orderId", authenticate, packOrderController);

export default router;
