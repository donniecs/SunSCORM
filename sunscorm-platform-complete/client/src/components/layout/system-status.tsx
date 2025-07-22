import { useState } from "react";
import { Activity, Database, HardDrive, Shield, Clock, AlertCircle, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface SystemHealth {
  database: { status: 'healthy' | 'unhealthy'; responseTime: number };
  storage: { status: 'healthy' | 'unhealthy'; totalCourses: number };
  auth: { status: 'healthy' | 'unhealthy' };
  lastUpdated: string;
}

interface SystemStatusProps {
  open: boolean;
  onClose: () => void;
}

export function SystemStatus({ open, onClose }: SystemStatusProps) {
  const { data: health, isLoading, refetch } = useQuery<SystemHealth>({
    queryKey: ['/api/system/health'],
    enabled: open,
    refetchInterval: 30000, // Refetch every 30 seconds when open
  });

  const getStatusColor = (status: 'healthy' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'unhealthy':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getStatusIcon = (status: 'healthy' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'unhealthy':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getOverallStatus = () => {
    if (!health) return 'unknown';
    
    const statuses = [
      health.database?.status || 'unknown',
      health.storage?.status || 'unknown', 
      health.auth?.status || 'unknown'
    ];
    return statuses.every(s => s === 'healthy') ? 'healthy' : 'unhealthy';
  };

  const getEnvironment = () => {
    return process.env.NODE_ENV || 'development';
  };

  const getEnvironmentColor = (env: string) => {
    switch (env) {
      case 'production':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'staging':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'development':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Activity className="w-5 h-5" />
            <span>System Status</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Environment Badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Environment</span>
            <Badge className={getEnvironmentColor(getEnvironment())}>
              {getEnvironment().toUpperCase()}
            </Badge>
          </div>

          {/* Overall Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Status</span>
            <Badge className={getStatusColor(getOverallStatus())}>
              <div className="flex items-center space-x-1">
                {getStatusIcon(getOverallStatus())}
                <span>{getOverallStatus().toUpperCase()}</span>
              </div>
            </Badge>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : health ? (
            <div className="space-y-3">
              {/* Database Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Database</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {health.database?.responseTime || 0}ms
                  </span>
                  <Badge variant="secondary" className={getStatusColor(health.database?.status || 'unhealthy')}>
                    {getStatusIcon(health.database?.status || 'unhealthy')}
                  </Badge>
                </div>
              </div>

              {/* Storage Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Storage</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {health.storage?.totalCourses || 0} courses
                  </span>
                  <Badge variant="secondary" className={getStatusColor(health.storage?.status || 'unhealthy')}>
                    {getStatusIcon(health.storage?.status || 'unhealthy')}
                  </Badge>
                </div>
              </div>

              {/* Authentication Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Authentication</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className={getStatusColor(health.auth?.status || 'unhealthy')}>
                    {getStatusIcon(health.auth?.status || 'unhealthy')}
                  </Badge>
                </div>
              </div>

              {/* Last Updated */}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>Last updated</span>
                </div>
                <span>
                  {formatDistanceToNow(new Date(health.lastUpdated || new Date()), { addSuffix: true })}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Failed to load system status
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SystemStatusIndicator() {
  const [showStatus, setShowStatus] = useState(false);
  
  const { data: health } = useQuery<SystemHealth>({
    queryKey: ['/api/system/health'],
    refetchInterval: 60000, // Refetch every minute
  });

  const getOverallStatus = () => {
    if (!health) return 'unknown';
    
    const statuses = [
      health.database?.status || 'unknown',
      health.storage?.status || 'unknown', 
      health.auth?.status || 'unknown'
    ];
    return statuses.every(s => s === 'healthy') ? 'healthy' : 'unhealthy';
  };

  const getIndicatorColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'unhealthy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowStatus(true)}
        className="flex items-center space-x-2"
      >
        <div className={`w-2 h-2 rounded-full ${getIndicatorColor(getOverallStatus())}`} />
        <Activity className="w-4 h-4" />
      </Button>
      
      <SystemStatus open={showStatus} onClose={() => setShowStatus(false)} />
    </>
  );
}