import { Router } from "express";
import { getSubscriptionController } from "./subscription.controller.js";
import { authenticate, requireRole } from "../auth/auth.middleware.js";

const router = Router();

router.get("/", authenticate, requireRole("ADMIN"), getSubscriptionController);

export default router;