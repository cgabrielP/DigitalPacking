import { Router } from "express";
import { authenticate, requireRole, checkSubscription } from "../auth/auth.middleware.js";
import { getAccounts, connectAccount, disconnectAccount } from "./accounts.controller.js";

const router = Router();

// All routes require auth + ADMIN role + active subscription
router.use(authenticate, requireRole("ADMIN"), checkSubscription);

router.get("/", getAccounts);
router.post("/", connectAccount);
router.delete("/:accountId", disconnectAccount);

export default router;
