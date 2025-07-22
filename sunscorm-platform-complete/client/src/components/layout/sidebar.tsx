import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Sun, BarChart3, BookOpen, Send, Users, Building, Settings, LogOut } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: BarChart3 },
  { name: "Courses", href: "/courses", icon: BookOpen },
  { name: "Dispatches", href: "/dispatches", icon: Send },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
];

const management = [
  { name: "Users", href: "/users", icon: Users },
  { name: "Companies", href: "/companies", icon: Building },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <div className="w-64 bg-white shadow-lg border-r border-gray-200">
      <div className="flex items-center justify-center h-16 px-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Sun className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">Sun-SCORM</span>
        </div>
      </div>

      <nav className="mt-8">
        <div className="px-4 mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Main</h3>
        </div>
        <ul className="space-y-1 px-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "text-white bg-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <Icon className="w-4 h-4 mr-3" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="px-4 mt-8 mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Management</h3>
        </div>
        <ul className="space-y-1 px-2">
          {management.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "text-white bg-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <Icon className="w-4 h-4 mr-3" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile Section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {user?.firstName ? user.firstName[0] : user?.email?.[0]?.toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email || "User"}
            </p>
            <p className="text-xs text-gray-500">
              {user?.role === 'admin' ? 'Administrator' : 'User'}
            </p>
          </div>
          <button 
            onClick={() => window.location.href = '/api/logout'}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}