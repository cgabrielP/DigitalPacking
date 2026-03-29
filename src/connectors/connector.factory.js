import MercadoLibreConnector from "./mercadolibre/ml.connector.js";
import FalabellaConnector from "./falabella/falabella.connector.js";
import RipleyConnector from "./ripley/ripley.connector.js";

const connectors = {
  MERCADOLIBRE: MercadoLibreConnector,
  FALABELLA:    FalabellaConnector,
  RIPLEY:       RipleyConnector,
  // WALMART:      WalmartConnector,
};

/**
 * Create the right connector for a MarketplaceAccount row.
 * @param {object} account — MarketplaceAccount from Prisma
 * @returns {MarketplaceConnector}
 */
export function createConnector(account) {
  const ConnectorClass = connectors[account.marketplace];
  if (!ConnectorClass) {
    throw new Error(`No hay conector para marketplace: ${account.marketplace}`);
  }
  return new ConnectorClass(account);
}
