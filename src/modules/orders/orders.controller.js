import * as OrdersService from "./orders.service"

export const getMLOrders = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const orders = await OrdersService.getMercadoLibreOrders(tenantId);

    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo órdenes ML" });
  }
};
