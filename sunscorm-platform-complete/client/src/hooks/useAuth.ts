import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { clearCSRFToken } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const isAuthenticated = !!user;
  const wasAuthenticatedRef = useRef(isAuthenticated);

  // Clear CSRF token when user logs out (was authenticated, now isn't)
  useEffect(() => {
    if (wasAuthenticatedRef.current && !isAuthenticated && !isLoading) {
      clearCSRFToken();
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading]);

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}
