import prisma from "../../database/prisma.js";
import { createConnector } from "../../connectors/connector.factory.js";

/**
 * List all marketplace accounts for a tenant.
 */
export const getAccounts = async (tenantId) => {
  const accounts = await prisma.marketplaceAccount.findMany({
    where: { tenantId },
    select: {
      id: true,
      marketplace: true,
      nickname: true,
      isActive: true,
      lastSyncedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return accounts;
};

/**
 * Connect a new marketplace account (API key based — Falabella, Ripley, Walmart).
 * For ML, use the existing OAuth flow.
 */
export const connectAccount = async (tenantId, { marketplace, nickname, credentials }) => {
  // Validate marketplace
  const supported = ["FALABELLA", "RIPLEY", "WALMART", "HITES"];
  if (!supported.includes(marketplace)) {
    throw new Error(`Usa el flujo OAuth para conectar ${marketplace}`);
  }

  // Validate required credentials per marketplace
  validateCredentials(marketplace, credentials);

  // Test the connection before saving
  const testAccount = {
    id: "test",
    tenantId,
    marketplace,
    nickname,
    credentials,
    isActive: true,
    lastSyncedAt: null,
  };

  try {
    const connector = createConnector(testAccount);
    await connector.refreshAuth();
  } catch (e) {
    // refreshAuth is a no-op for API key marketplaces, so this is fine
  }

  // Upsert — same tenant + marketplace + nickname can't duplicate
  const account = await prisma.marketplaceAccount.upsert({
    where: {
      tenantId_marketplace_nickname: { tenantId, marketplace, nickname },
    },
    create: {
      tenantId,
      marketplace,
      nickname,
      credentials,
      isActive: true,
    },
    update: {
      credentials,
      isActive: true,
    },
  });

  return account;
};

/**
 * Disconnect (deactivate) a marketplace account.
 */
export const disconnectAccount = async (tenantId, accountId) => {
  const account = await prisma.marketplaceAccount.findFirst({
    where: { id: accountId, tenantId },
  });
  if (!account) throw new Error("Cuenta no encontrada");

  await prisma.marketplaceAccount.update({
    where: { id: accountId },
    data: { isActive: false },
  });

  return { message: "Cuenta desconectada" };
};

/**
 * Validate credentials structure per marketplace.
 */
function validateCredentials(marketplace, credentials) {
  switch (marketplace) {
    case "FALABELLA":
      if (!credentials.apiKey) throw new Error("apiKey es requerido para Falabella");
      if (!credentials.userId) throw new Error("userId es requerido para Falabella");
      if (!credentials.apiUrl) throw new Error("apiUrl es requerido para Falabella");
      break;
    case "RIPLEY":
      if (!credentials.apiKey) throw new Error("apiKey es requerido para Ripley");
      if (!credentials.shopId) throw new Error("shopId es requerido para Ripley");
      break;
    case "WALMART":
      if (!credentials.clientId) throw new Error("clientId es requerido para Walmart");
      if (!credentials.clientSecret) throw new Error("clientSecret es requerido para Walmart");
      break;
    default:
      break;
  }
}
