import * as adminService from "./admin.service.js";

const VALID_ROLES = ["ADMIN", "SUPERVISOR", "PICKER", "DELIVERY"];

// ─────────────────────────────────────────
//  GET /admin/users
// ─────────────────────────────────────────

export const getUsers = async (req, res) => {
  try {
    const users = await adminService.getUsers(req.tenantId);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────
//  POST /admin/users
// ─────────────────────────────────────────

export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role)
      return res.status(400).json({ error: "name, email, password y role son requeridos" });

    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: `Rol inválido. Válidos: ${VALID_ROLES.join(", ")}` });

    if (password.length < 8)
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });

    const user = await adminService.createUser(req.tenantId, { name, email, password, role });
    res.status(201).json(user);
  } catch (error) {
    const isKnown = error.message === "El email ya existe en esta empresa";
    res.status(isKnown ? 409 : 500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────
//  DELETE /admin/users/:userId
// ─────────────────────────────────────────

export const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // No puede desactivarse a sí mismo
    if (userId === req.userId)
      return res.status(400).json({ error: "No podés desactivar tu propio usuario" });

    const result = await adminService.deactivateUser(req.tenantId, userId);
    res.json(result);
  } catch (error) {
    const isKnown = error.message === "Usuario no encontrado";
    res.status(isKnown ? 404 : 500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────
//  PATCH /admin/users/:userId/role
// ─────────────────────────────────────────

export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role }   = req.body;

    if (!role || !VALID_ROLES.includes(role))
      return res.status(400).json({ error: `Rol inválido. Válidos: ${VALID_ROLES.join(", ")}` });

    // No puede cambiarse el rol a sí mismo
    if (userId === req.userId)
      return res.status(400).json({ error: "No podés cambiar tu propio rol" });

    const user = await adminService.updateUserRole(req.tenantId, userId, role);
    res.json(user);
  } catch (error) {
    const isKnown = error.message === "Usuario no encontrado";
    res.status(isKnown ? 404 : 500).json({ error: error.message });
  }
};