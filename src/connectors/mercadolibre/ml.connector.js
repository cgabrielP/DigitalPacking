import axios from "axios";
import MarketplaceConnector from "../connector.interface.js";
import { refreshMlToken } from "./ml.auth.js";
import { mapMlOrder } from "./ml.mapper.js";

const ML_API = "https://api.mercadolibre.com";

export default class MercadoLibreConnector extends MarketplaceConnector {
  constructor(account) {
    super(account);
    this.accessToken = this.credentials.accessToken;
    this.mlUserId = this.credentials.mlUserId;
    this.label = account.nickname || this.mlUserId;
  }

  // ── Auth ──────────────────────────────────────────────────────

  async refreshAuth() {
    try {
      const updated = await refreshMlToken(this.credentials);
      this.accessToken = updated.accessToken;
      console.log(`🔑 [${this.label}] Token refrescado correctamente`);
      return updated;
    } catch (e) {
      console.warn(`⚠️ [${this.label}] No se pudo refrescar token, se usa el actual`);
      return null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  async _mlGet(url, opts = {}) {
    try {
      return await axios.get(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        ...opts,
      });
    } catch (error) {
      if (error.response?.status === 401) {
        const updated = await refreshMlToken(this.credentials);
        this.accessToken = updated.accessToken;
        return axios.get(url, {
          headers: { Authorization: `Bearer ${this.accessToken}` },
          ...opts,
        });
      }
      throw error;
    }
  }

  async _fetchAllRawOrders(since) {
    const limit = 50;
    let offset = 0;
    let allOrders = [];

    const dateFromISO = since.toISOString();
    const isFirstSync = !this.account.lastSyncedAt;
    console.log(`📅 [${this.label}] ${isFirstSync ? "Primer sync — últimos 14 días" : `Sync desde ${dateFromISO}`}`);

    while (true) {
      const res = await this._mlGet(
        `${ML_API}/orders/search?seller=${this.mlUserId}&order.date_last_updated.from=${dateFromISO}&sort=date_desc&limit=${limit}&offset=${offset}`
      );

      const results = res.data.results ?? [];
      allOrders = [...allOrders, ...results];

      const total = res.data.paging?.total ?? 0;
      offset += limit;

      console.log(`📄 [${this.label}] Paginando: ${allOrders.length}/${total}`);

      if (offset >= total || results.length === 0) break;
    }

    return allOrders;
  }

  async _fetchShipment(shippingId) {
    if (!shippingId) return null;
    try {
      const res = await this._mlGet(`${ML_API}/shipments/${shippingId}`);
      return res.data;
    } catch (e) {
      console.error(`❌ [${this.label}] Error shipment ${shippingId}:`, e.response?.data);
      return null;
    }
  }

  async _fetchThumbnail(item) {
    let thumbnail = item.item.thumbnail ?? null;
    if (thumbnail) return thumbnail.replace("http://", "https://");

    try {
      const itemRes = await this._mlGet(`${ML_API}/items/${item.item.id}`);
      const data = itemRes.data;
      thumbnail =
        data.pictures?.find((p) => p.secure_url)?.secure_url ??
        data.pictures?.find((p) => p.url)?.url ??
        data.thumbnail ?? null;
      if (thumbnail) return thumbnail.replace("http://", "https://");
    } catch (e) {
      console.error(`❌ Item ${item.item.id}:`, e.response?.data?.message ?? e.message);
    }

    try {
      const picRes = await this._mlGet(`${ML_API}/items/${item.item.id}/pictures`);
      const pics = picRes.data;
      if (Array.isArray(pics) && pics.length > 0) {
        thumbnail = pics[0].secure_url ?? pics[0].url ?? null;
        if (thumbnail) return thumbnail.replace("http://", "https://");
      }
    } catch { /* silencioso */ }

    return null;
  }

  // ── Public interface ──────────────────────────────────────────

  async fetchOrders(since) {
    const rawOrders = await this._fetchAllRawOrders(since);
    console.log(`📦 [${this.label}] Órdenes a procesar: ${rawOrders.length}`);

    const normalized = [];

    for (const mlOrder of rawOrders) {
      const shippingId = mlOrder.shipping?.id?.toString() ?? null;
      const shipment = await this._fetchShipment(shippingId);

      if (shipment) {
        const so = shipment.shipping_option ?? {};
        const ra = shipment.receiver_address ?? {};
        console.log(
          `🚚 [${this.label}] Shipment ${shippingId} | ${shipment.status} | ${shipment.substatus}` +
          ` | método: ${so.name ?? "—"}` +
          ` | destino: ${ra.city?.name ?? "—"} (${ra.delivery_preference ?? "—"})`
        );
      }

      // Resolve thumbnails
      const itemsWithThumbnails = await Promise.all(
        mlOrder.order_items.map(async (item) => ({
          ...item,
          thumbnail: await this._fetchThumbnail(item),
        }))
      );

      normalized.push(mapMlOrder(mlOrder, shipment, itemsWithThumbnails));
    }

    return normalized;
  }

  async getShippingLabel(externalShipmentId) {
    const response = await this._mlGet(
      `${ML_API}/shipment_labels?shipment_ids=${externalShipmentId}&response_type=pdf&caller.id=${this.mlUserId}`,
      { responseType: "stream" }
    );

    if (response.status !== 200) {
      const errorBody = await new Promise((resolve) => {
        let raw = "";
        response.data.on("data", (chunk) => (raw += chunk));
        response.data.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch { resolve({ message: raw }); }
        });
      });
      console.error("❌ ML shipment_labels error:", errorBody);
      throw new Error(errorBody?.failed_shipments?.[0]?.error ?? "Error obteniendo etiqueta de ML");
    }

    return {
      stream: response.data,
      contentType: response.headers["content-type"] ?? "application/pdf",
      shippingId: externalShipmentId,
    };
  }

  async getItemPicture(externalItemId) {
    try {
      const res = await this._mlGet(`${ML_API}/items/${externalItemId}`);
      const data = res.data;
      const url =
        data.pictures?.find((p) => p.secure_url)?.secure_url ??
        data.pictures?.find((p) => p.url)?.url ??
        data.thumbnail ?? null;
      return url?.replace("http://", "https://") ?? null;
    } catch {
      return null;
    }
  }
}
