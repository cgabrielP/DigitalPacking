import prisma from "../../database/prisma.js";

// ─────────────────────────────────────────
//  PAYMENT CONFIG
// ─────────────────────────────────────────

export const getPaymentConfig = async (tenantId) => {
    const config = await prisma.deliveryPaymentConfig.findUnique({
        where: { tenantId },
    });
    return config;
};

export const upsertPaymentConfig = async (tenantId, amountPerDelivery) => {
    return prisma.deliveryPaymentConfig.upsert({
        where: { tenantId },
        update: { amountPerDelivery },
        create: { tenantId, amountPerDelivery },
    });
};

// ─────────────────────────────────────────
//  ASSIGN
// ─────────────────────────────────────────

export const assignOrder = async (tenantId, { orderId, deliveryUserId, notes }) => {
    // Verificar que la orden pertenece al tenant
    const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
    });
    if (!order) throw new Error("Orden no encontrada");

    // Verificar que el delivery pertenece al tenant y tiene rol DELIVERY
    const deliveryUser = await prisma.user.findFirst({
        where: { id: deliveryUserId, tenantId, role: "DELIVERY", isActive: true },
    });
    if (!deliveryUser) throw new Error("Usuario delivery no encontrado");

    // Leer monto vigente del config
    const config = await prisma.deliveryPaymentConfig.findUnique({
        where: { tenantId },
    });
    if (!config) throw new Error("No hay configuración de pago definida. Configura el monto por delivery primero.");

    // Crear o reasignar (si ya existía un assignment para esta orden, lo reemplaza)
    const assignment = await prisma.deliveryAssignment.upsert({
        where: { orderId },
        update: { deliveryUserId, paymentAmount: config.amountPerDelivery, notes: notes ?? null },
        create: { orderId, deliveryUserId, paymentAmount: config.amountPerDelivery, notes: notes ?? null },
        include: { deliveryUser: { select: { id: true, name: true } } },
    });

    return assignment;
};

export const unassignOrder = async (tenantId, orderId) => {
    // Verificar que la orden pertenece al tenant
    const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
    });
    if (!order) throw new Error("Orden no encontrada");

    await prisma.deliveryAssignment.delete({
        where: { orderId },
    });

    return { message: "Asignación eliminada" };
};

// ─────────────────────────────────────────
//  LISTAR ASIGNACIONES
//  - ADMIN/SUPERVISOR: todas las del tenant, filtradas por fecha opcional
//  - DELIVERY: solo las suyas
// ─────────────────────────────────────────

export const getAssignments = async ({ tenantId, role, userId, date }) => {
    // Filtro por fecha: si se pasa, busca asignaciones cuya orden fue asignada ese día
    let dateFilter = {};
    if (date) {
        const from = new Date(date);
        from.setHours(0, 0, 0, 0);
        const to = new Date(date);
        to.setHours(23, 59, 59, 999);
        dateFilter = { assignedAt: { gte: from, lte: to } };
    }

    const where = {
        ...dateFilter,
        // Filtramos por tenant a través de la orden
        order: { tenantId },
        // Si es DELIVERY, solo sus asignaciones
        ...(role === "DELIVERY" ? { deliveryUserId: userId } : {}),
    };

    const assignments = await prisma.deliveryAssignment.findMany({
        where,
        orderBy: { assignedAt: "desc" },
        include: {
            deliveryUser: { select: { id: true, name: true, email: true } },
            order: {
                select: {
                    id: true,
                    packId: true,
                    status: true,
                    totalAmount: true,
                    buyerNickname: true,
                    shippingStatus: true,
                    shippingSubstatus: true,
                    receiverCity: true,
                    createdAt: true,
                    orderItems: {
                        select: { id: true, title: true, thumbnail: true, quantity: true, variation: true },
                    },
                },
            },
        },
    });

    return assignments;
};

// ─────────────────────────────────────────
//  REPORTE DE PAGOS
//  Cuánto se le debe pagar a un delivery en un día dado
// ─────────────────────────────────────────

export const getDeliveryReport = async ({ tenantId, userId, date }) => {
    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);

    const assignments = await prisma.deliveryAssignment.findMany({
        where: {
            deliveryUserId: userId,
            assignedAt: { gte: from, lte: to },
            order: { tenantId, shippingStatus: "delivered" },
        },
        include: {
            order: {
                select: {
                    id: true,
                    packId: true,
                    totalAmount: true,
                    buyerNickname: true,
                    shippingStatus: true,
                    receiverCity: true,
                },
            },
        },
    });

    const totalDelivered = assignments.length;
    const totalPayment = assignments.reduce((acc, a) => acc + a.paymentAmount, 0);

    return {
        date,
        userId,
        totalDelivered,
        totalPayment,
        assignments,
    };
};