import axios from "axios";
import prisma from "../../database/prisma.js";

const {
  ML_CLIENT_ID,
  ML_CLIENT_SECRET,
  ML_REDIRECT_URI,
} = process.env;

export const getMercadoLibreAuthUrl = () => {
  return `https://auth.mercadolibre.cl/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${ML_REDIRECT_URI}`;
};

export const handleMercadoLibreCallback = async (code) => {
  const response = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    {
      grant_type: "authorization_code",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri: ML_REDIRECT_URI,
    },
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  const {
    access_token,
    refresh_token,
    expires_in,
    user_id,
    token_type,
    scope,
  } = response.data;

  // 🔎 1️⃣ Buscar si ya existe cuenta
  const existingAccount = await prisma.mercadoLibreAccount.findFirst({
    where: {
      userId: user_id.toString(),
    },
  });

  if (existingAccount) {
    // 🔄 2️⃣ Actualizar tokens
    await prisma.mercadoLibreAccount.update({
      where: { id: existingAccount.id },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        tokenType: token_type,
        scope,
      },
    });

    return { message: "Cuenta actualizada correctamente" };
  }

  // 🆕 3️⃣ Si no existe, crear tenant + cuenta
  const tenant = await prisma.tenant.create({
    data: {
      name: `ML-${user_id}`,
    },
  });
console.log("holaaaaa",response.data)
console.log("access data",access_tokena)
console.log("soy el refresh token",refresh_token)

await prisma.mercadoLibreAccount.create({
  data: {
    userId: user_id.toString(),
    accessToken: access_token,
    refreshToken: refresh_token ?? "", 
    expiresIn: expires_in,
    tokenType: token_type,
    scope,
    tenantId: tenant.id,
  },
});


  return { message: "Cuenta conectada correctamente" };
};
