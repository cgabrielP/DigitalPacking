import prisma from "../../database/prisma.js";
import { createConnector } from "../../connectors/connector.factory.js";

// ─────────────────────────────────────────
//  SYNC — todas las cuentas del tenant
// ─────────────────────────────────────────

export const syncAllAccounts = async (tenantId) => {
  const accounts = await prisma.marketplaceAccount.findMany({
    where: { tenantId, isActive: true },
  });

  if (!accounts.length) throw new Error("No hay cuentas de marketplace conectadas");

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

// ── Sync de una sola cuenta (marketplace-agnostic) ───────────────────────

const syncAccount = async (account, tenantId) => {
  const syncStartedAt = new Date();
  const label = account.nickname || account.id;

  const connector = createConnector(account);

  // 1. Refresh auth (each connector knows how)
  const updatedCredentials = await connector.refreshAuth();
  if (updatedCredentials) {
    await prisma.marketplaceAccount.update({
      where: { id: account.id },
      data: { credentials: updatedCredentials },
    });
  }

  // Resolve legacy mlAccountId for backward compat FK
  let legacyMlAccountId = null;
  if (account.marketplace === "MERCADOLIBRE") {
    const mlUserId = account.credentials?.mlUserId;
    if (mlUserId) {
      const legacy = await prisma.mercadoLibreAccount.findFirst({
        where: { tenantId, mlUserId },
        select: { id: true },
      });
      legacyMlAccountId = legacy?.id ?? null;
    }
  }

  // 2. Calculate sync start date (same -5 min overlap logic)
  const baseDate = account.lastSyncedAt ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  })();
  const since = new Date(baseDate.getTime() - 5 * 60 * 1000);

  // 3. Fetch normalized orders via connector
  const normalizedOrders = await connector.fetchOrders(since);

  if (normalizedOrders.length === 0) {
    await prisma.marketplaceAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: syncStartedAt },
    });
    return { accountId: account.id, nickname: label, total: 0, message: "Sin cambios" };
  }

  // 4. Upsert into DB
  for (const order of normalizedOrders) {
    const raw = order.raw ?? {};
    const orderId = raw.packId
      ? `${order.externalOrderId}`
      : order.externalOrderId;

    await prisma.order.upsert({
      where: { id: orderId },
      update: {
        // Legacy ML fields
        status:                raw.status ?? order.normalizedStatus,
        totalAmount:           raw.totalAmount ?? 0,
        shippingId:            raw.shippingId,
        shippingStatus:        raw.shippingStatus,
        shippingSubstatus:     raw.shippingSubstatus,
        logisticType:          raw.logisticType,
        shippingOptionName:    raw.shippingOptionName,
        packId:                raw.packId,
        lastUpdatedAt:         raw.lastUpdatedAt,
        deliveryPromise:       raw.deliveryPromise,
        estimatedDeliveryTime: raw.estimatedDeliveryTime,
        estimatedDeliveryLimit: raw.estimatedDeliveryLimit,
        estimatedDeliveryFinal: raw.estimatedDeliveryFinal,
        shippingMethodId:      raw.shippingMethodId,
        shippingMethodName:    raw.shippingMethodName,
        shippingMethodType:    raw.shippingMethodType,
        shippingDeliverTo:     raw.shippingDeliverTo,
        receiverCity:          raw.receiverCity,
        mlAccountId:           legacyMlAccountId,
        // Normalized fields
        marketplace:           account.marketplace,
        externalOrderId:       order.externalOrderId,
        marketplaceAccountId:  account.id,
        normalizedStatus:      order.normalizedStatus,
        buyerName:             order.buyerName,
        shippingAddress:       order.shippingAddress,
        marketplaceCreatedAt:  order.marketplaceCreatedAt,
      },
      create: {
        id:                    orderId,
        tenantId,
        // Legacy ML fields
        status:                raw.status ?? order.normalizedStatus,
        totalAmount:           raw.totalAmount ?? 0,
        buyerNickname:         raw.buyerNickname,
        shippingId:            raw.shippingId,
        shippingStatus:        raw.shippingStatus,
        shippingSubstatus:     raw.shippingSubstatus,
        logisticType:          raw.logisticType,
        shippingOptionName:    raw.shippingOptionName,
        packId:                raw.packId,
        lastUpdatedAt:         raw.lastUpdatedAt,
        deliveryPromise:       raw.deliveryPromise,
        estimatedDeliveryTime: raw.estimatedDeliveryTime,
        estimatedDeliveryLimit: raw.estimatedDeliveryLimit,
        estimatedDeliveryFinal: raw.estimatedDeliveryFinal,
        shippingMethodId:      raw.shippingMethodId,
        shippingMethodName:    raw.shippingMethodName,
        shippingMethodType:    raw.shippingMethodType,
        shippingDeliverTo:     raw.shippingDeliverTo,
        receiverCity:          raw.receiverCity,
        mlAccountId:           legacyMlAccountId,
        // Normalized fields
        marketplace:           account.marketplace,
        externalOrderId:       order.externalOrderId,
        marketplaceAccountId:  account.id,
        normalizedStatus:      order.normalizedStatus,
        buyerName:             order.buyerName,
        shippingAddress:       order.shippingAddress,
        marketplaceCreatedAt:  order.marketplaceCreatedAt,
      },
    });

    // Upsert order items
    const itemsData = order.items.map((item) => ({
      orderId,
      itemId:    item.externalItemId ?? item.title,
      title:     item.title,
      thumbnail: item.pictureUrl,
      quantity:  item.quantity,
      variation: item.variation,
    }));

    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { orderId } }),
      ...itemsData.map((data) => prisma.orderItem.create({ data })),
    ]);
  }

  // 5. Update lastSyncedAt
  await prisma.marketplaceAccount.update({
    where: { id: account.id },
    data: { lastSyncedAt: syncStartedAt },
  });

  // Also update legacy MercadoLibreAccount lastSyncedAt for backward compat
  if (account.marketplace === "MERCADOLIBRE") {
    const mlUserId = account.credentials?.mlUserId;
    if (mlUserId) {
      await prisma.mercadoLibreAccount.updateMany({
        where: { tenantId, mlUserId },
        data: { lastSyncedAt: syncStartedAt },
      });
    }
  }

  console.log(`✅ [${label}] lastSyncedAt → ${syncStartedAt.toISOString()}`);

  return {
    accountId: account.id,
    nickname: label,
    total: normalizedOrders.length,
    lastSyncedAt: syncStartedAt,
  };
};

