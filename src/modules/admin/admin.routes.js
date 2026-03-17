import { Router } from "express";
import { getUsers, createUser, deactivateUser, updateUserRole } from "./admin.controller.js";
import { authenticate, checkSubscription, requireRole } from "../auth/auth.middleware.js";

const router = Router();

router.use(authenticate, checkSubscription); 

// SUPERVISOR puede leer usuarios (para poblar el dropdown de delivery en AssignDelivery)
router.get("/users", requireRole("ADMIN", "SUPERVISOR"), getUsers);

// Solo ADMIN puede crear, desactivar y cambiar roles
router.post  ("/users",              requireRole("ADMIN"), createUser);
router.delete("/users/:userId",      requireRole("ADMIN"), deactivateUser);
router.patch ("/users/:userId/role", requireRole("ADMIN"), updateUserRole);

export default router;