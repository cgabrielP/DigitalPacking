import jwt from "jsonwebtoken";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const token   = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId   = decoded.userId;
    req.tenantId = decoded.tenantId;
    req.role     = decoded.role;

    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
};

// ─── Guard de roles ───────────────────────────────────────────────────────────
// Uso: router.delete("/users/:id", authenticate, requireRole("ADMIN"), controller)

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.role)) {
    return res.status(403).json({ error: "No tienes permisos para esta acción" });
  }
  next();
};