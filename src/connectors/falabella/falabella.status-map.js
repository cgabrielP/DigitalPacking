/**
 * Maps Falabella Seller Center order status → internal OrderStatus enum.
 * Falabella statuses come from GetOrders response Statuses[0].Status
 */
const statusMap = {
  pending:        "PENDING",
  ready_to_ship:  "PACKED",
  shipped:        "IN_TRANSIT",
  delivered:      "DELIVERED",
  canceled:       "CANCELLED",
  failed:         "CANCELLED",
  returned:       "RETURNED",
};

export function mapStatus(falabellaStatus) {
  return statusMap[(falabellaStatus || "").toLowerCase()] || "PENDING";
}
