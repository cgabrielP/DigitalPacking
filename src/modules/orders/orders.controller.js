import * as OrdersService from "./orders.service.js"

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

export const scanOrderController = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { code } = req.body;

    const order = await OrdersService.scanOrder(tenantId, code);

    res.json(order);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

export const syncOrdersController = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const result = await OrdersService.syncMercadoLibreOrders(tenantId);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error sincronizando órdenes" });
  }
};
export const getDBOrders = async (req,res)=>{
  try {
    const { tenantId } = req.params;

    const orders = await OrdersService.getOrdersFromDB(tenantId);

    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo órdenes DB" });
  }
}

