'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  Menu, 
  X, 
  LayoutDashboard, 
  Users, 
  FileText, 
  Calendar, 
  Bed, 
  Skull, 
  LogOut,
  Hospital,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Settings,
  Activity,
  ClipboardList,
  UserCheck,
  Building,
  Stethoscope
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useUserRole } from '../userrole';

const Sidebar = () => {
  const { role, loading } = useUserRole();
  const [isOpen, setIsOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const pathname = usePathname()
  const router = useRouter()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
        <span className="ml-3 text-blue-700 font-medium text-sm">Loading...</span>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-red-600 font-medium text-sm">Access denied: User role not found.</span>
      </div>
    );
  }

  const toggleSidebar = () => setIsOpen(!isOpen)

  const toggleMenu = (menuName: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuName) 
        ? prev.filter(item => item !== menuName)
        : [...prev, menuName]
    )
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  type MenuItem = {
    title: string;
    icon: React.ElementType;
    href?: string;
    submenu: { title: string; href: string }[];
  };
  
  let menuItems: MenuItem[] = [];
  if (role === 'admin') {
    menuItems = [
      {
        title: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
        submenu: [],
      },
      {
        title: 'Admin Panel',
        icon: Users,
        submenu: [
          { title: 'June Backup', href: '/backup' },
          { title: 'OPD Admin', href: '/admin/opd-admin' },
          { title: 'IPD Admin', href: '/admin/ipd-admin' },
          { title: 'Patient Admin', href: '/admin/patient-admin' },
          { title: 'DPR', href: '/admin/dpr' },
          { title: 'OT Management', href: '/admin/ot' },
          { title: 'Collections', href: '/amount' },
        ]
      },
      {
        title: 'OPD',
        icon: Stethoscope,
        submenu: [
          { title: 'Appointments', href: '/opd/appointment' },
          { title: 'Patient List', href: '/opd/list' },
          { title: 'Prescriptions', href: '/opd/list/opdlistprescripitono' },
          { title: 'Add Doctor', href: '/opd/add-doctor' },
        ]
      },
      {
        title: 'IPD',
        icon: Bed,
        submenu: [
          { title: 'New Admission', href: '/ipd/appointment' },
          { title: 'Patient Management', href: '/ipd/management' },
          { title: 'Bed Management', href: '/ipd/bed-management' },
          { title: 'Add Doctor', href: '/ipd/add-doctor' },
          { title: 'Daily Reports', href: '/amount' },
        ]
      },
    ];
  } else if (role === 'opd-ipd') {
    menuItems = [
      {
        title: 'OPD',
        icon: Stethoscope,
        submenu: [
          { title: 'Appointments', href: '/opd/appointment' },
          { title: 'Patient List', href: '/opd/list' },
          { title: 'Prescriptions', href: '/opd/list/opdlistprescripitono' },
          { title: 'Add Doctor', href: '/opd/add-doctor' },
        ]
      },
      {
        title: 'IPD',
        icon: Bed,
        submenu: [
          { title: 'New Admission', href: '/ipd/appointment' },
          { title: 'Patient Management', href: '/ipd/management' },
          { title: 'Bed Management', href: '/ipd/bed-management' },
          { title: 'Add Doctor', href: '/ipd/add-doctor' },
          { title: 'Daily Reports', href: '/amount' },
        ]
      },
    ];
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Mobile toggle button */}
      <Button
        onClick={toggleSidebar}
        variant="outline"
        size="sm"
        className="fixed top-3 left-3 z-50 lg:hidden bg-white/90 backdrop-blur-sm shadow-sm border-gray-200/50"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Sidebar */}
      <div className={cn(
        "fixed left-0 top-0 h-full bg-white/95 backdrop-blur-sm border-r border-gray-200/80 z-50 transition-all duration-200 ease-out shadow-xl",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        "w-64"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/80">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-blue-500 rounded-lg shadow-sm">
              <Hospital className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">InfiPlus</h2>
              <p className="text-xs text-gray-600">Hospital System</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="lg:hidden hover:bg-blue-100/50 h-7 w-7 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 h-[calc(100vh-120px)]">
          <nav className="py-3">
            <ul className="space-y-1 px-2">
              {menuItems.map((item) => (
                <li key={item.title}>
                  {item.submenu.length > 0 ? (
                    <div>
                      <button
                        onClick={() => toggleMenu(item.title)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                          "hover:bg-gray-50 text-gray-700 hover:text-gray-900",
                          "group"
                        )}
                      >
                        <div className="flex items-center space-x-2">
                          <item.icon className="h-4 w-4 transition-colors group-hover:text-blue-600" />
                          <span className="text-xs">{item.title}</span>
                        </div>
                        <div className={cn(
                          "transition-transform duration-150",
                          expandedMenus.includes(item.title) ? "rotate-90" : ""
                        )}>
                          <ChevronRight className="h-3 w-3 text-gray-400" />
                        </div>
                      </button>
                      <div className={cn(
                        "overflow-hidden transition-all duration-200 ease-out",
                        expandedMenus.includes(item.title) ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
                      )}>
                        {Array.isArray(item.submenu) && (
                          <ul className="mt-1 space-y-0.5 ml-4 border-l border-gray-100">
                            {(item.submenu as { title: string; href: string }[]).map((subItem) => (
                              <li key={subItem.title}>
                                <Link
                                  href={(subItem.href ?? '/') as string}
                                  className={cn(
                                    "block px-3 py-1.5 text-xs rounded-md transition-all duration-150 ml-2",
                                    pathname === subItem.href
                                      ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-500 ml-0"
                                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                  )}
                                  onClick={() => setIsOpen(false)}
                                >
                                  {subItem.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Link
                      href={item.href ?? '/'}
                      className={cn(
                        "flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                        pathname === item.href
                          ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="text-xs">{item.title}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </ScrollArea>

        {/* User Info & Logout */}
        <div className="border-t border-gray-100 p-3 bg-gray-50/50">
          <div className="mb-2 px-3 py-2">
            <div className="text-xs font-medium text-gray-700 mb-0.5">Logged in as</div>
            <div className="text-xs text-gray-500 capitalize">{role.replace('-', ' ')} User</div>
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all duration-150 h-8"
          >
            <LogOut className="h-3 w-3 mr-2" />
            <span className="text-xs">Sign Out</span>
          </Button>
        </div>
      </div>

      {/* Main content spacer for desktop */}
      <div className="hidden lg:block w-64 flex-shrink-0" />
    </>
  )
}

export default Sidebar