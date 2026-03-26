import { mapStatus } from "./ml.status-map.js";

/**
 * Map a raw ML order + shipment details → normalized order object.
 * @param {object} mlOrder — raw ML order from /orders/search
 * @param {object|null} shipment — raw ML shipment from /shipments/{id}
 * @param {object[]} itemsWithThumbnails — order items with resolved thumbnails
 * @returns {object} Normalized order ready for DB upsert
 */
export function mapMlOrder(mlOrder, shipment, itemsWithThumbnails) {
  const so = shipment?.shipping_option ?? {};
  const ra = shipment?.receiver_address ?? {};
  const lt = shipment?.lead_time ?? {};

  return {
    externalOrderId:    String(mlOrder.id),
    externalShipmentId: mlOrder.shipping?.id ? String(mlOrder.shipping.id) : null,
    normalizedStatus:   mapStatus(mlOrder.status),
    buyerName:          mlOrder.buyer?.nickname ?? null,
    shippingAddress:    ra.street_name ? {
      street:   ra.street_name,
      city:     ra.city?.name,
      state:    ra.state?.name,
      zip:      ra.zip_code,
      country:  ra.country?.id,
      comments: ra.comment,
    } : null,
    marketplaceCreatedAt: new Date(mlOrder.date_created),
    items: itemsWithThumbnails.map((item) => ({
      externalItemId: String(item.item.id),
      title:          item.item.title,
      quantity:       item.quantity,
      pictureUrl:     item.thumbnail,
      variation:      item.item.variation_attributes
        ?.map((v) => `${v.name}: ${v.value_name}`)
        .join(", ") ?? null,
    })),

    // ── Legacy fields (ML-specific, kept for backward compat) ──
    raw: {
      status:                mlOrder.status,
      totalAmount:           mlOrder.total_amount,
      buyerNickname:         mlOrder.buyer?.nickname ?? null,
      packId:                mlOrder.pack_id?.toString() ?? null,
      lastUpdatedAt:         mlOrder.date_last_updated ? new Date(mlOrder.date_last_updated) : null,
      shippingId:            mlOrder.shipping?.id?.toString() ?? null,
      shippingStatus:        shipment?.status ?? null,
      shippingSubstatus:     shipment?.substatus ?? shipment?.status ?? null,
      logisticType:          shipment?.logistic?.type ?? null,
      shippingOptionName:    so.name ?? null,
      deliveryPromise:       so.estimated_delivery_time?.pay_before ?? null,
      estimatedDeliveryTime: so.estimated_delivery_time?.date
        ? new Date(so.estimated_delivery_time.date) : null,
      estimatedDeliveryLimit: so.estimated_delivery_limit?.date
        ? new Date(so.estimated_delivery_limit.date) : null,
      estimatedDeliveryFinal: so.estimated_delivery_final?.date
        ? new Date(so.estimated_delivery_final.date) : null,
      shippingMethodId:   so.shipping_method_id ?? lt.shipping_method?.id ?? null,
      shippingMethodName: so.name ?? lt.shipping_method?.name ?? null,
      shippingMethodType: lt.shipping_method?.type ?? so.delivery_type ?? null,
      shippingDeliverTo:  ra.delivery_preference ?? null,
      receiverCity:       ra.city?.name ?? ra.neighborhood?.name ?? null,
    },
  };
}
