import * as DeliveryService from "./delivery.service.js";

export const getPaymentConfigController = async (req, res) => {
  try {
    const config = await DeliveryService.getPaymentConfig(req.tenantId);
    res.json(config ?? { amountPerDelivery: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const upsertPaymentConfigController = async (req, res) => {
  try {
    const { amountPerDelivery } = req.body;
    if (!amountPerDelivery || isNaN(amountPerDelivery)) {
      return res.status(400).json({ error: "amountPerDelivery debe ser un número" });
    }
    const config = await DeliveryService.upsertPaymentConfig(req.tenantId, Number(amountPerDelivery));
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createManualOrderController = async (req, res) => {
  try {
    const { buyerNickname, receiverCity, notes } = req.body;
    if (!buyerNickname) {
      return res.status(400).json({ error: "buyerNickname es requerido" });
    }
    const order = await DeliveryService.createManualOrder(req.tenantId, { buyerNickname, receiverCity, notes });
    res.json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteManualOrderController = async (req, res) => {
  try {
    const result = await DeliveryService.deleteManualOrder(req.tenantId, req.params.orderId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const assignOrderController = async (req, res) => {
  try {
    const assignment = await DeliveryService.assignOrder(req.tenantId, req.body);
    res.json(assignment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const unassignOrderController = async (req, res) => {
  try {
    await DeliveryService.unassignOrder(req.tenantId, req.params.orderId);
    res.json({ message: "Asignación eliminada" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getAssignmentsController = async (req, res) => {
  try {
    const { date } = req.query;
    const assignments = await DeliveryService.getAssignments({
      tenantId: req.tenantId,
      role:     req.role,
      userId:   req.userId,
      date,
    });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getDeliveryReportController = async (req, res) => {
  try {
    const { date, userId } = req.query;
    if (!date)   return res.status(400).json({ error: "El parámetro date es requerido" });
    if (!userId) return res.status(400).json({ error: "El parámetro userId es requerido" });

    const report = await DeliveryService.getDeliveryReport({
      tenantId: req.tenantId,
      userId,
      date,
    });
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};