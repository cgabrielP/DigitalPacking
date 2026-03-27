import { mapStatus } from "./falabella.status-map.js";

/**
 * Map a Falabella Seller Center order → normalized order object.
 * @param {object} fbOrder — raw order from GetOrders response
 * @param {object[]} fbItems — items from GetOrderItems response
 * @returns {object} Normalized order ready for DB upsert
 */
export function mapFalabellaOrder(fbOrder, fbItems = [], imageMap = new Map()) {
  // Statuses can be { Status: "pending" } (object) or [{ Status: "pending" }] (array)
  const rawStatuses = fbOrder.Statuses;
  const status = Array.isArray(rawStatuses)
    ? rawStatuses[0]?.Status
    : rawStatuses?.Status || fbOrder.Status || "pending";

  // Use items from GetOrderItems if available, fallback to embedded OrderItems
  const items = fbItems.length > 0
    ? fbItems
    : (fbOrder.OrderItems?.OrderItem || []);

  // Normalize items to array (Falabella returns single item as object, not array)
  const itemList = Array.isArray(items) ? items : [items];

  return {
    externalOrderId:    String(fbOrder.OrderId || fbOrder.OrderNumber),
    externalShipmentId: fbOrder.ShipmentProviderId || null,
    normalizedStatus:   mapStatus(status),
    buyerName:          `${fbOrder.CustomerFirstName || ""} ${fbOrder.CustomerLastName || ""}`.trim() || null,
    shippingAddress:    fbOrder.AddressShipping ? {
      street:   fbOrder.AddressShipping.Address1,
      city:     fbOrder.AddressShipping.City,
      state:    fbOrder.AddressShipping.Region,
      zip:      fbOrder.AddressShipping.PostCode,
      country:  fbOrder.AddressShipping.Country,
      comments: fbOrder.AddressShipping.Address2,
    } : null,
    marketplaceCreatedAt: new Date(fbOrder.CreatedAt),
    items: itemList.map((item) => ({
      externalItemId: String(item.OrderItemId || item.ShopSku || ""),
      title:          item.Name || "Sin título",
      quantity:       parseInt(item.Quantity) || 1,
      pictureUrl:     imageMap.get(item.Sku) || null,
      variation:      item.Variation || null,
    })),

    // Falabella-specific raw data (for legacy fields)
    raw: {
      status:            status.toLowerCase(),
      totalAmount:       parseFloat(fbOrder.Price) || 0,
      buyerNickname:     `${fbOrder.CustomerFirstName || ""} ${fbOrder.CustomerLastName || ""}`.trim() || null,
      packId:            null,
      lastUpdatedAt:     fbOrder.UpdatedAt ? new Date(fbOrder.UpdatedAt) : null,
      shippingId:        fbOrder.ShipmentProviderId || null,
      shippingStatus:    status.toLowerCase(),
      shippingSubstatus: null,
      logisticType:      fbOrder.ShipmentProvider || null,
      shippingOptionName: fbOrder.ShipmentProvider || null,
      deliveryPromise:       fbOrder.PromisedShippingTime || null,
      estimatedDeliveryTime: fbOrder.PromisedShippingTime
        ? new Date(fbOrder.PromisedShippingTime) : null,
      estimatedDeliveryLimit: null,
      estimatedDeliveryFinal: null,
      shippingMethodId:   null,
      shippingMethodName: fbOrder.ShipmentProvider || null,
      shippingMethodType: null,
      shippingDeliverTo:  null,
      receiverCity:       fbOrder.AddressShipping?.City || null,
    },
  };
}
