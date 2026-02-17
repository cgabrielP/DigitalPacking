import { Router } from "express";
import { getMLOrders } from "./orders.controller";

const router = Router();

router.get("/ml/orders/:tenantId", getMLOrders);


export default router;
