import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import ngrok from "@ngrok/ngrok";

// ── Route modules ─────────────────────────────────────────────────────────────
import ordersRouter  from "./routes/orders.js";   // /api/orders
import fabricsRouter from "./routes/fabrics.js";  // /api/fabrics
import ediRouter     from "./routes/edi.js";       // /api/edi

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT         = process.env.PORT         || 3000;
const NGROK_TOKEN  = process.env.NGROK_AUTHTOKEN;
const NGROK_DOMAIN = process.env.NGROK_DOMAIN || "wildcard-squeegee-plunder.ngrok-free.dev";

async function startServer() {
  const app = express();

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Allow both localhost and the ngrok domain
  const allowedOrigins = [
    `http://localhost:${PORT}`,
    `https://${NGROK_DOMAIN}`,
  ];

  app.use(cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
    credentials: true,
  }));

  // ── ngrok browser-warning bypass ─────────────────────────────────────────
  // When a browser hits the ngrok free-tier URL it shows an interstitial page.
  // Setting this header skips it. We echo it back so API clients know to send it.
  app.use((_req, res, next) => {
    res.setHeader("ngrok-skip-browser-warning", "true");
    next();
  });

  app.use(express.json());

  // ── Mount routes ──────────────────────────────────────────────────────────
  app.use("/api/orders",  ordersRouter);
  app.use("/api/fabrics", fabricsRouter);
  app.use("/api/edi",     ediRouter);

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "Hiraya API is operational",
      publicUrl: `https://${NGROK_DOMAIN}`,
      environment: process.env.NODE_ENV || "development",
    });
  });

  // ── Vite dev / production static ──────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  // ── Start HTTP server ─────────────────────────────────────────────────────
  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`\n🚀  Local:   http://localhost:${PORT}`);
    console.log(`📦  Env:     ${process.env.NODE_ENV || "development"}`);

    // ── Start ngrok tunnel ──────────────────────────────────────────────────
    if (NGROK_TOKEN) {
      try {
        const listener = await ngrok.forward({
          addr:     PORT,
          authtoken: NGROK_TOKEN,
          domain:   NGROK_DOMAIN,   // claim your static free domain
        });
        const publicUrl = listener.url();
        console.log(`🌐  Public:  ${publicUrl}`);
        console.log(`\n📡  Live API base URL:`);
        console.log(`    ${publicUrl}/api/health\n`);
      } catch (err) {
        console.error("⚠️  ngrok tunnel failed:", err.message);
        console.log("    Server still running locally on port", PORT);
      }
    } else {
      console.log(`\n⚠️  NGROK_AUTHTOKEN not set — tunnel skipped.`);
      console.log(`    Add it to .env to enable the public URL.\n`);
    }

    printRoutes();
  });
}

function printRoutes() {
  const base = `https://${NGROK_DOMAIN}`;
  console.log(`\n📋  API Endpoints  (${base})`);
  console.log(`    GET    ${base}/api/health`);
  console.log(`\n    ── Orders ──────────────────────────────────────────────`);
  console.log(`    GET    ${base}/api/orders`);
  console.log(`    POST   ${base}/api/orders`);
  console.log(`    GET    ${base}/api/orders/:id`);
  console.log(`    PUT    ${base}/api/orders/:id/status`);
  console.log(`    PUT    ${base}/api/orders/:id/transit`);
  console.log(`    PUT    ${base}/api/orders/:id/decline`);
  console.log(`    PUT    ${base}/api/orders/:id/note`);
  console.log(`    DELETE ${base}/api/orders/:id`);
  console.log(`\n    ── Fabrics ─────────────────────────────────────────────`);
  console.log(`    GET    ${base}/api/fabrics`);
  console.log(`    POST   ${base}/api/fabrics`);
  console.log(`    GET    ${base}/api/fabrics/:id`);
  console.log(`    PUT    ${base}/api/fabrics/:id`);
  console.log(`    PATCH  ${base}/api/fabrics/:id/stock`);
  console.log(`    DELETE ${base}/api/fabrics/:id`);
  console.log(`\n    ── EDI Pipeline ────────────────────────────────────────`);
  console.log(`    POST   ${base}/api/edi/receive/850`);
  console.log(`    POST   ${base}/api/edi/receive/861`);
  console.log(`    POST   ${base}/api/edi/receive/freight-invoice`);
  console.log(`    POST   ${base}/api/edi/freight-invoice/paid`);
  console.log(`    POST   ${base}/api/edi/freight-invoice/receipt`);
  console.log(`    POST   ${base}/api/edi/receive/820`);
  console.log(`    POST   ${base}/api/edi/receive/861`);
  console.log(`    POST   ${base}/api/edi/import`);
  console.log(`    POST   ${base}/api/edi/send-204`);
  console.log(`    POST   ${base}/api/edi/cargo/webhook\n`);
}

startServer();
