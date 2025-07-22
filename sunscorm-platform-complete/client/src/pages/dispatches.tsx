import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Send, Calendar, Users, Clock, CheckCircle, MoreHorizontal, Ban, Download, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import CreateDispatch from "@/components/dispatches/create-dispatch";
import { LicenseStatusBadge } from "@/components/license/license-status";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";

export default function Dispatches() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dispatchToDelete, setDispatchToDelete] = useState<any>(null);

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

  const { data: dispatches = [], isLoading: dispatchesLoading, error } = useQuery({
    queryKey: ["/api/dispatches"],
    enabled: isAuthenticated,
    retry: false,
  });

  const disableMutation = useMutation({
    mutationFn: async (dispatchId: string) => {
      const response = await apiRequest("DELETE", `/api/dispatches/${dispatchId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Dispatch disabled successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      setShowDeleteConfirm(false);
      setDispatchToDelete(null);
    },
    onError: (error: any) => {
      console.error("Error disabling dispatch:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to disable dispatch",
        variant: "destructive",
      });
      setShowDeleteConfirm(false);
      setDispatchToDelete(null);
    },
  });

  const [exportProgress, setExportProgress] = useState<{[key: string]: number}>({});
  const [isExporting, setIsExporting] = useState<{[key: string]: boolean}>({});

  const handleExportDispatch = async (dispatchId: string, dispatchName: string) => {
    try {
      setIsExporting(prev => ({ ...prev, [dispatchId]: true }));
      setExportProgress(prev => ({ ...prev, [dispatchId]: 0 }));

      // Simulate progress for user feedback (in production, this would use WebSocket)
      const progressInterval = setInterval(() => {
        setExportProgress(prev => {
          const current = prev[dispatchId] || 0;
          if (current < 90) {
            return { ...prev, [dispatchId]: current + 10 };
          }
          return prev;
        });
      }, 200);

      const response = await fetch(`/api/dispatches/${dispatchId}/export`);
      
      clearInterval(progressInterval);
      setExportProgress(prev => ({ ...prev, [dispatchId]: 100 }));

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
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export dispatch package",
        variant: "destructive",
      });
    } finally {
      // Clean up progress state
      setTimeout(() => {
        setIsExporting(prev => ({ ...prev, [dispatchId]: false }));
        setExportProgress(prev => ({ ...prev, [dispatchId]: 0 }));
      }, 1000);
    }
  };

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

  if (isLoading || dispatchesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-end mb-8">
          <Button 
            className="bg-primary hover:bg-blue-700 text-white"
            onClick={() => setShowCreate(true)}
          >
            <Send className="w-4 h-4 mr-2" />
            Create Dispatch
          </Button>
        </div>

        {dispatches.length === 0 ? (
          <Card className="border-gray-200">
            <CardContent className="text-center py-16">
              <Send className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Dispatches Yet</h3>
              <p className="text-gray-600 mb-6">Create your first dispatch to start distributing courses</p>
              <Button 
                className="bg-primary hover:bg-blue-700 text-white"
                onClick={() => setShowCreate(true)}
              >
                <Send className="w-4 h-4 mr-2" />
                Create Dispatch
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dispatches.map((dispatch: any) => (
              <Card key={dispatch.id} className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                      <Send className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex items-center space-x-2">
                      <LicenseStatusBadge dispatchId={dispatch.id} />
                      <Badge className={`text-xs ${getStatusColor(dispatch.status)}`}>
                        {dispatch.status.charAt(0).toUpperCase() + dispatch.status.slice(1)}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setDispatchToDelete(dispatch);
                              setShowDeleteConfirm(true);
                            }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Disable Dispatch
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardTitle className="text-lg">{dispatch.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                    <div className="grid grid-cols-2 gap-2">
                      {dispatch.maxUsers && (
                        <div className="flex items-center">
                          <Users className="w-4 h-4 mr-2" />
                          Max Users: {dispatch.maxUsers}
                        </div>
                      )}
                      {dispatch.maxCompletions && (
                        <div className="flex items-center">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Max Completions: {dispatch.maxCompletions}
                        </div>
                      )}
                    </div>
                    {dispatch.expiresAt && (
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-2" />
                        Expires: {new Date(dispatch.expiresAt).toLocaleDateString()}
                      </div>
                    )}
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Created {new Date(dispatch.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    {isExporting[dispatch.id] && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                          <span>Exporting SCORM package...</span>
                          <span>{exportProgress[dispatch.id] || 0}%</span>
                        </div>
                        <Progress value={exportProgress[dispatch.id] || 0} className="h-2" />
                      </div>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleExportDispatch(dispatch.id, dispatch.name)}
                      disabled={dispatch.isDisabled || isExporting[dispatch.id]}
                    >
                      {isExporting[dispatch.id] ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      {dispatch.isDisabled 
                        ? 'Export Package (Disabled)' 
                        : isExporting[dispatch.id]
                        ? 'Exporting...'
                        : 'Export SCORM Package'
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {showCreate && (
          <CreateDispatch 
            isOpen={showCreate} 
            onClose={() => setShowCreate(false)} 
          />
        )}

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disable Dispatch</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to disable "{dispatchToDelete?.name}"? This will:
                <ul className="mt-2 list-disc list-inside space-y-1">
                  <li>Remove it from active use</li>
                  <li>Prevent new launches</li>
                  <li>Keep it in your dispatch history</li>
                  <li>Retain all associated statistics</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (dispatchToDelete?.id) {
                    disableMutation.mutate(dispatchToDelete.id);
                  }
                }}
                className="bg-red-600 hover:bg-red-700"
                disabled={disableMutation.isPending}
              >
                {disableMutation.isPending ? "Disabling..." : "Disable Dispatch"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
