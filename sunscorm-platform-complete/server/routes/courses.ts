import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { insertCourseSchema } from "@shared/schema";
import { z } from "zod";
import { validateSCORMPackage } from "../scormValidator";
import { moveToStorage, cleanupTempFile } from "../storageService";
import { csrfProtection } from "../csrfProtection";
import multer from "multer";
import { findSCORMEntryPoint, generateSCORMLaunchHTML, getSCORMManifest } from "../services/scormService";
// Removed client-side import - not needed in server routes

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
    files: 1,
    fieldSize: 10 * 1024 * 1024,
    fieldNameSize: 1000,
    headerPairs: 2000
  },
  fileFilter: (req, file, cb) => {
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
 * Course Management Routes
 * Handles SCORM course upload, editing, deletion, and preview
 */

export function registerCourseRoutes(app: Express): void {
  
  // List courses (with soft delete filtering)
  app.get('/api/courses', isAuthenticated, async (req: any, res) => {
    try {
      const includeDeleted = req.query.includeDeleted === 'true';
      const user = await storage.getUser(req.user.claims.sub);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let courses;
      if (user.role === 'admin') {
        courses = await storage.getCourses(includeDeleted);
      } else {
        courses = await storage.getCoursesByUser(req.user.claims.sub, includeDeleted);
      }

      res.json(courses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      res.status(500).json({ message: "Failed to fetch courses" });
    }
  });

  // Get specific course
  app.get('/api/courses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check ownership or admin access
      if (course.createdBy !== req.user.claims.sub && user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(course);
    } catch (error) {
      console.error("Error fetching course:", error);
      res.status(500).json({ message: "Failed to fetch course" });
    }
  });

  // Upload SCORM course
  app.post('/api/courses/upload', isAuthenticated, csrfProtection, upload.single('course'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log(`Processing course upload: ${req.file.originalname}`);

      // Validate SCORM package (enhanced with manifest parsing)
      const validation = await validateSCORMPackage(req.file);
      if (!validation.isValid) {
        await cleanupTempFile(req.file.path);
        return res.status(400).json({ message: validation.error });
      }

      // Get enhanced SCORM information using new service
      let scormManifest;
      try {
        scormManifest = await getSCORMManifest(req.file.path);
      } catch (error) {
        console.warn('Failed to parse SCORM manifest, using defaults:', error);
      }

      // Move file to persistent storage
      const storagePath = await moveToStorage(req.file, 'courses');

      // Parse tags
      const tags = req.body.tags ? 
        req.body.tags.split(',').map((tag: string) => tag.trim().toLowerCase()).filter(Boolean) : 
        [];

      // Create course record with enhanced metadata
      const courseData = {
        title: req.body.title || scormManifest?.title || req.file.originalname,
        description: req.body.description || scormManifest?.description || '',
        version: req.body.version || '1.0',
        scormType: scormManifest?.version || validation.scormType || 'scorm_1_2',
        tags,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        storagePath,
        createdBy: req.user.claims.sub,
        isDisabled: false
      };

      const course = await storage.createCourse(courseData);

      // Cleanup temp file
      await cleanupTempFile(req.file.path);

      console.log(`Course uploaded successfully: ${course.id}`);
      res.json(course);

    } catch (error) {
      console.error("Course upload error:", error);
      
      // Cleanup on error
      if (req.file?.path) {
        await cleanupTempFile(req.file.path);
      }

      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to upload course" 
      });
    }
  });

  // Update course (with optional file replacement)
  app.put('/api/courses/:id', isAuthenticated, csrfProtection, upload.single('course'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const courseId = req.params.id;
      const existingCourse = await storage.getCourse(courseId);
      
      if (!existingCourse) {
        return res.status(404).json({ message: "Course not found" });
      }

      let updateData: any = {
        title: req.body.title || existingCourse.title,
        description: req.body.description || existingCourse.description,
        version: req.body.version || existingCourse.version,
      };

      // Parse tags if provided
      if (req.body.tags) {
        updateData.tags = req.body.tags.split(',').map((tag: string) => tag.trim().toLowerCase()).filter(Boolean);
      }

      // Handle file replacement if new file uploaded
      if (req.file) {
        console.log(`Replacing SCORM file for course ${courseId}: ${req.file.originalname}`);

        // Validate new SCORM package
        const validation = await validateSCORMPackage(req.file);
        if (!validation.isValid) {
          await cleanupTempFile(req.file.path);
          return res.status(400).json({ message: validation.error });
        }

        // Get enhanced SCORM information
        let scormManifest;
        try {
          scormManifest = await getSCORMManifest(req.file.path);
        } catch (error) {
          console.warn('Failed to parse SCORM manifest for replacement:', error);
        }

        // Move new file to storage
        const newStoragePath = await moveToStorage(req.file, 'courses');

        // Update file-related fields
        updateData.fileName = req.file.originalname;
        updateData.fileSize = req.file.size;
        updateData.storagePath = newStoragePath;
        updateData.scormType = scormManifest?.version || validation.scormType || updateData.scormType;

        // Cleanup temp file
        await cleanupTempFile(req.file.path);
      }

      const updatedCourse = await storage.updateCourse(courseId, updateData);
      res.json(updatedCourse);

    } catch (error) {
      console.error("Course update error:", error);
      
      if (req.file?.path) {
        await cleanupTempFile(req.file.path);
      }

      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update course" 
      });
    }
  });

  // Soft delete course (admin only)
  app.delete('/api/courses/:id', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const courseId = req.params.id;
      
      // Check if course has active dispatches
      const dispatches = await storage.getDispatchesByCourse(courseId);
      const activeDispatches = dispatches.filter(d => !d.isDisabled);
      
      if (activeDispatches.length > 0) {
        return res.status(400).json({ 
          message: `Cannot delete course with ${activeDispatches.length} active dispatch(es). Please disable dispatches first.`,
          activeDispatches: activeDispatches.length
        });
      }

      // Soft delete the course
      await storage.updateCourse(courseId, {
        isDisabled: true,
        deletedAt: new Date()
      });

      res.json({ message: "Course disabled successfully" });

    } catch (error) {
      console.error("Course deletion error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to delete course" 
      });
    }
  });

  // Check for dispatch conflicts
  app.get('/api/courses/check-conflicts', isAuthenticated, async (req: any, res) => {
    try {
      const { title } = req.query;
      
      if (!title || typeof title !== 'string') {
        return res.json({ conflicts: [] });
      }

      // Find courses with similar titles
      const allCourses = await storage.getCourses(false); // Only active courses
      const similarCourses = allCourses.filter(course => 
        course.title.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(course.title.toLowerCase())
      );

      // Find dispatches for these courses
      const conflicts = [];
      for (const course of similarCourses) {
        const dispatches = await storage.getDispatchesByCourse(course.id);
        const activeDispatches = dispatches.filter(d => !d.isDisabled);
        
        if (activeDispatches.length > 0) {
          conflicts.push({
            courseId: course.id,
            courseTitle: course.title,
            dispatchCount: activeDispatches.length
          });
        }
      }

      res.json({ conflicts });

    } catch (error) {
      console.error("Error checking conflicts:", error);
      res.status(500).json({ message: "Failed to check conflicts" });
    }
  });

  // SCORM Preview routes
  app.get('/api/preview/:courseId', isAuthenticated, async (req: any, res) => {
    try {
      const courseId = req.params.courseId;
      const course = await storage.getCourse(courseId);
      
      if (!course) {
        return res.status(404).send("Course not found");
      }

      // Check if course is disabled (SOFT DELETE ENFORCEMENT)
      if (course.isDisabled) {
        return res.status(403).send("Course is no longer available");
      }

      // Check access permissions
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).send("User not found");
      }

      if (course.createdBy !== req.user.claims.sub && user.role !== 'admin') {
        return res.status(403).send("Access denied");
      }

      // Generate preview HTML using consolidated service
      const entryPoint = await findSCORMEntryPoint(course.storagePath);
      
      const previewHtml = generateSCORMLaunchHTML({
        courseTitle: course.title,
        token: '', // Not needed for preview
        entryPoint,
        isPreview: true,
        courseId: course.id
      });

      res.setHeader('Content-Type', 'text/html');
      res.send(previewHtml);

    } catch (error) {
      console.error("Preview generation error:", error);
      res.status(500).send("Failed to generate preview");
    }
  });

  // SCORM Preview assets
  app.get('/api/preview/:courseId/assets/*', isAuthenticated, async (req: any, res) => {
    try {
      const courseId = req.params.courseId;
      const assetPath = req.params[0];
      
      const course = await storage.getCourse(courseId);
      if (!course || course.isDisabled) {
        return res.status(404).send("Course not found");
      }

      // Check access permissions
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).send("User not found");
      }

      if (course.createdBy !== req.user.claims.sub && user.role !== 'admin') {
        return res.status(403).send("Access denied");
      }

      // Extract and serve file using consolidated service
      const { extractFileFromZip, getContentType } = await import('../services/scormService');
      const fileContent = await extractFileFromZip(course.storagePath, assetPath);
      
      const contentType = getContentType(assetPath);
      res.setHeader('Content-Type', contentType);
      res.send(fileContent);

    } catch (error) {
      console.error("Preview asset error:", error);
      res.status(404).send("Asset not found");
    }
  });
}