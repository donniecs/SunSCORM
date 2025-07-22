import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Load environment variables from .env file
import { config } from 'dotenv';
config();

// Validate critical environment variables for production deployment
function validateEnvironment() {
  const requiredEnvVars = {
    'DATABASE_URL': process.env.DATABASE_URL,
    'PORT': process.env.PORT || '5000', // PORT has a default
  };

  // Additional production requirements
  if (process.env.NODE_ENV === 'production') {
    requiredEnvVars['SESSION_SECRET'] = process.env.SESSION_SECRET;
    requiredEnvVars['REPLIT_DOMAINS'] = process.env.REPLIT_DOMAINS;
  }

  const missing = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key, _]) => key);

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing critical environment variables for production: ${missing.join(', ')}`);
    } else {
      console.warn('Warning: Missing environment variables in development mode:', missing.join(', '));
    }
  }

  // Log environment status
  console.log('Environment validation:', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '5000',
    HAS_DATABASE_URL: !!process.env.DATABASE_URL,
    HAS_SESSION_SECRET: !!process.env.SESSION_SECRET,
    HAS_REPLIT_DOMAINS: !!process.env.REPLIT_DOMAINS,
    HAS_PUBLIC_DOMAIN: !!process.env.PUBLIC_DOMAIN,
  });
}

const app = express();

// Enhanced configuration for production deployment
app.set('trust proxy', true);

// Increase payload limits for large SCORM file uploads (512MB)
// Also configure timeouts and connection handling
app.use(express.json({ 
  limit: '512mb',
  extended: true,
  parameterLimit: 50000
}));
app.use(express.urlencoded({ 
  extended: false, 
  limit: '512mb',
  parameterLimit: 50000
}));

// Configure timeouts for large uploads
app.use((req, res, next) => {
  // Set longer timeout for upload endpoints
  if (req.path.includes('/upload') || req.path.includes('/courses')) {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
  }
  next();
});

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

(async () => {
  // Validate environment before starting server
  try {
    validateEnvironment();
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const httpServer = server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
  
  // Increase timeout for large file uploads (10 minutes)
  httpServer.timeout = 10 * 60 * 1000;
  if (httpServer.keepAliveTimeout) {
    httpServer.keepAliveTimeout = 10 * 60 * 1000;
  }
  if (httpServer.headersTimeout) {
    httpServer.headersTimeout = 10 * 60 * 1000;
  }
})();
