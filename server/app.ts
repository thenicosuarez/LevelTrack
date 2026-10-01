import express, { type Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { log } from "./vite";

// Builds the Express app with all API routes. Serving the client (Vite in
// dev, static files in prod) and listening are left to the caller, so tests
// can start the API on their own port.
export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();
  app.set("trust proxy", 1); // Correctly read X-Forwarded-Proto from reverse proxy
  // Room for compressed photos (progress photos, up to 3 label photos).
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ extended: false }));

  // Request log: method, path, status and timing only. Response bodies hold
  // health data and are deliberately not logged.
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    res.on("finish", () => {
      if (path.startsWith("/api")) {
        log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
      }
    });
    next();
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (status >= 500) console.error(err);
    if (!res.headersSent) res.status(status).json({ message });
  });

  return { app, server };
}
