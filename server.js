import express from "express";
import pkg from "pg";
import cors from "cors";
import dotenv from "dotenv";
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
    // 1. Buscar participante
    const participanteRes = await pool.query(
      "SELECT * FROM participantes WHERE LOWER(nombre) = LOWER($1)",
      [nombre]
    );

    if (participanteRes.rows.length === 0) {
      return res.status(400).json({ error: "Participante no válido" });
    }

    const participante = participanteRes.rows[0];

    // 2. ✅ SI YA PARTICIPÓ → DEVOLVER SU HISTORIAL
    if (participante.participo && participante.amigo_asignado) {
      const amigoRes = await pool.query(
        "SELECT intereses FROM participantes WHERE nombre = $1",
        [participante.amigo_asignado]
      );

      return res.json({
        amigo: participante.amigo_asignado,
        intereses: amigoRes.rows[0]?.intereses || "",
        token: participante.token,
        mensaje: "Ya habías participado (historial)"
      });
    }

    // 3. Guardar intereses del participante
    await pool.query(
      "UPDATE participantes SET intereses = $1 WHERE id = $2",
      [intereses, participante.id]
    );

    // 4. Buscar amigos disponibles (que aún NO han participado)
    const disponiblesRes = await pool.query(
      `SELECT * FROM participantes 
       WHERE participo = FALSE AND id != $1`,
      [participante.id]
    );

    if (disponiblesRes.rows.length === 0) {
      return res.status(400).json({ error: "No quedan participantes disponibles" });
    }

    // 5. Elegir amigo aleatorio
    const amigo =
      disponiblesRes.rows[
      Math.floor(Math.random() * disponiblesRes.rows.length)
      ];

    // 6. Generar token
    const token = crypto.randomBytes(16).toString("hex");

    // 7. ✅ Guardar todo correctamente (SOLO el que participa)
    await pool.query(
      `UPDATE participantes 
       SET participo = TRUE,
           intereses = $1,
           amigo_asignado = $2,
           token = $3
       WHERE id = $4`,
      [
        intereses,
        amigo.nombre,
        token,
        participante.id
      ]
    );

    // 8. ✅ Responder correctamente
    res.json({
      amigo: amigo.nombre,
      intereses: amigo.intereses || "Sin intereses registrados",
      token
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

/* ============================================
   ✅ ENDPOINT: VER HISTORIAL PERSONAL CON TOKEN
============================================ */
app.post("/historial", async (req, res) => {
  const { token } = req.body;

  try {
    // 1. Buscar participante por token
    const participanteRes = await pool.query(
      "SELECT * FROM participantes WHERE token = $1",
      [token]
    );

    if (participanteRes.rows.length === 0) {
      return res.status(404).json({ error: "Token inválido o no existe" });
    }

    const participante = participanteRes.rows[0];

    // 2. Verificar que tenga amigo asignado
    if (!participante.amigo_asignado) {
      return res.status(400).json({ error: "Aún no tienes amigo asignado" });
    }

    // 3. Buscar intereses actuales del amigo
    const amigoRes = await pool.query(
      "SELECT nombre, intereses FROM participantes WHERE nombre = $1",
      [participante.amigo_asignado]
    );

    if (amigoRes.rows.length === 0) {
      return res.status(404).json({ error: "El amigo ya no existe en la base de datos" });
    }

    const amigo = amigoRes.rows[0];

    // 4. Responder historial correctamente
    res.json({
      amigo: amigo.nombre,
      intereses: amigo.intereses || "Aún no ha escrito sus intereses"
    });

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