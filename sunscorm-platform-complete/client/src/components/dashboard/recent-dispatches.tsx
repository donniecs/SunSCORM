import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";

export default function RecentDispatches() {
  const { toast } = useToast();
  
  const { data: dispatches = [], isLoading, error } = useQuery({
    queryKey: ["/api/dashboard/recent-dispatches"],
    retry: false,
  });

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
    <Card className="border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">Recent Dispatches</CardTitle>
          <a href="/dispatches" className="text-primary text-sm hover:text-blue-700">
            View all
          </a>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="divide-y divide-gray-200">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-6 py-4">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : dispatches.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <Send className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No dispatches yet</p>
            <p className="text-sm text-gray-500">Create your first dispatch to see it here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {dispatches.map((dispatch: any) => (
              <div key={dispatch.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                      <Send className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{dispatch.name}</p>
                      <p className="text-xs text-gray-500">
                        {dispatch.maxUsers ? `${dispatch.maxUsers} users` : 'Unlimited users'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge className={`text-xs ${getStatusColor(dispatch.status)}`}>
                      {dispatch.status.charAt(0).toUpperCase() + dispatch.status.slice(1)}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {new Date(dispatch.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
