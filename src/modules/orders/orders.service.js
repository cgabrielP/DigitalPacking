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
  const limit  = 50;
  let   offset = 0;
  let   allOrders = [];

  // FIX 3 — Restar 5 min a lastSyncedAt para cubrir el "hueco" entre syncs
  const baseDate = account.lastSyncedAt ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  })();
  const dateFrom    = new Date(baseDate.getTime() - 5 * 60 * 1000); // −5 min
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
      data.pictures?.find(p => p.url)?.url               ??
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
    message:  `Sync completado — ${accounts.length} cuenta(s)`,
    accounts: results,
    total:    totalOrders,
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
      data:  { lastSyncedAt: syncStartedAt },
    });
    return { accountId: account.id, nickname: label, total: 0, message: "Sin cambios" };
  }

  for (const order of orders) {
    const shippingId = order.shipping?.id?.toString() ?? null;

    // ── Campos existentes ──────────────────────────────────────────────────
    let shippingSubstatus  = null;
    let shippingStatus     = null;
    let logisticType       = null;
    let shippingOptionName = null;

    // ── Nuevos campos de timing ────────────────────────────────────────────
    // delivery_promise: timestamp hasta el cual el vendedor debe despachar
    // para que el comprador reciba en el plazo comprometido.
    // Ejemplo: "2024-11-15T18:00:00.000-03:00" → despachar antes de las 18hs
    let deliveryPromise        = null;
    let estimatedDeliveryTime  = null; // fecha estimada de llegada al comprador
    let estimatedDeliveryLimit = null; // fecha límite de entrega
    let estimatedDeliveryFinal = null; // fecha final comprometida (la más estricta)

    // ── Nuevos campos de método de envío ──────────────────────────────────
    let shippingMethodId   = null;
    let shippingMethodName = null;
    let shippingMethodType = null; // "standard", "express", "same_day", "turbo"
    let shippingDeliverTo  = null; // "address" o "agency"

    if (shippingId) {
      try {
        const shipmentRes = await axios.get(
          `https://api.mercadolibre.com/shipments/${shippingId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const s  = shipmentRes.data;
        const lt = s.lead_time ?? {};

        // Campos existentes
        shippingStatus     = s.status ?? null;
        shippingSubstatus  = s.substatus ?? s.status ?? null;
        logisticType       = s.logistic?.type ?? null;
        shippingOptionName = s.shipping_option?.name ?? null;

        // Timing — delivery_promise viene como string ISO en lead_time
        deliveryPromise        = lt.delivery_promise ?? null;
        estimatedDeliveryTime  = lt.estimated_delivery_time?.date
                                   ? new Date(lt.estimated_delivery_time.date) : null;
        estimatedDeliveryLimit = lt.estimated_delivery_limit?.date
                                   ? new Date(lt.estimated_delivery_limit.date) : null;
        estimatedDeliveryFinal = lt.estimated_delivery_final?.date
                                   ? new Date(lt.estimated_delivery_final.date) : null;

        // Shipping method
        shippingMethodId   = lt.shipping_method?.id   ?? null;
        shippingMethodName = lt.shipping_method?.name ?? null;
        shippingMethodType = lt.shipping_method?.type ?? null;
        shippingDeliverTo  = lt.shipping_method?.deliver_to ?? null;

        console.log(
          `🚚 [${label}] Shipment ${shippingId} | ${shippingStatus} | ${shippingSubstatus}` +
          ` | método: ${shippingMethodName ?? "—"} (${shippingMethodType ?? "—"})` +
          ` | promesa despacho: ${deliveryPromise ?? "—"}`
        );
      } catch (e) {
        console.error(`❌ [${label}] Error shipment ${shippingId}:`, e.response?.data);
      }
    }

    await prisma.order.upsert({
      where: { id: order.id.toString() },
      update: {
        status:            order.status,
        totalAmount:       order.total_amount,
        shippingId,
        shippingStatus,
        shippingSubstatus,
        logisticType,
        shippingOptionName,
        packId:            order.pack_id?.toString() ?? null,
        lastUpdatedAt:     order.date_last_updated ? new Date(order.date_last_updated) : null,
        mlAccountId:       account.id,
        // Nuevos campos
        deliveryPromise,
        estimatedDeliveryTime,
        estimatedDeliveryLimit,
        estimatedDeliveryFinal,
        shippingMethodId,
        shippingMethodName,
        shippingMethodType,
        shippingDeliverTo,
      },
      create: {
        id:                order.id.toString(),
        status:            order.status,
        totalAmount:       order.total_amount,
        buyerNickname:     order.buyer?.nickname,
        shippingId,
        shippingStatus,
        shippingSubstatus,
        logisticType,
        shippingOptionName,
        tenantId,
        mlAccountId:       account.id,
        packId:            order.pack_id?.toString() ?? null,
        lastUpdatedAt:     order.date_last_updated ? new Date(order.date_last_updated) : null,
        // Nuevos campos
        deliveryPromise,
        estimatedDeliveryTime,
        estimatedDeliveryLimit,
        estimatedDeliveryFinal,
        shippingMethodId,
        shippingMethodName,
        shippingMethodType,
        shippingDeliverTo,
      },
    });

    // FIX 2 — Resolver todas las thumbnails ANTES de tocar la DB,
    // luego borrar + crear en una sola transacción atómica
    const itemsData = await Promise.all(
      order.order_items.map(async (item) => {
        const thumbnail = await fetchThumbnail(item, accessToken);
        return {
          orderId:   order.id.toString(),
          itemId:    item.item.id,
          title:     item.item.title,
          thumbnail,
          quantity:  item.quantity,
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
    data:  { lastSyncedAt: syncStartedAt },
  });

  console.log(`✅ [${label}] lastSyncedAt → ${syncStartedAt.toISOString()}`);

  return {
    accountId: account.id,
    nickname:  label,
    total:     orders.length,
    lastSyncedAt: syncStartedAt,
  };
};

// ─────────────────────────────────────────
//  ÓRDENES DESDE DB
// ─────────────────────────────────────────

export const getOrdersFromDB = async (tenantId) => {
  const orders = await prisma.order.findMany({
    where:   { tenantId },
    include: { orderItems: true },
    orderBy: { createdAt: "desc" },
  });

  const packsMap = new Map();
  const result   = [];

  for (const order of orders) {
    const shippingCategory  = resolveCategory(order.shippingStatus, order.shippingSubstatus);
    const deliveryUrgency   = resolveDeliveryUrgency(order.deliveryPromise);

    if (order.packId) {
      if (!packsMap.has(order.packId)) {
        packsMap.set(order.packId, {
          ...order,
          shippingCategory,
          deliveryUrgency,
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
  if (["delivered", "not_delivered"].includes(status))       return "finalizados";
  if (["delivered", "stolen", "lost"].includes(substatus))   return "finalizados";
  if (status === "shipped")                                  return "en_transito";
  if ([
    "in_hub", "in_packing_list", "dropped_off", "picked_up",
    "receiver_absent", "rescheduled", "returning", "returned",
  ].includes(substatus))                                     return "en_transito";
  if (["ready_to_print", "printed"].includes(substatus))     return "por_despachar";
  return "por_despachar";
};

// ── Urgencia de despacho basada en delivery_promise ───────────────────────
// "today"    → la promesa vence hoy (hay que despachar YA)
// "overdue"  → la promesa ya venció (tarde)
// "upcoming" → la promesa es en los próximos días (no urge hoy)
// "none"     → sin promesa definida

const resolveDeliveryUrgency = (deliveryPromise) => {
  if (!deliveryPromise) return "none";

  const promise = new Date(deliveryPromise);
  const now     = new Date();

  // Si la fecha ya pasó
  if (promise < now) return "overdue";

  // Si vence hoy (mismo día calendario)
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (promise <= endOfToday) return "today";

  return "upcoming";
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

  if (!orders.length)                              throw new Error("Orden no encontrada");
  if (orders.every(o => o.pickingStatus === "completed")) throw new Error("La orden ya fue completada");

  await prisma.order.updateMany({ where, data: { pickingStatus: "scanned" } });

  return {
    displayIdentifier: orders[0].packId ?? orders[0].id,
    buyerNickname:     orders[0].buyerNickname,
    totalAmount:       orders.reduce((acc, o) => acc + o.totalAmount, 0),
    pickingStatus:     "scanned",
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