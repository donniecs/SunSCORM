import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CloudUpload, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CourseEditProps {
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface CourseData {
  id: string;
  title: string;
  version: string;
  description: string;
  tags: string[];
}

export default function CourseEdit({ courseId, isOpen, onClose }: CourseEditProps) {
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["/api/courses", courseId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/courses/${courseId}`);
      return response.json();
    },
    enabled: isOpen && !!courseId,
    retry: false,
  });

  // Pre-fill form when course data loads
  useEffect(() => {
    if (course) {
      setTitle(course.title || "");
      setVersion(course.version || "");
      setDescription(course.description || "");
      setTags(course.tags ? course.tags.map((tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1)).join(", ") : "");
    }
  }, [course]);

  const updateMutation = useMutation({
    mutationFn: async (updateData: { title: string; version: string; description: string; tags: string; file?: File }) => {
      if (updateData.file) {
        // Use FormData for file upload
        const formData = new FormData();
        formData.append("title", updateData.title);
        formData.append("version", updateData.version);
        formData.append("description", updateData.description);
        formData.append("tags", updateData.tags);
        formData.append("course", updateData.file);
        
        const response = await fetch(`/api/courses/${courseId}`, {
          method: "PUT",
          body: formData,
          credentials: "include",
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to update course");
        }
        
        return response.json();
      } else {
        // Use JSON for metadata-only updates
        const response = await apiRequest("PUT", `/api/courses/${courseId}`, updateData);
        return response.json();
      }
    },
    onSuccess: (data) => {
      const hasFileUpdate = file !== null;
      toast({
        title: "Success",
        description: hasFileUpdate 
          ? "Course updated — new file uploaded successfully" 
          : "Course updated — no file change",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/standards-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update course",
        variant: "destructive",
      });
    },
  });

  const validateFileType = (file: File): boolean => {
    const allowedTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      'application/x-zip'
    ];
    
    const allowedExtensions = ['.zip', '.scorm'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    return allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension);
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
      if (validateFileType(selectedFile)) {
        setFile(selectedFile);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please select a ZIP file containing your SCORM package",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFileType(selectedFile)) {
        setFile(selectedFile);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please select a ZIP file containing your SCORM package",
          variant: "destructive",
        });
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Course title is required",
        variant: "destructive",
      });
      return;
    }

    if (!version.trim()) {
      toast({
        title: "Error",
        description: "Course version is required",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      title: title.trim(),
      version: version.trim(),
      description: description.trim(),
      tags: tags.trim(),
      file: file || undefined,
    });
  };

  const handleClose = () => {
    if (!updateMutation.isPending) {
      onClose();
    }
  };

  if (courseLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Course Title*</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter course title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-version">Version*</Label>
            <Input
              id="edit-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Enter version (e.g., 1.0)"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter course description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tags">Tags (comma separated)</Label>
            <Input
              id="edit-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. English, Construction, CST256"
            />
          </div>

          <div className="space-y-2">
            <Label>Replace SCORM File (optional)</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive ? "border-primary bg-blue-50" : "border-gray-300"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <CloudUpload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              {file ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    Remove File
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Drop a ZIP file here or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".zip,.scorm"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    Choose File
                  </Button>
                </div>
              )}
            </div>
            {file && (
              <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  Uploading a new file will overwrite the current SCORM package for this course across all dispatches.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={updateMutation.isPending}
              className="bg-primary hover:bg-blue-700 text-white"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}