import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart3 } from "lucide-react";

export default function ChartsSection() {
  const { data: standardsData, isLoading: standardsLoading, error: standardsError } = useQuery({
    queryKey: ["/api/dashboard/standards-distribution"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Launch Activity Chart */}
      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900">Launch Activity</CardTitle>
            <Select defaultValue="7days">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
            <p className="text-gray-500">Chart visualization coming soon</p>
          </div>
        </CardContent>
      </Card>

      {/* Standards Distribution */}
      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Standards Distribution</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {standardsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded-full mr-2 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
                  </div>
                  <div className="flex items-center">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full mr-2 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : standardsError ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-red-700 mb-2">Error Loading Data</h3>
              <p className="text-red-600 text-sm">
                {standardsError.message || "Failed to load standards distribution"}
              </p>
            </div>
          ) : !standardsData || standardsData.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No Data Available</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Upload some courses to see their standards distribution
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {standardsData.map((standard: any, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 ${standard.color} rounded-full mr-2`}></div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{standard.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      ({standard.value} course{standard.value !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full mr-2">
                      <div 
                        className={`h-2 ${standard.color} rounded-full transition-all duration-300`}
                        style={{ width: `${standard.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                      {standard.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
