import { Router } from "express";
import { createLog, getLogs } from "./log.controller.js";
import { authenticate, requireRole } from "../auth/auth.middleware.js";

const router = Router();

router.post("/", authenticate, createLog);

router.get("/", authenticate, requireRole("ADMIN", "SUPERVISOR"), getLogs);

export default router;