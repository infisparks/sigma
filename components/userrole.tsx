import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation'; // Added usePathname
import { supabase } from '@/lib/supabase';

interface UserRoleContextType {
  role: string | null;
  loading: boolean;
}

const UserRoleContext = createContext<UserRoleContextType>({ role: null, loading: true });

export const useUserRole = () => useContext(UserRoleContext);

interface UserRoleProviderProps {
  children: ReactNode;
}

// Define allowed routes for technicians
// Define allowed routes for technicians
const TECHNICIAN_ALLOWED_ROUTES = [
  '/pathology/dashboard',
  '/pathology/download-report',
  '/pathology/edit-patient',
  '/pathology/blood-values'
];

// Define allowed routes for pharmacy
const PHARMACY_ALLOWED_ROUTES = [
  '/pharmacy/dashboard',
  '/pharmacy/billing',
  '/pharmacy/sales',
  '/pharmacy/inventory',
  '/pharmacy/vendors',
  '/pharmacy/purchases'
];

export const UserRoleProvider = ({ children }: UserRoleProviderProps) => {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname(); // Get the current URL path

  useEffect(() => {
    const fetchRoleAndProtectRoutes = async () => {
      // 1. Get Auth User
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace('/login');
        setLoading(false);
        return;
      }

      // 2. Fetch User Role
      let userRole: string | null = null;

      // Try fetching by ID
      let { data, error } = await supabase
        .from('user')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data) {
        userRole = data.role;
      } else {
        // Fallback: Try fetching by Email
        if (user.email) {
          const { data: emailData } = await supabase
            .from('user')
            .select('role')
            .eq('email', user.email)
            .single();

          if (emailData) {
            userRole = emailData.role;
          }
        }
      }

      // 3. Enforce Role-Based Access Control
      if (userRole === 'technician') {
        // Check if the current path starts with any allowed route
        const isAllowed = TECHNICIAN_ALLOWED_ROUTES.some(route =>
          pathname.startsWith(route)
        );

        if (!isAllowed) {
          // If they are on a forbidden page, kick them to dashboard
          router.replace('/pathology/dashboard');
          // Note: We don't return here, we still set the role so the UI loads
        }
      }

      if (userRole === 'pharmacy') {
        const isAllowed = PHARMACY_ALLOWED_ROUTES.some(route =>
          pathname.startsWith(route)
        );

        if (!isAllowed) {
          router.replace('/pharmacy/dashboard');
        }
      }

      setRole(userRole);
      setLoading(false);
    };

    fetchRoleAndProtectRoutes();

    // Re-run this check if the path changes (to prevent manual URL entry)
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        <span className="ml-4 text-blue-700 font-semibold">Loading...</span>
      </div>
    );
  }

  return (
    <UserRoleContext.Provider value={{ role, loading }}>
      {children}
    </UserRoleContext.Provider>
  );
};