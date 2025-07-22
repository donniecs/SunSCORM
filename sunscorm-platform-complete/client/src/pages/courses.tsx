import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, BookOpen, Calendar, User, Building2, Plus, MoreHorizontal, Edit, Eye, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CourseUpload from "@/components/courses/course-upload";
import CourseEdit from "@/components/courses/course-edit";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

export default function Courses() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [showUpload, setShowUpload] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [editingCourseId, setEditingCourseId] = useState<string>("");
  const [deletingCourseId, setDeletingCourseId] = useState<string>("");
  const [assignmentData, setAssignmentData] = useState({
    tenantId: "",
    maxUsers: "",
    maxCompletions: "",
    expiresAt: ""
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: courses = [], isLoading: coursesLoading, error } = useQuery({
    queryKey: ["/api/courses"],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["/api/tenants"],
    enabled: isAuthenticated && showBulkAssign,
    retry: false,
  });

  const { data: existingDispatches = [] } = useQuery({
    queryKey: ["/api/dispatches"],
    enabled: isAuthenticated && showBulkAssign,
    retry: false,
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async (courseIds: string[]) => {
      const dispatchPromises = courseIds.map(async (courseId) => {
        // Check if dispatch already exists
        const existingDispatch = existingDispatches.find(
          (d: any) => d.courseId === courseId && d.tenantId === assignmentData.tenantId
        );
        
        if (existingDispatch) {
          return { courseId, skipped: true, reason: "Already exists" };
        }

        // Find the course to use its title as dispatch name
        const course = courses.find((c: any) => c.id === courseId);
        const dispatchName = course ? `${course.title} - Dispatch` : "Course Dispatch";

        const response = await apiRequest("POST", "/api/dispatches", {
          courseId,
          tenantId: assignmentData.tenantId,
          name: dispatchName,
          maxUsers: assignmentData.maxUsers ? parseInt(assignmentData.maxUsers) : null,
          maxCompletions: assignmentData.maxCompletions ? parseInt(assignmentData.maxCompletions) : null,
          expiresAt: assignmentData.expiresAt || null,
        });
        
        const dispatch = await response.json();
        
        return { courseId, created: true, dispatch };
      });
      
      return Promise.all(dispatchPromises);
    },
    onSuccess: (results) => {
      const created = results.filter(r => r.created).length;
      const skipped = results.filter(r => r.skipped).length;
      
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      
      toast({
        title: "Assignment Complete",
        description: `${created} courses assigned, ${skipped} skipped (already assigned)`,
      });
      
      setShowBulkAssign(false);
      setSelectedCourses([]);
      setAssignmentData({ tenantId: "", maxUsers: "", maxCompletions: "", expiresAt: "" });
    },
    onError: (error) => {
      console.error("Assignment error:", error);
      toast({
        title: "Assignment Failed", 
        description: error.message || "Failed to assign courses to company",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const response = await apiRequest("DELETE", `/api/courses/${courseId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete course');
      }
      return response.json();
    },
    onSuccess: (data, courseId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDeletingCourseId("");
      
      toast({
        title: "Success",
        description: "Course deleted successfully",
      });
    },
    onError: (error: any) => {
      console.error('Course deletion error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete course",
        variant: "destructive",
      });
      setDeletingCourseId("");
    },
  });

  const handleCourseSelect = (courseId: string, checked: boolean) => {
    if (checked) {
      setSelectedCourses(prev => [...prev, courseId]);
    } else {
      setSelectedCourses(prev => prev.filter(id => id !== courseId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCourses(filteredCourses.map((course: any) => course.id));
    } else {
      setSelectedCourses([]);
    }
  };

  const handleBulkAssign = () => {
    if (selectedCourses.length === 0) {
      toast({
        title: "No Courses Selected",
        description: "Please select at least one course to assign",
        variant: "destructive",
      });
      return;
    }

    if (!assignmentData.tenantId) {
      toast({
        title: "No Company Selected",
        description: "Please select a company to assign courses to",
        variant: "destructive",
      });
      return;
    }

    bulkAssignMutation.mutate(selectedCourses);
  };

  // Extract unique tags from all courses
  const uniqueTags = Array.from(new Set(
    courses.flatMap((course: any) => course.tags || [])
  )).sort();

  // Filter courses based on selected tag
  const filteredCourses = selectedTag && selectedTag !== "all"
    ? courses.filter((course: any) => 
        course.tags && course.tags.some((tag: string) => tag.toLowerCase() === selectedTag.toLowerCase())
      )
    : courses;

  if (error && isUnauthorizedError(error)) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Logging in again...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
    return null;
  }

  if (isLoading || coursesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-end mb-8">
          <div className="flex space-x-3">
            {courses.length > 0 && (
              <Dialog open={showBulkAssign} onOpenChange={setShowBulkAssign}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline"
                    disabled={selectedCourses.length === 0}
                    className="border-primary text-primary hover:bg-primary hover:text-white"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    Assign to Company ({selectedCourses.length})
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Courses to Company</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="company">Select Company</Label>
                      <Select value={assignmentData.tenantId} onValueChange={(value) => setAssignmentData(prev => ({ ...prev, tenantId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a company" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenants.map((tenant: any) => (
                            <SelectItem key={tenant.id} value={tenant.id}>
                              {tenant.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="maxUsers">Max Users (optional)</Label>
                      <Input
                        id="maxUsers"
                        type="number"
                        value={assignmentData.maxUsers}
                        onChange={(e) => setAssignmentData(prev => ({ ...prev, maxUsers: e.target.value }))}
                        placeholder="Leave empty for unlimited"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="maxCompletions">Max Completions (optional)</Label>
                      <Input
                        id="maxCompletions"
                        type="number"
                        value={assignmentData.maxCompletions || ''}
                        onChange={(e) => setAssignmentData(prev => ({ ...prev, maxCompletions: e.target.value }))}
                        placeholder="Leave empty for unlimited"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="expiresAt">Expiration Date (optional)</Label>
                      <Input
                        id="expiresAt"
                        type="date"
                        value={assignmentData.expiresAt}
                        onChange={(e) => setAssignmentData(prev => ({ ...prev, expiresAt: e.target.value }))}
                      />
                    </div>
                    
                    <div className="bg-blue-50 p-3 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>{selectedCourses.length}</strong> course(s) will be assigned to the selected company
                      </p>
                    </div>
                    
                    <div className="flex justify-end space-x-3">
                      <Button type="button" variant="outline" onClick={() => setShowBulkAssign(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleBulkAssign} disabled={bulkAssignMutation.isPending}>
                        {bulkAssignMutation.isPending ? "Assigning..." : "Assign Courses"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            
            <Button 
              className="bg-primary hover:bg-blue-700 text-white"
              onClick={() => setShowUpload(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Course
            </Button>
          </div>
        </div>

        {courses.length > 0 && (
          <>
            {/* Tag Filter */}
            {uniqueTags.length > 0 && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Filter by Tag</Label>
                <Select value={selectedTag} onValueChange={setSelectedTag}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="All tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tags</SelectItem>
                    {uniqueTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag.charAt(0).toUpperCase() + tag.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTag && (
                  <p className="text-xs text-gray-600 mt-1">
                    Showing {filteredCourses.length} of {courses.length} courses
                  </p>
                )}
              </div>
            )}

            <div className="mb-4 flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <Checkbox
                id="select-all"
                checked={selectedCourses.length === filteredCourses.length && filteredCourses.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <Label htmlFor="select-all" className="text-sm font-medium">
                Select All ({filteredCourses.length} courses{selectedTag ? ` with "${selectedTag}" tag` : ''})
              </Label>
            </div>
          </>
        )}

        {courses.length === 0 ? (
          <Card className="border-gray-200">
            <CardContent className="text-center py-16">
              <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Courses Yet</h3>
              <p className="text-gray-600 mb-6">Upload your first SCORM course to get started</p>
              <Button 
                className="bg-primary hover:bg-blue-700 text-white"
                onClick={() => setShowUpload(true)}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Course
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course: any) => (
              <Card 
                key={course.id} 
                className={`border-gray-200 hover:shadow-lg transition-all cursor-pointer ${
                  selectedCourses.includes(course.id) ? 'ring-2 ring-primary bg-blue-50' : ''
                }`}
                onClick={() => handleCourseSelect(course.id, !selectedCourses.includes(course.id))}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={selectedCourses.includes(course.id)}
                        onCheckedChange={(checked) => handleCourseSelect(course.id, checked as boolean)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                        <BookOpen className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-xs">
                        {course.scormType.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/course/${course.id}/preview`);
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            Preview Course
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setEditingCourseId(course.id);
                          }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Course
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-600 focus:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingCourseId(course.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Course
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Version {course.version}
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Created {new Date(course.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {course.description && (
                    <p className="text-sm text-gray-600 mt-3 line-clamp-2">
                      {course.description}
                    </p>
                  )}
                  {course.tags && course.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {course.tags.map((tag: string, index: number) => (
                        <Badge 
                          key={index} 
                          variant="secondary" 
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTag(tag);
                          }}
                        >
                          {tag.charAt(0).toUpperCase() + tag.slice(1)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {showUpload && (
          <CourseUpload 
            isOpen={showUpload} 
            onClose={() => setShowUpload(false)} 
          />
        )}

        {editingCourseId && (
          <CourseEdit
            courseId={editingCourseId}
            isOpen={!!editingCourseId}
            onClose={() => setEditingCourseId("")}
          />
        )}

        {/* Delete Course Confirmation Dialog */}
        <AlertDialog open={!!deletingCourseId} onOpenChange={() => setDeletingCourseId("")}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Course</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this course? This action will remove the course from all active views 
                but preserve its data in historical records (dispatches, analytics, etc.). This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeletingCourseId("")}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  if (deletingCourseId) {
                    deleteMutation.mutate(deletingCourseId);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Course"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
