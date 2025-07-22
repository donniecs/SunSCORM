import { useState } from "react";
import { Bell, Search, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { GlobalSearch } from "./global-search";
import { UserProfileDropdown } from "./user-profile-dropdown";
import { SystemStatusIndicator } from "./system-status-safe";
import { DateRangeFilter } from "./date-range-filter";
import { format } from "date-fns";

const pageNames: Record<string, string> = {
  "/": "Dashboard",
  "/courses": "Courses",
  "/dispatches": "Dispatches",
  "/analytics": "Analytics",
  "/users": "Users",
  "/tenants": "Tenants",
  "/companies": "Companies",
  "/settings": "Settings",
};

const pageDescriptions: Record<string, string> = {
  "/": "Welcome back, monitor your SCORM platform performance",
  "/courses": "Manage your SCORM courses and content",
  "/dispatches": "Manage your SCORM dispatches and track usage",
  "/analytics": "Monitor performance and track learning outcomes",
  "/users": "Manage user accounts and permissions",
  "/tenants": "Manage organizations and multi-tenant settings",
  "/companies": "Manage companies and license settings",
  "/settings": "Configure your Sun-SCORM platform",
};

export default function Header() {
  const [location] = useLocation();
  const [showSearch, setShowSearch] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    to: new Date()
  });
  
  const pageName = pageNames[location] || "Page";
  const pageDescription = pageDescriptions[location] || "";

  const handleDateRangeChange = (range: { from: Date; to: Date }) => {
    setDateRange(range);
    // You can add logic here to filter dashboard data based on date range
    console.log("Date range changed:", range);
  };

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pageName}</h1>
            {pageDescription && (
              <p className="text-gray-600 dark:text-gray-400 truncate">{pageDescription}</p>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Global Search */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSearch(true)}
                className="flex items-center space-x-2 min-w-[200px] justify-start"
              >
                <Search className="w-4 h-4" />
                <span className="text-gray-500">Search platform...</span>
              </Button>
            </div>

            {/* Date Range Filter - Only show on dashboard */}
            {location === "/" && (
              <DateRangeFilter
                value={dateRange}
                onChange={handleDateRangeChange}
                className="hidden sm:flex"
              />
            )}

            {/* Environment Indicator */}
            <div className="hidden md:flex items-center space-x-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {process.env.NODE_ENV === 'production' ? 'PROD' : 'DEV'}
              </div>
            </div>

            {/* System Status */}
            <SystemStatusIndicator />

            {/* Notifications */}
            <Button variant="ghost" size="sm" className="p-2">
              <Bell className="w-4 h-4" />
            </Button>

            {/* User Profile */}
            <UserProfileDropdown />
          </div>
        </div>
      </div>

      {/* Global Search Modal */}
      <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} />
    </header>
  );
}
