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
const fetchAllOrders = async (account) => {
  const limit = 50;
  let offset = 0;
  let allOrders = [];

  // Últimos 14 días
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 1);
  const dateFromISO = dateFrom.toISOString();

  while (true) {
    const res = await fetchOrders(
      account,
      `&order.date_created.from=${dateFromISO}&limit=${limit}&offset=${offset}`
    );
    const results = res.data.results ?? [];
    allOrders = [...allOrders, ...results];

    const total = res.data.paging?.total ?? 0;
    offset += limit;

    console.log(`📄 Paginando: ${allOrders.length}/${total}`);

    if (offset >= total || results.length === 0) break;
  }

  return allOrders;
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
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      shippingSubstatus: {
        in: ["ready_to_print", "printed", "ready_to_ship", "rescheduled", "not_delivered"],
      },
    },
    include: { orderItems: true },
    orderBy: { createdAt: "desc" },
  });

  // Agrupar por packId cuando existe
  const packsMap = new Map();
  const result = [];

  for (const order of orders) {
    if (order.packId) {
      if (!packsMap.has(order.packId)) {
        // Primera orden del pack, la usamos como "contenedor"
        packsMap.set(order.packId, {
          ...order,
          displayIdentifier: order.packId, // 👈 lo que muestra el front
          orderItems: [...order.orderItems],
          packedOrders: [order.id],
        });
        result.push(packsMap.get(order.packId));
      } else {
        // Orden del mismo pack, mergeamos los items
        const pack = packsMap.get(order.packId);
        pack.orderItems = [...pack.orderItems, ...order.orderItems];
        pack.packedOrders.push(order.id);
        pack.totalAmount += order.totalAmount;
      }
    } else {
      // Sin pack, va solo con su order.id
      result.push({
        ...order,
        displayIdentifier: order.id, // 👈 lo que muestra el front
        packedOrders: [order.id],
      });
    }
  }

  return result;
};
export const syncMercadoLibreOrders = async (tenantId) => {
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId },
  });
  if (!account) throw new Error("Cuenta de Mercado Libre no encontrada");

  const orders = await fetchAllOrders(account);
  console.log(`📦 Total órdenes obtenidas de ML: ${orders.length}`);

  for (const order of orders) {
    const shippingId = order.shipping?.id?.toString() ?? null;
    let shippingSubstatus = null;
    let shippingStatus = null;
    let logisticType = null;
    let shippingOptionName = null;

    if (shippingId) {
      try {
        const shipmentRes = await axios.get(
          `https://api.mercadolibre.com/shipments/${shippingId}`,
          { headers: { Authorization: `Bearer ${account.accessToken}` } }
        );
        shippingStatus = shipmentRes.data.status ?? null;
        shippingSubstatus = shipmentRes.data.substatus ?? shipmentRes.data.status ?? null;
        logisticType = shipmentRes.data.logistic_type ?? null;
        shippingOptionName = shipmentRes.data.shipping_option?.name ?? null;

        console.log(`🚚 Shipment ${shippingId} | status: ${shippingStatus} | substatus: ${shippingSubstatus}`);
      } catch (e) {
        console.error(`❌ Error shipment ${shippingId}:`, e.response?.data);
      }
    }
    console.log(`🔍 id: ${order.id} | display_id: ${order.pack_id}`);
    await prisma.order.upsert({
      where: { id: order.id.toString() },
      update: {
        status: order.status,
        totalAmount: order.total_amount,
        shippingId,
        shippingStatus,
        shippingSubstatus,
        logisticType,
        shippingOptionName,
        packId: order.pack_id?.toString() ?? null,
      },
      create: {
        id: order.id.toString(),
        status: order.status,
        totalAmount: order.total_amount,
        buyerNickname: order.buyer?.nickname,
        shippingId,
        shippingStatus,
        shippingSubstatus,
        logisticType,
        shippingOptionName,
        tenantId,
        packId: order.pack_id?.toString() ?? null,
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
export const scanOrder = async (tenantId, code) => {
  // Buscar por packId primero, si no por orderId
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      OR: [
        { packId: code },
        { id: code },
      ],
    },
    include: { orderItems: true },
  });

  if (!orders.length) {
    throw new Error("Orden no encontrada");
  }

  if (orders.every(o => o.pickingStatus === "completed")) {
    throw new Error("La orden ya fue completada");
  }

  // Actualizar todas las órdenes del pack
  await prisma.order.updateMany({
    where: {
      tenantId,
      OR: [
        { packId: code },
        { id: code },
      ],
    },
    data: { pickingStatus: "scanned" },
  });

  // Retornar agrupado igual que getOrdersFromDB
  return {
    displayIdentifier: orders[0].packId ?? orders[0].id,
    buyerNickname: orders[0].buyerNickname,
    totalAmount: orders.reduce((acc, o) => acc + o.totalAmount, 0),
    pickingStatus: "scanned",
    orderItems: orders.flatMap(o => o.orderItems),
    packedOrders: orders.map(o => o.id),
  };
};

export const packOrder = async (orderId) => {
  return prisma.order.update({
    where: { id: orderId },
    data: { pickingStatus: "packed" },
  });
};
