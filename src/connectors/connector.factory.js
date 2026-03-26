import MercadoLibreConnector from "./mercadolibre/ml.connector.js";

const connectors = {
  MERCADOLIBRE: MercadoLibreConnector,
  // FALABELLA:    FalabellaConnector,
  // RIPLEY:       MiraklConnector,
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
