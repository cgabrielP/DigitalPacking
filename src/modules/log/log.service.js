import prisma from "../../database/prisma.js";

export const createPackingLog = async ({ tenantId, userId, orderId, notes, action = "packed" }) => {
    return await prisma.packingLog.create({
        data: { tenantId, userId, orderId, notes: notes ?? null, action },
    });
};

export const getPackingLogs = async ({ tenantId, userId, from, to }) => {
    const where = { tenantId };

    if (userId) where.userId = userId;

    if (from || to) {
        where.packedAt = {};
        if (from) where.packedAt.gte = new Date(from);
        if (to) where.packedAt.lte = new Date(to);
    }

    return await prisma.packingLog.findMany({
        where,
        orderBy: { packedAt: "desc" },
        include: {
            user: { select: { id: true, name: true, role: true } },
            order: { select: { id: true, packId: true, buyerNickname: true, receiverCity: true, shippingId: true, shippingStatus: true } },
        },
    });
};