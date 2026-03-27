import axios from "axios";
import MarketplaceConnector from "../connector.interface.js";
import { buildSignedUrl } from "./falabella.auth.js";
import { mapFalabellaOrder } from "./falabella.mapper.js";

export default class FalabellaConnector extends MarketplaceConnector {
  constructor(account) {
    super(account);
    this.label = account.nickname || this.credentials.userId;
  }

  // ── Auth ──────────────────────────────────────────────────────
  // Falabella uses API key + HMAC — no token refresh needed
  async refreshAuth() {
    return null;
  }

  // ── Private helpers ───────────────────────────────────────────

  async _callApi(action, extraParams = {}) {
    const url = buildSignedUrl(this.credentials, action, extraParams);

    let res;
    try {
      res = await axios.get(url, { timeout: 30000 });
    } catch (err) {
      // axios throws on non-2xx — extract the Falabella error body if present
      const body = err.response?.data;
      const msg = body?.ErrorResponse?.Head?.ErrorMessage
        || body?.ErrorResponse?.Head?.ErrorCode
        || err.message;
      throw new Error(`Falabella API ${err.response?.status || "error"}: ${msg}`);
    }

    // Falabella API can also return errors inside a 200 response body
    if (res.data?.ErrorResponse) {
      const err = res.data.ErrorResponse?.Head?.ErrorMessage || "Error desconocido de Falabella";
      throw new Error(`Falabella API error: ${err}`);
    }

    return res.data;
  }

  // ── Public interface ──────────────────────────────────────────

  async fetchOrders(since) {
    const sinceISO = since.toISOString();
    const isFirstSync = !this.account.lastSyncedAt;

    console.log(`📅 [${this.label}] ${isFirstSync ? "Primer sync Falabella" : `Sync Falabella desde ${sinceISO}`}`);

    let allOrders = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = await this._callApi("GetOrders", {
        CreatedAfter: sinceISO,
        Limit: String(limit),
        Offset: String(offset),
        SortBy: "created_at",
        SortDirection: "DESC",
      });

      const body = data.SuccessResponse?.Body;
      const orders = body?.Orders?.Order || [];

      // Normalize to array (single order comes as object)
      const orderList = Array.isArray(orders) ? orders : [orders];
      if (orderList.length === 0 || !orderList[0]?.OrderId) break;

      allOrders = [...allOrders, ...orderList];

      console.log(`📄 [${this.label}] Paginando Falabella: ${allOrders.length}`);

      // If we got less than the limit, we're done
      if (orderList.length < limit) break;
      offset += limit;
    }

    console.log(`📦 [${this.label}] Órdenes Falabella a procesar: ${allOrders.length}`);

    // Fetch items for each order
    const normalized = [];
    for (const fbOrder of allOrders) {
      let items = [];
      try {
        const itemData = await this._callApi("GetOrderItems", {
          OrderId: String(fbOrder.OrderId || fbOrder.OrderNumber),
        });
        const rawItems = itemData.SuccessResponse?.Body?.OrderItems?.OrderItem || [];
        items = Array.isArray(rawItems) ? rawItems : [rawItems];
      } catch (e) {
        console.warn(`⚠️ [${this.label}] No se pudieron obtener items de orden ${fbOrder.OrderId}:`, e.message);
      }

      normalized.push(mapFalabellaOrder(fbOrder, items));
    }

    return normalized;
  }

  async getShippingLabel(externalShipmentId) {
    // Falabella uses GetDocument action for shipping labels
    const data = await this._callApi("GetDocument", {
      OrderItemIds: externalShipmentId,
      DocumentType: "shippingLabel",
    });

    const doc = data.SuccessResponse?.Body?.Document;
    if (!doc?.File) {
      throw new Error("Falabella no retornó etiqueta de envío");
    }

    // Falabella returns base64-encoded PDF
    const pdfBuffer = Buffer.from(doc.File, "base64");
    const { Readable } = await import("stream");
    const stream = Readable.from(pdfBuffer);

    return {
      stream,
      contentType: doc.MimeType || "application/pdf",
      shippingId: externalShipmentId,
    };
  }

  async getItemPicture(_externalItemId) {
    // Falabella doesn't provide item images through the order API
    return null;
  }
}
