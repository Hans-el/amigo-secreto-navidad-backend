const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
import pkg from "pg";
const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());
require ('dotenv').config();

export const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false }
});

// ✅ GENERAR SORTEO
app.post("/api/sorteo", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM participantes");
    const mezclados = [...rows].sort(() => Math.random() - 0.5);

    for (let i = 0; i < mezclados.length; i++) {
      const participante = mezclados[i];
      const amigo = mezclados[(i + 1) % mezclados.length];

      await pool.query(
        "INSERT INTO asignaciones (participante_id, amigo_id) VALUES ($1, $2)",
        [participante.id, amigo.id]
      );
    }

    res.json({ mensaje: "Sorteo generado correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ OBTENER AMIGO SECRETO
app.get("/api/amigo/:nombre", async (req, res) => {
  try {
    const nombre = req.params.nombre;

    const p = await pool.query(
      "SELECT id FROM participantes WHERE LOWER(nombre) = LOWER($1)",
      [nombre]
    );

    if (p.rows.length === 0) {
      return res.json({ error: "Participante no existe" });
    }

    const participanteId = p.rows[0].id;

    const usado = await pool.query(
      "SELECT 1 FROM usados WHERE participante_id = $1",
      [participanteId]
    );

    if (usado.rows.length > 0) {
      return res.json({ error: "Este participante ya usó su turno" });
    }

    const amigo = await pool.query(`
      SELECT p.nombre FROM asignaciones a
      JOIN participantes p ON p.id = a.amigo_id
      WHERE a.participante_id = $1
    `, [participanteId]);

    await pool.query(
      "INSERT INTO usados (participante_id) VALUES ($1)",
      [participanteId]
    );

    res.json({ amigo: amigo.rows[0].nombre });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ RESET ADMIN
app.post("/api/reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM usados");
    await pool.query("DELETE FROM asignaciones");
    res.json({ mensaje: "Sorteo reseteado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("✅ Servidor API activo en http://localhost:3000");
});

