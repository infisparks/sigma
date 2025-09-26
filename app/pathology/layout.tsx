// app/pathology/layout.tsx
"use client"

import type React from "react"
import Layout from "@/components/global/Layout" // Assuming your global layout is here
import { FlaskConical, Beaker, FileText, Microscope, Cog } from "lucide-react"

// Define the navigation items specific to the pathology section
const pathologyNavItems = [
  {
    href: "/pathology/dashboard",
    icon: <FlaskConical className="h-4 w-4" />,
    label: "Pathology Dashboard",
  },
  {
    href: "/pathology/test-requests",
    icon: <Beaker className="h-4 w-4" />,
    label: "Test Requests",
  },
  {
    href: "/pathology/lab-results",
    icon: <Microscope className="h-4 w-4" />,
    label: "Lab Results",
  },
  {
    href: "/pathology/reports",
    icon: <FileText className="h-4 w-4" />,
    label: "Reports",
  },
  {
    href: "/pathology/settings",
    icon: <Cog className="h-4 w-4" />,
    label: "Settings",
  },
]

interface PathologyLayoutProps {
  children: React.ReactNode
}

export default function PathologyLayout({ children }: PathologyLayoutProps) {
  return (
    // Your global Layout component will wrap every page in the pathology folder.
    // We render the Layout and pass children, but do not pass navItems directly (fixes type error).
    <Layout>
      {children}
    </Layout>
  )
}