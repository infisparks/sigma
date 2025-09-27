'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  Menu, 
  X, 
  LayoutDashboard, 
  Users, 
  FileText, 
  Bed, 
  LogOut,
  Hospital,
  ChevronRight,
  UserPlus,
  Settings,
  Stethoscope,
  FlaskConical,
  Package,
  Clock,
  Scan, 
  ChevronLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useUserRole } from '../userrole' 

// Define the menu items
const pathologyMenuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/pathology/dashboard', roles: ['admin', 'technician', 'phlebo'] },
  { icon: UserPlus, label: 'Patient Entry', href: '/pathology/patient-entry', roles: ['admin', 'technician'] },
  { icon: Clock, label: 'Turn Around Time', href: '/pathology/turnAroundTime', roles: ['admin'] },
  { icon: Users, label: 'Deleted Entry', href: '/pathology/deleted', roles: ['admin'] },
  { icon: FlaskConical, label: 'Billing', href: '/pathology/billing', roles: ['admin'] },
  { icon: FlaskConical, label: 'Blood Tests', href: '/pathology/blood-tests', roles: ['admin'] },
  { icon: Package, label: 'Packages', href: '/pathology/packages', roles: ['admin'] },
];

const xrayMenuItems = [
  { title: 'X-ray Entry', href: '/pathology/x-ray' },
  { title: 'X-ray Dashboard', href: '/pathology/x-rayDashboard' },
];

