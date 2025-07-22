import { useState } from "react";
import { User, Settings, LogOut, Shield, Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User as UserType } from "@shared/schema";

export function UserProfileDropdown() {
  const [, setLocation] = useLocation();
  
  const { data: user, isLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const handleLogout = () => {
    window.location.href = '/api/logout';
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'company_admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'user':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-3 h-3" />;
      case 'company_admin':
        return <Building2 className="w-3 h-3" />;
      case 'user':
        return <User className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center space-x-2 h-10 px-2">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user.profileImageUrl || undefined} alt="Profile" />
            <AvatarFallback className="text-sm">
              {getInitials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {user.firstName || user.lastName ? `${user.firstName} ${user.lastName}` : 'User'}
            </span>
            <div className="flex items-center space-x-1">
              <Badge variant="secondary" className={`text-xs ${getRoleColor(user.role)}`}>
                <div className="flex items-center space-x-1">
                  {getRoleIcon(user.role)}
                  <span>{user.role.replace('_', ' ')}</span>
                </div>
              </Badge>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {user.firstName || user.lastName ? `${user.firstName} ${user.lastName}` : 'User'}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {user.email}
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <Badge variant="secondary" className={`text-xs ${getRoleColor(user.role)}`}>
                <div className="flex items-center space-x-1">
                  {getRoleIcon(user.role)}
                  <span>{user.role.replace('_', ' ')}</span>
                </div>
              </Badge>
              {user.tenantId && (
                <Badge variant="outline" className="text-xs">
                  Tenant: {user.tenantId}
                </Badge>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={() => setLocation('/settings')}>
          <Settings className="w-4 h-4 mr-2" />
          Account Settings
        </DropdownMenuItem>
        
        {user.role === 'admin' && (
          <DropdownMenuItem onClick={() => setLocation('/tenants')}>
            <Building2 className="w-4 h-4 mr-2" />
            Manage Tenants
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}