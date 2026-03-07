import { Router } from "express";
import { getUsers, createUser, deactivateUser, updateUserRole } from "./admin.controller.js";
import { authenticate, requireRole } from "../auth/auth.middleware.js";

const router = Router();


router.use(authenticate);
router.use(requireRole("ADMIN"));

router.get   ("/users",                getUsers);        
router.post  ("/users",                createUser);      
router.delete("/users/:userId",        deactivateUser);  
router.patch ("/users/:userId/role",   updateUserRole);  

export default router;