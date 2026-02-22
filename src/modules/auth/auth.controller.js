import axios from "axios";
import prisma from "../../database/prisma.js";
import * as authService from "./auth.service.js";


export const loginMercadoLibre = (req, res) => {
  const url = authService.getMercadoLibreAuthUrl();
  res.redirect(url);
};

// auth.controller.js
export const callbackMercadoLibre = async (req, res) => {
  try {
    const { code } = req.query;
    const { appToken } = await authService.handleMercadoLibreCallback(code);


    res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${appToken}`);
  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
  }
};

export const getMLUser = async (req, res) => {
  try {
    const { tenantId } = req;

    const user = await authService.getMercadoLibreUser(tenantId);

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo usuario ML" });
  }
};


