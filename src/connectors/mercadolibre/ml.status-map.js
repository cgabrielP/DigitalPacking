/**
 * Maps ML order status → internal OrderStatus enum.
 */
const statusMap = {
  paid:          "PENDING",
  handling:      "PENDING",
  ready_to_ship: "PACKED",
  shipped:       "IN_TRANSIT",
  delivered:     "DELIVERED",
  cancelled:     "CANCELLED",
  returned:      "RETURNED",
};

export function mapStatus(mlStatus) {
  return statusMap[mlStatus] || "PENDING";
}
