import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Building2, Users, CheckCircle, Calendar, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { Tenant } from "@shared/schema";

interface TenantLicenseSettingsProps {
  tenant: Tenant;
  isOpen: boolean;
  onClose: () => void;
}

export default function TenantLicenseSettings({ tenant, isOpen, onClose }: TenantLicenseSettingsProps) {
  const [maxDispatchUsers, setMaxDispatchUsers] = useState("");
  const [maxCompletions, setMaxCompletions] = useState("");
  const [globalExpiration, setGlobalExpiration] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize form values when tenant changes
  useEffect(() => {
    if (tenant) {
      setMaxDispatchUsers(tenant.maxDispatchUsers?.toString() || "");
      setMaxCompletions(tenant.maxCompletions?.toString() || "");
      setGlobalExpiration(tenant.globalExpiration ? format(new Date(tenant.globalExpiration), "yyyy-MM-dd'T'HH:mm") : "");
    }
  }, [tenant]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", `/api/tenants/${tenant.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "License settings updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      onClose();
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
      toast({
        title: "Error",
        description: error.message || "Failed to update license settings",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      maxDispatchUsers: maxDispatchUsers ? parseInt(maxDispatchUsers) : null,
      maxCompletions: maxCompletions ? parseInt(maxCompletions) : null,
      globalExpiration: globalExpiration ? new Date(globalExpiration).toISOString() : null,
    };

    updateMutation.mutate(data);
  };

  const resetForm = () => {
    if (tenant) {
      setMaxDispatchUsers(tenant.maxDispatchUsers?.toString() || "");
      setMaxCompletions(tenant.maxCompletions?.toString() || "");
      setGlobalExpiration(tenant.globalExpiration ? format(new Date(tenant.globalExpiration), "yyyy-MM-dd'T'HH:mm") : "");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Building2 className="w-5 h-5" />
            <span>License Settings - {tenant.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Settings Overview */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Max Users</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tenant.maxDispatchUsers || "∞"}
                </div>
                <p className="text-xs text-gray-500">
                  {tenant.maxDispatchUsers ? "Limited" : "Unlimited"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Max Completions</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tenant.maxCompletions || "∞"}
                </div>
                <p className="text-xs text-gray-500">
                  {tenant.maxCompletions ? "Limited" : "Unlimited"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>Expiration</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold">
                  {tenant.globalExpiration ? format(new Date(tenant.globalExpiration), "MMM dd, yyyy") : "None"}
                </div>
                <p className="text-xs text-gray-500">
                  {tenant.globalExpiration ? "Limited" : "No expiration"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Warning about hierarchy */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-800 dark:text-yellow-400">Company-Level Enforcement</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  These settings override individual dispatch limits. If you set a company limit of 100 users, 
                  all dispatches for this company will be limited to 100 users total, regardless of their individual settings.
                </p>
              </div>
            </div>
          </div>

          {/* License Configuration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxDispatchUsers">Maximum Users</Label>
                <Input
                  id="maxDispatchUsers"
                  type="number"
                  value={maxDispatchUsers}
                  onChange={(e) => setMaxDispatchUsers(e.target.value)}
                  placeholder="Unlimited"
                  min="1"
                />
                <p className="text-xs text-gray-500">
                  Total unique users across all dispatches
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxCompletions">Maximum Completions</Label>
                <Input
                  id="maxCompletions"
                  type="number"
                  value={maxCompletions}
                  onChange={(e) => setMaxCompletions(e.target.value)}
                  placeholder="Unlimited"
                  min="1"
                />
                <p className="text-xs text-gray-500">
                  Total completions across all dispatches
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="globalExpiration">Global Expiration Date</Label>
              <Input
                id="globalExpiration"
                type="datetime-local"
                value={globalExpiration}
                onChange={(e) => setGlobalExpiration(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                All dispatches for this company will expire on this date
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                Reset
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                className="bg-primary hover:bg-blue-700"
              >
                {updateMutation.isPending ? "Updating..." : "Update Settings"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}