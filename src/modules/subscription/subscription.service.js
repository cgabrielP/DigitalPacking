import prisma from "../../database/prisma.js";

export const getSubscription = async (tenantId) => {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: { select: { name: true } } },
  });
  if (!sub) throw new Error("Suscripción no encontrada");
  return sub;
};