import * as AccountsService from "./accounts.service.js";

export const getAccounts = async (req, res) => {
  try {
    const accounts = await AccountsService.getAccounts(req.tenantId);
    res.json(accounts);
  } catch (error) {
    console.error("getAccounts error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const connectAccount = async (req, res) => {
  try {
    const { marketplace, nickname, credentials } = req.body;
    const account = await AccountsService.connectAccount(req.tenantId, {
      marketplace,
      nickname,
      credentials,
    });
    res.status(201).json(account);
  } catch (error) {
    console.error("connectAccount error:", error.message);
    res.status(400).json({ error: error.message });
  }
};

export const disconnectAccount = async (req, res) => {
  try {
    const result = await AccountsService.disconnectAccount(
      req.tenantId,
      req.params.accountId
    );
    res.json(result);
  } catch (error) {
    console.error("disconnectAccount error:", error.message);
    res.status(400).json({ error: error.message });
  }
};
