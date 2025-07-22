import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  ArrowLeft, 
  Calendar, 
  Users, 
  BookOpen, 
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import type { Tenant, Dispatch, Course } from "@shared/schema";

export default function CompanyProfile() {
  const { id: companyId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();

  // Fetch company details
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["/api/tenants", companyId],
    queryFn: () => fetch(`/api/tenants/${companyId}`).then(res => res.json()),
    enabled: isAuthenticated && !!companyId,
  });

  // Fetch company dispatches
  const { data: dispatches = [], isLoading: dispatchesLoading } = useQuery({
    queryKey: ["/api/dispatches", companyId],
    queryFn: () => fetch(`/api/dispatches?tenantId=${companyId}`).then(res => res.json()),
    enabled: isAuthenticated && !!companyId,
  });

  // Fetch all courses to resolve course titles
  const { data: allCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["/api/courses"],
    enabled: isAuthenticated,
  });

  const isLoading = companyLoading || dispatchesLoading || coursesLoading;

  // Helper function to get course title from courseId
  const getCourseTitle = (courseId: string) => {
    const course = allCourses.find((c: Course) => c.id === courseId);
    return course?.title || "Unknown Course";
  };

  // Helper function to handle SCORM package export
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

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Access Denied</h1>
            <p className="text-gray-600 dark:text-gray-300">Admin access required to view company profiles.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!company) {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Company Not Found</h1>
            <p className="text-gray-600 dark:text-gray-300 mb-4">The requested company could not be found.</p>
            <Link href="/companies">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Companies
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link href="/companies">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Companies
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <Building2 className="w-6 h-6" />
                <span>{company.name}</span>
              </h1>
              <p className="text-gray-600 dark:text-gray-300">Company Profile & Course Management</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Section 1: Company Overview */}
          <Card className="border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Building2 className="w-5 h-5" />
                <span>Company Overview</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Company Name</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{company.name}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Company ID</div>
                  <div className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {company.id}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {company.createdAt ? format(new Date(company.createdAt), "MMM dd, yyyy") : "Unknown"}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Assigned Courses</div>
                  <div className="text-lg font-semibold text-primary">{dispatches.length}</div>
                </div>
              </div>

              {/* License Information */}
              <Separator className="my-6" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>Max Users</span>
                  </div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {company.maxDispatchUsers || "Unlimited"}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                    <CheckCircle className="w-4 h-4" />
                    <span>Max Completions</span>
                  </div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {company.maxCompletions || "Unlimited"}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                    <Calendar className="w-4 h-4" />
                    <span>License Expiration</span>
                  </div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {company.globalExpiration ? format(new Date(company.globalExpiration), "MMM dd, yyyy") : "Never"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Assigned Courses */}
          <Card className="border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5" />
                <span>Assigned Courses</span>
                <Badge variant="secondary">{dispatches.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dispatches.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Courses Assigned</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    This company has no course dispatches. Use the "Assign to Company" feature on the Courses page to add some.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {dispatches.map((dispatch: Dispatch) => (
                    <Card key={dispatch.id} className="border-gray-100 dark:border-gray-800">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {getCourseTitle(dispatch.courseId)}
                              </h4>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Assigned {dispatch.createdAt ? format(new Date(dispatch.createdAt), "MMM dd, yyyy") : "Unknown"}
                                {dispatch.isDisabled && dispatch.deletedAt && (
                                  <span className="block text-xs text-red-600 dark:text-red-400">
                                    Disabled {format(new Date(dispatch.deletedAt), "MMM dd, yyyy")}
                                  </span>
                                )}
                              </p>
                            </div>
                            <Badge 
                              variant={dispatch.isDisabled ? 'secondary' : 'default'}
                              className="ml-2"
                            >
                              {dispatch.isDisabled ? '🧾 Disabled' : '✅ Active'}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Max Users:</span>
                              <div className="font-medium">{dispatch.maxUsers || "Unlimited"}</div>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Expires:</span>
                              <div className="font-medium">
                                {dispatch.expiresAt ? format(new Date(dispatch.expiresAt), "MMM dd") : "Never"}
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                            <Button
                              onClick={() => handleExportDispatch(dispatch.id, dispatch.name)}
                              variant="outline"
                              size="sm"
                              className="w-full text-xs"
                              disabled={dispatch.isDisabled}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              {dispatch.isDisabled ? 'Export Package (Disabled)' : 'Export SCORM Package'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Raw Dispatch Table */}
          {dispatches.length > 0 && (
            <Card className="border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ExternalLink className="w-5 h-5" />
                  <span>Dispatch Records</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Dispatch ID</th>
                        <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Course Title</th>
                        <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Created</th>
                        <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Expires</th>
                        <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Max Users</th>
                        <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Status</th>
                        <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Disabled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatches.map((dispatch: Dispatch) => (
                        <tr key={dispatch.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="p-3">
                            <div className="font-mono text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded max-w-32 truncate">
                              {dispatch.id}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {getCourseTitle(dispatch.courseId)}
                            </div>
                          </td>
                          <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                            {dispatch.createdAt ? format(new Date(dispatch.createdAt), "MMM dd, yyyy") : "Unknown"}
                          </td>
                          <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                            {dispatch.expiresAt ? format(new Date(dispatch.expiresAt), "MMM dd, yyyy") : "Never"}
                          </td>
                          <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                            {dispatch.maxUsers || "Unlimited"}
                          </td>
                          <td className="p-3">
                            <Badge variant={dispatch.status === 'active' ? 'default' : 'secondary'}>
                              {dispatch.status}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant={dispatch.isDisabled ? 'destructive' : 'default'}>
                              {dispatch.isDisabled ? 'Yes' : 'No'}
                            </Badge>
                            {dispatch.isDisabled && dispatch.deletedAt && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {format(new Date(dispatch.deletedAt), "MMM dd, yyyy")}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}