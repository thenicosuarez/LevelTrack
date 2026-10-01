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
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
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
