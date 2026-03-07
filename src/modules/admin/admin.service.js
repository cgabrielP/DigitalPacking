import bcrypt from "bcrypt";
import prisma from "../../database/prisma.js";

// ─────────────────────────────────────────
//  LISTAR USUARIOS DEL TENANT
// ─────────────────────────────────────────

export const getUsers = async (tenantId) => {
  return prisma.user.findMany({
    where:   { tenantId },
    select:  { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
};

// ─────────────────────────────────────────
//  CREAR USUARIO EN EL TENANT
// ─────────────────────────────────────────

export const createUser = async (tenantId, { name, email, password, role }) => {
  // Email único por tenant
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) throw new Error("El email ya existe en esta empresa");

  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: { name, email, passwordHash, role, tenantId },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
};


export const deactivateUser = async (tenantId, userId) => {
  // Verificar que el usuario pertenece al tenant
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new Error("Usuario no encontrado");

  // No permitir desactivarse a uno mismo
  // (se valida en el controller comparando con req.userId)

  return prisma.user.update({
    where: { id: userId },
    data:  { isActive: false },
    select: { id: true, name: true, isActive: true },
  });
};

// ─────────────────────────────────────────
//  ACTUALIZAR ROL
// ─────────────────────────────────────────

export const updateUserRole = async (tenantId, userId, role) => {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new Error("Usuario no encontrado");

  return prisma.user.update({
    where:  { id: userId },
    data:   { role },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
};