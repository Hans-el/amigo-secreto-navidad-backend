import express from "express";
import pkg from "pg";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";



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
   ✅ ENDPOINT: INICIAR SORTEO (SOLO VERIFICA CONEXIÓN)
============================================ */
app.post("/sorteo", async (req, res) => {
  try {
    const test = await pool.query("SELECT 1");
    res.json({ ok: true, mensaje: "Sorteo iniciado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error al iniciar sorteo" });
  }
});


/* ============================================
   ✅ ENDPOINT: PARTICIPAR EN EL SORTEO
============================================ */
app.post("/participar", async (req, res) => {
  const { nombre, intereses} = req.body;

  try {
    // 1. Buscar participante
    const participanteRes = await pool.query(
      "SELECT * FROM participantes WHERE LOWER(nombre) = LOWER($1)",
      [nombre]
    );

    if (participanteRes.rows.length === 0) {
      return res.status(400).json({ error: "Participante no válido" });
    }

    const participante = participanteRes.rows[0];

    // 2. Verificar si ya participó
    if (participante.participo) {
      return res.status(400).json({ error: "Ya participaste" });
    }

     // 3. Guardar intereses del participante
    await pool.query(
      "UPDATE participantes SET intereses = $1 WHERE id = $2",
      [intereses, participante.id]
    );

    // 4. Obtener amigos disponibles
    const disponiblesRes = await pool.query(`
      SELECT * FROM participantes
      WHERE participo = FALSE AND id != $1
    `, [participante.id]);

    if (disponiblesRes.rows.length === 0) {
      return res.status(400).json({ error: "No quedan participantes disponibles" });
    }

    const amigo = disponiblesRes.rows[
      Math.floor(Math.random() * disponiblesRes.rows.length)
    ];

    // 5. Guardar asignación
    await pool.query(
      "INSERT INTO asignaciones (participante_id, amigo_id) VALUES ($1, $2)",
      [participante.id, amigo.id]
    );

    // 6. Marcar ambos como usados
    await pool.query(
      "UPDATE participantes SET participo = TRUE WHERE id IN ($1, $2)",
      [participante.id, amigo.id]
    );
// ✅ RESPUESTA CON INTERESES DEL AMIGO
    res.json({
      amigo: amigo.nombre,
      intereses: amigo.intereses || "Sin intereses registrados"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error servidor" });
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
    await pool.query("UPDATE participantes SET participo = FALSE");

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
