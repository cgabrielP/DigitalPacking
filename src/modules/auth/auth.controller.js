import axios from "axios";
import prisma from "../../database/prisma.js";
import * as authService from "./auth.service.js";


export const loginMercadoLibre = (req, res) => {
  const url = authService.getMercadoLibreAuthUrl();
  res.redirect(url);
};

export const callbackMercadoLibre = async (req, res) => {
  try {
    const { code } = req.query;

    await authService.handleMercadoLibreCallback(code);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error conectando cuenta" });
  }
};

