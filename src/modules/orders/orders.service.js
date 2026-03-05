import axios from "axios";
import prisma from "../../database/prisma.js";
import { refreshAccessToken } from "../auth/auth.service.js";

// ─── Helpers de fetch ─────────────────────────────────────────────────────────

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

/**
 * Pagina todas las órdenes modificadas desde `fromDate`.
 * Si no se pasa fromDate (primer sync), usa los últimos 14 días como fallback.
 */
const fetchAllOrders = async (account, fromDate = null) => {
  const limit  = 50;
  let   offset = 0;
  let   allOrders = [];

  // Primer sync → últimos 14 días; syncs siguientes → desde lastSyncAt
  const dateFrom    = fromDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  })();
  const dateFromISO = dateFrom instanceof Date
    ? dateFrom.toISOString()
    : dateFrom;

  console.log(`📅 Sync desde: ${dateFromISO}`);

  while (true) {
    const res = await fetchOrders(
      account,
      `&order.date_last_updated.from=${dateFromISO}&sort=date_desc&limit=${limit}&offset=${offset}`
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

// ─── Servicio: órdenes desde ML (sin tocar DB) ───────────────────────────────

export const getMercadoLibreOrders = async (tenantId) => {
  const account = await prisma.mercadoLibreAccount.findFirst({
    where: { tenantId },
  });
  if (!account) throw new Error("Cuenta de Mercado Libre no encontrada");

  const [readyRes, printedRes] = await Promise.all([
    fetchOrders(account, "&shipping.substatus=ready_to_print"),
    fetchOrders(account, "&shipping.substatus=printed"),
  ]);

  const combined = [
    ...(readyRes.data.results  ?? []),
    ...(printedRes.data.results ?? []),
  ];

  const unique = Array.from(new Map(combined.map((o) => [o.id, o])).values());
  return { results: unique, total: unique.length };
};

// ─── Servicio: órdenes desde DB ──────────────────────────────────────────────

export const getOrdersFromDB = async (tenantId) => {
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      shippingStatus: { not: null },
    },
    include: { orderItems: true },
    orderBy: { createdAt: "desc" },
  });

  const packsMap = new Map();
  const result   = [];

  for (const order of orders) {
    const shippingCategory = resolveCategory(order.shippingStatus, order.shippingSubstatus);

    if (order.packId) {
      if (!packsMap.has(order.packId)) {
        packsMap.set(order.packId, {
          ...order,
          shippingCategory,
          displayIdentifier: order.packId,
          orderItems:   [...order.orderItems],
          packedOrders: [order.id],
        });
        result.push(packsMap.get(order.packId));
      } else {
        const pack = packsMap.get(order.packId);
        pack.orderItems = [...pack.orderItems, ...order.orderItems];
        pack.packedOrders.push(order.id);
        pack.totalAmount += order.totalAmount;
      }
    } else {
      result.push({
        ...order,
        shippingCategory,
        displayIdentifier: order.id,
        packedOrders: [order.id],
      });
    }
  }

  return result;
};

const resolveCategory = (status, substatus) => {
  if (["delivered", "not_delivered"].includes(status))   return "finalizados";
  if (["delivered", "stolen", "lost"].includes(substatus)) return "finalizados";
  if (status === "shipped") return "en_transito";
  if ([
    "in_hub", "in_packing_list", "dropped_off", "picked_up",
    "receiver_absent", "rescheduled", "returning", "returned",
  ].includes(substatus)) return "en_transito";
  if (["ready_to_print", "printed"].includes(substatus)) return "por_despachar";
  return "por_despachar";
};

// ─── Servicio: sync incremental ───────────────────────────────────────────────

