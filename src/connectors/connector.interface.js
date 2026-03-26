/**
 * Base class every marketplace connector must implement.
 * sync.service.js calls these methods without knowing which marketplace it is.
 */
export default class MarketplaceConnector {
  /**
   * @param {object} account — MarketplaceAccount row (credentials already parsed)
   */
  constructor(account) {
    this.account = account;
    this.credentials = account.credentials;
  }

  /**
   * Refresh credentials if needed.
   * @returns {object|null} Updated credentials to persist, or null if unchanged.
   */
  async refreshAuth() {
    throw new Error("Not implemented");
  }

  /**
   * Fetch orders since a given date.
   * Must return an array of normalized order objects:
   * {
   *   externalOrderId, externalShipmentId?, status (OrderStatus),
   *   buyerName?, shippingAddress? (Json), marketplaceCreatedAt (Date),
   *   items: [{ externalItemId?, title, sku?, quantity, unitPrice, currency, pictureUrl?, variation? }],
   *   // ML-specific legacy fields (passed through for backward compat):
   *   raw? (original order data for marketplace-specific fields)
   * }
   */
  async fetchOrders(since) {
    throw new Error("Not implemented");
  }

  /**
   * Get shipping label as a stream.
   * @returns {{ stream, contentType, shippingId }}
   */
  async getShippingLabel(externalShipmentId) {
    throw new Error("Not implemented");
  }

  /**
   * Get product image URL.
   * @returns {string|null}
   */
  async getItemPicture(externalItemId) {
    throw new Error("Not implemented");
  }
}
