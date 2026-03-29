import { mapStatus } from "./ripley.status-map.js";

/**
 * Map a Mirakl (Ripley) order → normalized order object.
 *
 * Mirakl OR11 response shape (per order):
 * {
 *   order_id, commercial_id, created_date, last_updated_date,
 *   order_state, total_price, currency_iso_code,
 *   customer: { firstname, lastname, billing_address, shipping_address },
 *   shipping_address: { street_1, street_2, city, state, zip_code, country_iso_code },
 *   order_lines: [
 *     {
 *       order_line_id, offer_sku, product_title, quantity, price,
 *       offer_id, product_media_url, category_label, ...
 *     }
 *   ],
 *   shipping_tracking_number, shipping_carrier_code, ...
 * }
 *
 * @param {object} miraklOrder — raw order from OR11 response
 * @returns {object} Normalized order ready for DB upsert
 */
export function mapRipleyOrder(miraklOrder) {
  const addr = miraklOrder.shipping_address || miraklOrder.customer?.shipping_address;
  const lines = miraklOrder.order_lines || [];

  return {
    externalOrderId:    String(miraklOrder.order_id),
    externalShipmentId: miraklOrder.shipping_tracking_number || null,
    normalizedStatus:   mapStatus(miraklOrder.order_state),
    buyerName:          formatBuyerName(miraklOrder.customer),
    shippingAddress:    addr ? {
      street:   [addr.street_1, addr.street_2].filter(Boolean).join(", "),
      city:     addr.city,
      state:    addr.state,
      zip:      addr.zip_code,
      country:  addr.country_iso_code || addr.country,
      comments: addr.additional_info || null,
    } : null,
    marketplaceCreatedAt: new Date(miraklOrder.created_date),
    items: lines.map((line) => ({
      externalItemId: String(line.order_line_id || line.offer_id || ""),
      title:          line.product_title || "Sin título",
      quantity:       parseInt(line.quantity) || 1,
      pictureUrl:     line.product_media_url || null,
      variation:      line.category_label || null,
    })),

    // Ripley-specific raw data (for legacy fields)
    raw: {
      status:             (miraklOrder.order_state || "").toLowerCase(),
      totalAmount:        parseFloat(miraklOrder.total_price) || 0,
      buyerNickname:      formatBuyerName(miraklOrder.customer),
      packId:             miraklOrder.commercial_id || null,
      lastUpdatedAt:      miraklOrder.last_updated_date
        ? new Date(miraklOrder.last_updated_date) : null,
      shippingId:         miraklOrder.shipping_tracking_number || null,
      shippingStatus:     (miraklOrder.order_state || "").toLowerCase(),
      shippingSubstatus:  null,
      logisticType:       miraklOrder.shipping_carrier_code || null,
      shippingOptionName: miraklOrder.shipping_type_label || null,
      deliveryPromise:       null,
      estimatedDeliveryTime: miraklOrder.delivery_date
        ? new Date(miraklOrder.delivery_date) : null,
      estimatedDeliveryLimit: null,
      estimatedDeliveryFinal: null,
      shippingMethodId:   null,
      shippingMethodName: miraklOrder.shipping_carrier_code || null,
      shippingMethodType: miraklOrder.shipping_type_code || null,
      shippingDeliverTo:  null,
      receiverCity:       addr?.city || null,
    },
  };
}

function formatBuyerName(customer) {
  if (!customer) return null;
  return `${customer.firstname || ""} ${customer.lastname || ""}`.trim() || null;
}
