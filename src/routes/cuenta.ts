import { Router } from "express";
import supabase from "../lib/supabase.js";

const router = Router();

router.get("/", async (_req, res) => {
  const [
    { data: cuenta, error: errorCuenta },
    { data: eventos, error: errorEventos },
  ] = await Promise.all([
    supabase.from("cuenta").select("*").single(),
    supabase.from("eventos").select("*").order("fecha", { ascending: true }),
  ]);

  if (errorCuenta || errorEventos) {
    res
      .status(500)
      .json({ error: "No se pudieron obtener los datos de la cuenta." });
    return;
  }

  res.json({ cuenta, eventos });
});

export default router;
