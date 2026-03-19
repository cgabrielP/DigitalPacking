import * as subscriptionService from "./subscription.service.js";

export const getSubscriptionController = async (req, res) => {
  try {
    const sub = await subscriptionService.getSubscription(req.tenantId);
    res.json(sub);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};