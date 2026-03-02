import axios from "axios";
import prisma from "../../database/prisma.js";
import { refreshAccessToken } from "../auth/auth.service.js";

const fetchOrders = async (account, extraParams = "") => {
  const url = `https://api.mercadolibre.com/orders/search?seller=${account.userId}${extraParams}`;

  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    return res;
  } catch (error) {
    if (error.response?.status === 401) {
      const newToken = await refreshAccessToken(account);
      return axios.get(url, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
    }
    throw error;
  }
};

//funcion que lee sin tocar mi db
export const getMercadoLibreOrders = async (tenantId) => {
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId },
  });
  if (!account) throw new Error("Cuenta de Mercado Libre no encontrada");

  // ML no soporta múltiples substatuses en un solo query,
  // así que hacemos dos llamadas y las combinamos
  const [readyRes, printedRes] = await Promise.all([
    fetchOrders(account, "&shipping.substatus=ready_to_print"),
    fetchOrders(account, "&shipping.substatus=printed"),
  ]);

  const combined = [
    ...(readyRes.data.results ?? []),
    ...(printedRes.data.results ?? []),
  ];

  // Deduplicar por si acaso
  const unique = Array.from(new Map(combined.map((o) => [o.id, o])).values());

  return { results: unique, total: unique.length };
};

export const getOrdersFromDB = async (tenantId) => {
  return prisma.order.findMany({
    where: {
      tenantId,
      shippingSubstatus: { in: ["ready_to_print", "printed"] },
    },
    include: { orderItems: true },
    orderBy: { createdAt: "desc" },
  });
};
export const syncMercadoLibreOrders = async (tenantId) => {
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId },
  });
  if (!account) throw new Error("Cuenta de Mercado Libre no encontrada");

  // Traemos todas las órdenes sin filtrar
  const response = await fetchOrders(account, "");
  const orders = response.data.results ?? [];

  for (const order of orders) {
    const shippingId = order.shipping?.id?.toString() ?? null;
    let shippingSubstatus = null;
    let shippingStatus = null;
    let logisticType = null;
    let shippingOptionName = null;

    // Consultamos el shipment por separado para obtener substatus real
    if (shippingId) {
      try {
        const shipmentRes = await axios.get(
          `https://api.mercadolibre.com/shipments/${shippingId}`,
          { headers: { Authorization: `Bearer ${account.accessToken}` } }
        );
        shippingSubstatus = shipmentRes.data.substatus ?? shipmentRes.data.status ?? null;
        shippingStatus = shipmentRes.data.status ?? null;
        logisticType = shipmentRes.data.logistic_type ?? null;
        shippingOptionName = shipmentRes.data.shipping_option?.name ?? null;

      } catch (e) {
        console.error(`❌ Error shipment ${shippingId}:`, e.response?.data);
      }
    }

    await prisma.order.upsert({
      where: { id: order.id.toString() },
      update: {
        status: order.status,
        totalAmount: order.total_amount,
        shippingId,
        shippingSubstatus,
        shippingStatus,
        logisticType,
        shippingOptionName,
      },
      create: {
        id: order.id.toString(),
        status: order.status,
        totalAmount: order.total_amount,
        buyerNickname: order.buyer?.nickname,
        shippingId,
        shippingSubstatus,
        shippingStatus,
        logisticType,
        shippingOptionName,
        tenantId,
      },
    });

    await prisma.orderItem.deleteMany({ where: { orderId: order.id.toString() } });

    for (const item of order.order_items) {
      let thumbnail = item.item.thumbnail ?? null;

      if (!thumbnail) {
        try {
          const itemResponse = await axios.get(
            `https://api.mercadolibre.com/items/${item.item.id}`,
            { headers: { Authorization: `Bearer ${account.accessToken}` } }
          );
          thumbnail =
            itemResponse.data.pictures?.[0]?.secure_url ??
            itemResponse.data.pictures?.[0]?.url ??
            itemResponse.data.thumbnail?.replace("http://", "https://") ??
            null;
        } catch (e) {
          console.error(`❌ Item ${item.item.id}:`, e.response?.data);
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
          variation:
            item.variation_attributes
              ?.map((v) => `${v.name}: ${v.value_name}`)
              .join(", ") ?? null,
        },
      });
    }
  }

  return { message: "Órdenes sincronizadas", total: orders.length };
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
