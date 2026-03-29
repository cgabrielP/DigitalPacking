import { mapStatus } from "./ripley.status-map.js";
import { RIPLEY_BASE_URL } from "./ripley.auth.js";

/**
 * Map a Mirakl (Ripley) order → normalized order object.
 *
 * @param {object} miraklOrder — raw order from OR11 response
 * @returns {object} Normalized order ready for DB upsert
 */
export function mapRipleyOrder(miraklOrder) {
  const addr = miraklOrder.customer?.shipping_address;
  const lines = miraklOrder.order_lines || [];

  // commiteddate = promised delivery to customer (from order_additional_fields)
  // shipping_deadline = when seller must ship — less relevant for urgency
  const commitedDate = extractAdditionalField(miraklOrder.order_additional_fields, "commiteddate");
  const deadline = commitedDate || miraklOrder.shipping_deadline || null;

  return {
    externalOrderId:    String(miraklOrder.order_id),
    externalShipmentId: miraklOrder.shipping_tracking || null,
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
      pictureUrl:     pickImageUrl(line.product_medias),
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
      shippingId:         miraklOrder.shipping_tracking || null,
      shippingStatus:     (miraklOrder.order_state || "").toLowerCase(),
      shippingSubstatus:  null,
      logisticType:       miraklOrder.shipping_carrier_code || null,
      shippingOptionName: miraklOrder.shipping_type_label || null,
      deliveryPromise:       deadline,
      estimatedDeliveryTime: deadline ? new Date(deadline) : null,
      estimatedDeliveryLimit: null,
      estimatedDeliveryFinal: null,
      shippingMethodId:   null,
      shippingMethodName: miraklOrder.shipping_company || null,
      shippingMethodType: miraklOrder.shipping_type_code || null,
      shippingDeliverTo:  null,
      receiverCity:       addr?.city || null,
      trackingUrl:        miraklOrder.shipping_tracking_url || null,
    },
  };
}

/**
 * Pick the best image URL from product_medias array.
 * Prefers MEDIUM > LARGE > SMALL. Paths are relative, so prepend the base domain.
 */
function pickImageUrl(medias) {
  if (!medias || medias.length === 0) return null;

  const preferred = ["MEDIUM", "LARGE", "SMALL"];
  let best = null;
  for (const pref of preferred) {
    best = medias.find((m) => m.type === pref);
    if (best) break;
  }
  if (!best) best = medias[0];

  const path = best.media_url;
  if (!path) return null;

  // Paths come as "/media/product/image/..." — prepend the Mirakl domain
  if (path.startsWith("/")) {
    const baseOrigin = RIPLEY_BASE_URL.replace(/\/api\/?$/, "");
    return `${baseOrigin}${path}`;
  }
  return path;
}

function formatBuyerName(customer) {
  if (!customer) return null;
  return `${customer.firstname || ""} ${customer.lastname || ""}`.trim() || null;
}

function extractAdditionalField(fields, code) {
  if (!Array.isArray(fields)) return null;
  return fields.find((f) => f.code === code)?.value || null;
}
