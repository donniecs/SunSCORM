import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertTenantSchema, insertCourseSchema, insertDispatchSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { licenseEnforcement } from "./licenseEnforcement";
import { validateSCORMPackage } from "./scormValidator";
import { moveToStorage, cleanupTempFile } from "./storageService";
import { csrfProtection, getCSRFToken } from "./csrfProtection";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import yauzl from "yauzl";
import { promisify } from "util";

const upload = multer({ 
  storage: multer.diskStorage({
    destination: '/tmp/',
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: { 
    fileSize: 512 * 1024 * 1024, // 512MB limit for large SCORM packages
    files: 1, // Only allow one file
    fieldSize: 10 * 1024 * 1024, // 10MB field size limit (increased for large uploads)
    fieldNameSize: 1000, // Increased field name size
    headerPairs: 2000 // Increased header pairs limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common SCORM package formats
    const allowedTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      'application/x-zip'
    ];
    
    const allowedExtensions = ['.zip', '.scorm'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only ZIP and SCORM files are allowed.'));
    }
  }
});

/**
 * Generate launch.html file for external LMS upload
 */
async function generateLaunchFile(dispatchId: string, launchToken: string): Promise<void> {
  // Enhanced domain detection with better fallbacks for production
  let publicDomain = process.env.PUBLIC_DOMAIN;
  
  if (!publicDomain) {
    // Try to construct from REPLIT_DOMAINS if available
    if (process.env.REPLIT_DOMAINS) {
      const domains = process.env.REPLIT_DOMAINS.split(',');
      publicDomain = `https://${domains[0].trim()}`;
    } else {
      // Final fallback - this should be set in production
      publicDomain = 'https://yourscormplatform.replit.app';
      console.warn('Warning: PUBLIC_DOMAIN not set, using fallback domain. This may cause SCORM launch issues in production.');
    }
  }
  
  console.log(`Generating launch file for dispatch ${dispatchId} with domain: ${publicDomain}`);
  
  const launchHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url=${publicDomain}/launch/${launchToken}" />
    <title>Loading Course...</title>
  </head>
  <body>
    <p>If you are not redirected, <a href="${publicDomain}/launch/${launchToken}">click here</a>.</p>
  </body>
</html>`;

  const launchLinksDir = path.join(process.cwd(), 'uploads', 'launch_links');
  
  // Ensure directory exists
  if (!fs.existsSync(launchLinksDir)) {
    fs.mkdirSync(launchLinksDir, { recursive: true });
  }
  
  const filePath = path.join(launchLinksDir, `dispatch-${dispatchId}.html`);
  fs.writeFileSync(filePath, launchHtml, 'utf8');
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint (no auth required)
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Auth middleware
  await setupAuth(app);

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

  // CSRF token endpoint (must be authenticated but before CSRF protection)
  app.get('/api/csrf-token', isAuthenticated, getCSRFToken);

  // Apply CSRF protection to all routes except GET requests and specific exclusions
  app.use(csrfProtection);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard analytics
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      const tenantId = user?.role === 'admin' ? undefined : user?.tenantId || undefined;
      const stats = await storage.getDashboardStats(tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get('/api/dashboard/recent-dispatches', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      const tenantId = user?.role === 'admin' ? undefined : user?.tenantId || undefined;
      const dispatches = await storage.getRecentDispatches(tenantId, 5);
      res.json(dispatches);
    } catch (error) {
      console.error("Error fetching recent dispatches:", error);
      res.status(500).json({ message: "Failed to fetch recent dispatches" });
    }
  });

  app.get('/api/dashboard/standards-distribution', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      const tenantId = user?.role === 'admin' ? undefined : user?.tenantId || undefined;
      const distribution = await storage.getStandardsDistribution(tenantId);
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching standards distribution:", error);
      res.status(500).json({ message: "Failed to fetch standards distribution" });
    }
  });

  // Global search endpoint
  app.get('/api/search', isAuthenticated, async (req: any, res) => {
    try {
      const { query, type } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Search query is required" });
      }

      const user = await storage.getUser(req.user.claims.sub);
      const tenantId = user?.role === 'admin' ? undefined : user?.tenantId || undefined;
      const results = await storage.globalSearch(query, type, tenantId);
      res.json(results);
    } catch (error) {
      console.error("Error performing search:", error);
      res.status(500).json({ message: "Failed to perform search" });
    }
  });



  // System health endpoint
  app.get('/api/system/health', isAuthenticated, async (req: any, res) => {
    try {
      const health = await storage.getSystemHealth();
      res.json(health);
    } catch (error) {
      console.error("Error fetching system health:", error);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  // Course routes
  app.get('/api/courses', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      const tenantId = user?.role === 'admin' ? undefined : user?.tenantId || undefined;
      const includeDeleted = req.query.includeDeleted === 'true';
      const courses = await storage.getCourses(tenantId, includeDeleted);
      res.json(courses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      res.status(500).json({ message: "Failed to fetch courses" });
    }
  });

  // Chunked upload endpoints for large files (500MB - 3GB)
  
  // Initialize chunked upload session
  app.post('/api/upload/initialize', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const { uploadId, fileName, fileSize, totalChunks, courseData } = req.body;
      
      console.log(`Initializing chunked upload: ${fileName} (${fileSize} bytes, ${totalChunks} chunks)`);
      
      // Create upload session directory
      const uploadDir = path.join(process.cwd(), 'uploads', 'chunks', uploadId);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Store upload metadata
      const metadata = {
        uploadId,
        fileName,
        fileSize,
        totalChunks,
        courseData,
        uploadedChunks: [],
        createdAt: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(uploadDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      res.json({ success: true, uploadId });
    } catch (error) {
      console.error('Failed to initialize chunked upload:', error);
      res.status(500).json({ message: 'Failed to initialize upload' });
    }
  });

  // Upload individual chunk
  app.post('/api/upload/chunk', isAuthenticated, csrfProtection, (req, res, next) => {
    // Use multer for individual chunks (15MB max to allow overhead)
    const chunkUpload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadId = (req as any).body.uploadId;
          const uploadDir = path.join(process.cwd(), 'uploads', 'chunks', uploadId);
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const chunkIndex = (req as any).body.chunkIndex;
          cb(null, `chunk_${chunkIndex.toString().padStart(6, '0')}`);
        }
      }),
      limits: { 
        fileSize: 15 * 1024 * 1024, // 15MB to allow some overhead
        files: 1
      }
    });

    chunkUpload.single('chunk')(req, res, (err) => {
      if (err) {
        console.error('Chunk upload error:', err);
        return res.status(400).json({ message: 'Chunk upload failed: ' + err.message });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks } = req.body;
      
      console.log(`Received chunk ${chunkIndex}/${totalChunks} for upload ${uploadId}`);
      
      // Update metadata with uploaded chunk
      const uploadDir = path.join(process.cwd(), 'uploads', 'chunks', uploadId);
      const metadataPath = path.join(uploadDir, 'metadata.json');
      
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        metadata.uploadedChunks.push(parseInt(chunkIndex));
        metadata.uploadedChunks.sort((a, b) => a - b);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      }
      
      res.json({ 
        success: true, 
        chunkIndex: parseInt(chunkIndex),
        received: true 
      });
    } catch (error) {
      console.error('Failed to process chunk:', error);
      res.status(500).json({ message: 'Failed to process chunk' });
    }
  });

  // Finalize chunked upload (reassemble and process)
  app.post('/api/upload/finalize', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const { uploadId } = req.body;
      const user = await storage.getUser(req.user.claims.sub);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      console.log(`Finalizing chunked upload: ${uploadId}`);
      
      const uploadDir = path.join(process.cwd(), 'uploads', 'chunks', uploadId);
      const metadataPath = path.join(uploadDir, 'metadata.json');
      
      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ message: 'Upload session not found' });
      }
      
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      
      // Verify all chunks are uploaded
      if (metadata.uploadedChunks.length !== metadata.totalChunks) {
        return res.status(400).json({ 
          message: `Missing chunks: ${metadata.uploadedChunks.length}/${metadata.totalChunks}` 
        });
      }
      
      // Reassemble file
      const finalFilePath = path.join(process.cwd(), 'uploads', 'courses', `${uploadId}.zip`);
      await reassembleChunks(uploadDir, finalFilePath, metadata.totalChunks);
      
      // Validate SCORM package
      const validation = await validateSCORMPackage({
        path: finalFilePath,
        originalname: metadata.fileName,
        mimetype: 'application/zip'
      } as any);
      
      if (!validation.isValid) {
        await fs.promises.unlink(finalFilePath).catch(() => {});
        return res.status(400).json({ 
          message: `Invalid SCORM package: ${validation.error}` 
        });
      }
      
      // Create course record
      const courseId = await storage.createCourse({
        title: metadata.courseData.title,
        description: metadata.courseData.description,
        version: metadata.courseData.version,
        tags: metadata.courseData.tags,
        scormType: validation.scormType || 'scorm_1_2',
        storagePath: finalFilePath,
        structure: validation.structure,
        ownerId: user.id
      });
      
      // Cleanup chunks
      await fs.promises.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
      
      console.log(`Chunked upload completed: Course ${courseId} created`);
      
      res.status(201).json({
        courseId,
        message: `Course "${metadata.courseData.title}" uploaded successfully`
      });
      
    } catch (error) {
      console.error('Failed to finalize chunked upload:', error);
      res.status(500).json({ message: 'Failed to finalize upload' });
    }
  });

  // Cleanup failed upload
  app.post('/api/upload/cleanup', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const { uploadId } = req.body;
      const uploadDir = path.join(process.cwd(), 'uploads', 'chunks', uploadId);
      
      if (fs.existsSync(uploadDir)) {
        await fs.promises.rm(uploadDir, { recursive: true, force: true });
        console.log(`Cleaned up failed upload: ${uploadId}`);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to cleanup upload:', error);
      res.status(500).json({ message: 'Failed to cleanup upload' });
    }
  });

  // Legacy single upload endpoint (for smaller files < 512MB)
  app.post('/api/courses/upload', isAuthenticated, csrfProtection, (req, res, next) => {
    const startTime = Date.now();
    console.log("Starting file upload...");

    upload.single('course')(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ 
            message: "File too large. Maximum size is 512MB.", 
            error: "PAYLOAD_TOO_LARGE",
            maxSize: "512MB",
            suggestion: "Try compressing your SCORM package or break it into smaller modules."
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: "Unexpected file field. Please use 'course' field name." });
        }
        if (err.code === 'LIMIT_FIELD_VALUE') {
          return res.status(400).json({ message: "Field value too large. Please check your form data." });
        }
        return res.status(400).json({ message: "File upload error: " + err.message });
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`Multer processing completed in ${processingTime}ms`);
      next();
    });
  }, async (req: any, res) => {
    const requestStartTime = Date.now();
    
    try {
      console.log("Processing upload request...");
      console.log("Request headers:", req.headers);
      console.log("Request body keys:", Object.keys(req.body));
      
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        console.log("User not found for ID:", req.user.claims.sub);
        return res.status(401).json({ message: "User not found" });
      }

      if (!req.file) {
        console.log("No file in request. Body:", req.body);
        console.log("Request files:", req.files);
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("File uploaded successfully:", {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        fieldname: req.file.fieldname,
        path: req.file.path,
        encoding: req.file.encoding
      });

      // Validate SCORM package before processing
      console.log("Validating SCORM package...");
      const validation = await validateSCORMPackage(req.file);
      
      if (!validation.isValid) {
        console.error("SCORM validation failed:", validation.error);
        // Clean up uploaded file
        await cleanupTempFile(req.file.path);
        return res.status(400).json({ 
          message: `Invalid SCORM package: ${validation.error}` 
        });
      }

      console.log("SCORM validation passed, moving to persistent storage...");
      
      // Move file to persistent storage
      let persistentPath: string;
      try {
        persistentPath = await moveToStorage(req.file.path, req.file.originalname);
      } catch (storageError) {
        console.error("Failed to move file to storage:", storageError);
        await cleanupTempFile(req.file.path);
        return res.status(500).json({ 
          message: "Failed to store course file. Please try again." 
        });
      }
      
      console.log("Creating course record...");
      
      // Process tags: split by comma, trim whitespace, normalize to lowercase
      let tags: string[] = [];
      if (req.body.tags && typeof req.body.tags === 'string') {
        tags = req.body.tags
          .split(',')
          .map((tag: string) => tag.trim().toLowerCase())
          .filter((tag: string) => tag.length > 0);
      }
      
      const courseData = {
        title: req.body.title || req.file.originalname.replace(/\.[^/.]+$/, ""),
        version: '1.0',
        description: req.body.description || '',
        ownerId: user.id,
        tenantId: user.tenantId || 'default',
        fileCount: 1,
        storagePath: persistentPath, // Use persistent storage path
        structure: { files: [], manifest: {} },
        scormType: validation.scormType || 'scorm_1_2',
        tags: tags,
      };

      console.log("Creating course record with data:", courseData);
      const course = await storage.createCourse(courseData);
      
      const totalTime = Date.now() - requestStartTime;
      console.log(`Course upload completed successfully in ${totalTime}ms`);
      
      res.status(201).json(course);
    } catch (error) {
      const totalTime = Date.now() - requestStartTime;
      console.error(`Error uploading course after ${totalTime}ms:`, error);
      
      if (error instanceof Error) {
        console.error("Error stack:", error.stack);
      }
      
      res.status(500).json({ message: "Failed to upload course" });
    }
  });

  // Check for course conflicts before upload
  app.get('/api/courses/check-conflicts', isAuthenticated, async (req: any, res) => {
    try {
      const { title } = req.query;
      
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ message: "Title is required" });
      }

      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Find active dispatches with similar course titles
      const conflicts = await storage.findDispatchConflictsByTitle(title, user.tenantId);
      
      res.json({ conflicts });
    } catch (error) {
      console.error("Error checking conflicts:", error);
      res.status(500).json({ message: "Failed to check conflicts" });
    }
  });

  // Get individual course
  app.get('/api/courses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const course = await storage.getCourse(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Only admin or course owner can view course details
      if (user.role !== 'admin' && course.ownerId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(course);
    } catch (error) {
      console.error("Error fetching course:", error);
      res.status(500).json({ message: "Failed to fetch course" });
    }
  });

  // Update course with optional file replacement
  app.put('/api/courses/:id', isAuthenticated, (req, res, next) => {
    // Check if this is a file upload request (multipart/form-data)
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      const startTime = Date.now();
      console.log("Starting course update with file upload...");

      upload.single('course')(req, res, (err) => {
        if (err) {
          console.error("Multer error during course update:", err);
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: "File too large. Maximum size is 500MB." });
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ message: "Unexpected file field. Please use 'course' field name." });
          }
          return res.status(400).json({ message: "File upload error: " + err.message });
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`Multer processing completed in ${processingTime}ms for course update`);
        next();
      });
    } else {
      // No file upload, proceed directly
      next();
    }
  }, async (req: any, res) => {
    const requestStartTime = Date.now();
    
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const existingCourse = await storage.getCourse(req.params.id);
      if (!existingCourse) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Only admin or course owner can edit
      if (user.role !== 'admin' && existingCourse.ownerId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      console.log("Processing course update request...");
      console.log("Has file:", !!req.file);
      console.log("Request body keys:", Object.keys(req.body));

      // Handle file replacement if provided
      let newStoragePath = existingCourse.storagePath;
      let scormType = existingCourse.scormType;
      let structure = existingCourse.structure;

      if (req.file) {
        console.log("Processing SCORM file replacement...");
        
        // Validate SCORM package
        const validation = await validateSCORMPackage(req.file);
        
        if (!validation.isValid) {
          console.error("SCORM validation failed:", validation.error);
          await cleanupTempFile(req.file.path);
          return res.status(400).json({ 
            message: `Invalid SCORM package: ${validation.error}` 
          });
        }

        console.log("SCORM validation passed, replacing file...");
        
        try {
          // Replace the existing file by using the same storage path structure
          const courseFileName = `course-${req.params.id}.zip`;
          newStoragePath = await moveToStorage(req.file.path, courseFileName, req.params.id);
          scormType = validation.scormType || existingCourse.scormType;
          structure = validation.structure || existingCourse.structure;
          
          console.log("File replacement completed, new path:", newStoragePath);
        } catch (storageError) {
          console.error("Failed to replace course file:", storageError);
          await cleanupTempFile(req.file.path);
          return res.status(500).json({ 
            message: "Failed to replace course file. Please try again." 
          });
        }
      }

      // Process tags: split by comma, trim whitespace, normalize to lowercase
      let tags: string[] = [];
      if (req.body.tags && typeof req.body.tags === 'string') {
        tags = req.body.tags
          .split(',')
          .map((tag: string) => tag.trim().toLowerCase())
          .filter((tag: string) => tag.length > 0);
      } else if (Array.isArray(req.body.tags)) {
        tags = req.body.tags
          .map((tag: string) => tag.trim().toLowerCase())
          .filter((tag: string) => tag.length > 0);
      }

      // Validate and prepare update data
      const updateData = {
        title: req.body.title || existingCourse.title,
        description: req.body.description !== undefined ? req.body.description : existingCourse.description,
        version: req.body.version || existingCourse.version,
        tags: tags.length > 0 ? tags : existingCourse.tags || [],
        storagePath: newStoragePath,
        scormType: scormType,
        structure: structure,
        updatedAt: new Date(),
      };

      // Validate required fields
      if (!updateData.title || !updateData.version) {
        return res.status(400).json({ message: "Title and version are required" });
      }

      console.log("Updating course record with data:", updateData);
      const updatedCourse = await storage.updateCourse(req.params.id, updateData);
      
      const totalTime = Date.now() - requestStartTime;
      console.log(`Course update completed successfully in ${totalTime}ms`);
      
      res.json(updatedCourse);
    } catch (error) {
      const totalTime = Date.now() - requestStartTime;
      console.error(`Error updating course after ${totalTime}ms:`, error);
      
      if (error instanceof Error) {
        console.error("Error stack:", error.stack);
      }
      
      res.status(500).json({ message: "Failed to update course" });
    }
  });

  // Soft delete course route
  app.delete('/api/courses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Only admin users can delete courses
      if (user.role !== 'admin') {
        return res.status(403).json({ message: "Only administrators can delete courses" });
      }

      const course = await storage.getCourse(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Check if course is already deleted
      if (course.isDisabled) {
        return res.status(400).json({ message: "Course is already deleted" });
      }

      // Check for active dispatches
      const { hasActiveDispatches, activeCount } = await storage.checkCourseActiveDispatches(req.params.id);
      
      if (hasActiveDispatches) {
        return res.status(400).json({ 
          message: `Cannot delete course. It has ${activeCount} active dispatch(s). Please disable all dispatches first.`,
          activeDispatches: activeCount
        });
      }

      // Perform soft delete
      const deletedCourse = await storage.softDeleteCourse(req.params.id);
      
      console.log(`Course ${course.title} soft deleted by admin ${user.email}`);
      res.json({ 
        message: "Course deleted successfully", 
        course: deletedCourse 
      });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({ message: "Failed to delete course" });
    }
  });

  // Dispatch routes
  app.get('/api/dispatches', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      // Allow filtering by tenantId and courseId query parameters for admin users
      const queryTenantId = req.query.tenantId as string;
      const queryCourseId = req.query.courseId as string;
      const includeDisabled = req.query.includeDisabled === 'true';
      let tenantId: string | undefined;
      
      if (user?.role === 'admin') {
        // Admin can specify tenantId or get all dispatches
        tenantId = queryTenantId || undefined;
      } else {
        // Non-admin users only see their own tenant's dispatches
        tenantId = user?.tenantId || undefined;
      }
      
      const dispatches = await storage.getDispatches(tenantId, includeDisabled, queryCourseId);
      res.json(dispatches);
    } catch (error) {
      console.error("Error fetching dispatches:", error);
      res.status(500).json({ message: "Failed to fetch dispatches" });
    }
  });

  app.post('/api/dispatches', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Only admin users can create dispatches for other tenants
      if (user.role !== 'admin' && req.body.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "Insufficient permissions to create dispatch for this company" });
      }

      console.log("Creating dispatch with data:", req.body);

      const validatedData = insertDispatchSchema.parse({
        ...req.body,
        tenantId: req.body.tenantId || user.tenantId || 'default',
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      });

      console.log("Validated dispatch data:", validatedData);

      // Validate license constraints
      const constraintValidation = await licenseEnforcement.validateDispatchConstraints(
        validatedData.tenantId,
        {
          maxUsers: validatedData.maxUsers,
          maxCompletions: validatedData.maxCompletions,
          expiresAt: validatedData.expiresAt
        }
      );

      if (!constraintValidation.valid) {
        return res.status(400).json({ message: constraintValidation.message });
      }
      
      // Check for existing ACTIVE dispatch to prevent duplicates (exclude disabled dispatches)
      const duplicateDispatch = await storage.findActiveDispatch(validatedData.courseId, validatedData.tenantId);
      
      if (duplicateDispatch) {
        return res.status(409).json({ 
          message: `Course "${duplicateDispatch.name}" is already assigned to this company. You can only assign a course once. If you want to assign it again, please disable the previous dispatch first.`,
          existingDispatch: duplicateDispatch
        });
      }

      const dispatch = await storage.createDispatch(validatedData);
      console.log("Dispatch created successfully:", dispatch);
      
      // Create a default dispatch user for the admin who created it
      // This ensures there's always at least one valid token for the dispatch
      try {
        await storage.createDispatchUser({
          dispatchId: dispatch.id,
          email: user.email || 'admin@dispatch',
          launchToken: dispatch.launchToken
        });
        console.log(`Default dispatch user created for dispatch ${dispatch.id}`);
      } catch (userError) {
        console.error("Failed to create default dispatch user:", userError);
        // Don't fail the dispatch creation if user creation fails
      }
      
      // Generate launch.html file for external LMS upload
      try {
        await generateLaunchFile(dispatch.id, dispatch.launchToken);
        console.log(`Launch file generated for dispatch ${dispatch.id}`);
      } catch (fileError) {
        console.error("Failed to generate launch file:", fileError);
        // Don't fail the dispatch creation if launch file generation fails
      }
      
      res.status(201).json(dispatch);
    } catch (error) {
      console.error("Error creating dispatch:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          message: "Invalid dispatch data", 
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
      
      // Handle database constraint errors
      if (error instanceof Error && error.message.includes('duplicate') || error.message.includes('unique')) {
        return res.status(409).json({ message: "Dispatch already exists for this course and company" });
      }
      
      res.status(500).json({ message: "Failed to create dispatch" });
    }
  });

  // Launch file download endpoint (deprecated - kept for backwards compatibility)
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
        return res.status(404).json({ message: "Launch file not found" });
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

  // Test SCORM loader template endpoint (for development/testing)
  app.get('/api/test/scorm-loader', async (req: any, res) => {
    try {
      const loaderTemplatePath = path.join(process.cwd(), 'server', 'templates', 'scorm-loader.html');
      const loaderTemplate = fs.readFileSync(loaderTemplatePath, 'utf8');
      
      // Test with a sample launch URL
      const testLaunchUrl = `${req.protocol}://${req.get('host')}/launch/test-token-123`;
      const testLoader = loaderTemplate.replace(/__LAUNCH_URL__/g, testLaunchUrl);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(testLoader);
    } catch (error) {
      console.error('Error loading test SCORM loader:', error);
      res.status(500).json({ message: 'Failed to load test loader' });
    }
  });

  // SCORM ZIP export endpoint
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

      // Get course and tenant information
      const course = await storage.getCourse(dispatch.courseId);
      const tenant = await storage.getTenant(dispatch.tenantId);
      
      if (!course || !tenant) {
        return res.status(404).json({ message: "Course or tenant not found" });
      }

      // Generate SCORM ZIP - get the correct domain for deployed version
      // Priority: 1. PUBLIC_DOMAIN env var (for custom domains)
      //           2. REPLIT_DOMAINS (for deployed Replit apps)
      //           3. Constructed from HOST header (fallback)
      let publicDomain = process.env.PUBLIC_DOMAIN;
      
      if (!publicDomain) {
        const replitDomains = process.env.REPLIT_DOMAINS;
        if (replitDomains) {
          // REPLIT_DOMAINS can be comma-separated, use the first one
          const domains = replitDomains.split(',').map(d => d.trim());
          publicDomain = `https://${domains[0]}`;
        } else {
          // Fallback: construct from request host (removes preview-specific parts)
          const host = req.get('host') || 'localhost:5000';
          const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
          publicDomain = isLocalhost ? `http://${host}` : `https://${host}`;
        }
      }
      
      console.log('Using public domain for SCORM ZIP:', publicDomain);
      console.log('Environment debug - REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS);
      console.log('Environment debug - PUBLIC_DOMAIN:', process.env.PUBLIC_DOMAIN);
      console.log('Environment debug - HOST header:', req.get('host'));
      
      // Create SCORM manifest (minimal SCORM 1.2)
      const imsmanifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="com.scorm.dispatch.${dispatch.id}" version="1.0"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                              http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                              http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="dispatch_org">
    <organization identifier="dispatch_org">
      <title>${course.title} - ${dispatch.name}</title>
      <item identifier="item_1" identifierref="resource_1">
        <title>${course.title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="resource_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>`;

      // Ensure we have a valid dispatch user token for export
      let validLaunchToken = dispatch.launchToken;
      
      // Check if dispatch users exist, if not create one for export
      const dispatchUsers = await storage.getDispatchUsers(dispatch.id);
      if (dispatchUsers.length === 0) {
        console.log('No dispatch users found, creating one for export');
        const newDispatchUser = await storage.createDispatchUser({
          dispatchId: dispatch.id,
          email: user.email || 'admin@export',
          launchToken: dispatch.launchToken // Use the dispatch's token
        });
        validLaunchToken = newDispatchUser.launchToken;
      } else {
        // Use the first dispatch user's token
        validLaunchToken = dispatchUsers[0].launchToken;
      }
      
      console.log('Using launch token for export:', validLaunchToken);
      
      // Load SCORM loader template and inject launch URL
      const loaderTemplatePath = path.join(process.cwd(), 'server', 'templates', 'scorm-loader.html');
      let indexHtml;
      
      try {
        const loaderTemplate = fs.readFileSync(loaderTemplatePath, 'utf8');
        const launchUrl = `${publicDomain}/launch/${validLaunchToken}`;
        // Replace placeholder with actual launch URL
        indexHtml = loaderTemplate.replace(/__LAUNCH_URL__/g, launchUrl);
      } catch (templateError) {
        console.error('Failed to load SCORM loader template, using fallback:', templateError);
        // Fallback to simple redirect if template fails
        indexHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Loading Course...</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .loading-container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #3498db;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loading-container">
    <div class="spinner"></div>
    <h2>Loading Course...</h2>
    <p>You will be redirected shortly.</p>
    <noscript>
      <p style="color: red;">This course requires JavaScript to be enabled.</p>
      <p>Please enable JavaScript and refresh the page.</p>
    </noscript>
  </div>
  <script>
    // Redirect to the dispatch launch URL
    window.location.href = "${publicDomain}/launch/${dispatch.launchToken}";
  </script>
</body>
</html>`;
      }

      // Create dispatch metadata (optional)
      const dispatchMetadata = {
        dispatchId: dispatch.id,
        dispatchName: dispatch.name,
        courseId: course.id,
        courseTitle: course.title,
        tenantId: tenant.id,
        tenantName: tenant.name,
        launchToken: validLaunchToken,
        maxUsers: dispatch.maxUsers,
        maxCompletions: dispatch.maxCompletions,
        expiresAt: dispatch.expiresAt,
        isDisabled: dispatch.isDisabled,
        createdAt: dispatch.createdAt,
        launchUrl: `${publicDomain}/launch/${validLaunchToken}`
      };

      // Set response headers for ZIP download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="dispatch-${dispatch.name.replace(/[^a-z0-9]/gi, '_')}.zip"`);

      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Handle archive errors
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        res.status(500).json({ message: 'Failed to create dispatch archive' });
      });

      // Pipe archive data to response
      archive.pipe(res);

      // Add files to ZIP
      archive.append(imsmanifest, { name: 'imsmanifest.xml' });
      archive.append(indexHtml, { name: 'index.html' });
      archive.append(JSON.stringify(dispatchMetadata, null, 2), { name: 'dispatch.json' });

      // Finalize the archive
      await archive.finalize();

    } catch (error) {
      console.error("Error exporting dispatch:", error);
      res.status(500).json({ message: "Failed to export dispatch" });
    }
  });

  // License enforcement endpoints
  app.get('/api/dispatches/:id/license-info', isAuthenticated, async (req: any, res) => {
    try {
      const licenseInfo = await licenseEnforcement.getDispatchLicenseInfo(req.params.id);
      res.json(licenseInfo);
    } catch (error) {
      console.error("Error fetching license info:", error);
      res.status(500).json({ message: "Failed to fetch license information" });
    }
  });

  app.post('/api/dispatches/:id/check-access', isAuthenticated, async (req: any, res) => {
    try {
      const { userEmail } = req.body;
      if (!userEmail) {
        return res.status(400).json({ message: "User email is required" });
      }
      
      const accessResult = await licenseEnforcement.canAccessDispatch(req.params.id, userEmail);
      res.json(accessResult);
    } catch (error) {
      console.error("Error checking access:", error);
      res.status(500).json({ message: "Failed to check access" });
    }
  });

  // Soft delete dispatch endpoint
  app.delete('/api/dispatches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the dispatch to check permissions
      const dispatch = await storage.getDispatch(req.params.id);
      if (!dispatch) {
        return res.status(404).json({ message: "Dispatch not found" });
      }

      // Only admin users can delete dispatches for other tenants
      if (user.role !== 'admin' && dispatch.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "Insufficient permissions to disable this dispatch" });
      }

      // Check if already disabled
      if (dispatch.isDisabled) {
        return res.status(400).json({ message: "Dispatch is already disabled" });
      }

      const updatedDispatch = await storage.softDeleteDispatch(req.params.id);
      res.json(updatedDispatch);
    } catch (error) {
      console.error("Error disabling dispatch:", error);
      res.status(500).json({ message: "Failed to disable dispatch" });
    }
  });

  // Tenant routes
  app.get('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const tenants = await storage.getTenants();
      res.json(tenants);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  app.post('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = insertTenantSchema.parse(req.body);
      const tenant = await storage.createTenant(validatedData);
      res.status(201).json(tenant);
    } catch (error) {
      console.error("Error creating tenant:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  app.get('/api/tenants/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenant = await storage.getTenant(req.params.id);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(tenant);
    } catch (error) {
      console.error("Error fetching tenant:", error);
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  app.put('/api/tenants/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = insertTenantSchema.partial().parse(req.body);
      const tenant = await storage.updateTenant(req.params.id, validatedData);
      res.json(tenant);
    } catch (error) {
      console.error("Error updating tenant:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update tenant" });
    }
  });



  // xAPI routes
  app.post('/api/xapi/statements', isAuthenticated, async (req: any, res) => {
    try {
      // Validate dispatch exists and is active
      if (req.body.token) {
        const dispatchUser = await storage.getDispatchUserByToken(req.body.token);
        if (!dispatchUser) {
          return res.status(403).json({ message: 'Invalid or inactive dispatch.' });
        }
        
        const dispatch = await storage.getDispatch(dispatchUser.dispatchId);
        if (!dispatch || dispatch.isDisabled) {
          return res.status(403).json({ message: 'Invalid or inactive dispatch.' });
        }
      }

      // TODO: Implement xAPI statement validation and processing
      const statement = await storage.createXapiStatement(req.body);
      res.status(201).json(statement);
    } catch (error) {
      console.error("Error creating xAPI statement:", error);
      res.status(500).json({ message: "Failed to create xAPI statement" });
    }
  });

  // Course preview route - serves SCORM content directly from ZIP without dispatch system
  app.get('/api/preview/:courseId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const course = await storage.getCourse(req.params.courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Check if user has access to this course (admin or owner)
      if (user.role !== 'admin' && course.ownerId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Generate SCORM preview HTML
      const previewHtml = await generateSCORMPreview(course);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(previewHtml);
    } catch (error) {
      console.error("Error serving course preview:", error);
      res.status(500).json({ message: "Failed to load course preview" });
    }
  });

  // Course preview assets route - serves individual files from ZIP
  app.get('/api/preview/:courseId/assets/*', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const course = await storage.getCourse(req.params.courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Check if user has access to this course
      if (user.role !== 'admin' && course.ownerId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const assetPath = req.params[0]; // Get the wildcard path
      console.log(`Serving asset: ${assetPath} for course ${course.id}`);

      // Extract and serve the specific file from ZIP
      const fileContent = await extractFileFromZip(course.storagePath, assetPath);
      
      // Determine content type
      const contentType = getContentType(assetPath);
      res.setHeader('Content-Type', contentType);
      res.send(fileContent);
    } catch (error) {
      console.error("Error serving course asset:", error);
      res.status(404).json({ message: "Asset not found" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

/**
 * Reassemble uploaded chunks into final file
 */
async function reassembleChunks(uploadDir: string, finalFilePath: string, totalChunks: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(finalFilePath);
    let currentChunk = 0;

    function writeNextChunk() {
      if (currentChunk >= totalChunks) {
        writeStream.end();
        resolve();
        return;
      }

      const chunkPath = path.join(uploadDir, `chunk_${currentChunk.toString().padStart(6, '0')}`);
      
      if (!fs.existsSync(chunkPath)) {
        reject(new Error(`Missing chunk ${currentChunk}`));
        return;
      }

      const readStream = fs.createReadStream(chunkPath);
      
      readStream.on('data', (chunk) => {
        writeStream.write(chunk);
      });

      readStream.on('end', () => {
        currentChunk++;
        writeNextChunk();
      });

      readStream.on('error', (error) => {
        reject(error);
      });
    }

    writeStream.on('error', (error) => {
      reject(error);
    });

    writeNextChunk();
  });
}

/**
 * Generate error page HTML for launch failures
 */
function generateErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            color: #ffffff;
        }
        .error-container {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            max-width: 500px;
            width: 90%;
        }
        h1 {
            color: #ff6b6b;
            margin-bottom: 20px;
            font-size: 24px;
        }
        p {
            margin: 15px 0;
            font-size: 16px;
            opacity: 0.9;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>${title}</h1>
        <p>${message}</p>
        <p><small>If you believe this is an error, please contact your course administrator.</small></p>
    </div>
</body>
</html>`;
}

/**
 * Generate SCORM launch HTML with real tracking capabilities
 */
async function generateSCORMLaunch(course: any, dispatch: any, dispatchUser: any, token: string): Promise<string> {
  try {
    console.log(`Generating SCORM launch for course: ${course.id}`);
    
    // Extract the main entry point from the ZIP
    const entryPoint = await findSCORMEntryPoint(course.storagePath);
    console.log(`Found SCORM entry point: ${entryPoint}`);
    
    // Generate launch HTML with SCORM runtime and tracking
    const launchHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${course.title} - SCORM Course</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
        }
        .course-header {
            background: #fff;
            border-bottom: 1px solid #e5e5e5;
            padding: 12px 20px;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .course-content {
            margin-top: 60px;
            height: calc(100vh - 60px);
        }
        .scorm-frame {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        }
        .course-badge {
            background: #10b981;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            float: right;
        }
        h1 {
            margin: 0;
            font-size: 18px;
            color: #1f2937;
        }
    </style>
</head>
<body>
    <div class="course-header">
        <h1>${course.title}</h1>
        <span class="course-badge">LIVE COURSE</span>
    </div>
    <div class="course-content">
        <iframe 
            class="scorm-frame" 
            src="/launch/${token}/assets/${entryPoint}"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-top-navigation"
            title="SCORM Course Content">
        </iframe>
    </div>
    
    <script>
        // Full SCORM 1.2 API implementation with real tracking
        window.API = {
            LMSInitialize: function(param) {
                console.log('SCORM API: LMSInitialize called');
                // Send initialization to server
                fetch('/api/xapi/statements', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        actor: {email: '${dispatchUser.email}'},
                        verb: {id: 'http://adlnet.gov/expapi/verbs/launched'},
                        object: {
                            id: '${course.id}',
                            definition: {name: {'en-US': '${course.title}'}}
                        },
                        context: {
                            instructor: {name: 'SCORM Platform'},
                            platform: 'Sun-SCORM',
                            extensions: {
                                'dispatch_id': '${dispatch.id}',
                                'launch_token': '${token}'
                            }
                        }
                    })
                }).catch(e => console.error('xAPI tracking error:', e));
                return "true";
            },
            LMSFinish: function(param) {
                console.log('SCORM API: LMSFinish called');
                // Send completion to server
                fetch('/api/xapi/statements', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        actor: {email: '${dispatchUser.email}'},
                        verb: {id: 'http://adlnet.gov/expapi/verbs/completed'},
                        object: {
                            id: '${course.id}',
                            definition: {name: {'en-US': '${course.title}'}}
                        },
                        context: {
                            instructor: {name: 'SCORM Platform'},
                            platform: 'Sun-SCORM',
                            extensions: {
                                'dispatch_id': '${dispatch.id}',
                                'launch_token': '${token}'
                            }
                        }
                    })
                }).catch(e => console.error('xAPI tracking error:', e));
                return "true";
            },
            LMSGetValue: function(element) {
                console.log('SCORM API: LMSGetValue called for:', element);
                // Return real learner data
                switch(element) {
                    case 'cmi.core.student_id': return '${dispatchUser.id}';
                    case 'cmi.core.student_name': return '${dispatchUser.email}';
                    case 'cmi.core.lesson_location': return localStorage.getItem('scorm_location_${course.id}') || '';
                    case 'cmi.core.lesson_status': return localStorage.getItem('scorm_status_${course.id}') || 'not attempted';
                    case 'cmi.core.score.raw': return localStorage.getItem('scorm_score_${course.id}') || '';
                    case 'cmi.core.session_time': return '00:00:00';
                    default: return '';
                }
            },
            LMSSetValue: function(element, value) {
                console.log('SCORM API: LMSSetValue called for:', element, 'with value:', value);
                // Store progress locally and send to server
                switch(element) {
                    case 'cmi.core.lesson_location':
                        localStorage.setItem('scorm_location_${course.id}', value);
                        break;
                    case 'cmi.core.lesson_status':
                        localStorage.setItem('scorm_status_${course.id}', value);
                        // Send progress update
                        fetch('/api/xapi/statements', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                actor: {email: '${dispatchUser.email}'},
                                verb: {id: 'http://adlnet.gov/expapi/verbs/progressed'},
                                object: {
                                    id: '${course.id}',
                                    definition: {name: {'en-US': '${course.title}'}}
                                },
                                result: {completion: value === 'completed'},
                                context: {
                                    instructor: {name: 'SCORM Platform'},
                                    platform: 'Sun-SCORM',
                                    extensions: {
                                        'dispatch_id': '${dispatch.id}',
                                        'lesson_status': value
                                    }
                                }
                            })
                        }).catch(e => console.error('xAPI tracking error:', e));
                        break;
                    case 'cmi.core.score.raw':
                        localStorage.setItem('scorm_score_${course.id}', value);
                        break;
                }
                return "true";
            },
            LMSCommit: function(param) {
                console.log('SCORM API: LMSCommit called');
                return "true";
            },
            LMSGetLastError: function() {
                return "0";
            },
            LMSGetErrorString: function(errorCode) {
                return "No error";
            },
            LMSGetDiagnostic: function(errorCode) {
                return "No diagnostics available";
            }
        };
        
        // Make API available to iframe
        window.parent.API = window.API;
        
        console.log('SCORM Launch initialized for course: ${course.title}');
        console.log('Dispatch: ${dispatch.name}');
        console.log('User: ${dispatchUser.email}');
    </script>
</body>
</html>`;
    
    return launchHtml;
  } catch (error) {
    console.error("Error generating SCORM launch:", error);
    throw error;
  }
}

/**
 * Generate SCORM preview HTML that loads the course content in an iframe-friendly way
 */
async function generateSCORMPreview(course: any): Promise<string> {
  try {
    console.log(`Generating SCORM preview for course: ${course.id}`);
    
    // Extract the main entry point from the ZIP
    const entryPoint = await findSCORMEntryPoint(course.storagePath);
    console.log(`Found SCORM entry point: ${entryPoint}`);
    
    // Generate preview HTML with SCORM runtime
    const previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${course.title} - Preview</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
        }
        .preview-header {
            background: #fff;
            border-bottom: 1px solid #e5e5e5;
            padding: 12px 20px;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .preview-content {
            margin-top: 60px;
            height: calc(100vh - 60px);
        }
        .scorm-frame {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        }
        .preview-badge {
            background: #3b82f6;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            float: right;
        }
        h1 {
            margin: 0;
            font-size: 18px;
            color: #1f2937;
        }
    </style>
</head>
<body>
    <div class="preview-header">
        <h1>${course.title}</h1>
        <span class="preview-badge">PREVIEW MODE</span>
    </div>
    <div class="preview-content">
        <iframe 
            class="scorm-frame" 
            src="/api/preview/${course.id}/assets/${entryPoint}"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
            title="SCORM Course Content">
        </iframe>
    </div>
    
    <script>
        // Basic SCORM API simulation for preview mode
        window.API = {
            LMSInitialize: function(param) {
                console.log('SCORM API: LMSInitialize called (Preview Mode)');
                return "true";
            },
            LMSFinish: function(param) {
                console.log('SCORM API: LMSFinish called (Preview Mode)');
                return "true";
            },
            LMSGetValue: function(element) {
                console.log('SCORM API: LMSGetValue called for:', element);
                // Return appropriate defaults for preview
                switch(element) {
                    case 'cmi.core.student_id': return 'preview_user';
                    case 'cmi.core.student_name': return 'Preview User';
                    case 'cmi.core.lesson_location': return '';
                    case 'cmi.core.lesson_status': return 'not attempted';
                    case 'cmi.core.score.raw': return '';
                    case 'cmi.core.session_time': return '';
                    default: return '';
                }
            },
            LMSSetValue: function(element, value) {
                console.log('SCORM API: LMSSetValue called for:', element, 'with value:', value);
                return "true";
            },
            LMSCommit: function(param) {
                console.log('SCORM API: LMSCommit called (Preview Mode)');
                return "true";
            },
            LMSGetLastError: function() {
                return "0";
            },
            LMSGetErrorString: function(errorCode) {
                return "No error";
            },
            LMSGetDiagnostic: function(errorCode) {
                return "Preview mode - no diagnostics available";
            }
        };
        
        // Make API available to iframe
        window.parent.API = window.API;
        
        console.log('SCORM Preview Mode initialized for course: ${course.title}');
    </script>
</body>
</html>`;
    
    return previewHtml;
  } catch (error) {
    console.error("Error generating SCORM preview:", error);
    throw error;
  }
}

/**
 * Find the main entry point (index.html or similar) in a SCORM package
 */
async function findSCORMEntryPoint(zipPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error("Error opening ZIP file:", err);
        return reject(err);
      }
      
      const entries: string[] = [];
      
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (!entry.fileName.endsWith('/')) {
          entries.push(entry.fileName);
        }
        zipfile.readEntry();
      });
      
      zipfile.on("end", () => {
        // Look for common SCORM entry points in order of preference
        const entryPoints = [
          'index.html',
          'index.htm',
          'default.html',
          'default.htm',
          'story.html',
          'presentation.html',
          'course.html'
        ];
        
        // First, try to find exact matches
        for (const entryPoint of entryPoints) {
          if (entries.includes(entryPoint)) {
            return resolve(entryPoint);
          }
        }
        
        // Then try case-insensitive matches
        for (const entryPoint of entryPoints) {
          const found = entries.find(e => e.toLowerCase() === entryPoint.toLowerCase());
          if (found) {
            return resolve(found);
          }
        }
        
        // Finally, look for any HTML file in the root
        const htmlFiles = entries.filter(e => 
          e.endsWith('.html') || e.endsWith('.htm')
        ).filter(e => !e.includes('/')); // Root level only
        
        if (htmlFiles.length > 0) {
          return resolve(htmlFiles[0]);
        }
        
        reject(new Error("No suitable entry point found in SCORM package"));
      });
      
      zipfile.on("error", reject);
    });
  });
}

/**
 * Extract a specific file from a ZIP archive
 */
async function extractFileFromZip(zipPath: string, filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error("Error opening ZIP file:", err);
        return reject(err);
      }
      
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (entry.fileName === filePath) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              console.error("Error opening read stream:", err);
              return reject(err);
            }
            
            const chunks: Buffer[] = [];
            readStream.on("data", (chunk) => {
              chunks.push(chunk);
            });
            
            readStream.on("end", () => {
              const buffer = Buffer.concat(chunks);
              resolve(buffer);
            });
            
            readStream.on("error", reject);
          });
          return;
        }
        zipfile.readEntry();
      });
      
      zipfile.on("end", () => {
        reject(new Error(`File not found: ${filePath}`));
      });
      
      zipfile.on("error", reject);
    });
  });
}

/**
 * Determine content type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const contentTypes: { [key: string]: string } = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.xml': 'text/xml',
    '.txt': 'text/plain'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Handle SCORM course launch with license enforcement
 * @param token - Launch token from URL
 * @param req - Express request object
 * @param res - Express response object
 */
/**
 * Handle SCORM launch request - serves actual SCORM content
 */
async function handleSCORMLaunch(token: string, req: any, res: any): Promise<void> {
  try {
    // STEP 1: Token Lookup and validation
    console.log(`Launch request for token: ${token}`);
    
    const dispatchUser = await storage.getDispatchUserByToken(token);
    if (!dispatchUser) {
      console.log("Token not found in dispatch users");
      return res.status(404).send(generateErrorPage("Invalid Launch Token", "The launch link you used is not valid or has expired."));
    }

    // Get the associated dispatch
    const dispatch = await storage.getDispatch(dispatchUser.dispatchId);
    if (!dispatch) {
      console.log("Associated dispatch not found");
      return res.status(404).send(generateErrorPage("Invalid Dispatch", "The course dispatch could not be found."));
    }

    // STEP 1.5: Check if dispatch is disabled
    if (dispatch.isDisabled) {
      console.log("Dispatch is disabled");
      return res.status(403).send(generateErrorPage("Course Unavailable", "This course is no longer available."));
    }

    // STEP 2: Expiration Check
    if (dispatch.expiresAt && dispatch.expiresAt < new Date()) {
      console.log("Dispatch has expired");
      return res.status(403).send(generateErrorPage("Course Expired", "This course has expired and is no longer accessible."));
    }

    // STEP 3: Max User Check
    if (dispatch.maxUsers) {
      const existingUsers = await storage.getDispatchUsers(dispatch.id);
      const uniqueUserCount = new Set(existingUsers.map(u => u.email).filter(Boolean)).size;
      
      if (uniqueUserCount >= dispatch.maxUsers) {
        console.log("Max users reached for dispatch");
        return res.status(403).send(generateErrorPage("Maximum Users Reached", "This course has reached its maximum number of users."));
      }
    }

    // STEP 4: Update launch tracking
    if (!dispatchUser.launchedAt) {
      await storage.updateDispatchUser(dispatchUser.id, {
        launchedAt: new Date(),
        lastAccessedAt: new Date()
      });
      console.log("User launch tracked successfully");
    } else {
      await storage.updateDispatchUser(dispatchUser.id, {
        lastAccessedAt: new Date()
      });
      console.log("User access time updated");
    }

    // Get course for launch
    const course = await storage.getCourse(dispatch.courseId);
    if (!course) {
      console.log("Associated course not found");
      return res.status(404).send(generateErrorPage("Course Not Found", "The course content could not be found."));
    }

    // STEP 5: Generate and serve SCORM launch page
    console.log("Generating SCORM launch page for course:", course.title);
    const launchHtml = await generateSCORMLaunch(course, dispatch, dispatchUser, token);
    res.setHeader('Content-Type', 'text/html');
    res.send(launchHtml);

  } catch (error) {
    console.error("Error in handleSCORMLaunch:", error);
    throw error;
  }
}

/**
 * Handle SCORM launch assets - serves individual files from course ZIP
 */
async function handleLaunchAssets(token: string, assetPath: string, req: any, res: any): Promise<void> {
  try {
    console.log(`Launch asset request - Token: ${token}, Asset: ${assetPath}`);
    
    // Validate token and get course
    const dispatchUser = await storage.getDispatchUserByToken(token);
    if (!dispatchUser) {
      return res.status(404).send("Invalid token");
    }

    const dispatch = await storage.getDispatch(dispatchUser.dispatchId);
    if (!dispatch || dispatch.isDisabled) {
      return res.status(403).send("Course unavailable");
    }

    const course = await storage.getCourse(dispatch.courseId);
    if (!course) {
      return res.status(404).send("Course not found");
    }

    // Extract and serve the specific file from ZIP
    const fileContent = await extractFileFromZip(course.storagePath, assetPath);
    
    // Determine content type
    const contentType = getContentType(assetPath);
    res.setHeader('Content-Type', contentType);
    res.send(fileContent);
  } catch (error) {
    console.error("Error serving launch asset:", error);
    res.status(404).send("Asset not found");
  }
}