// ─────────────────────────────────────────
//  ÓRDENES DESDE DB
// ─────────────────────────────────────────

export const getOrdersFromDB = async (tenantId) => {
  const orders = await prisma.order.findMany({
    where: { tenantId },
    include: {
      orderItems: true,
      deliveryAssignment: {
        select: {
          id: true,
          deliveryUserId: true,
          deliveryUser: { select: { id: true, name: true } },
        },
      },
      marketplaceAccount: {
        select: { id: true, marketplace: true, nickname: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const packsMap = new Map();
  const result = [];

  for (const order of orders) {
    const shippingCategory = resolveCategory(order);
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

const resolveCategory = (order) => {
  // Use normalizedStatus for marketplace-agnostic categorization
  const ns = order.normalizedStatus;
  if (ns === "DELIVERED" || ns === "RETURNED") return "finalizados";
  if (ns === "CANCELLED") return "finalizados";
  if (ns === "IN_TRANSIT") return "en_transito";

  // ML-specific substatus refinement
  const status = order.shippingStatus;
  const substatus = order.shippingSubstatus;
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
    : [{ packId: resolvedCode }, { id: resolvedCode }, { shippingId: resolvedCode }, { externalOrderId: resolvedCode }],
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
    buyerNickname: orders[0].buyerNickname,
    marketplace: orders[0].marketplace,
    totalAmount: orders.reduce((acc, o) => acc + o.totalAmount, 0),
    pickingStatus: alreadyProcessed ? orders[0].pickingStatus : "scanned",
    orderItems: orders.flatMap(o => o.orderItems),
    packedOrders: orders.map(o => o.id),
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
  const order = await prisma.order.findFirst({
    where: {
      tenantId,
      OR: [{ id: orderId }, { packId: orderId }],
    },
    include: { marketplaceAccount: true },
  });

  if (!order) throw new Error("Orden no encontrada");
  if (!order.shippingId) throw new Error("La orden no tiene envío asociado");
  if (["shipped", "delivered", "not_delivered"].includes(order.shippingStatus)) {
    throw new Error(`La etiqueta no está disponible — el envío ya está en estado "${order.shippingStatus}"`);
  }

  const connector = createConnector(order.marketplaceAccount);
  await connector.refreshAuth();

  console.log(`🏷️  Obteniendo etiqueta | shipmentId: ${order.shippingId} | marketplace: ${order.marketplace}`);

  return connector.getShippingLabel(order.shippingId);
};