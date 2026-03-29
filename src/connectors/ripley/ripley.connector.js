import axios from "axios";
import MarketplaceConnector from "../connector.interface.js";
import { RIPLEY_BASE_URL, buildHeaders } from "./ripley.auth.js";
import { mapRipleyOrder } from "./ripley.mapper.js";

/**
 * Ripley connector — Mirakl marketplace platform.
 *
 * Mirakl API reference used:
 *   OR11  — List orders       GET /orders
 *   OR72  — Get documents     GET /orders/{orderId}/documents
 *   OF51  — Get offer         GET /offers (for product images)
 *
 * Credentials: { apiKey: string, shopId: string }
 */
export default class RipleyConnector extends MarketplaceConnector {
  constructor(account) {
    super(account);
    this.label = account.nickname || this.credentials.shopId || "Ripley";
    this.baseUrl = RIPLEY_BASE_URL;
    this.headers = buildHeaders(this.credentials);
  }

  // ── Auth ──────────────────────────────────────────────────────
  // Mirakl uses API key — no token refresh needed
  async refreshAuth() {
    return null;
  }

  // ── Private helpers ───────────────────────────────────────────

  async _callApi(path, params = {}) {
    const url = `${this.baseUrl}${path}`;

    let res;
    try {
      res = await axios.get(url, {
        headers: this.headers,
        params,
        timeout: 30000,
      });
    } catch (err) {
      const body = err.response?.data;
      const msg = body?.message || body?.error || err.message;
      throw new Error(`Ripley API ${err.response?.status || "error"}: ${msg}`);
    }

    return res.data;
  }

  async _callApiStream(path, params = {}) {
    const url = `${this.baseUrl}${path}`;

    try {
      const res = await axios.get(url, {
        headers: this.headers,
        params,
        timeout: 30000,
        responseType: "stream",
      });
      return res;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Ripley API ${err.response?.status || "error"}: ${msg}`);
    }
  }

  // ── Public interface ──────────────────────────────────────────

  /**
   * Fetch orders from Mirakl OR11 endpoint.
   * Supports pagination via offset/limit (max 100 per page).
   */
  async fetchOrders(since) {
    const sinceISO = since.toISOString();
    const isFirstSync = !this.account.lastSyncedAt;

    console.log(`📅 [${this.label}] ${isFirstSync ? "Primer sync Ripley" : `Sync Ripley desde ${sinceISO}`}`);

    let allOrders = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const params = {
        start_date: sinceISO,
        offset,
        max: limit,
        sort: "dateCreated",
      };
      if (this.credentials.shopId) params.shop_id = this.credentials.shopId;

      const data = await this._callApi("/orders", params);

      const orders = data.orders || [];
      if (orders.length === 0) break;

      allOrders = [...allOrders, ...orders];

      console.log(`📄 [${this.label}] Paginando Ripley: ${allOrders.length}/${data.total_count || "?"}`);

      if (orders.length < limit) break;
      offset += limit;
    }

    console.log(`📦 [${this.label}] Órdenes Ripley a procesar: ${allOrders.length}`);

    return allOrders.map((order) => mapRipleyOrder(order));
  }

  /**
   * Get shipping label for a Ripley order.
   *
   * The caller passes order.shippingId (tracking number), but Mirakl
   * needs the order_id. We receive the tracking number so we look up
   * the order first, then download documents.
   *
   * Mirakl endpoint: GET /orders/{order_id}/documents/download
   */
  async getShippingLabel(shippingId) {
    // shippingId = tracking number. We need to find the order_id.
    // Search orders by tracking number.
    const data = await this._callApi("/orders", {
      shipping_tracking: shippingId,
      max: 1,
    });

    const order = data.orders?.[0];
    if (!order) {
      throw new Error(`No se encontró orden Ripley con tracking ${shippingId}`);
    }

    const orderId = order.order_id;
    const res = await this._callApiStream(
      `/orders/${orderId}/documents/download`
    );

    return {
      stream: res.data,
      contentType: res.headers["content-type"] || "application/pdf",
      shippingId: orderId,
    };
  }

  /**
   * Get product image URL.
   * Mirakl includes product_media_url in order lines, so this is rarely needed.
   */
  async getItemPicture(externalItemId) {
    try {
      const data = await this._callApi("/offers", {
        offer_id: externalItemId,
      });

      const offer = data.offers?.[0];
      return offer?.product_media_url || null;
    } catch {
      return null;
    }
  }
}
