import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { insertDispatchSchema } from "@shared/schema";
import { z } from "zod";
import { licenseEnforcement } from "../licenseEnforcement";
import { csrfProtection } from "../csrfProtection";
import { generateLaunchFile } from "../services/launchService";
import fs from "fs";
import path from "path";
import archiver from "archiver";

/**
 * Dispatch Management Routes
 * Handles SCORM dispatch creation, management, and export
 */

export function registerDispatchRoutes(app: Express): void {

  // List dispatches with filtering
  app.get('/api/dispatches', isAuthenticated, async (req: any, res) => {
    try {
      const { courseId, tenantId, includeDisabled } = req.query;
      const user = await storage.getUser(req.user.claims.sub);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let dispatches;
      
      if (user.role === 'admin') {
        if (courseId) {
          dispatches = await storage.getDispatchesByCourse(courseId, includeDisabled === 'true');
        } else if (tenantId) {
          dispatches = await storage.getDispatchesByTenant(tenantId, includeDisabled === 'true');
        } else {
          dispatches = await storage.getDispatches(includeDisabled === 'true');
        }
      } else {
        // Regular users can only see dispatches they're assigned to
        dispatches = await storage.getDispatchesByUser(req.user.claims.sub);
      }

      res.json(dispatches);
    } catch (error) {
      console.error("Error fetching dispatches:", error);
      res.status(500).json({ message: "Failed to fetch dispatches" });
    }
  });

  // Get specific dispatch
  app.get('/api/dispatches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const dispatch = await storage.getDispatch(req.params.id);
      if (!dispatch) {
        return res.status(404).json({ message: "Dispatch not found" });
      }

      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check permissions
      if (user.role !== 'admin') {
        const userDispatches = await storage.getDispatchesByUser(req.user.claims.sub);
        const hasAccess = userDispatches.some(d => d.id === dispatch.id);
        
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      res.json(dispatch);
    } catch (error) {
      console.error("Error fetching dispatch:", error);
      res.status(500).json({ message: "Failed to fetch dispatch" });
    }
  });

  // Create dispatch with enhanced validation
  app.post('/api/dispatches', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate input using enhanced schema
      const dispatchSchema = insertDispatchSchema.extend({
        emails: z.array(z.string().email()).optional(),
        maxUsers: z.number().optional(),
        maxCompletions: z.number().optional(),
        expiresAt: z.string().datetime().optional(),
      });

      const validatedData = dispatchSchema.parse(req.body);

      // Check if course exists and is not disabled
      const course = await storage.getCourse(validatedData.courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      
      if (course.isDisabled) {
        return res.status(400).json({ message: "Cannot create dispatch for disabled course" });
      }

      // Check if tenant exists
      const tenant = await storage.getTenant(validatedData.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Company not found" });
      }

      // Enhanced license validation using consolidated service
      const canCreate = await licenseEnforcement.canCreateDispatch(
        validatedData.tenantId,
        validatedData.maxUsers || null,
        validatedData.maxCompletions || null
      );

      if (!canCreate.allowed) {
        return res.status(400).json({ 
          message: canCreate.reason,
          licenseInfo: canCreate
        });
      }

      // Check for existing active dispatch (prevent duplicates)
      const existingDispatches = await storage.getDispatchesByCourse(validatedData.courseId);
      const existingActive = existingDispatches.find(d => 
        d.tenantId === validatedData.tenantId && !d.isDisabled
      );

      if (existingActive) {
        return res.status(400).json({ 
          message: "An active dispatch already exists for this course and company",
          existingDispatchId: existingActive.id
        });
      }

      // Create dispatch record
      const dispatchData = {
        ...validatedData,
        launchToken: undefined, // Will be generated by storage layer
        isDisabled: false,
        createdBy: req.user.claims.sub,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
      };

      const dispatch = await storage.createDispatch(dispatchData);

      // Create dispatch users if emails provided
      if (validatedData.emails && validatedData.emails.length > 0) {
        const dispatchUsers = validatedData.emails.map(email => ({
          dispatchId: dispatch.id,
          email,
          launchToken: undefined, // Will be generated by storage layer
        }));

        for (const userData of dispatchUsers) {
          await storage.createDispatchUser(userData);
        }
      }

      // Generate launch file for external LMS using consolidated service
      try {
        await generateLaunchFile(dispatch.id, dispatch.launchToken);
      } catch (error) {
        console.warn("Failed to generate launch file, dispatch created but manual launch may be required:", error);
      }

      console.log(`Dispatch created successfully: ${dispatch.id} for course: ${course.title}`);
      res.json(dispatch);

    } catch (error) {
      console.error("Dispatch creation error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }

      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create dispatch" 
      });
    }
  });

  // Update dispatch
  app.put('/api/dispatches/:id', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dispatchId = req.params.id;
      const existingDispatch = await storage.getDispatch(dispatchId);
      
      if (!existingDispatch) {
        return res.status(404).json({ message: "Dispatch not found" });
      }

      const updateData = {
        name: req.body.name || existingDispatch.name,
        maxUsers: req.body.maxUsers !== undefined ? req.body.maxUsers : existingDispatch.maxUsers,
        maxCompletions: req.body.maxCompletions !== undefined ? req.body.maxCompletions : existingDispatch.maxCompletions,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : existingDispatch.expiresAt,
      };

      const updatedDispatch = await storage.updateDispatch(dispatchId, updateData);
      res.json(updatedDispatch);

    } catch (error) {
      console.error("Dispatch update error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update dispatch" 
      });
    }
  });

  // Soft delete dispatch
  app.delete('/api/dispatches/:id', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const dispatchId = req.params.id;
      const dispatch = await storage.getDispatch(dispatchId);
      
      if (!dispatch) {
        return res.status(404).json({ message: "Dispatch not found" });
      }

      // Check permissions (admin or dispatch owner)
      if (user.role !== 'admin' && dispatch.createdBy !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Soft delete the dispatch (this will deactivate LMS access)
      await storage.updateDispatch(dispatchId, {
        isDisabled: true,
        deletedAt: new Date()
      });

      console.log(`Dispatch ${dispatchId} disabled - LMS access deactivated`);
      res.json({ message: "Dispatch disabled successfully" });

    } catch (error) {
      console.error("Dispatch deletion error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to delete dispatch" 
      });
    }
  });

  // Export SCORM ZIP package with progress tracking
  app.get('/api/dispatches/:id/export', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dispatch = await storage.getDispatch(req.params.id);
      if (!dispatch) {
        return res.status(404).json({ message: "Dispatch not found" });
      }

      const course = await storage.getCourse(dispatch.courseId);
      if (!course) {
        return res.status(404).json({ message: "Associated course not found" });
      }

      // Enhanced domain detection for production deployment
      let publicDomain = process.env.PUBLIC_DOMAIN;
      
      if (!publicDomain) {
        if (process.env.REPLIT_DOMAINS) {
          const domains = process.env.REPLIT_DOMAINS.split(',');
          publicDomain = `https://${domains[0].trim()}`;
        } else {
          const hostHeader = req.get('host');
          const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
          publicDomain = `${protocol}://${hostHeader}`;
        }
      }

      console.log(`Exporting dispatch ${dispatch.id} with domain: ${publicDomain}`);

      // Load and inject launch URL into loader template
      const loaderTemplatePath = path.join(process.cwd(), 'server', 'templates', 'scorm-loader.html');
      let loaderContent: string;
      
      try {
        loaderContent = fs.readFileSync(loaderTemplatePath, 'utf8');
        loaderContent = loaderContent.replace(/__LAUNCH_URL__/g, `${publicDomain}/launch/${dispatch.launchToken}`);
      } catch (error) {
        console.error('Failed to load SCORM loader template:', error);
        return res.status(500).json({ message: 'Failed to load launcher template' });
      }

      // Generate SCORM 1.2 manifest
      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="dispatch_${dispatch.id}" version="1.0"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                              http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="default_org">
    <organization identifier="default_org">
      <title>${course.title}</title>
      <item identifier="launch_item" identifierref="launch_resource">
        <title>${course.title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="launch_resource" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>`;

      // Create dispatch metadata
      const dispatchMetadata = {
        dispatch: {
          id: dispatch.id,
          name: dispatch.name,
          courseTitle: course.title,
          launchUrl: `${publicDomain}/launch/${dispatch.launchToken}`,
          createdAt: dispatch.createdAt,
          expiresAt: dispatch.expiresAt
        },
        course: {
          id: course.id,
          title: course.title,
          scormType: course.scormType
        },
        exportedAt: new Date().toISOString(),
        platform: 'Sun-SCORM'
      };

      // Set response headers for ZIP download
      const fileName = `dispatch-${dispatch.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Pipe archive to response
      archive.pipe(res);

      // Add files to archive
      archive.append(loaderContent, { name: 'index.html' });
      archive.append(manifest, { name: 'imsmanifest.xml' });
      archive.append(JSON.stringify(dispatchMetadata, null, 2), { name: 'dispatch.json' });

      // Finalize the archive
      await archive.finalize();

      console.log(`SCORM package exported successfully: ${fileName}`);

    } catch (error) {
      console.error("Error exporting dispatch:", error);
      res.status(500).json({ message: "Failed to export dispatch" });
    }
  });

  // Get dispatch license information
  app.get('/api/dispatches/:id/license-info', isAuthenticated, async (req: any, res) => {
    try {
      const dispatch = await storage.getDispatch(req.params.id);
      if (!dispatch) {
        return res.status(404).json({ message: "Dispatch not found" });
      }

      const licenseInfo = await licenseEnforcement.getDispatchConstraints(dispatch.id);
      res.json(licenseInfo);

    } catch (error) {
      console.error("Error fetching license info:", error);
      res.status(500).json({ message: "Failed to fetch license information" });
    }
  });

  // Check dispatch access for user
  app.post('/api/dispatches/:id/check-access', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const { email } = req.body;
      const dispatchId = req.params.id;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const dispatch = await storage.getDispatch(dispatchId);
      if (!dispatch || dispatch.isDisabled) {
        return res.status(404).json({ message: "Dispatch not found or disabled" });
      }

      // Check if user has access
      const dispatchUsers = await storage.getDispatchUsers(dispatchId);
      const userAccess = dispatchUsers.find(u => u.email === email);

      if (!userAccess) {
        return res.status(403).json({ message: "User does not have access to this dispatch" });
      }

      // Check license constraints
      const canAccess = await licenseEnforcement.canAccessDispatch(dispatchId, email);
      
      res.json({
        hasAccess: canAccess.allowed,
        reason: canAccess.reason,
        launchToken: canAccess.allowed ? userAccess.launchToken : undefined,
        constraints: canAccess
      });

    } catch (error) {
      console.error("Error checking dispatch access:", error);
      res.status(500).json({ message: "Failed to check access" });
    }
  });

  // DEPRECATED: Launch file download (kept for backward compatibility)
  // TODO: Remove after Q2 2025
  app.get('/api/dispatches/:id/launch-file', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dispatch = await storage.getDispatch(req.params.id);
      if (!dispatch) {
        return res.status(404).json({ message: "Dispatch not found" });
      }

      const filePath = path.join(process.cwd(), 'uploads', 'launch_links', `dispatch-${req.params.id}.html`);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Launch file not found. Please use the ZIP export instead." });
      }

      res.download(filePath, `dispatch-${dispatch.name}-launch.html`, (err) => {
        if (err) {
          console.error("Error downloading launch file:", err);
          res.status(500).json({ message: "Failed to download launch file" });
        }
      });
    } catch (error) {
      console.error("Error accessing launch file:", error);
      res.status(500).json({ message: "Failed to access launch file" });
    }
  });
}