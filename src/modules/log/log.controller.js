import * as LogService from "./log.service.js";

export const createLog = async (req, res) => {
    try {
        const { tenantId, userId } = req;
        const { orderId, notes, action } = req.body;

        if (!orderId) return res.status(400).json({ error: "orderId es requerido" });

        const log = await LogService.createPackingLog({ tenantId, userId, orderId, notes, action });
        res.status(201).json(log);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getLogs = async (req, res) => {
    try {
        const { tenantId } = req;
        const { userId, from, to } = req.query;

        const logs = await LogService.getPackingLogs({ tenantId, userId, from, to });
        res.json(logs);
    } catch (error) {
        console.error("❌ getLabelController:", {
            status: error.response?.status,
            data: error.response?.data,
            orderId: req.params.orderId,
        })
        res.status(500).json({ error: error.message });
    }
};