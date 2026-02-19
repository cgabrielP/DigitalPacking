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

export const syncMercadoLibreOrders = async (tenantId) => {
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId },
  });

  const response = await axios.get(
    `https://api.mercadolibre.com/orders/search?seller=${account.userId}`,
    {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
      },
    }
  );

  const orders = response.data.results;

  for (const order of orders) {
    await prisma.order.upsert({
      where: { id: order.id.toString() },
      update: {},
      create: {
        id: order.id.toString(),
        status: order.status,
        totalAmount: order.total_amount,
        buyerNickname: order.buyer?.nickname,
        tenantId,
      },
    });


    await prisma.orderItem.deleteMany({
      where: { orderId: order.id.toString() },
    });


    for (const item of order.order_items) {
      await prisma.orderItem.create({
        data: {
          orderId: order.id.toString(),
          itemId: item.item.id,
          title: item.item.title,
          thumbnail: item.item.thumbnail,
          quantity: item.quantity,
          variation: item.variation_attributes
            ?.map(v => `${v.name}: ${v.value_name}`)
            .join(", ") ?? null,
        },
      });
    }

  }


  return { message: "Órdenes sincronizadas" };
};

export const scanOrder = async (tenantId, orderId) => {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      tenantId,
    },
    include: {
      items: true,
    },
  });

  if (!order) {
    throw new Error("Orden no encontrada");
  }

  return order;
};

export const packOrder = async (orderId) => {
  return prisma.order.update({
    where: { id: orderId },
    data: { pickingStatus: "packed" },
  });
};
