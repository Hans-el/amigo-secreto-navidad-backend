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
  const { nombre } = req.body;

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

    // 3. Obtener amigos disponibles
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

    // 4. Guardar asignación
    await pool.query(
      "INSERT INTO asignaciones (participante_id, amigo_id) VALUES ($1, $2)",
      [participante.id, amigo.id]
    );

    // 5. Marcar ambos como usados
    await pool.query(
      "UPDATE participantes SET participo = TRUE WHERE id IN ($1, $2)",
      [participante.id, amigo.id]
    );

    res.json({ amigo: amigo.nombre });

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
async function resetearTodo() {
  if (!confirm("¿Seguro que deseas borrar el sorteo?")) return;

  try {
    const res = await fetch(`${API_URL}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: CLAVE_ADMIN })
    });

    const data = await res.json();
    alert("Sorteo reseteado correctamente");
    localStorage.removeItem("bloqueado");
    pantalla("pantallaInicio");

  } catch (error) {
    alert("No se pudo resetear el sorteo");
  }
}


/* ============================================
   ✅ SERVIDOR ONLINE
============================================ */
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
