import { Router } from "express";
import { getDBOrders, getLabelController, packOrderController, scanOrderController, syncOrdersController } from "./orders.controller.js";
import { authenticate, authenticateQuery, checkSubscription } from "../auth/auth.middleware.js";

const router = Router();

router.get("/",              authenticate,      checkSubscription, getDBOrders);
router.post("/scan",         authenticate,      checkSubscription, scanOrderController);
router.post("/sync",         authenticate,      checkSubscription, syncOrdersController);
router.post("/pack/:orderId",authenticate,      checkSubscription, packOrderController);
router.get("/:orderId/label",authenticateQuery, checkSubscription, getLabelController);

export default router;
