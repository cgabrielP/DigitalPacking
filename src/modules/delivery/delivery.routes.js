import { Router } from "express";
import {
  getPaymentConfigController,
  upsertPaymentConfigController,
  assignOrderController,
  unassignOrderController,
  getAssignmentsController,
  getDeliveryReportController,
} from "./delivery.controller.js";
import { authenticate, checkSubscription, requireRole } from "../auth/auth.middleware.js";

const router = Router();

router.get("/config",              authenticate, checkSubscription, requireRole("ADMIN"), getPaymentConfigController);
router.post("/config",             authenticate, checkSubscription, requireRole("ADMIN"), upsertPaymentConfigController);

router.post("/assign",             authenticate, checkSubscription, requireRole("ADMIN", "SUPERVISOR"), assignOrderController);
router.delete("/assign/:orderId",  authenticate, checkSubscription, requireRole("ADMIN", "SUPERVISOR"), unassignOrderController);
router.get("/assignments",         authenticate, checkSubscription, getAssignmentsController);

router.get("/report",              authenticate, checkSubscription, getDeliveryReportController);

export default router;