/**
 * Chunked Upload System for Large SCORM Files
 * Handles files up to 3GB by breaking them into 10MB chunks
 */

export interface ChunkUploadProgress {
  totalChunks: number;
  uploadedChunks: number;
  currentChunk: number;
  percentage: number;
  speed: string;
  timeRemaining: string;
}

export interface ChunkUploadOptions {
  chunkSize?: number; // Default 10MB
  onProgress?: (progress: ChunkUploadProgress) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
  onError?: (error: Error, chunkIndex?: number) => void;
}

export class ChunkedUploader {
  private readonly CHUNK_SIZE: number;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor(options: ChunkUploadOptions = {}) {
    this.CHUNK_SIZE = options.chunkSize || 10 * 1024 * 1024; // 10MB default
  }

  /**
   * Upload a large file using chunked upload
   */
  async uploadFile(
    file: File,
    courseData: { title: string; description: string; version: string; tags: string[] },
    options: ChunkUploadOptions = {}
  ): Promise<{ courseId: string; message: string }> {
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    const uploadId = this.generateUploadId();
    const startTime = Date.now();
    
    console.log(`Starting chunked upload: ${file.name} (${this.formatFileSize(file.size)}) in ${totalChunks} chunks`);

    try {
      // Step 1: Initialize upload session
      await this.initializeUpload(uploadId, file.name, file.size, totalChunks, courseData);

      // Step 2: Upload chunks sequentially
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        await this.uploadChunkWithRetry(uploadId, chunkIndex, chunk, totalChunks);

        // Progress callback
        if (options.onProgress) {
          const progress = this.calculateProgress(chunkIndex + 1, totalChunks, startTime);
          options.onProgress(progress);
        }

        if (options.onChunkComplete) {
          options.onChunkComplete(chunkIndex, totalChunks);
        }
      }

      // Step 3: Finalize upload (reassemble chunks)
      const result = await this.finalizeUpload(uploadId);
      
      console.log(`Chunked upload completed: ${file.name}`);
      return result;

    } catch (error) {
      console.error('Chunked upload failed:', error);
      // Cleanup failed upload
      await this.cleanupUpload(uploadId).catch(() => {});
      
      if (options.onError) {
        options.onError(error as Error);
      }
      throw error;
    }
  }

  /**
   * Initialize upload session on server
   */
  private async initializeUpload(
    uploadId: string,
    fileName: string,
    fileSize: number,
    totalChunks: number,
    courseData: any
  ): Promise<void> {
    const response = await fetch('/api/upload/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': await this.getCsrfToken()
      },
      body: JSON.stringify({
        uploadId,
        fileName,
        fileSize,
        totalChunks,
        courseData
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize upload: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Upload a single chunk with retry logic
   */
  private async uploadChunkWithRetry(
    uploadId: string,
    chunkIndex: number,
    chunk: Blob,
    totalChunks: number,
    retryCount = 0
  ): Promise<void> {
    try {
      await this.uploadChunk(uploadId, chunkIndex, chunk, totalChunks);
    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        console.warn(`Chunk ${chunkIndex} failed, retrying (${retryCount + 1}/${this.MAX_RETRIES})`);
        await this.delay(this.RETRY_DELAY * (retryCount + 1));
        return this.uploadChunkWithRetry(uploadId, chunkIndex, chunk, totalChunks, retryCount + 1);
      }
      throw new Error(`Chunk ${chunkIndex} failed after ${this.MAX_RETRIES} retries: ${error}`);
    }
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(
    uploadId: string,
    chunkIndex: number,
    chunk: Blob,
    totalChunks: number
  ): Promise<void> {
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('chunk', chunk);

    const response = await fetch('/api/upload/chunk', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': await this.getCsrfToken()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chunk upload failed: ${response.status} ${errorText}`);
    }
  }

  /**
   * Finalize upload (reassemble chunks and process)
   */
  private async finalizeUpload(uploadId: string): Promise<{ courseId: string; message: string }> {
    const response = await fetch('/api/upload/finalize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': await this.getCsrfToken()
      },
      body: JSON.stringify({ uploadId })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to finalize upload: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Cleanup failed upload
   */
  private async cleanupUpload(uploadId: string): Promise<void> {
    await fetch('/api/upload/cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': await this.getCsrfToken()
      },
      body: JSON.stringify({ uploadId })
    });
  }

  /**
   * Generate unique upload ID
   */
  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get CSRF token
   */
  private async getCsrfToken(): string {
    const response = await fetch('/api/csrf-token');
    const data = await response.json();
    return data.csrfToken;
  }

  /**
   * Calculate upload progress
   */
  private calculateProgress(
    uploadedChunks: number,
    totalChunks: number,
    startTime: number
  ): ChunkUploadProgress {
    const percentage = (uploadedChunks / totalChunks) * 100;
    const elapsedTime = Date.now() - startTime;
    const speed = this.calculateSpeed(uploadedChunks * this.CHUNK_SIZE, elapsedTime);
    const timeRemaining = this.calculateTimeRemaining(uploadedChunks, totalChunks, elapsedTime);

    return {
      totalChunks,
      uploadedChunks,
      currentChunk: uploadedChunks,
      percentage: Math.round(percentage * 100) / 100,
      speed,
      timeRemaining
    };
  }

  /**
   * Calculate upload speed
   */
  private calculateSpeed(bytesUploaded: number, elapsedTime: number): string {
    const bytesPerSecond = bytesUploaded / (elapsedTime / 1000);
    return this.formatFileSize(bytesPerSecond) + '/s';
  }

  /**
   * Calculate remaining time
   */
  private calculateTimeRemaining(
    uploadedChunks: number,
    totalChunks: number,
    elapsedTime: number
  ): string {
    if (uploadedChunks === 0) return 'Calculating...';
    
    const chunksPerSecond = uploadedChunks / (elapsedTime / 1000);
    const remainingChunks = totalChunks - uploadedChunks;
    const remainingSeconds = remainingChunks / chunksPerSecond;

    return this.formatTime(remainingSeconds);
  }

  /**
   * Format file size
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format time in seconds to readable format
   */
  private formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}