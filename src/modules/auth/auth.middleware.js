import jwt from "jsonwebtoken";
import prisma from "../../database/prisma.js";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.userId;
    req.tenantId = decoded.tenantId;
    req.role = decoded.role;

    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
};

export const authenticateQuery = (req, res, next) => {
  const token = req.query.token || req.headers.authorization?.split(" ")[1]
  if (!token) return res.status(401).json({ error: "No autorizado" })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = decoded.userId
    req.tenantId = decoded.tenantId
    req.role = decoded.role
    next()
  } catch {
    res.status(401).json({ error: "Token inválido" })
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.role)) {
    return res.status(403).json({ error: "No tienes permisos para esta acción" });
  }
  next();
};

export const checkSubscription = async (req, res, next) => {
  const tenantId = req.tenantId;

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
  });

  if (!subscription) {
    return res.status(403).json({ error: "Sin suscripción activa" });
  }

  console.log("CHECK SUBSCRIPTION:", tenantId, subscription); 
  if (subscription.plan === "TRIAL" && subscription.status === "ACTIVE") {
    if (new Date() > new Date(subscription.trialEndsAt)) {
      await prisma.subscription.update({
        where: { tenantId },
        data: { status: "EXPIRED" },
      });
      return res.status(403).json({ error: "trial_expired" });
    }
  }

  if (subscription.status === "EXPIRED" || subscription.status === "CANCELLED") {
    return res.status(403).json({ error: "trial_expired" });
  }

  req.subscription = subscription;
  next();
};