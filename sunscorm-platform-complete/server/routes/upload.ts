import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { csrfProtection } from "../csrfProtection";
import { validateSCORMPackage } from "../scormValidator";
import { moveToStorage, cleanupTempFile } from "../storageService";
import { getSCORMManifest } from "../services/scormService";
import multer from "multer";
import fs from "fs";
import path from "path";

/**
 * Chunked Upload Routes
 * Handles large file upload with progress tracking
 */

// Chunked upload configuration
const CHUNKED_UPLOAD_THRESHOLD = 100 * 1024 * 1024; // 100MB
const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
const MAX_TOTAL_SIZE = 3 * 1024 * 1024 * 1024; // 3GB total limit
const CHUNK_UPLOAD_TIMEOUT = 30 * 60 * 1000; // 30 minutes

interface ChunkedUploadSession {
  id: string;
  userId: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  tempDir: string;
  createdAt: Date;
  lastActivity: Date;
  metadata: any;
}

// In-memory session storage (in production, use Redis or database)
const uploadSessions = new Map<string, ChunkedUploadSession>();

// Cleanup old sessions periodically
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of uploadSessions.entries()) {
    if (now.getTime() - session.lastActivity.getTime() > CHUNK_UPLOAD_TIMEOUT) {
      console.log(`Cleaning up expired upload session: ${sessionId}`);
      cleanupUploadSession(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

async function cleanupUploadSession(sessionId: string): Promise<void> {
  const session = uploadSessions.get(sessionId);
  if (session) {
    try {
      if (fs.existsSync(session.tempDir)) {
        fs.rmSync(session.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Error cleaning up session ${sessionId}:`, error);
    }
    uploadSessions.delete(sessionId);
  }
}

function generateSessionId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CHUNK_SIZE,
    files: 1
  }
});

export function registerUploadRoutes(app: Express): void {

  // Initialize chunked upload session
  app.post('/api/upload/initialize', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const { fileName, totalSize, totalChunks, title, description, version, tags } = req.body;

      // Validate input
      if (!fileName || !totalSize || !totalChunks) {
        return res.status(400).json({ message: "Missing required fields: fileName, totalSize, totalChunks" });
      }

      if (totalSize > MAX_TOTAL_SIZE) {
        return res.status(400).json({ 
          message: `File too large. Maximum size is ${Math.round(MAX_TOTAL_SIZE / (1024 * 1024 * 1024))}GB` 
        });
      }

      // Validate file type
      const allowedExtensions = ['.zip', '.scorm'];
      const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
      
      if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({ message: 'Invalid file type. Only ZIP and SCORM files are allowed.' });
      }

      // Create upload session
      const sessionId = generateSessionId();
      const tempDir = path.join(process.cwd(), 'uploads', 'chunks', sessionId);
      
      // Ensure temp directory exists
      fs.mkdirSync(tempDir, { recursive: true });

      const session: ChunkedUploadSession = {
        id: sessionId,
        userId: req.user.claims.sub,
        fileName,
        totalSize,
        totalChunks,
        uploadedChunks: new Set(),
        tempDir,
        createdAt: new Date(),
        lastActivity: new Date(),
        metadata: { title, description, version, tags }
      };

      uploadSessions.set(sessionId, session);

      console.log(`Chunked upload initialized: ${sessionId} for file: ${fileName} (${Math.round(totalSize / (1024 * 1024))}MB)`);

      res.json({
        sessionId,
        message: "Upload session initialized",
        chunkSize: MAX_CHUNK_SIZE,
        totalChunks
      });

    } catch (error) {
      console.error("Error initializing chunked upload:", error);
      res.status(500).json({ message: "Failed to initialize upload" });
    }
  });

  // Upload individual chunk
  app.post('/api/upload/chunk', isAuthenticated, csrfProtection, chunkUpload.single('chunk'), async (req: any, res) => {
    try {
      const { sessionId, chunkIndex } = req.body;

      if (!sessionId || chunkIndex === undefined || !req.file) {
        return res.status(400).json({ message: "Missing sessionId, chunkIndex, or chunk file" });
      }

      const session = uploadSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Upload session not found or expired" });
      }

      // Verify user owns this session
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      const chunkNum = parseInt(chunkIndex);
      if (isNaN(chunkNum) || chunkNum < 0 || chunkNum >= session.totalChunks) {
        return res.status(400).json({ message: "Invalid chunk index" });
      }

      // Save chunk to temp directory
      const chunkPath = path.join(session.tempDir, `chunk_${chunkNum}`);
      fs.writeFileSync(chunkPath, req.file.buffer);

      // Mark chunk as uploaded
      session.uploadedChunks.add(chunkNum);
      session.lastActivity = new Date();

      console.log(`Chunk ${chunkNum}/${session.totalChunks - 1} uploaded for session ${sessionId}`);

      res.json({
        message: "Chunk uploaded successfully",
        chunkIndex: chunkNum,
        uploadedChunks: session.uploadedChunks.size,
        totalChunks: session.totalChunks,
        isComplete: session.uploadedChunks.size === session.totalChunks
      });

    } catch (error) {
      console.error("Error uploading chunk:", error);
      res.status(500).json({ message: "Failed to upload chunk" });
    }
  });

  // Finalize chunked upload and create course
  app.post('/api/upload/finalize', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "Missing sessionId" });
      }

      const session = uploadSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Upload session not found or expired" });
      }

      // Verify user owns this session
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if all chunks are uploaded
      if (session.uploadedChunks.size !== session.totalChunks) {
        return res.status(400).json({ 
          message: "Upload incomplete", 
          uploaded: session.uploadedChunks.size,
          required: session.totalChunks
        });
      }

      console.log(`Finalizing chunked upload for session ${sessionId}`);

      // Reassemble file from chunks
      const finalFilePath = path.join(session.tempDir, session.fileName);
      const writeStream = fs.createWriteStream(finalFilePath);

      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(session.tempDir, `chunk_${i}`);
        if (!fs.existsSync(chunkPath)) {
          throw new Error(`Missing chunk ${i}`);
        }
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
      }

      writeStream.end();

      // Validate the reassembled file
      const mockFile = {
        path: finalFilePath,
        originalname: session.fileName,
        size: session.totalSize,
        mimetype: 'application/zip'
      };

      const validation = await validateSCORMPackage(mockFile);
      if (!validation.isValid) {
        await cleanupUploadSession(sessionId);
        return res.status(400).json({ message: validation.error });
      }

      // Get enhanced SCORM information
      let scormManifest;
      try {
        scormManifest = await getSCORMManifest(finalFilePath);
      } catch (error) {
        console.warn('Failed to parse SCORM manifest during chunked upload:', error);
      }

      // Move file to persistent storage
      const storagePath = await moveToStorage(mockFile, 'courses');

      // Parse tags
      const tags = session.metadata.tags ? 
        session.metadata.tags.split(',').map((tag: string) => tag.trim().toLowerCase()).filter(Boolean) : 
        [];

      // Create course record
      const courseData = {
        title: session.metadata.title || scormManifest?.title || session.fileName,
        description: session.metadata.description || scormManifest?.description || '',
        version: session.metadata.version || '1.0',
        scormType: scormManifest?.version || validation.scormType || 'scorm_1_2',
        tags,
        fileName: session.fileName,
        fileSize: session.totalSize,
        storagePath,
        createdBy: req.user.claims.sub,
        isDisabled: false
      };

      const course = await storage.createCourse(courseData);

      // Cleanup session
      await cleanupUploadSession(sessionId);

      console.log(`Chunked upload completed successfully: Course ${course.id} created from ${session.fileName}`);

      res.json({
        course,
        message: "Course uploaded successfully via chunked upload",
        uploadMethod: "chunked"
      });

    } catch (error) {
      console.error("Error finalizing chunked upload:", error);
      
      // Cleanup on error
      if (req.body.sessionId) {
        await cleanupUploadSession(req.body.sessionId);
      }

      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to finalize upload" 
      });
    }
  });

  // Cancel chunked upload
  app.post('/api/upload/cleanup', isAuthenticated, csrfProtection, async (req: any, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "Missing sessionId" });
      }

      const session = uploadSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Upload session not found" });
      }

      // Verify user owns this session
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      await cleanupUploadSession(sessionId);

      console.log(`Upload session cleaned up: ${sessionId}`);
      res.json({ message: "Upload session cleaned up successfully" });

    } catch (error) {
      console.error("Error cleaning up upload session:", error);
      res.status(500).json({ message: "Failed to cleanup upload session" });
    }
  });

  // Get upload session status
  app.get('/api/upload/status/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = req.params.sessionId;
      const session = uploadSessions.get(sessionId);

      if (!session) {
        return res.status(404).json({ message: "Upload session not found" });
      }

      // Verify user owns this session
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json({
        sessionId,
        fileName: session.fileName,
        totalSize: session.totalSize,
        totalChunks: session.totalChunks,
        uploadedChunks: session.uploadedChunks.size,
        isComplete: session.uploadedChunks.size === session.totalChunks,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
      });

    } catch (error) {
      console.error("Error getting upload status:", error);
      res.status(500).json({ message: "Failed to get upload status" });
    }
  });

  // List active upload sessions for user
  app.get('/api/upload/sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userSessions = Array.from(uploadSessions.values())
        .filter(session => session.userId === req.user.claims.sub)
        .map(session => ({
          sessionId: session.id,
          fileName: session.fileName,
          totalSize: session.totalSize,
          uploadedChunks: session.uploadedChunks.size,
          totalChunks: session.totalChunks,
          isComplete: session.uploadedChunks.size === session.totalChunks,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity
        }));

      res.json(userSessions);

    } catch (error) {
      console.error("Error listing upload sessions:", error);
      res.status(500).json({ message: "Failed to list upload sessions" });
    }
  });
}