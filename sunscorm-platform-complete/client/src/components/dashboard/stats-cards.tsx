import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Send, Rocket, TrendingUp } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";

export default function StatsCards() {
  const { toast } = useToast();
  
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["/api/dashboard/stats"],
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-gray-200">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Courses",
      value: stats?.totalCourses || 0,
      icon: BookOpen,
      color: "bg-blue-50",
      iconColor: "text-primary",
      change: "+12%",
    },
    {
      title: "Active Dispatches", 
      value: stats?.activeDispatches || 0,
      icon: Send,
      color: "bg-green-50",
      iconColor: "text-green-600",
      change: "+8%",
    },
    {
      title: "Total Launches",
      value: stats?.totalLaunches || 0,
      icon: Rocket,
      color: "bg-purple-50", 
      iconColor: "text-purple-600",
      change: "+24%",
    },
    {
      title: "Completion Rate",
      value: `${stats?.completionRate || 0}%`,
      icon: TrendingUp,
      color: "bg-yellow-50",
      iconColor: "text-yellow-600",
      change: "+2.1%",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} className="border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center`}>
                  <Icon className={`${card.iconColor} w-6 h-6`} />
                </div>
              </div>
              <div className="mt-4 flex items-center">
                <span className="text-green-600 text-sm font-medium">{card.change}</span>
                <span className="text-gray-500 text-sm ml-2">from last month</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