interface SidebarProps {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggleCollapse }) => {
  const { role, loading } = useUserRole();
  const [isOpen, setIsOpen] = useState(false) // Mobile state
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]) // Expanded state for full sidebar
  const [activeFlyout, setActiveFlyout] = useState<{ title: string; top: number; submenu: SubMenuItem[] } | null>(null); // Flyout state for collapsed sidebar
  
  const pathname = usePathname()
  const router = useRouter()
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close flyout when collapsing from full view
  useEffect(() => {
    if (!isCollapsed) {
        setActiveFlyout(null);
    }
  }, [isCollapsed]);


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

  const toggleMobileSidebar = () => setIsOpen(!isOpen)
  
  // Close flyout on any route change or external click
  const closeFlyout = () => setActiveFlyout(null);


  const toggleMenu = (item: MenuItem, buttonRef: React.RefObject<HTMLButtonElement>) => {
    if (isCollapsed) {
        // Handle Flyout menu
        if (activeFlyout?.title === item.title) {
            closeFlyout();
        } else {
            // Calculate position of the flyout based on the clicked button
            const rect = buttonRef.current?.getBoundingClientRect();
            if (rect) {
                setActiveFlyout({ 
                    title: item.title, 
                    top: rect.top, // Use absolute screen position
                    submenu: item.submenu 
                });
            }
        }
    } else {
        // Handle standard expanded accordion menu
        setExpandedMenus(prev => 
            prev.includes(item.title) 
              ? prev.filter(name => name !== item.title)
              : [...prev, item.title]
        )
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  type SubMenuItem = { title: string; href: string };

  type MenuItem = {
    title: string;
    icon: React.ElementType;
    href?: string;
    submenu: SubMenuItem[];
  };
  
  // Dynamically build the menu items based on the user's role
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
      // Admin sees a separate X-ray group
      {
        title: 'X-ray',
        icon: Scan,
        submenu: xrayMenuItems,
      },
      // Admin sees all other pathology links
      {
        title: 'Pathology',
        icon: FlaskConical,
        submenu: pathologyMenuItems.map(item => ({ title: item.label, href: item.href }))
      }
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
  } else if (role === 'xray') {
    // X-ray role only sees the dedicated X-ray group
    menuItems = [
      {
        title: 'X-ray',
        icon: Scan,
        submenu: xrayMenuItems,
      }
    ];
  } else if (['technician', 'phlebo'].includes(role)) {
    // Technician/Phlebo only see their specific pathology links (excluding X-ray)
    menuItems = [
      {
        title: 'Pathology',
        icon: FlaskConical,
        submenu: pathologyMenuItems
          .filter(item => item.roles.includes(role as 'technician' | 'phlebo'))
          .map(item => ({ title: item.label, href: item.href }))
      }
    ];
  }

  // Determine width based on collapse state
  const sidebarWidthClass = isCollapsed ? 'w-[5.5rem]' : 'w-64';

  // Create refs for menu buttons that can open a flyout
  const menuRefs = useRef<{ [key: string]: React.RefObject<HTMLButtonElement> }>({});
  menuItems.forEach(item => {
    if (item.submenu.length > 0) {
      // Initialize ref only for items that have submenus
      menuRefs.current[item.title] = React.createRef<HTMLButtonElement>() as React.RefObject<HTMLButtonElement>;
    }
  });

  return (
    <>
      {/* Invisible overlay for flyout menu close mechanism */}
      {activeFlyout && (
          <div 
              className="fixed inset-0 z-40 lg:block hidden"
              onClick={closeFlyout}
          />
      )}

      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={toggleMobileSidebar}
        />
      )}

      {/* Mobile toggle button */}
      <Button
        onClick={toggleMobileSidebar}
        variant="outline"
        size="sm"
        className="fixed top-3 left-3 z-50 lg:hidden bg-white/90 backdrop-blur-sm shadow-sm border-gray-200/50"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        className={cn(
        "fixed left-0 top-0 h-full bg-white/95 backdrop-blur-sm border-r border-gray-200/80 z-50 transition-all duration-200 ease-out shadow-xl",
        isOpen ? "translate-x-0" : "-translate-x-full", // Mobile state
        sidebarWidthClass, // Desktop collapse state
        "lg:translate-x-0" // Always visible on desktop
      )}>
        {/* Header and Collapse Button */}
        <div className={cn(
            "flex items-center p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 transition-all duration-200",
            isCollapsed ? 'justify-center' : 'justify-between'
        )}>
            <div className={cn(
                "flex items-center space-x-2 transition-opacity duration-200",
                isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'
            )}>
                <div className="p-1.5 bg-blue-500 rounded-lg shadow-sm">
                    <Hospital className="h-4 w-4 text-white" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-gray-900">InfiPlus</h2>
                    <p className="text-xs text-gray-600">Hospital System</p>
                </div>
            </div>
            
            <div className="flex items-center">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleMobileSidebar}
                    className="lg:hidden hover:bg-blue-100/50 h-7 w-7 p-0"
                >
                    <X className="h-3 w-3" />
                </Button>
                {/* Desktop Collapse Toggle */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleCollapse}
                    className={cn(
                        "hidden lg:flex hover:bg-blue-100/50 h-7 w-7 p-0 transition-transform duration-200",
                        isCollapsed ? 'rotate-180' : ''
                    )}
                >
                    <ChevronLeft className="h-4 w-4 text-gray-500" />
                </Button>
            </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 h-[calc(100vh-120px)]">
          <nav className="py-3">
            <ul className="space-y-1 px-2">
              {menuItems.map((item) => (
                <li key={item.title}>
                  {item.submenu.length > 0 ? (
                    <div>
                        {/* Parent Menu Toggle/Link */}
                        <button
                          ref={menuRefs.current[item.title]} // Attach ref
                          onClick={() => toggleMenu(item, menuRefs.current[item.title]!)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150 group",
                            "hover:bg-gray-50 text-gray-700 hover:text-gray-900",
                            isCollapsed ? 'justify-center' : '', // Center icon when collapsed
                            (isCollapsed && activeFlyout?.title === item.title) ? 'bg-blue-50 text-blue-700' : '' // Highlight active flyout button
                          )}
                        >
                            <div className={cn("flex items-center space-x-2 w-full", isCollapsed ? 'justify-center' : '')}>
                                <item.icon className="h-4 w-4 transition-colors group-hover:text-blue-600" />
                                {/* Label shown only when NOT collapsed */}
                                {!isCollapsed && <span className="text-xs">{item.title}</span>}
                            </div>
                            {/* Chevron shown only when NOT collapsed */}
                            {!isCollapsed && (
                                <div className={cn(
                                    "transition-transform duration-150",
                                    expandedMenus.includes(item.title) ? "rotate-90" : ""
                                )}>
                                    <ChevronRight className="h-3 w-3 text-gray-400" />
                                </div>
                            )}
                        </button>
                      
                        {/* Submenu: Hide completely when collapsed */}
                        {!isCollapsed && (
                          <div className={cn(
                            "overflow-hidden transition-all duration-200 ease-out",
                            expandedMenus.includes(item.title) ? "max-h-96 opacity-100" : "max-h-0 opacity-0" 
                          )}>
                            {Array.isArray(item.submenu) && (
                              <ul className="mt-1 space-y-0.5 ml-4 border-l border-gray-100">
                                {(item.submenu as SubMenuItem[]).map((subItem) => (
                                  <li key={subItem.title}>
                                    <Link
                                      href={subItem.href}
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
                        )}
                    </div>
                  ) : (
                    // Single-level Link (always clickable)
                    <Link
                      href={item.href ?? '/'}
                      className={cn(
                        "flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                        pathname === item.href
                          ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
                        isCollapsed ? 'justify-center' : ''
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <item.icon className="h-4 w-4" />
                      {/* Label shown only when NOT collapsed */}
                      {!isCollapsed && <span className="text-xs">{item.title}</span>}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </ScrollArea>

        {/* User Info & Logout */}
        <div className="border-t border-gray-100 p-3 bg-gray-50/50">
          {/* User Info shown only when NOT collapsed */}
          {!isCollapsed && (
            <div className="mb-2 px-3 py-2">
              <div className="text-xs font-medium text-gray-700 mb-0.5">Logged in as</div>
              <div className="text-xs text-gray-500 capitalize">{role.replace('-', ' ')} User</div>
            </div>
          )}
          <Button
            onClick={handleLogout}
            variant="ghost"
            size="sm"
            className={cn(
                "w-full text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all duration-150 h-8",
                isCollapsed ? 'justify-center' : 'justify-start'
            )}
          >
            <LogOut className="h-3 w-3 mr-2" />
            {!isCollapsed && <span className="text-xs">Sign Out</span>}
          </Button>
        </div>
      </div>
      
      {/* Flyout Menu (Desktop only, when sidebar is collapsed) */}
      {isCollapsed && activeFlyout && (
          <div 
              style={{ top: activeFlyout.top }}
              className={cn(
                "absolute left-[5.5rem] mt-[-3px] w-48 bg-white border border-gray-200 rounded-lg shadow-2xl z-50 transition-all duration-100 ease-out p-1",
                "hidden lg:block" // Ensure it's only for desktop collapsed state
              )}
          >
              <p className="text-xs font-semibold text-gray-800 px-2 py-1 mb-1 border-b border-gray-100">
                  {activeFlyout.title}
              </p>
              <ul className="space-y-0.5">
                  {activeFlyout.submenu.map((subItem) => (
                      <li key={subItem.title}>
                          <Link
                              href={subItem.href}
                              className={cn(
                                  "block px-3 py-1.5 text-xs rounded-md transition-all duration-150",
                                  pathname === subItem.href
                                      ? "bg-blue-50 text-blue-700 font-medium"
                                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                              )}
                              onClick={closeFlyout} // Close flyout on click
                          >
                              {subItem.title}
                          </Link>
                      </li>
                  ))}
              </ul>
          </div>
      )}

      {/* Main content spacer for desktop */}
      {/* We use the same width class here */}
      <div className={cn(
          "hidden lg:block flex-shrink-0 transition-all duration-200",
          isCollapsed ? 'w-[5.5rem]' : 'w-64'
      )} />
    </>
  )
}

export default Sidebar