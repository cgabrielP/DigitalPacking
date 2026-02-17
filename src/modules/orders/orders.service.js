import axios from "axios";
import prisma from "../../database/prisma.js";

export const getMercadoLibreOrders = async (tenantId) => {
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId },
  });

  if (!account) {
    throw new Error("Cuenta de Mercado Libre no encontrada");
  }

  const response = await axios.get(
    `https://api.mercadolibre.com/orders/search?seller=${account.userId}`,
    {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
      },
    }
  );

  return response.data;
};