export const syncMercadoLibreOrders = async (tenantId) => {
  // 1. Cargar cuenta + lastSyncAt del tenant en una sola query
  const [account, tenant] = await Promise.all([
    prisma.mercadoLibreAccount.findFirst({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { lastSyncAt: true } }),
  ]);

  if (!account) throw new Error("Cuenta de Mercado Libre no encontrada");

  const isFirstSync = !tenant?.lastSyncAt;
  const fromDate    = isFirstSync ? null : tenant.lastSyncAt;

  console.log(isFirstSync
    ? "🆕 Primer sync — trayendo últimos 14 días"
    : `🔄 Sync incremental desde ${fromDate.toISOString()}`
  );

  // 2. Guardar el momento ANTES de consultar ML
  //    (así no perdemos órdenes que se creen/modifiquen durante el procesamiento)
  const syncStartedAt = new Date();

  // 3. Traer órdenes modificadas desde fromDate
  const orders = await fetchAllOrders(account, fromDate);
  console.log(`📦 Órdenes a procesar: ${orders.length}`);

  if (orders.length === 0) {
    // Igual actualizamos lastSyncAt para mover la ventana
    await prisma.tenant.update({
      where: { id: tenantId },
      data:  { lastSyncAt: syncStartedAt },
    });
    return { message: "Sin cambios desde el último sync", total: 0, isFirstSync };
  }

  // 4. Procesar cada orden
  for (const order of orders) {
    const shippingId = order.shipping?.id?.toString() ?? null;
    let shippingSubstatus  = null;
    let shippingStatus     = null;
    let logisticType       = null;
    let shippingOptionName = null;

    if (shippingId) {
      try {
        const shipmentRes = await axios.get(
          `https://api.mercadolibre.com/shipments/${shippingId}`,
          { headers: { Authorization: `Bearer ${account.accessToken}` } }
        );
        shippingStatus     = shipmentRes.data.status ?? null;
        shippingSubstatus  = shipmentRes.data.substatus ?? shipmentRes.data.status ?? null;
        logisticType       = shipmentRes.data.logistic_type ?? null;
        shippingOptionName = shipmentRes.data.shipping_option?.name ?? null;

        console.log(`🚚 Shipment ${shippingId} | ${shippingStatus} | ${shippingSubstatus}`);
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
        shippingStatus,
        shippingSubstatus,
        logisticType,
        shippingOptionName,
        packId: order.pack_id?.toString() ?? null,
        lastUpdatedAt: order.date_last_updated
          ? new Date(order.date_last_updated)
          : null,
      },
      create: {
        id:           order.id.toString(),
        status:       order.status,
        totalAmount:  order.total_amount,
        buyerNickname: order.buyer?.nickname,
        shippingId,
        shippingStatus,
        shippingSubstatus,
        logisticType,
        shippingOptionName,
        tenantId,
        packId: order.pack_id?.toString() ?? null,
        lastUpdatedAt: order.date_last_updated
          ? new Date(order.date_last_updated)
          : null,
      },
    });

    // Reemplazar items solo si la orden cambió
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
          orderId:  order.id.toString(),
          itemId:   item.item.id,
          title:    item.item.title,
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

  // 5. Solo actualizamos lastSyncAt si todo salió bien
  await prisma.tenant.update({
    where: { id: tenantId },
    data:  { lastSyncAt: syncStartedAt },
  });

  console.log(`✅ lastSyncAt actualizado a ${syncStartedAt.toISOString()}`);

  return {
    message: isFirstSync
      ? "Primer sync completado"
      : "Sync incremental completado",
    total: orders.length,
    isFirstSync,
    lastSyncAt: syncStartedAt,
  };
};

// ─── Escaneo y empaque ────────────────────────────────────────────────────────

export const scanOrder = async (tenantId, code) => {
  // El QR de la etiqueta ML devuelve un JSON: {"id":"46591213050","sender_id":...}
  // El "id" de ese JSON es el shippingId.
  // También puede venir el packId o orderId directo (escaneo manual).
  let resolvedCode = code
  let searchByShipping = false

  try {
    const parsed = JSON.parse(code)
    if (parsed?.id) {
      resolvedCode    = parsed.id.toString()
      searchByShipping = true
    }
  } catch {
    // No es JSON → es packId u orderId directo, seguimos normal
  }

  const where = {
    tenantId,
    OR: searchByShipping
      ? [{ shippingId: resolvedCode }]
      : [{ packId: resolvedCode }, { id: resolvedCode }],
  }

  const orders = await prisma.order.findMany({
    where,
    include: { orderItems: true },
  })

  if (!orders.length) throw new Error("Orden no encontrada")

  if (orders.every(o => o.pickingStatus === "completed")) {
    throw new Error("La orden ya fue completada")
  }

  await prisma.order.updateMany({
    where,
    data: { pickingStatus: "scanned" },
  })

  return {
    displayIdentifier: orders[0].packId ?? orders[0].id,
    buyerNickname:     orders[0].buyerNickname,
    totalAmount:       orders.reduce((acc, o) => acc + o.totalAmount, 0),
    pickingStatus:     "scanned",
    orderItems:        orders.flatMap(o => o.orderItems),
    packedOrders:      orders.map(o => o.id),
  }
}

export const packOrder = async (tenantId, code) => {
  // Mismo parseo que scanOrder — el código puede ser JSON del QR o un ID directo
  let resolvedCode     = code
  let searchByShipping = false

  try {
    const parsed = JSON.parse(code)
    if (parsed?.id) {
      resolvedCode     = parsed.id.toString()
      searchByShipping = true
    }
  } catch {
    // ID directo
  }

  const where = {
    tenantId,
    OR: searchByShipping
      ? [{ shippingId: resolvedCode }]
      : [{ packId: resolvedCode }, { id: resolvedCode }],
  }

  const result = await prisma.order.updateMany({
    where,
    data: { pickingStatus: "packed" },
  })

  console.log(`📦 packOrder | code: ${resolvedCode} | tenantId: ${tenantId} | updated: ${result.count}`)

  if (result.count === 0) {
    throw new Error("Orden no encontrada o no pertenece a este tenant")
  }

  return { message: "Orden empacada correctamente", updated: result.count }
}