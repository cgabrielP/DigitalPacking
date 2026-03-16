import axios from "axios";
import prisma from "../../database/prisma.js";
import { refreshAccessToken } from "../auth/auth.service.js";

// ─────────────────────────────────────────
//  HELPERS DE FETCH
// ─────────────────────────────────────────

const fetchOrders = async (account, extraParams = "") => {
  const url = `https://api.mercadolibre.com/orders/search?seller=${account.mlUserId}${extraParams}`;

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

  // FIX 3 — Restar 5 min a lastSyncedAt para cubrir el "hueco" entre syncs
  const baseDate = account.lastSyncedAt ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  })();
  const dateFrom = new Date(baseDate.getTime() - 5 * 60 * 1000); // −5 min
  const dateFromISO = dateFrom.toISOString();

  const isFirstSync = !account.lastSyncedAt;
  console.log(`📅 [${account.nickname ?? account.mlUserId}] ${isFirstSync ? "Primer sync — últimos 14 días" : `Sync desde ${dateFromISO}`}`);

  while (true) {
    const res = await fetchOrders(
      account,
      `&order.date_last_updated.from=${dateFromISO}&sort=date_desc&limit=${limit}&offset=${offset}`
    );

    const results = res.data.results ?? [];
    allOrders = [...allOrders, ...results];

    const total = res.data.paging?.total ?? 0;
    offset += limit;

    console.log(`📄 [${account.nickname ?? account.mlUserId}] Paginando: ${allOrders.length}/${total}`);

    if (offset >= total || results.length === 0) break;
  }

  return allOrders;
};

