import axios from "axios";
import bcrypt from "bcrypt";
import prisma from "../../database/prisma.js";
import jwt from "jsonwebtoken";

const { ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI } = process.env;

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });


export const registerUser = async ({ name, email, password, tenantName }) => {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) throw new Error("El email ya está registrado");

  const { user, tenant, subscription } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: tenantName ?? `Empresa de ${name}` },
    });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await tx.user.create({
      data: { email, passwordHash, name, role: "ADMIN", tenantId: tenant.id },
    });

    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const subscription = await tx.subscription.create({
      data: {
        tenantId:    tenant.id,
        plan:        "TRIAL",
        status:      "ACTIVE",
        trialEndsAt,
      },
    });

    return { user, tenant, subscription };
  });

  const token = signToken({
    userId:      user.id,
    tenantId:    tenant.id,
    role:        user.role,
    name:        user.name,
    plan:        "TRIAL",
    trialEndsAt: subscription.trialEndsAt,
  });

  return {
    token,
    user:   { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: tenant.id, name: tenant.name },
  };
};


export const loginUser = async ({ email, password }) => {
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    include: { tenant: true },
  });

  if (!user) throw new Error("Credenciales inválidas");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Credenciales inválidas");

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: user.tenantId },
  });

  const token = signToken({
    userId:      user.id,
    tenantId:    user.tenantId,
    role:        user.role,
    name:        user.name,
    plan:        subscription?.plan        ?? "TRIAL",
    trialEndsAt: subscription?.trialEndsAt ?? null,
  });

  return {
    token,
    user:   { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: user.tenant.id, name: user.tenant.name },
  };
};

// ─────────────────────────────────────────
//  MERCADO LIBRE — OAuth
// ─────────────────────────────────────────

/**
 * Genera la URL de autorización.
 * Embebe el tenantId en el parámetro `state` para recuperarlo en el callback.
 */
export const getMercadoLibreAuthUrl = (tenantId) => {
  const state = Buffer.from(JSON.stringify({ tenantId })).toString("base64");
  return (
    `https://auth.mercadolibre.cl/authorization` +
    `?response_type=code` +
    `&client_id=${ML_CLIENT_ID}` +
    `&redirect_uri=${ML_REDIRECT_URI}` +
    `&state=${state}`
  );
};

/**
 * Procesa el callback de ML.
 * Lee el tenantId desde `state` y vincula/actualiza la cuenta ML a ese tenant.
 */
export const handleMercadoLibreCallback = async (code, state) => {
  // 1. Decodificar state para obtener tenantId
  let tenantId;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
    tenantId = decoded.tenantId;
  } catch {
    throw new Error("State inválido en callback de ML");
  }

  // 2. Intercambiar code por tokens en ML
  const response = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    {
      grant_type:    "authorization_code",
      client_id:     ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri:  ML_REDIRECT_URI,
    },
    { headers: { "Content-Type": "application/json" } }
  );

  const { access_token, refresh_token, expires_in, user_id, token_type, scope } =
    response.data;

  // 3. Obtener nickname de ML para mostrar en UI
  let nickname = null;
  try {
    const meRes = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    nickname = meRes.data.nickname ?? null;
  } catch {
    // no crítico
  }

  // 4. Upsert de la cuenta ML (misma cuenta ML no puede conectarse dos veces al mismo tenant)
  await prisma.mercadoLibreAccount.upsert({
    where: {
      tenantId_mlUserId: { tenantId, mlUserId: user_id.toString() },
    },
    update: {
      accessToken:  access_token,
      refreshToken: refresh_token ?? null,
      expiresIn:    expires_in,
      tokenType:    token_type,
      scope,
      nickname,
      isActive:     true,
    },
    create: {
      mlUserId:     user_id.toString(),
      accessToken:  access_token,
      refreshToken: refresh_token ?? null,
      expiresIn:    expires_in,
      tokenType:    token_type,
      scope,
      nickname,
      tenantId,
    },
  });

  return { tenantId };
};

// ─────────────────────────────────────────
//  CUENTAS ML DEL TENANT
// ─────────────────────────────────────────

export const getMlAccounts = async (tenantId) => {
  return prisma.mercadoLibreAccount.findMany({
    where:   { tenantId, isActive: true },
    select:  { id: true, mlUserId: true, nickname: true, lastSyncedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
};

export const getMercadoLibreUser = async (tenantId) => {
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId, isActive: true },
  });
  if (!account) throw new Error("Cuenta de Mercado Libre no encontrada");

  const response = await axios.get("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  return response.data;
};

// ─────────────────────────────────────────
//  REFRESH TOKEN
// ─────────────────────────────────────────

export const refreshAccessToken = async (account) => {
  const response = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: account.refreshToken,
    })
  );

  const newAccessToken  = response.data.access_token;
  const newRefreshToken = response.data.refresh_token;

  await prisma.mercadoLibreAccount.update({
    where: { id: account.id },
    data:  { accessToken: newAccessToken, refreshToken: newRefreshToken },
  });

  return newAccessToken;
};