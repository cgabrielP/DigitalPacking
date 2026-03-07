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

  // Primer sync → últimos 14 días; syncs siguientes → desde lastSyncedAt
  const dateFrom    = account.lastSyncedAt ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  })();
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

  const orders = await fetchAllOrders(account);
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

        console.log(`🚚 [${label}] Shipment ${shippingId} | ${shippingStatus} | ${shippingSubstatus}`);
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
        mlAccountId:       account.id,   // ← actualiza si la orden cambió de cuenta (edge case)
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
      },
    });

    await prisma.orderItem.deleteMany({ where: { orderId: order.id.toString() } });

    for (const item of order.order_items) {
      const thumbnail = await fetchThumbnail(item, account.accessToken);
      await prisma.orderItem.create({
        data: {
          orderId:   order.id.toString(),
          itemId:    item.item.id,
          title:     item.item.title,
          thumbnail,
          quantity:  item.quantity,
          variation: item.variation_attributes
            ?.map(v => `${v.name}: ${v.value_name}`)
            .join(", ") ?? null,
        },
      });
    }
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
    where:   { tenantId, shippingStatus: { not: null } },
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

// ─────────────────────────────────────────
//  SCAN & PACK
// ─────────────────────────────────────────

const parseScannedCode = (code) => {
  const match = code.match(/"id"\s*:\s*"(\d+)"/)
  if (match?.[1]) return { resolvedCode: match[1], searchByShipping: true }
  return { resolvedCode: code.trim(), searchByShipping: false }
};

export const scanOrder = async (tenantId, code) => {
  const { resolvedCode, searchByShipping } = parseScannedCode(code);

  console.log(`🔍 scanOrder | resolved: ${resolvedCode} | byShipping: ${searchByShipping}`);

  const where = {
    tenantId,
    OR: searchByShipping
      ? [{ shippingId: resolvedCode }]
      : [{ packId: resolvedCode }, { id: resolvedCode }],
  };

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

  const where = {
    tenantId,
    OR: searchByShipping
      ? [{ shippingId: resolvedCode }]
      : [{ packId: resolvedCode }, { id: resolvedCode }],
  };

  const result = await prisma.order.updateMany({ where, data: { pickingStatus: "packed" } });

  if (result.count === 0) throw new Error("Orden no encontrada o no pertenece a este tenant");

  return { message: "Orden empacada correctamente", updated: result.count };
};