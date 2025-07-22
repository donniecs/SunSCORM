import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Send, Building, BarChart3 } from "lucide-react";
import { useLocation } from "wouter";
import CourseUpload from "@/components/courses/course-upload";
import CreateDispatch from "@/components/dispatches/create-dispatch";

export default function QuickActions() {
  const [, setLocation] = useLocation();
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateDispatch, setShowCreateDispatch] = useState(false);

  const actions = [
    {
      icon: Upload,
      label: "Upload Course",
      action: () => setShowUpload(true),
    },
    {
      icon: Send,
      label: "Create Dispatch", 
      action: () => setShowCreateDispatch(true),
    },
    {
      icon: Building,
      label: "Add Tenant",
      action: () => setLocation("/tenants"),
    },
    {
      icon: BarChart3,
      label: "View Analytics",
      action: () => setLocation("/analytics"),
    },
  ];

  return (
    <>
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className="w-full justify-start h-12"
                onClick={action.action}
              >
                <Icon className="w-4 h-4 mr-2 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      {showUpload && (
        <CourseUpload 
          isOpen={showUpload} 
          onClose={() => setShowUpload(false)} 
        />
      )}

      {showCreateDispatch && (
        <CreateDispatch 
          isOpen={showCreateDispatch} 
          onClose={() => setShowCreateDispatch(false)} 
        />
      )}
    </>
  );
}
