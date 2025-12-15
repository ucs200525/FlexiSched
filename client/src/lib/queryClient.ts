import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (res.status === 401) {
    // Clear auth data on 401
    localStorage.removeItem("timetable_token");
    localStorage.removeItem("timetable_user");
    // Redirect to login page
    if (window.location.pathname !== '/login') {
      window.location.href = "/login?sessionExpired=true";
    }
    throw new Error("Session expired. Please log in again.");
  }
  
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Helper to get auth headers
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("timetable_token");
  const headers: Record<string, string> = {};
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey }) => {
    try {
      const headers = getAuthHeaders();
      const url = Array.isArray(queryKey) ? queryKey[0] : String(queryKey);
      const res = await fetch(url, { 
        headers,
        credentials: "include"
      });
      
      if (res.status === 401) {
        if (on401 === "returnNull") return null;
        // Let throwIfResNotOk handle the 401
      }
      
      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error("Query error:", error);
      throw error;
    }
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
