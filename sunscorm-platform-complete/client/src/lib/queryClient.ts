import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Cache for CSRF token to avoid repeated requests
let csrfTokenCache: string | null = null;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    console.error(`[API Error]: ${res.status} ${text}`);
    console.error(`[API Error URL]: ${res.url}`);
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Get CSRF token from server
 */
async function getCSRFToken(): Promise<string> {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  try {
    const response = await fetch('/api/csrf-token', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to get CSRF token');
    }
    
    const data = await response.json();
    csrfTokenCache = data.csrfToken;
    
    // Log CSRF token in development for debugging
    if (import.meta.env.DEV) {
      console.log('[CSRF Token]:', csrfTokenCache);
    }
    
    return csrfTokenCache;
  } catch (error) {
    console.error('Error getting CSRF token:', error);
    throw error;
  }
}

/**
 * Clear CSRF token cache (useful for auth state changes)
 */
export function clearCSRFToken() {
  csrfTokenCache = null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isFormData = data instanceof FormData;
  const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  
  // Get headers
  const headers: Record<string, string> = isFormData ? {} : (data ? { "Content-Type": "application/json" } : {});
  
  // Add CSRF token for state-changing requests
  if (isStateChanging) {
    try {
      const csrfToken = await getCSRFToken();
      headers['X-CSRF-Token'] = csrfToken;
    } catch (error) {
      console.error('Failed to get CSRF token:', error);
      // Try to clear cache and retry once
      clearCSRFToken();
      try {
        const csrfToken = await getCSRFToken();
        headers['X-CSRF-Token'] = csrfToken;
      } catch (retryError) {
        console.error('Failed to get CSRF token on retry:', retryError);
        throw new Error('Unable to get CSRF token for request');
      }
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
    credentials: "include",
  });

  // If we get a CSRF error, clear the token cache and let user retry
  if (res.status === 403) {
    const text = await res.text();
    if (text.includes('CSRF')) {
      clearCSRFToken();
    }
    // Re-create response object since we already read the body
    throw new Error(`403: ${text}`);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
