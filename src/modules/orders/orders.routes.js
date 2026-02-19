import { Router } from "express";
import { getMLOrders, scanOrderController, syncOrdersController } from "./orders.controller.js";

const router = Router();

router.get("/:tenantId", getMLOrders);
router.post("/scan/:tenantId", scanOrderController);
router.post("/sync/:tenantId", syncOrdersController);

export default router;
