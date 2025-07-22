import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users as UsersIcon, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Users() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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

  if (isLoading) {
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
          <Button className="bg-primary hover:bg-blue-700 text-white">
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>

        <Card className="border-gray-200">
          <CardContent className="text-center py-16">
            <UsersIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">User Management</h3>
            <p className="text-gray-600">
              User management features are coming soon. Currently using Replit Auth for authentication.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
