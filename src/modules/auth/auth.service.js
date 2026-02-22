import axios from "axios";
import prisma from "../../database/prisma.js";
import jwt from "jsonwebtoken";
const {
  ML_CLIENT_ID,
  ML_CLIENT_SECRET,
  ML_REDIRECT_URI,
} = process.env;

export const getMercadoLibreAuthUrl = () => {
  return `https://auth.mercadolibre.cl/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${ML_REDIRECT_URI}`;
};

export const handleMercadoLibreCallback = async (code) => {
  const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
    grant_type: "authorization_code",
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
    code,
    redirect_uri: ML_REDIRECT_URI,
  }, { headers: { "Content-Type": "application/json" } });

  const { access_token, refresh_token, expires_in, user_id, token_type, scope } = response.data;

  let tenant;
  const existingAccount = await prisma.mercadoLibreAccount.findFirst({
    where: { userId: user_id.toString() },
    include: { tenant: true },
  });

  if (existingAccount) {
    await prisma.mercadoLibreAccount.update({
      where: { id: existingAccount.id },
      data: { accessToken: access_token, refreshToken: refresh_token ?? null, expiresIn: expires_in, tokenType: token_type, scope },
    });
    tenant = existingAccount.tenant; // ✅ recuperas el tenant
  } else {
    tenant = await prisma.tenant.create({ data: { name: `ML-${user_id}` } });
    await prisma.mercadoLibreAccount.create({
      data: {
        userId: user_id.toString(),
        accessToken: access_token,
        refreshToken: refresh_token ?? null,
        expiresIn: expires_in,
        tokenType: token_type,
        scope,
        tenantId: tenant.id,
      },
    });
  }

  // ✅ Siempre genera el JWT, sin importar si era cuenta nueva o existente
  const appToken = jwt.sign(
    { tenantId: tenant.id, mlUserId: user_id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return { appToken };
};

export const getMercadoLibreUser = async (tenantId) => {
  // 1️⃣ Buscar cuenta
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId },
  });

  if (!account) {
    throw new Error("Cuenta de Mercado Libre no encontrada");
  }

  // 2️⃣ Llamar API
  const response = await axios.get(
    "https://api.mercadolibre.com/users/me",
    {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
      },
    }
  );

  return response.data;
};

export const refreshAccessToken = async (account) => {
  const response = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: account.refreshToken,
    })
  );

  const newAccessToken = response.data.access_token;
  const newRefreshToken = response.data.refresh_token;

  await prisma.mercadoLibreAccount.update({
    where: { id: account.id },
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    },
  });

  return newAccessToken;
};