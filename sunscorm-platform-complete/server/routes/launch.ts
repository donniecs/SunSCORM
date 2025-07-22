import type { Express } from "express";
import { handleSCORMLaunch, handleLaunchAssets } from "../services/launchService";

/**
 * SCORM Launch Routes
 * Handles external LMS integration and course launching
 */

export function registerLaunchRoutes(app: Express): void {
  // SCORM Launch route (must be BEFORE Vite middleware catch-all)
  app.get('/launch/:token', async (req, res) => {
    try {
      console.log(`[Launch] Processing token: ${req.params.token}`);
      await handleSCORMLaunch(req.params.token, req, res);
    } catch (error) {
      console.error("Error in launch handler:", error);
      res.status(500).send(`
        <html>
          <head><title>Launch Error</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>Course Launch Failed</h1>
            <p>Unable to launch the course. Please contact support.</p>
          </body>
        </html>
      `);
    }
  });

  // SCORM Launch assets route - serves individual files from ZIP for dispatched courses
  app.get('/launch/:token/assets/*', async (req, res) => {
    try {
      console.log(`[Launch Assets] Processing token: ${req.params.token}`);
      await handleLaunchAssets(req.params.token, req.params[0], req, res);
    } catch (error) {
      console.error("Error serving launch assets:", error);
      res.status(404).send("Asset not found");
    }
  });
}