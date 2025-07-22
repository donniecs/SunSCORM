import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Info } from "lucide-react";

interface CreateDispatchProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateDispatch({ isOpen, onClose }: CreateDispatchProps) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [maxCompletions, setMaxCompletions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["/api/courses"],
    enabled: isOpen,
    retry: false,
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["/api/tenants"],
    enabled: isOpen,
    retry: false,
  });

  // Check for previously disabled dispatches for the selected course and tenant
  const { data: disabledDispatches = [] } = useQuery({
    queryKey: ["/api/dispatches", "disabled", courseId, tenantId],
    queryFn: async () => {
      if (!courseId || !tenantId) return [];
      const response = await fetch(`/api/dispatches?courseId=${courseId}&tenantId=${tenantId}&includeDisabled=true`);
      if (!response.ok) return [];
      const dispatches = await response.json();
      return dispatches.filter((d: any) => d.isDisabled);
    },
    enabled: !!(courseId && tenantId),
    retry: false,
  });

  // Get course and tenant names for display
  const selectedCourse = courses.find((c: any) => c.id === courseId);
  const selectedTenant = tenants.find((t: any) => t.id === tenantId);
  const hasPreviouslyDisabledDispatch = disabledDispatches.length > 0;

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/dispatches", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Dispatch created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/recent-dispatches"] });
      onClose();
      resetForm();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      
      // Handle tenant not found error
      if (error.message?.includes("Tenant not found")) {
        toast({
          title: "Error",
          description: "You must select a company before creating a dispatch.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to create dispatch",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setName("");
    setCourseId("");
    setTenantId("");
    setMaxUsers("");
    setMaxCompletions("");
    setExpiresAt("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Dispatches must always be scoped to a tenant
    if (!name || !courseId || !tenantId) {
      toast({
        title: "Error",
        description: "Please fill in all required fields including company selection",
        variant: "destructive",
      });
      return;
    }

    const data = {
      name,
      courseId,
      tenantId,
      maxUsers: maxUsers ? parseInt(maxUsers) : null,
      maxCompletions: maxCompletions ? parseInt(maxCompletions) : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    createMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Dispatch</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Dispatch Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter dispatch name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tenantId">Company *</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {tenantsLoading ? (
                  <SelectItem value="loading" disabled>Loading companies...</SelectItem>
                ) : tenants.length === 0 ? (
                  <SelectItem value="no-tenants" disabled>No companies available</SelectItem>
                ) : (
                  tenants.map((tenant: any) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="courseId">Course *</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {coursesLoading ? (
                  <SelectItem value="loading" disabled>Loading courses...</SelectItem>
                ) : courses.length === 0 ? (
                  <SelectItem value="no-courses" disabled>No courses available</SelectItem>
                ) : (
                  courses.map((course: any) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Show alert if there's a previously disabled dispatch for this course and company */}
          {hasPreviouslyDisabledDispatch && selectedCourse && selectedTenant && (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <strong>{selectedCourse.title}</strong> was previously dispatched to <strong>{selectedTenant.name}</strong> but is now disabled. You may re-dispatch it.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxUsers">Max Users</Label>
              <Input
                id="maxUsers"
                type="number"
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value)}
                placeholder="Unlimited"
                min="1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxCompletions">Max Completions</Label>
              <Input
                id="maxCompletions"
                type="number"
                value={maxCompletions}
                onChange={(e) => setMaxCompletions(e.target.value)}
                placeholder="Unlimited"
                min="1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expiration Date</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createMutation.isPending}
              className="bg-primary hover:bg-blue-700"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
