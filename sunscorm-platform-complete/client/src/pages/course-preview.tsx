import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { useState } from "react";

export default function CoursePreview() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Fetch course details
  const { data: course, isLoading, error } = useQuery({
    queryKey: ["/api/courses", id],
    enabled: !!id,
  });

  const handleBack = () => {
    navigate("/courses");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading course preview...</span>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load course. The course may not exist or you may not have permission to view it.
            </AlertDescription>
          </Alert>
          <Button onClick={handleBack} variant="outline" className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Courses
          </Button>
        </div>
      </div>
    );
  }

  const previewUrl = `/api/preview/${id}`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              onClick={handleBack}
              variant="ghost"
              size="sm"
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Courses</span>
            </Button>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {course.title}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Course Preview • {course.scormType?.toUpperCase() || 'SCORM'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full">
              Preview Mode
            </span>
          </div>
        </div>
      </div>

      {/* SCORM Content */}
      <div className="flex-1 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                    SCORM Course Player
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Testing course functionality before dispatch
                  </p>
                </div>
                <Alert className="max-w-sm">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This is a preview mode. Progress and interactions are not saved.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
            
            {/* SCORM iframe */}
            <div className="relative">
              <iframe
                src={previewUrl}
                className="w-full border-0"
                style={{ 
                  height: "calc(100vh - 200px)", 
                  minHeight: "600px",
                  opacity: iframeLoaded ? 1 : 0,
                  transition: "opacity 0.3s ease"
                }}
                title={`SCORM Course: ${course.title}`}
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                onLoad={() => {
                  console.log("SCORM iframe loaded successfully");
                  setIframeLoaded(true);
                }}
                onError={(e) => {
                  console.error("SCORM iframe error:", e);
                  setIframeLoaded(true); // Show iframe even on error so user can see what happened
                }}
              />
              
              {/* Loading overlay - only show when iframe hasn't loaded */}
              {!iframeLoaded && (
                <div className="absolute inset-0 bg-white dark:bg-gray-800 flex items-center justify-center">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-gray-700 dark:text-gray-300">Loading SCORM content...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}