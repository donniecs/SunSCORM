import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TenantLicenseSettings from "@/components/tenants/tenant-license-settings";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Building2, Plus, Settings, Users, CheckCircle, Calendar, AlertTriangle, BookOpen, Eye, Download, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import type { Tenant } from "@shared/schema";

export default function Tenants() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isLicenseDialogOpen, setIsLicenseDialogOpen] = useState(false);
  const [isDispatchViewOpen, setIsDispatchViewOpen] = useState(false);
  const [viewingTenant, setViewingTenant] = useState<Tenant | null>(null);
  const [newTenantName, setNewTenantName] = useState("");

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

  const { data: tenants = [], isLoading: tenantsLoading, error } = useQuery({
    queryKey: ["/api/tenants"],
    enabled: isAuthenticated,
  });

  const { data: tenantDispatches = [], isLoading: dispatchesLoading } = useQuery({
    queryKey: ["/api/dispatches", viewingTenant?.id, "includeDisabled"],
    queryFn: () => fetch(`/api/dispatches?tenantId=${viewingTenant?.id}&includeDisabled=true`).then(res => res.json()),
    enabled: isAuthenticated && !!viewingTenant?.id && isDispatchViewOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/tenants", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Company created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      setIsCreateDialogOpen(false);
      setNewTenantName("");
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
        description: error.message || "Failed to create company",
        variant: "destructive",
      });
    },
  });

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    
    createMutation.mutate({ name: newTenantName.trim() });
  };

  const openLicenseSettings = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsLicenseDialogOpen(true);
  };

  const openDispatchView = (tenant: Tenant) => {
    setViewingTenant(tenant);
    setIsDispatchViewOpen(true);
  };

  const handleExportDispatch = async (dispatchId: string, dispatchName: string) => {
    try {
      const response = await fetch(`/api/dispatches/${dispatchId}/export`);
      if (!response.ok) {
        throw new Error('Failed to export dispatch');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `dispatch-${dispatchName.replace(/[^a-z0-9]/gi, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Complete",
        description: "SCORM dispatch package downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export dispatch package",
        variant: "destructive",
      });
    }
  };

  const getLicenseStatus = (tenant: Tenant) => {
    const hasLimits = tenant.maxDispatchUsers || tenant.maxCompletions || tenant.globalExpiration;
    const isExpired = tenant.globalExpiration && new Date(tenant.globalExpiration) < new Date();
    
    if (isExpired) {
      return { status: "expired", color: "destructive" };
    }
    if (hasLimits) {
      return { status: "limited", color: "secondary" };
    }
    return { status: "unlimited", color: "default" };
  };

  if (isLoading || tenantsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <div className="text-center py-16">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-700 mb-2">Error Loading Companies</h3>
            <p className="text-red-600">
              {error.message || "Failed to load companies"}
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-end mb-8">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Company
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Company</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    placeholder="Enter company name"
                    required
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
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
        </div>

        {tenants.length === 0 ? (
          <Card className="border-gray-200 dark:border-gray-700">
            <CardContent className="text-center py-16">
              <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Companies Yet</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Create your first company to start managing users and dispatches.
              </p>
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="bg-primary hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Company
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tenants.map((tenant: Tenant) => {
              const licenseStatus = getLicenseStatus(tenant);
              
              return (
                <Card key={tenant.id} className="border-gray-200 dark:border-gray-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Building2 className="w-5 h-5" />
                        <span>{tenant.name}</span>
                      </CardTitle>
                      <Badge variant={licenseStatus.color}>
                        {licenseStatus.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                          <Users className="w-4 h-4" />
                          <span>Max Users</span>
                        </div>
                        <div className="font-medium">
                          {tenant.maxDispatchUsers || "Unlimited"}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                          <CheckCircle className="w-4 h-4" />
                          <span>Max Completions</span>
                        </div>
                        <div className="font-medium">
                          {tenant.maxCompletions || "Unlimited"}
                        </div>
                      </div>
                    </div>
                    
                    {tenant.globalExpiration && (
                      <div className="text-sm">
                        <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                          <Calendar className="w-4 h-4" />
                          <span>Expires</span>
                        </div>
                        <div className="font-medium">
                          {format(new Date(tenant.globalExpiration), "MMM dd, yyyy")}
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t space-y-2">
                      <Link href={`/companies/${tenant.id}`}>
                        <Button
                          variant="default"
                          className="w-full bg-primary hover:bg-primary/90"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View Profile
                        </Button>
                      </Link>
                      <Button
                        onClick={() => openDispatchView(tenant)}
                        variant="outline"
                        className="w-full"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Dispatches
                      </Button>
                      <Button
                        onClick={() => openLicenseSettings(tenant)}
                        variant="outline"
                        className="w-full"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        License Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* License Settings Dialog */}
        {selectedTenant && (
          <TenantLicenseSettings
            tenant={selectedTenant}
            isOpen={isLicenseDialogOpen}
            onClose={() => {
              setIsLicenseDialogOpen(false);
              setSelectedTenant(null);
            }}
          />
        )}

        {/* Company Dispatches Dialog */}
        <Dialog open={isDispatchViewOpen} onOpenChange={(open) => {
          setIsDispatchViewOpen(open);
          if (!open) {
            setViewingTenant(null);
          }
        }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Building2 className="w-5 h-5" />
                <span>{viewingTenant?.name} - Course Dispatches</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {dispatchesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : tenantDispatches.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Dispatches Yet</h3>
                  <p className="text-gray-600">
                    No courses have been assigned to this company yet. Use the "Assign to Company" button on the Courses page to add dispatches.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {tenantDispatches.map((dispatch: any) => (
                    <Card key={dispatch.id} className={`border-gray-200 ${dispatch.isDisabled ? 'opacity-60 bg-gray-50' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                dispatch.isDisabled ? 'bg-gray-100' : 'bg-blue-50'
                              }`}>
                                <BookOpen className={`w-5 h-5 ${dispatch.isDisabled ? 'text-gray-400' : 'text-primary'}`} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <h4 className={`font-medium ${dispatch.isDisabled ? 'text-gray-500' : 'text-gray-900'}`}>
                                    {dispatch.name}
                                  </h4>
                                  <Badge 
                                    variant={dispatch.isDisabled ? "destructive" : "default"}
                                    className="text-xs"
                                  >
                                    {dispatch.isDisabled ? "Disabled" : "Active"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-600">
                                  Created {new Date(dispatch.createdAt).toLocaleDateString()}
                                  {dispatch.isDisabled && dispatch.deletedAt && (
                                    <> • Disabled {new Date(dispatch.deletedAt).toLocaleDateString()}</>
                                  )}
                                </p>
                              </div>
                            </div>
                            
                            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Max Users:</span>
                                <div className={`font-medium ${dispatch.isDisabled ? 'text-gray-400' : ''}`}>
                                  {dispatch.maxUsers || "Unlimited"}
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-500">Max Completions:</span>
                                <div className={`font-medium ${dispatch.isDisabled ? 'text-gray-400' : ''}`}>
                                  {dispatch.maxCompletions || "Unlimited"}
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-500">Expires:</span>
                                <div className={`font-medium ${dispatch.isDisabled ? 'text-gray-400' : ''}`}>
                                  {dispatch.expiresAt ? format(new Date(dispatch.expiresAt), "MMM dd, yyyy") : "Never"}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="ml-4">
                            <Button
                              onClick={() => handleExportDispatch(dispatch.id, dispatch.name)}
                              variant="outline"
                              size="sm"
                              disabled={dispatch.isDisabled}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Export SCORM Package
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>SCORM Packages:</strong> Download the SCORM-compliant ZIP packages to upload to external LMS platforms like TalentLMS, Docebo, or Cornerstone OnDemand.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