const fetchThumbnail = async (item, accessToken) => {
  let thumbnail = item.item.thumbnail ?? null;
  if (thumbnail) return thumbnail.replace("http://", "https://");

  try {
    const itemRes = await axios.get(
      `https://api.mercadolibre.com/items/${item.item.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = itemRes.data;
    thumbnail =
      data.pictures?.find(p => p.secure_url)?.secure_url ??
      data.pictures?.find(p => p.url)?.url ??
      data.thumbnail ?? null;
    if (thumbnail) return thumbnail.replace("http://", "https://");
  } catch (e) {
    console.error(`❌ Item ${item.item.id}:`, e.response?.data?.message ?? e.message);
  }

  try {
    const picRes = await axios.get(
      `https://api.mercadolibre.com/items/${item.item.id}/pictures`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const pics = picRes.data;
    if (Array.isArray(pics) && pics.length > 0) {
      thumbnail = pics[0].secure_url ?? pics[0].url ?? null;
      if (thumbnail) return thumbnail.replace("http://", "https://");
    }
  } catch { /* silencioso */ }

  return null;
};

// ─────────────────────────────────────────
//  SYNC — todas las cuentas del tenant
// ─────────────────────────────────────────

export const syncMercadoLibreOrders = async (tenantId) => {
  const accounts = await prisma.mercadoLibreAccount.findMany({
    where: { tenantId, isActive: true },
  });

  if (!accounts.length) throw new Error("No hay cuentas de Mercado Libre conectadas");

  console.log(`🔄 Sincronizando ${accounts.length} cuenta(s) para tenant ${tenantId}`);

  const results = [];

  for (const account of accounts) {
    const result = await syncAccount(account, tenantId);
    results.push(result);
  }

  const totalOrders = results.reduce((acc, r) => acc + r.total, 0);

  return {
    message: `Sync completado — ${accounts.length} cuenta(s)`,
    accounts: results,
    total: totalOrders,
  };
};

// ── Sync de una sola cuenta ────────────────────────────────────────────────

const syncAccount = async (account, tenantId) => {
  const syncStartedAt = new Date();
  const label = account.nickname ?? account.mlUserId;

  // FIX 4 — Refrescar token al inicio del sync para que todas las
  // llamadas (shipments, items, pictures) usen el mismo token fresco
  let accessToken = account.accessToken;
  try {
    accessToken = await refreshAccessToken(account);
    console.log(`🔑 [${label}] Token refrescado correctamente`);
  } catch (e) {
    console.warn(`⚠️ [${label}] No se pudo refrescar token, se usa el actual`);
  }

  const orders = await fetchAllOrders({ ...account, accessToken });
  console.log(`📦 [${label}] Órdenes a procesar: ${orders.length}`);

  if (orders.length === 0) {
    await prisma.mercadoLibreAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: syncStartedAt },
    });
    return { accountId: account.id, nickname: label, total: 0, message: "Sin cambios" };
  }

  for (const order of orders) {
    const shippingId = order.shipping?.id?.toString() ?? null;

    // ── Campos existentes ──────────────────────────────────────────────────
    let shippingSubstatus = null;
    let shippingStatus = null;
    let logisticType = null;
    let shippingOptionName = null;

    // ── Nuevos campos de timing ────────────────────────────────────────────
    // delivery_promise: timestamp hasta el cual el vendedor debe despachar
    // para que el comprador reciba en el plazo comprometido.
    // Ejemplo: "2024-11-15T18:00:00.000-03:00" → despachar antes de las 18hs
    let deliveryPromise = null;
    let estimatedDeliveryTime = null; // fecha estimada de llegada al comprador
    let estimatedDeliveryLimit = null; // fecha límite de entrega
    let estimatedDeliveryFinal = null; // fecha final comprometida (la más estricta)

    // ── Nuevos campos de método de envío y destino ────────────────────────
    let shippingMethodId = null;
    let shippingMethodName = null;
    let shippingMethodType = null;
    let shippingDeliverTo = null; // "residential", "agency", "pickup_point"
    let receiverCity = null; // comuna/ciudad destino, ej: "San Miguel"

    if (shippingId) {
      try {
        const shipmentRes = await axios.get(
          `https://api.mercadolibre.com/shipments/${shippingId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const s = shipmentRes.data;
        const so = s.shipping_option ?? {}; // todos los campos de timing viven acá

        // Campos base
        shippingStatus = s.status ?? null;
        shippingSubstatus = s.substatus ?? s.status ?? null;
        logisticType = s.logistic?.type ?? null;
        shippingOptionName = so.name ?? null;

        // Timing — vienen todos dentro de shipping_option
        // delivery_promise acá es un string descriptivo ("estimated", "exact"), NO una fecha.
        // La fecha real a usar para urgencia es estimated_delivery_time.pay_before
        // que indica hasta cuándo el vendedor puede pagar/despachar para cumplir el plazo.
        deliveryPromise = so.estimated_delivery_time?.pay_before ?? null; // cuándo debe despachar
        estimatedDeliveryTime = so.estimated_delivery_time?.date
          ? new Date(so.estimated_delivery_time.date) : null;
        estimatedDeliveryLimit = so.estimated_delivery_limit?.date
          ? new Date(so.estimated_delivery_limit.date) : null;
        estimatedDeliveryFinal = so.estimated_delivery_final?.date
          ? new Date(so.estimated_delivery_final.date) : null;

        // Shipping method
        const lt = s.lead_time ?? {};
        shippingMethodId = so.shipping_method_id ?? lt.shipping_method?.id ?? null;
        shippingMethodName = so.name ?? lt.shipping_method?.name ?? null; // "Prioritario a domicilio"
        shippingMethodType = lt.shipping_method?.type ?? so.delivery_type ?? null;

        // receiver_address tiene la preferencia de entrega y la ciudad/comuna destino
        const ra = s.receiver_address ?? {};
        shippingDeliverTo = ra.delivery_preference ?? null; // "residential", "agency"
        receiverCity = ra.city?.name ?? ra.neighborhood?.name ?? null; // "San Miguel"

        console.log(
          `🚚 [${label}] Shipment ${shippingId} | ${shippingStatus} | ${shippingSubstatus}` +
          ` | método: ${shippingMethodName ?? "—"} (id: ${shippingMethodId ?? "—"})` +
          ` | despachar antes de: ${deliveryPromise ?? "—"}` +
          ` | entrega estimada: ${estimatedDeliveryTime?.toISOString() ?? "—"}` +
          ` | destino: ${receiverCity ?? "—"} (${shippingDeliverTo ?? "—"})`
        );
      } catch (e) {
        console.error(`❌ [${label}] Error shipment ${shippingId}:`, e.response?.data);
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
        lastUpdatedAt: order.date_last_updated ? new Date(order.date_last_updated) : null,
        mlAccountId: account.id,
        // Nuevos campos
        deliveryPromise,
        estimatedDeliveryTime,
        estimatedDeliveryLimit,
        estimatedDeliveryFinal,
        shippingMethodId,
        shippingMethodName,
        shippingMethodType,
        shippingDeliverTo,
        receiverCity,
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
        mlAccountId: account.id,
        packId: order.pack_id?.toString() ?? null,
        lastUpdatedAt: order.date_last_updated ? new Date(order.date_last_updated) : null,
        // Nuevos campos
        deliveryPromise,
        estimatedDeliveryTime,
        estimatedDeliveryLimit,
        estimatedDeliveryFinal,
        shippingMethodId,
        shippingMethodName,
        shippingMethodType,
        shippingDeliverTo,
        receiverCity,
      },
    });

    // FIX 2 — Resolver todas las thumbnails ANTES de tocar la DB,
    // luego borrar + crear en una sola transacción atómica
    const itemsData = await Promise.all(
      order.order_items.map(async (item) => {
        const thumbnail = await fetchThumbnail(item, accessToken);
        return {
          orderId: order.id.toString(),
          itemId: item.item.id,
          title: item.item.title,
          thumbnail,
          quantity: item.quantity,
          variation: item.variation_attributes
            ?.map(v => `${v.name}: ${v.value_name}`)
            .join(", ") ?? null,
        };
      })
    );

    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { orderId: order.id.toString() } }),
      ...itemsData.map(data => prisma.orderItem.create({ data })),
    ]);
  }

  await prisma.mercadoLibreAccount.update({
    where: { id: account.id },
    data: { lastSyncedAt: syncStartedAt },
  });

  console.log(`✅ [${label}] lastSyncedAt → ${syncStartedAt.toISOString()}`);

  return {
    accountId: account.id,
    nickname: label,
    total: orders.length,
    lastSyncedAt: syncStartedAt,
  };
};

// ─────────────────────────────────────────
//  ÓRDENES DESDE DB
// ─────────────────────────────────────────

export const getOrdersFromDB = async (tenantId) => {
  const orders = await prisma.order.findMany({
    where: { tenantId },
    include: { orderItems: true },
    orderBy: { createdAt: "desc" },
  });

  const packsMap = new Map();
  const result = [];

  for (const order of orders) {
    const shippingCategory = resolveCategory(order.shippingStatus, order.shippingSubstatus);
    const deliveryUrgency = resolveDeliveryUrgency(order.deliveryPromise);

    if (order.packId) {
      if (!packsMap.has(order.packId)) {
        packsMap.set(order.packId, {
          ...order,
          shippingCategory,
          deliveryUrgency,
          displayIdentifier: order.packId,
          orderItems: [...order.orderItems],
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
        deliveryUrgency,
        displayIdentifier: order.id,
        packedOrders: [order.id],
      });
    }
  }

  return result;
};

// ── Categoría de envío (existente) ────────────────────────────────────────

const resolveCategory = (status, substatus) => {
  if (["delivered", "not_delivered"].includes(status)) return "finalizados";
  if (["delivered", "stolen", "lost"].includes(substatus)) return "finalizados";
  if (status === "shipped") return "en_transito";
  if ([
    "in_hub", "in_packing_list", "dropped_off", "picked_up",
    "receiver_absent", "rescheduled", "returning", "returned",
  ].includes(substatus)) return "en_transito";
  if (["ready_to_print", "printed"].includes(substatus)) return "por_despachar";
  return "por_despachar";
};

// ── Urgencia de despacho basada en delivery_promise ───────────────────────
// "overdue"  → la hora de corte ya pasó
// "today"    → la hora de corte es hoy en timezone de Chile
// "upcoming" → la hora de corte es en días futuros
// "none"     → sin promesa definida
//
// El servidor corre en UTC pero ML envía el offset en el string
// ej: "2026-03-11T16:45:00.000-03:00" → extraemos -03:00 y comparamos
// el día calendario en esa timezone, no en UTC del servidor.

const resolveDeliveryUrgency = (deliveryPromise) => {
  if (!deliveryPromise) return "none";

  const promise = new Date(deliveryPromise);
  const now = new Date();

  // 1. ¿Ya pasó la hora exacta de corte? → overdue (UTC puro, siempre correcto)
  if (promise < now) return "overdue";

  // 2. Extraer offset del string de ML, ej: "-03:00" → -180 minutos
  //    Fallback: Chile continental UTC-3
  const offsetMatch = deliveryPromise.match(/([+-])(\d{2}):(\d{2})$/);
  let offsetMinutes = -180;
  if (offsetMatch) {
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    offsetMinutes = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3]));
  }

  // 3. Convertir fecha al día calendario local sumando el offset a UTC
  const toLocalDateStr = (date) => {
    const local = new Date(date.getTime() + offsetMinutes * 60 * 1000);
    return local.getUTCFullYear() + "-" + local.getUTCMonth() + "-" + local.getUTCDate();
  };

  // 4. ¿Misma fecha local? → today. Si no → upcoming
  return toLocalDateStr(promise) === toLocalDateStr(now) ? "today" : "upcoming";
};

// ─────────────────────────────────────────
//  SCAN & PACK
// ─────────────────────────────────────────

const parseScannedCode = (code) => {
  const match = code.match(/"id"\s*:\s*"(\d+)"/)
  if (match?.[1]) return { resolvedCode: match[1], searchByShipping: true }
  return { resolvedCode: code.trim(), searchByShipping: false }
};

const buildWhere = (tenantId, resolvedCode, searchByShipping) => ({
  tenantId,
  OR: searchByShipping
    ? [{ shippingId: resolvedCode }]
    : [{ packId: resolvedCode }, { id: resolvedCode }, { shippingId: resolvedCode }],
});

export const scanOrder = async (tenantId, code) => {
  const { resolvedCode, searchByShipping } = parseScannedCode(code);

  console.log(`🔍 scanOrder | resolved: ${resolvedCode} | byShipping: ${searchByShipping}`);

  const where = buildWhere(tenantId, resolvedCode, searchByShipping);
  const orders = await prisma.order.findMany({ where, include: { orderItems: true } });

  if (!orders.length) throw new Error("Orden no encontrada");
if (orders.every(o => o.pickingStatus === "completed")) throw new Error("La orden ya fue completada");

const alreadyProcessed = orders.every(o => o.pickingStatus === "scanned" || o.pickingStatus === "packed")

if (!alreadyProcessed) {
  await prisma.order.updateMany({ where, data: { pickingStatus: "scanned" } });
}

return {
  displayIdentifier: orders[0].packId ?? orders[0].id,
  buyerNickname:     orders[0].buyerNickname,
  totalAmount:       orders.reduce((acc, o) => acc + o.totalAmount, 0),
  pickingStatus:     alreadyProcessed ? orders[0].pickingStatus : "scanned",
  orderItems:        orders.flatMap(o => o.orderItems),
  packedOrders:      orders.map(o => o.id),
};
};

export const packOrder = async (tenantId, code) => {
  const { resolvedCode, searchByShipping } = parseScannedCode(code);

  console.log(`📦 packOrder | resolved: ${resolvedCode} | tenantId: ${tenantId}`);

  const where = buildWhere(tenantId, resolvedCode, searchByShipping);
  const result = await prisma.order.updateMany({ where, data: { pickingStatus: "packed" } });

  if (result.count === 0) throw new Error("Orden no encontrada o no pertenece a este tenant");

  return { message: "Orden empacada correctamente", updated: result.count };
};

// ─────────────────────────────────────────
//  ETIQUETA DE ENVÍO
// ─────────────────────────────────────────

export const getShipmentLabel = async (tenantId, orderId) => {
  // Buscar por id de orden o por packId (ambos tienen el mismo shippingId)
  const order = await prisma.order.findFirst({
    where: {
      tenantId,
      OR: [{ id: orderId }, { packId: orderId }],
    },
    include: { mlAccount: true },
  });

  if (!order) throw new Error("Orden no encontrada");
  if (!order.shippingId) throw new Error("La orden no tiene envío asociado");
  if (['shipped', 'delivered', 'not_delivered'].includes(order.shippingStatus)) {
    throw new Error(`La etiqueta no está disponible — el envío ya está en estado "${order.shippingStatus}"`)
  }

  // Refrescar token de la cuenta ML dueña de esta orden
  let accessToken = order.mlAccount.accessToken;
  try {
    accessToken = await refreshAccessToken(order.mlAccount);
  } catch {
    console.warn("⚠️ No se pudo refrescar token para etiqueta, usando el actual");
  }

  const mlUserId = order.mlAccount.mlUserId;

  console.log(`🏷️  Obteniendo etiqueta | shipmentId: ${order.shippingId} | seller: ${mlUserId}`);

  const response = await axios.get("https://api.mercadolibre.com/shipment_labels", {
    params: {
      shipment_ids: order.shippingId,
      response_type: "pdf",
      "caller.id": mlUserId,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
    responseType: "stream",
  });

  // axios con responseType stream no lanza error en 4xx — hay que chequearlo manualmente
  if (response.status !== 200) {
    // Leer el stream para obtener el mensaje de error
    const errorBody = await new Promise((resolve) => {
      let raw = ""
      response.data.on("data", chunk => raw += chunk)
      response.data.on("end", () => {
        try { resolve(JSON.parse(raw)) }
        catch { resolve({ message: raw }) }
      })
    })
    console.error("❌ ML shipment_labels error:", errorBody)
    throw new Error(errorBody?.failed_shipments?.[0]?.error ?? "Error obteniendo etiqueta de ML")
  }

  return {
    stream: response.data,
    contentType: response.headers["content-type"] ?? "application/pdf",
    shippingId: order.shippingId,
  };
};