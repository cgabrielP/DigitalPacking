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
  console.log("headers:", req.headers["content-type"]);
    console.log("body:", req.body);

  try {
    const { tenantId } = req;
    const { code } = req.body;
    const order = await OrdersService.scanOrder(tenantId, code);

    res.json(order);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

export const syncOrdersController = async (req, res) => {
  try {
    const { tenantId } = req;

    const result = await OrdersService.syncAllAccounts(tenantId);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error sincronizando órdenes" });
  }
};
export const getDBOrders = async (req,res)=>{
  try {
    const { tenantId } = req;

    const orders = await OrdersService.getOrdersFromDB(tenantId);

    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo órdenes DB" });
  }
}
export const packOrderController = async (req, res) => {
  try {
    const { tenantId } = req;
    const { orderId } = req.params;
    const result = await OrdersService.packOrder(tenantId, orderId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLabelController = async (req, res) => {
  try {
    const { tenantId }  = req;
    const { orderId }   = req.params;

    const result = await OrdersService.getShipmentLabel(tenantId, orderId);

    // Some marketplaces (e.g. Ripley) don't provide label downloads —
    // they return a carrier tracking URL instead.
    if (result.redirectUrl) {
      return res.redirect(result.redirectUrl);
    }

    const { stream, contentType, shippingId } = result;

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="etiqueta-${shippingId}.pdf"`
    );

    stream.pipe(res);
  } catch (error) {
    if (error.response?.data?.on) {
    const chunks = []
    for await (const chunk of error.response.data) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString()
    try {
      const parsed = JSON.parse(body)
      const mlError = parsed?.failed_shipments?.[0]
      console.error("❌ ML shipment_labels:", mlError)
      return res.status(400).json({ error: mlError?.error ?? body })
    } catch {
      console.error("❌ ML raw:", body)
      return res.status(400).json({ error: body })
    }
  }

  console.error("❌ getLabelController:", error.message)
  res.status(error.response?.status ?? 500).json({ error: error.message })
  }
};