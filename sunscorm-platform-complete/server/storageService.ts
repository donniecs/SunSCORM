import { promises as fs } from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'courses');

/**
 * Initialize persistent storage directory
 * Creates uploads/courses directory if it doesn't exist
 */
export async function initializeStorage(): Promise<void> {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    console.log(`Storage directory initialized: ${UPLOADS_DIR}`);
  } catch (error) {
    console.error('Failed to initialize storage directory:', error);
    throw error;
  }
}

/**
 * Move uploaded file from temporary location to persistent storage
 * @param tempFilePath - Path to temporary file
 * @param fileName - Desired filename in storage
 * @param courseId - Optional course ID for file replacement (keeps same path)
 * @returns Final storage path
 */
export async function moveToStorage(tempFilePath: string, fileName: string, courseId?: string): Promise<string> {
  try {
    // Ensure storage directory exists
    await initializeStorage();
    
    let finalPath: string;
    
    if (courseId) {
      // For course updates, use consistent naming to enable file replacement
      const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      finalPath = path.join(UPLOADS_DIR, `course_${courseId}_${safeFileName}`);
      
      // Remove existing file if it exists
      try {
        await fs.access(finalPath);
        await fs.unlink(finalPath);
        console.log(`Removed existing course file: ${finalPath}`);
      } catch (error) {
        // File doesn't exist, which is fine
        console.log(`No existing file to remove: ${finalPath}`);
      }
    } else {
      // For new uploads, generate unique filename to avoid conflicts
      const timestamp = Date.now();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const finalFileName = `${timestamp}_${safeFileName}`;
      finalPath = path.join(UPLOADS_DIR, finalFileName);
    }
    
    // Move file from temp to persistent storage
    // Use copyFile + unlink instead of rename to handle cross-device moves
    await fs.copyFile(tempFilePath, finalPath);
    await fs.unlink(tempFilePath);
    
    console.log(`File moved to persistent storage: ${finalPath}`);
    return finalPath;
  } catch (error) {
    console.error('Failed to move file to storage:', error);
    throw error;
  }
}

/**
 * Clean up temporary file if it still exists
 * @param tempFilePath - Path to temporary file to clean up
 */
export async function cleanupTempFile(tempFilePath: string): Promise<void> {
  try {
    await fs.access(tempFilePath);
    await fs.unlink(tempFilePath);
    console.log(`Cleaned up temporary file: ${tempFilePath}`);
  } catch (error) {
    // File might already be moved or deleted, this is okay
    console.log(`Temp file cleanup (expected): ${tempFilePath}`);
  }
}

/**
 * Get the persistent uploads directory path
 */
export function getUploadsDir(): string {
  return UPLOADS_DIR;
}