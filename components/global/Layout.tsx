'use client'

import React from 'react'
import Sidebar from './Sidebar'
import { UserRoleProvider } from '../userrole';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react'; // Import useState
import { useUserRole } from '../userrole';
import { cn } from '@/lib/utils'; // Assuming cn utility is available

interface LayoutProps {
  children: React.ReactNode
}

const COLLAPSED_STATE_KEY = 'sidebarCollapsed';

const Layout = ({ children }: LayoutProps) => {
  // Use state to manage the collapsed status of the sidebar
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    typeof window !== 'undefined' ? 
    localStorage.getItem(COLLAPSED_STATE_KEY) === 'true' : 
    false
  );

  const toggleSidebarCollapse = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLLAPSED_STATE_KEY, newState.toString());
    }
  };

  return (
    <UserRoleProvider>
      <RestrictedLayout 
        isSidebarCollapsed={isSidebarCollapsed} 
        toggleSidebarCollapse={toggleSidebarCollapse}
      >
        {children}
      </RestrictedLayout>
    </UserRoleProvider>
  );
}

function RestrictedLayout({ 
  children, 
  isSidebarCollapsed,
  toggleSidebarCollapse
}: { 
  children: React.ReactNode, 
  isSidebarCollapsed: boolean,
  toggleSidebarCollapse: () => void
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, loading } = useUserRole();

  useEffect(() => {
    if (loading) return;
    const isPathoEntry = role === 'patho-entry' || role === 'patho_entry' || role === 'pathoentry' || (role && role.trim().toLowerCase().replace(/[\s_-]+/g, '') === 'pathoentry');
    if (isPathoEntry) {
      const isAllowed = pathname.startsWith('/pathology/patient-entry') || 
                        pathname.startsWith('/pathology/dashboard') || 
                        pathname.startsWith('/pathology/edit-patient');
      if (!isAllowed) {
        router.replace('/pathology/patient-entry');
      }
      return;
    }

    const isOtherHospital = role === 'otherhospital' || role === 'other hospital' || (role && role.trim().toLowerCase().replace(/[\s_-]+/g, '') === 'otherhospital');
    if (isOtherHospital) {
      const isAllowed = pathname.startsWith('/pathology/patient-entry') || pathname.startsWith('/pathology/opd');
      if (!isAllowed) {
        router.replace('/pathology/patient-entry');
      }
      return;
    }

    if (role === 'opd-ipd') {
      // Restrict /dashboard and /admin/*
      if (
        pathname === '/dashboard' ||
        pathname.startsWith('/admin/') ||
        pathname === '/admin' 
      ) {
        router.replace('/pathology/dashboard');
      }
    }
  }, [role, loading, pathname, router]);

  const sidebarWidthClass = isSidebarCollapsed ? 'lg:ml-[5.5rem]' : 'lg:ml-64';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggleCollapse={toggleSidebarCollapse} 
      />
      <div className={cn("transition-all duration-200", sidebarWidthClass)}>
        <main className="p-1">
          <div className="max-w-full mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout