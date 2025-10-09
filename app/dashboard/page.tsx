// page.tsx
"use client"

import type React from "react"
import Layout from "@/components/global/Layout" // Your global layout component
import { useDashboardData } from "./useDashboardData" // The custom hook
import DashboardUI from "./DashboardUI" // The UI component

// Register Chart.js components globally once in the main client component file or a dedicated setup file
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js"
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const DashboardPage: React.FC = () => {
  // Use the custom hook to manage all state and logic
  const dashboardData = useDashboardData()

  return (
    <Layout>
      {/* Pass all state, computed data, and handlers to the UI component */}
      <DashboardUI {...dashboardData} />
    </Layout>
  )
}

export default DashboardPage