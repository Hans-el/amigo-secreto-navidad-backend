import express from "express";
import pkg from "pg";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";

dotenv.config();
console.log("DB HOST:", process.env.PGHOST);

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

// ✅ CONEXIÓN SEGURA A RAILWAY
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false }
});

const PORT = process.env.PORT || 3000;

/* ============================================
   ✅ ENDPOINT: INICIAR SORTEO
============================================ */
app.post("/sorteo", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, mensaje: "Sorteo iniciado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error al iniciar sorteo" });
  }
});

/* ============================================
   ✅ ENDPOINT: PARTICIPAR EN EL SORTEO
   - Genera token único para cada participante
============================================ */
app.post("/participar", async (req, res) => {
  const { nombre, intereses } = req.body;

  try {
    // Buscar participante
    const participanteRes = await pool.query(
      "SELECT * FROM participantes WHERE LOWER(nombre) = LOWER($1)",
      [nombre]
    );

    if (participanteRes.rows.length === 0) {
      return res.status(400).json({ error: "Participante no válido" });
    }

    const participante = participanteRes.rows[0];

    // Verificar si ya participó
    if (participante.participo) {
      return res.status(400).json({ error: "Ya participaste" });
    }

    // Guardar intereses del participante
    await pool.query(
      "UPDATE participantes SET intereses = $1 WHERE id = $2",
      [intereses, participante.id]
    );

    // Obtener amigos disponibles
    const disponiblesRes = await pool.query(
      `SELECT * FROM participantes WHERE participo = FALSE AND id != $1`,
      [participante.id]
    );

    if (disponiblesRes.rows.length === 0) {
      return res.status(400).json({ error: "No quedan participantes disponibles" });
    }

    const amigo = disponiblesRes.rows[
      Math.floor(Math.random() * disponiblesRes.rows.length)
    ];

    // Guardar asignación
    await pool.query(
      "INSERT INTO asignaciones (participante_id, amigo_id) VALUES ($1, $2)",
      [participante.id, amigo.id]
    );

    // Marcar participante como participó y generar token
    const token = crypto.randomBytes(16).toString("hex");
    await pool.query(
      "UPDATE participantes SET participo = TRUE, token = $1 WHERE id = $2",
      [token, participante.id]
    );

    // Responder con amigo y token
    res.json({
      amigo: amigo.nombre,
      intereses: amigo.intereses || "Sin intereses registrados",
      token
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error servidor" });
  }
});

/* ============================================
   ✅ ENDPOINT: VER HISTORIAL PERSONAL CON TOKEN
============================================ */
app.post("/historial", async (req, res) => {
  const { token } = req.body;

  try {
    // Buscar participante por token
    const participanteRes = await pool.query(
      "SELECT * FROM participantes WHERE token = $1",
      [token]
    );

    if (participanteRes.rows.length === 0) {
      return res.status(404).json({ error: "Token inválido o expirado" });
    }

    const participante = participanteRes.rows[0];

    // Buscar amigo asignado
    const historialRes = await pool.query(`
      SELECT p.nombre AS amigo, p.intereses
      FROM asignaciones a
      JOIN participantes p ON a.amigo_id = p.id
      WHERE a.participante_id = $1
    `, [participante.id]);

    if (historialRes.rows.length === 0) {
      return res.status(400).json({ error: "Aún no tienes amigo asignado" });
    }

    res.json(historialRes.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar historial" });
  }
});

/* ============================================
   ✅ ENDPOINT: LOGIN ADMIN
============================================ */
app.post("/admin-login", async (req, res) => {
  const { clave } = req.body;

  if (clave === process.env.ADMIN_SECRET) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

/* ============================================
   ✅ ENDPOINT: RESET GENERAL (SOLO ADMIN)
============================================ */
app.post("/reset", async (req, res) => {
  const { clave } = req.body;

  if (clave !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    await pool.query("DELETE FROM asignaciones");
    await pool.query("UPDATE participantes SET participo = FALSE, token = NULL");

    res.json({ ok: true, mensaje: "Sorteo reseteado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al resetear sorteo" });
  }
});

/* ============================================
   ✅ SERVIDOR ONLINE
============================================ */
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
