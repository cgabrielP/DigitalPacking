import { Router } from "express";
import { createLog, getLogs } from "./log.controller.js";
import { authenticate, checkSubscription, requireRole } from "../auth/auth.middleware.js";

const router = Router();

router.post("/", authenticate, checkSubscription, createLog);
router.get("/",  authenticate, checkSubscription, requireRole("ADMIN", "SUPERVISOR"), getLogs);

export default router;