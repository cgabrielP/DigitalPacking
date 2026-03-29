/**
 * Maps Mirakl (Ripley) order states → internal OrderStatus enum.
 *
 * Mirakl order states reference (OR11 response):
 *   STAGING              → seller is preparing the offer (pre-validation)
 *   WAITING_ACCEPTANCE   → order placed, waiting seller confirmation
 *   WAITING_DEBIT        → payment pending
 *   WAITING_DEBIT_PAYMENT→ payment in progress
 *   SHIPPING             → accepted and ready/being shipped
 *   SHIPPED              → carrier picked up
 *   TO_COLLECT           → ready for customer pickup
 *   RECEIVED             → customer confirmed receipt
 *   CLOSED               → order finalized
 *   REFUSED              → seller refused the order
 *   CANCELED             → order cancelled
 *   INCIDENT_OPEN        → dispute/incident opened
 *   INCIDENT_CLOSED      → dispute resolved
 */
const statusMap = {
  STAGING:               "PENDING",
  WAITING_ACCEPTANCE:    "PENDING",
  WAITING_DEBIT:         "PENDING",
  WAITING_DEBIT_PAYMENT: "PENDING",
  SHIPPING:              "PACKED",
  SHIPPED:               "IN_TRANSIT",
  TO_COLLECT:            "IN_TRANSIT",
  RECEIVED:              "DELIVERED",
  CLOSED:                "DELIVERED",
  REFUSED:               "CANCELLED",
  CANCELED:              "CANCELLED",
  INCIDENT_OPEN:         "PENDING",
  INCIDENT_CLOSED:       "DELIVERED",
};

export function mapStatus(miraklState) {
  return statusMap[(miraklState || "").toUpperCase()] || "PENDING";
}
