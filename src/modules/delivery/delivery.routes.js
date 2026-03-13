import { Router } from "express";
import {
  getPaymentConfigController,
  upsertPaymentConfigController,
  assignOrderController,
  unassignOrderController,
  getAssignmentsController,
  getDeliveryReportController,
} from "./delivery.controller.js";
import { authenticate, requireRole } from "../auth/auth.middleware.js";

const router = Router();

// ── Config de pago — solo ADMIN ──────────────────────────────────────────────
router.get("/config",  authenticate, requireRole("ADMIN"), getPaymentConfigController);
router.post("/config", authenticate, requireRole("ADMIN"), upsertPaymentConfigController);

// ── Asignaciones — ADMIN y SUPERVISOR asignan, DELIVERY solo lee las suyas ──
router.post("/assign",               authenticate, requireRole("ADMIN", "SUPERVISOR"), assignOrderController);
router.delete("/assign/:orderId",    authenticate, requireRole("ADMIN", "SUPERVISOR"), unassignOrderController);
router.get("/assignments",           authenticate, getAssignmentsController);

// ── Reporte de pagos — ADMIN, SUPERVISOR y el propio DELIVERY ───────────────
router.get("/report", authenticate, getDeliveryReportController);

export default router;