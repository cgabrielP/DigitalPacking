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
      let thumbnail = item.item.thumbnail ?? null;

      if (!thumbnail) {
        try {
          const itemResponse = await axios.get(
            `https://api.mercadolibre.com/items/${item.item.id}`,
            {
              headers: {
                Authorization: `Bearer ${account.accessToken}`,
              },
            }
          );
          console.log(`✅ Item ${item.item.id}:`, JSON.stringify(itemResponse.data?.pictures?.slice(0, 1)));

          thumbnail =
            itemResponse.data.pictures?.[0]?.secure_url ??
            itemResponse.data.pictures?.[0]?.url ??
            itemResponse.data.thumbnail?.replace("http://", "https://") ??
            null;
        } catch (e) {
          console.error(`❌ Item ${item.item.id} - Status:`, e.response?.status);
          console.error(`❌ Item ${item.item.id} - Error:`, JSON.stringify(e.response?.data));
        }
      }

      thumbnail = thumbnail?.replace("http://", "https://") ?? null;

      await prisma.orderItem.create({
        data: {
          orderId: order.id.toString(),
          itemId: item.item.id,
          title: item.item.title,
          thumbnail,
          quantity: item.quantity,
          variation: item.variation_attributes
            ?.map((v) => `${v.name}: ${v.value_name}`)
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
  });

  if (!order) {
    throw new Error("Orden no encontrada");
  }

  if (order.pickingStatus === "completed") {
    throw new Error("La orden ya fue completada");
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      pickingStatus: "scanned",
    },
    include: {
      orderItems: true,
    },
  });

  return updatedOrder;
};

export const packOrder = async (orderId) => {
  return prisma.order.update({
    where: { id: orderId },
    data: { pickingStatus: "packed" },
  });
};
