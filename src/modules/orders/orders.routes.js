import { Router } from "express";
import { getDBOrders, scanOrderController, syncOrdersController } from "./orders.controller.js";

const router = Router();

router.get("/:tenantId", getDBOrders);
router.post("/scan/:tenantId", scanOrderController);
router.post("/sync/:tenantId", syncOrdersController);

export default router;
