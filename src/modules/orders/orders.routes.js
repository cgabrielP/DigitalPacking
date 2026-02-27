import { Router } from "express";
import { getDBOrders, scanOrderController, syncOrdersController } from "./orders.controller.js";
import { authenticate } from "../auth/auth.middleware.js";

const router = Router();

router.get("/", authenticate, getDBOrders);
router.post("/scan", authenticate, scanOrderController);
router.post("/sync", authenticate, syncOrdersController);
router.post("/pack/:orderId", authenticate, syncOrdersController);

export default router;
