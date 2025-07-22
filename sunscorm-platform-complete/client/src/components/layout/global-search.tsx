import { useState, useEffect } from "react";
import { Search, X, FileText, Send, User, Building2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  status?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  type: 'course' | 'dispatch' | 'user' | 'tenant';
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [, setLocation] = useLocation();

  const { data: results, isLoading } = useQuery({
    queryKey: ['/api/search', query, selectedType],
    enabled: query.length > 2,
    refetchOnWindowFocus: false,
  });

  const handleResultClick = (result: SearchResult) => {
    switch (result.type) {
      case 'course':
        setLocation('/courses');
        break;
      case 'dispatch':
        setLocation('/dispatches');
        break;
      case 'user':
        setLocation('/users');
        break;
      case 'tenant':
        setLocation('/tenants');
        break;
    }
    onClose();
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'course':
        return <FileText className="w-4 h-4" />;
      case 'dispatch':
        return <Send className="w-4 h-4" />;
      case 'user':
        return <User className="w-4 h-4" />;
      case 'tenant':
        return <Building2 className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getResultTitle = (result: SearchResult) => {
    switch (result.type) {
      case 'course':
        return result.title;
      case 'dispatch':
        return result.name;
      case 'user':
        return `${result.firstName} ${result.lastName}`;
      case 'tenant':
        return result.name;
      default:
        return 'Unknown';
    }
  };

  const getResultSubtitle = (result: SearchResult) => {
    switch (result.type) {
      case 'course':
        return result.description;
      case 'dispatch':
        return `Status: ${result.status}`;
      case 'user':
        return result.email;
      case 'tenant':
        return 'Organization';
      default:
        return '';
    }
  };

  const typeFilters = [
    { value: '', label: 'All' },
    { value: 'course', label: 'Courses' },
    { value: 'dispatch', label: 'Dispatches' },
    { value: 'user', label: 'Users' },
    { value: 'tenant', label: 'Tenants' },
  ];

  const allResults = results ? [
    ...results.courses,
    ...results.dispatches,
    ...results.users,
    ...results.tenants,
  ] : [];

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedType("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Search Platform</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses, dispatches, users, or organizations..."
              className="pl-10 pr-4"
              autoFocus
            />
          </div>

          {/* Type Filters */}
          <div className="flex gap-2 flex-wrap">
            {typeFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={selectedType === filter.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {query.length <= 2 ? (
              <div className="text-center py-8 text-gray-500">
                Type at least 3 characters to search
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">Searching...</span>
              </div>
            ) : allResults.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No results found for "{query}"
              </div>
            ) : (
              <div className="space-y-2">
                {allResults.map((result) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleResultClick(result)}
                    className="p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors border"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-1">
                        {getResultIcon(result.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {getResultTitle(result)}
                          </h4>
                          <Badge variant="secondary" className="text-xs">
                            {result.type}
                          </Badge>
                        </div>
                        {getResultSubtitle(result) && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                            {getResultSubtitle(result)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}