import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Users, Calendar, Activity } from "lucide-react";
import { format } from "date-fns";

interface LicenseStatusProps {
  dispatchId: string;
  className?: string;
}

export default function LicenseStatus({ dispatchId, className }: LicenseStatusProps) {
  const { data: licenseInfo, isLoading, error } = useQuery({
    queryKey: ["/api/dispatches", dispatchId, "license-info"],
    queryFn: async () => {
      const response = await fetch(`/api/dispatches/${dispatchId}/license-info`);
      if (!response.ok) {
        throw new Error("Failed to fetch license information");
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-4">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-4">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">License info unavailable</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!licenseInfo) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "default";
      case "expired":
        return "destructive";
      case "limit_reached":
        return "destructive";
      case "warning":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="w-4 h-4" />;
      case "expired":
      case "limit_reached":
        return <AlertTriangle className="w-4 h-4" />;
      case "warning":
        return <Activity className="w-4 h-4" />;
      default:
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>License Status</span>
          <Badge variant={getStatusColor(licenseInfo.status || "active")} className="flex items-center space-x-1">
            {getStatusIcon(licenseInfo.status || "active")}
            <span>{licenseInfo.status ? licenseInfo.status.replace("_", " ") : "Active"}</span>
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User Usage */}
        {licenseInfo.userUsage && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Users</span>
              </div>
              <span className="font-medium">
                {licenseInfo.userUsage.current} / {licenseInfo.userUsage.limit || "∞"}
              </span>
            </div>
            {licenseInfo.userUsage.limit && (
              <Progress 
                value={(licenseInfo.userUsage.current / licenseInfo.userUsage.limit) * 100} 
                className="h-2"
              />
            )}
          </div>
        )}

        {/* Completion Usage */}
        {licenseInfo.completionUsage && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4" />
                <span>Completions</span>
              </div>
              <span className="font-medium">
                {licenseInfo.completionUsage.current} / {licenseInfo.completionUsage.limit || "∞"}
              </span>
            </div>
            {licenseInfo.completionUsage.limit && (
              <Progress 
                value={(licenseInfo.completionUsage.current / licenseInfo.completionUsage.limit) * 100} 
                className="h-2"
              />
            )}
          </div>
        )}

        {/* Expiration */}
        {licenseInfo.expiration && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>Expires</span>
              </div>
              <span className="font-medium">
                {format(new Date(licenseInfo.expiration), "MMM dd, yyyy")}
              </span>
            </div>
          </div>
        )}

        {/* Enforcement Level */}
        {licenseInfo.enforcementLevel && (
          <div className="text-xs text-gray-500 pt-2 border-t">
            <div className="flex items-center justify-between">
              <span>Enforcement Level</span>
              <Badge variant="outline" className="text-xs">
                {licenseInfo.enforcementLevel === "tenant" ? "Company" : "Dispatch"}
              </Badge>
            </div>
          </div>
        )}

        {/* Warnings */}
        {licenseInfo.warnings && licenseInfo.warnings.length > 0 && (
          <div className="space-y-2">
            {licenseInfo.warnings.map((warning: string, index: number) => (
              <div key={index} className="flex items-start space-x-2 text-sm text-yellow-600">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact version for inline use
export function LicenseStatusBadge({ dispatchId }: { dispatchId: string }) {
  const { data: licenseInfo, isLoading } = useQuery({
    queryKey: ["/api/dispatches", dispatchId, "license-info"],
    queryFn: async () => {
      const response = await fetch(`/api/dispatches/${dispatchId}/license-info`);
      if (!response.ok) {
        throw new Error("Failed to fetch license information");
      }
      return response.json();
    },
  });

  if (isLoading) {
    return <Badge variant="outline">Loading...</Badge>;
  }

  if (!licenseInfo) {
    return <Badge variant="destructive">Error</Badge>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "default";
      case "expired":
        return "destructive";
      case "limit_reached":
        return "destructive";
      case "warning":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <Badge variant={getStatusColor(licenseInfo.status || "active")}>
      {licenseInfo.status ? licenseInfo.status.replace("_", " ") : "Active"}
    </Badge>
  );
}