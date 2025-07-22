import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChunkedUploader, type ChunkUploadProgress } from "@/utils/chunked-upload";
import { CloudUpload, X, AlertTriangle, CheckCircle, Clock, Zap } from "lucide-react";

interface CourseUploadProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CourseUpload({ isOpen, onClose }: CourseUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [conflictCheck, setConflictCheck] = useState<string | null>(null);
  const [chunkProgress, setChunkProgress] = useState<ChunkUploadProgress | null>(null);
  const [isChunkedUpload, setIsChunkedUpload] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const MAX_FILE_SIZE = 512 * 1024 * 1024; // 512MB server limit
  const UPLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout
  const CHUNKED_UPLOAD_THRESHOLD = 100 * 1024 * 1024; // Use chunked upload for files > 100MB

  const uploadWithProgress = async (formData: FormData): Promise<any> => {
    setIsUploading(true);
    setUploadProgress(0);

    // Fetch CSRF token first
    let csrfToken;
    try {
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include'
      });
      const data = await csrfResponse.json();
      csrfToken = data.csrfToken;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      setIsUploading(false);
      throw new Error('Failed to get security token');
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Set up timeout - longer for larger files
      const fileSize = file?.size || 0;
      const dynamicTimeout = Math.max(UPLOAD_TIMEOUT, fileSize / (1024 * 1024) * 10000); // 10s per MB minimum
      
      const timeoutId = setTimeout(() => {
        xhr.abort();
        reject(new Error(`Upload timed out after ${Math.round(dynamicTimeout/1000)}s. Please try with a smaller file or check your connection.`));
      }, dynamicTimeout);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(Math.round(percentComplete));
        }
      });

      xhr.addEventListener('load', () => {
        clearTimeout(timeoutId);
        setIsUploading(false);
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error("Invalid response from server"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || `Upload failed with status ${xhr.status}`));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        clearTimeout(timeoutId);
        setIsUploading(false);
        reject(new Error("Network error occurred during upload"));
      });

      xhr.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        setIsUploading(false);
        reject(new Error("Upload was cancelled"));
      });

      xhr.open('POST', '/api/courses/upload');
      xhr.withCredentials = true;
      // Send CSRF token as header instead of form data
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      xhr.send(formData);
    });
  };

  // Check for dispatch conflicts when title changes
  const { data: conflictData } = useQuery({
    queryKey: ['/api/courses/check-conflicts', title],
    enabled: title.length > 2,
    refetchOnWindowFocus: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      
      // Use chunked upload for large files
      if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
        setIsChunkedUpload(true);
        setChunkProgress(null);
        
        const uploader = new ChunkedUploader({ chunkSize: 10 * 1024 * 1024 }); // 10MB chunks
        
        return uploader.uploadFile(
          file,
          {
            title,
            description,
            version: "1.0",
            tags: tags.split(',').map(tag => tag.trim()).filter(Boolean)
          },
          {
            onProgress: (progress) => {
              setChunkProgress(progress);
              setUploadProgress(progress.percentage);
            },
            onError: (error) => {
              console.error("Chunked upload error:", error);
              throw error;
            }
          }
        );
      } else {
        // Use regular upload for smaller files
        setIsChunkedUpload(false);
        setChunkProgress(null);
        
        const formData = new FormData();
        formData.append("course", file);
        formData.append("title", title);
        formData.append("description", description);
        formData.append("tags", tags);
        
        return uploadWithProgress(formData);
      }
    },
    onSuccess: (data) => {
      // Check for conflicts after successful upload
      if (conflictData?.conflicts?.length > 0) {
        toast({
          title: "Course Uploaded",
          description: `Course uploaded successfully. Note: ${conflictData.conflicts.length} existing dispatch(es) may conflict with this course.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Success",
          description: "Course uploaded successfully",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/standards-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      onClose();
      resetForm();
    },
    onError: (error) => {
      setIsUploading(false);
      setUploadProgress(0);
      setChunkProgress(null);
      setIsChunkedUpload(false);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload course",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setDescription("");
    setTags("");
    setUploadProgress(0);
    setIsUploading(false);
    setConflictCheck(null);
    setChunkProgress(null);
    setIsChunkedUpload(false);
  };

  const validateFileSize = (file: File): boolean => {
    // Allow files up to 3GB for chunked upload
    const MAX_ALLOWED_SIZE = 3 * 1024 * 1024 * 1024; // 3GB
    
    if (file.size > MAX_ALLOWED_SIZE) {
      toast({
        title: "File Too Large",
        description: `File size is ${(file.size / 1024 / 1024 / 1024).toFixed(1)}GB. Maximum file size is 3GB. Please compress your SCORM package.`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (validateFileSize(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFileSize(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("course", file);
    formData.append("title", title || file.name);
    formData.append("description", description);
    formData.append("tags", tags);

    uploadMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload SCORM Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Course Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter course title"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter course description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. English, Construction, CST256"
            />
          </div>

          {/* Conflict Warning */}
          {conflictData?.conflicts?.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This course title conflicts with {conflictData.conflicts.length} existing dispatch(es): {" "}
                {conflictData.conflicts.map((c: any) => c.tenantName).join(', ')}. 
                Upload will succeed, but assignment may fail.
              </AlertDescription>
            </Alert>
          )}
          
          {conflictData?.conflicts?.length === 0 && title.length > 2 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                No conflicts detected with existing dispatches.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Course File</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? "border-primary bg-blue-50" : "border-gray-300"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <CloudUpload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              {file ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {file.size > 200 * 1024 * 1024 && file.size <= MAX_FILE_SIZE && (
                      <div className="flex items-center gap-2 text-orange-600 text-xs">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Large file - upload may take longer or fail</span>
                      </div>
                    )}
                  </div>
                  
                  {isUploading && (
                    <div className="space-y-3">
                      {isChunkedUpload && chunkProgress ? (
                        // Enhanced progress for chunked uploads (large files)
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-blue-600">
                              <Zap className="h-4 w-4" />
                              Chunked Upload
                            </span>
                            <span className="font-medium">{chunkProgress.percentage.toFixed(1)}%</span>
                          </div>
                          
                          <Progress value={chunkProgress.percentage} className="w-full" />
                          
                          <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                              <span>Chunks:</span>
                              <span className="font-medium">
                                {chunkProgress.uploadedChunks}/{chunkProgress.totalChunks}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              <span>{chunkProgress.speed}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>ETA: {chunkProgress.timeRemaining}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>Size:</span>
                              <span>{(file!.size / 1024 / 1024 / 1024).toFixed(2)}GB</span>
                            </div>
                          </div>
                          
                          <div className="text-xs text-blue-600 text-center">
                            Large file detected - using chunked upload for reliability
                          </div>
                        </div>
                      ) : (
                        // Standard progress for regular uploads
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Uploading... ({(file!.size / 1024 / 1024).toFixed(1)}MB)</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <Progress value={uploadProgress} className="w-full" />
                          <div className="text-xs text-gray-500 text-center">
                            {uploadProgress < 100 ? (
                              file!.size > 100 * 1024 * 1024 ? 
                                "Large file - this may take several minutes" : 
                                "Processing..."
                            ) : "Finalizing upload..."}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!isUploading && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFile(null)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-gray-600">Drop your SCORM package here or</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("file-input")?.click()}
                  >
                    Browse Files
                  </Button>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>Supports SCORM 1.2, 2004, AICC, and xAPI packages</p>
                    <p>Supports files up to 3GB. Files over 100MB will use chunked upload for reliability.</p>
                  </div>
                </div>
              )}
              <input
                id="file-input"
                type="file"
                accept=".zip,.scorm"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={uploadMutation.isPending || isUploading}
              className="bg-primary hover:bg-blue-700"
            >
              {isUploading ? (
                isChunkedUpload ? `Chunked Upload ${uploadProgress.toFixed(1)}%` : `Uploading... ${uploadProgress}%`
              ) : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
