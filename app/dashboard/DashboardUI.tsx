// DashboardUI.tsx
import React from "react"
import { Bar } from "react-chartjs-2"
import {
  format,
  parseISO,
} from "date-fns"
import {
  Search,
  Activity,
  DollarSign,
  Layers,
  Stethoscope,
  Filter,
  RefreshCw,
  CalendarDays,
  Clock,
  User,
  FileText,
  CreditCard,
  UserCheck,
  Heart,
  X,
} from "lucide-react"

// Shadcn/ui components
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  FilterState,
  CombinedAppointment,
  OPDAppointmentDisplay,
  IPDAppointmentDisplay,
  OTAppointmentDisplay,
  PatientInfo,
  DashboardStats,
  IpdTotals,
  IModality,
} from "./useDashboardData" // Import types from the hook

// Helper functions (could be moved to a shared utils file)
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// Props interface for the UI component
interface DashboardUIProps {
  filters: FilterState
  isLoading: boolean
  statistics: DashboardStats
  filteredAppointments: CombinedAppointment[]
  searchedPatients: PatientInfo[]
  currentDateRange: { displayStart: string; displayEnd: string }
  ipdTotals: IpdTotals | null
  doctorConsultChartData: any
  chartData: any
  doctorConsultations: { doctorName: string; count: number }[]

  selectedAppointment: CombinedAppointment | null
  isModalOpen: boolean
  modalLoading: boolean
  selectedPatientForAppointments: PatientInfo | null
  patientAppointmentsModalOpen: boolean
  patientAppointmentsLoading: boolean
  patientAllAppointments: CombinedAppointment[]
  totalDownloadedBytes: number
  searchDownloadedBytes: number

  handleFilterChange: (upd: Partial<FilterState>) => void
  handleDateRangeChange: (startStr: string, endStr: string) => void
  resetFilters: () => void
  openModal: (app: CombinedAppointment) => void
  closeModal: () => void
  openPatientAppointmentsModal: (patient: PatientInfo) => void
  closePatientAppointmentsModal: () => void
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>
}

const DashboardUI: React.FC<DashboardUIProps> = ({
  filters,
  isLoading,
  statistics,
  filteredAppointments,
  searchedPatients,
  currentDateRange,
  ipdTotals,
  doctorConsultChartData,
  chartData,
  doctorConsultations,
  selectedAppointment,
  isModalOpen,
  modalLoading,
  selectedPatientForAppointments,
  patientAppointmentsModalOpen,
  patientAppointmentsLoading,
  patientAllAppointments,
  totalDownloadedBytes,
  searchDownloadedBytes,
  handleFilterChange,
  handleDateRangeChange,
  resetFilters,
  openModal,
  closeModal,
  openPatientAppointmentsModal,
  closePatientAppointmentsModal,
  setFilters,
}) => {
  const getBadgeColor = (t: string) => {
    switch (t) {
      case "OPD":
        return "bg-sky-100 text-sky-800"
      case "IPD":
        return "bg-orange-100 text-orange-800"
      case "OT":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getFilterTitle = () => {
    const { filterType } = filters
    const { displayStart, displayEnd } = currentDateRange

    switch (filterType) {
      case "today":
        return `Today's Data (${format(parseISO(displayStart), "MMM dd, yyyy")})`
      case "month":
        return `${format(parseISO(filters.selectedMonth + "-01"), "MMMM yyyy")} Data`
      case "dateRange":
        if (!filters.startDate || !filters.endDate) return "Select date range"
        return `${format(parseISO(filters.startDate), "MMM dd")} - ${format(parseISO(filters.endDate), "MMM dd, yyyy")}`
      case "week":
      default:
        return `Week: ${format(parseISO(displayStart), "MMM dd")} - ${format(parseISO(displayEnd), "MMM dd, yyyy")}`
    }
  }

  const getModalitiesSummary = (mods: IModality[]) => {
    const counts = {
      consultation: mods.filter((m) => m.type === "consultation").length,
      casualty: mods.filter((m) => m.type === "casualty").length,
      xray: mods.filter((m) => m.type === "xray").length,
      custom: mods.filter((m) => m.type === "custom").length,
      pathology: mods.filter((m) => m.type === "pathology").length,
      radiology: mods.filter((m) => m.type === "radiology").length,
      ipd: mods.filter((m) => m.type === "ipd").length,
    }
    const parts: string[] = []
    if (counts.consultation) parts.push(`${counts.consultation} Consultation${counts.consultation > 1 ? "s" : ""}`)
    if (counts.casualty) parts.push(`${counts.casualty} Casualty`)
    if (counts.xray) parts.push(`${counts.xray} X-ray${counts.xray > 1 ? "s" : ""}`)
    if (counts.pathology) parts.push(`${counts.pathology} Pathology`)
    if (counts.radiology) parts.push(`${counts.radiology} Radiology`)
    if (counts.ipd) parts.push(`${counts.ipd} IPD Service${counts.ipd > 1 ? "s" : ""}`)
    if (counts.custom) parts.push(`${counts.custom} Custom Service${counts.custom > 1 ? "s" : ""}`)
    return parts.join(", ") || "No services"
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-[1600px] mx-auto">
        {/* Header & Search */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-lg">
          <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <div className="p-2 bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg mr-3 shadow-md">
                <Activity className="text-white h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                INFIPLUS HOSPITAL
              </h1>
            </div>
            <div className="relative w-full md:w-1/3">
              <Search className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
              <Input
                type="text"
                placeholder="Search by name, phone, or UHID (min 3 chars)"
                value={filters.searchQuery}
                onChange={(e) => setFilters((p) => ({ ...p, searchQuery: e.target.value }))}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 transition shadow-sm"
              />
              {filters.searchQuery.length >= 3 && searchDownloadedBytes > 0 && (
                <p className="absolute -bottom-5 right-0 text-xs text-gray-500">
                  Downloaded: {formatBytes(searchDownloadedBytes)}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="p-6">
          {/* Advanced Filters (Hidden when searching) */}
          {!filters.searchQuery && (
            <div className="bg-white rounded-xl shadow-lg mb-6 p-6 border border-gray-100">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center mb-4 lg:mb-0">
                  <Filter className="mr-2 h-5 w-5 text-sky-500" /> Advanced Filters
                </h2>
                <Button
                  onClick={resetFilters}
                  variant="outline"
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center shadow-sm"
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Reset All
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Quick Filters */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Quick Filters</label>
                  <div className="flex flex-wrap gap-2">
                    {["today", "week", "month"].map((mode) => {
                      const label = mode === "week" ? "This Week" : mode === "today" ? "Today" : "This Month"
                      return (
                        <Button
                          key={mode}
                          onClick={() =>
                            handleFilterChange({
                              filterType: mode as any,
                              ...(mode === "month" ? { selectedMonth: format(new Date(), "yyyy-MM") } : {}),
                            })
                          }
                          className={`px-3 py-2 rounded-lg text-sm font-medium ${
                            filters.filterType === mode
                              ? "bg-sky-600 text-white shadow-md"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {label}
                        </Button>
                      )
                    })}
                  </div>
                </div>
                {/* Month Filter */}
                <div>
                  <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-1">
                    Filter by Month
                  </label>
                  <Input
                    type="month"
                    id="month"
                    value={filters.selectedMonth}
                    onChange={(e) => handleFilterChange({ selectedMonth: e.target.value, filterType: "month" })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
                  />
                </div>
                {/* Date Range Filter */}
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    id="startDate"
                    value={filters.startDate}
                    onChange={(e) => handleDateRangeChange(e.target.value, filters.endDate)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                    End Date (Max 30 days)
                  </label>
                  <Input
                    type="date"
                    id="endDate"
                    value={filters.endDate}
                    onChange={(e) => handleDateRangeChange(filters.startDate, e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showOnlyOpd"
                    checked={filters.showOnlyOpd}
                    onChange={(e) =>
                      handleFilterChange({
                        showOnlyOpd: e.target.checked,
                        showOnlyIpd: false,
                        showOnlyOt: false,
                        showOnlyBabyBirth: false,
                      })
                    }
                    className="h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300 rounded"
                  />
                  <label htmlFor="showOnlyOpd" className="ml-2 text-sm font-medium text-gray-700">
                    Show only OPD
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showOnlyIpd"
                    checked={filters.showOnlyIpd}
                    onChange={(e) =>
                      handleFilterChange({
                        showOnlyIpd: e.target.checked,
                        showOnlyOpd: false,
                        showOnlyOt: false,
                        showOnlyBabyBirth: false,
                      })
                    }
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <label htmlFor="showOnlyIpd" className="ml-2 text-sm font-medium text-gray-700">
                    Show only IPD
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showOnlyOt"
                    checked={filters.showOnlyOt}
                    onChange={(e) =>
                      handleFilterChange({
                        showOnlyOt: e.target.checked,
                        showOnlyOpd: false,
                        showOnlyIpd: false,
                        showOnlyBabyBirth: false,
                      })
                    }
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                  />
                  <label htmlFor="showOnlyOt" className="ml-2 text-sm font-medium text-gray-700">
                    Show only OT
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showOnlyBabyBirth"
                    checked={filters.showOnlyBabyBirth}
                    onChange={(e) =>
                      handleFilterChange({
                        showOnlyBabyBirth: e.target.checked,
                        showOnlyOpd: false,
                        showOnlyIpd: false,
                        showOnlyOt: false,
                      })
                    }
                    className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                  />
                  <label htmlFor="showOnlyBabyBirth" className="ml-2 text-sm font-medium text-gray-700">
                    Show only Baby Birth
                  </label>
                </div>
              </div>
              <div className="mt-4 p-3 bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg border border-sky-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CalendarDays className="mr-2 h-5 w-5 text-sky-600" />
                    <span className="text-sky-800 font-medium">{getFilterTitle()}</span>
                  </div>
                  {totalDownloadedBytes > 0 && (
                    <span className="text-xs text-gray-500">
                      Total Data Downloaded: <b>{formatBytes(totalDownloadedBytes)}</b>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Dashboard Statistics (Hidden when searching) */}
          {!filters.searchQuery && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-6 mb-6">
                {/* Row 1, Col 1: OPD */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-sky-100 to-blue-100 rounded-full shadow-md">
                      <Activity className="text-sky-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">OPD</p>
                      <p className="text-2xl font-bold text-gray-900">{statistics.totalOpdCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Revenue</span>
                    <span className="text-lg font-semibold text-sky-600">
                      {formatCurrency(statistics.totalOpdAmount)}
                    </span>
                  </div>
                </Card>
                {/* Row 1, Col 2: IPD */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-orange-100 to-red-100 rounded-full shadow-md">
                      <Layers className="text-orange-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">IPD Admissions</p>
                      <p className="text-2xl font-bold text-gray-900">{statistics.totalIpdCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total TPA IPD</span>
                    <span className="text-lg font-semibold text-orange-600">{statistics.totalTpaIpd}</span>
                  </div>
                  {statistics.overallIpdRefunds > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-gray-600">Total Refunds</span>
                      <span className="text-lg font-semibold text-blue-600">
                        {formatCurrency(statistics.overallIpdRefunds)}
                      </span>
                    </div>
                  )}
                </Card>
                {/* Row 1, Col 3: OT */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full shadow-md">
                      <Stethoscope className="text-purple-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">OT Procedures</p>
                      <p className="text-2xl font-bold text-gray-900">{statistics.totalOtCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Major/Minor</span>
                    <span className="text-lg font-semibold text-purple-600">
                      {statistics.totalMajorOt}/{statistics.totalMinorOt}
                    </span>
                  </div>
                </Card>
                {/* Row 1, Col 4: Total Revenue (from all sources including IPD totals) */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full shadow-md">
                      <DollarSign className="text-emerald-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">Total Revenue</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(statistics.totalRevenue)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Net Deposits</span>
                    <span className="text-lg font-semibold text-emerald-600">
                      {formatCurrency(ipdTotals ? ipdTotals.cash_total + ipdTotals.online_total : 0)}
                    </span>
                  </div>
                </Card>
              </div>

              {/* Second Row of Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-6 mb-6">
                {/* Total Discharges Card */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full shadow-md">
                      <UserCheck className="text-emerald-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">Total Discharges</p>
                      <p className="text-2xl font-bold text-gray-900">{statistics.totalDischarges}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Patients Discharged</span>
                    <span className="text-lg font-semibold text-emerald-600">{statistics.totalDischarges}</span>
                  </div>
                </Card>
                {/* Total Births Card */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-pink-100 to-rose-100 rounded-full shadow-md">
                      <Heart className="text-pink-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">Total Births</p>
                      <p className="text-2xl font-bold text-gray-900">{statistics.totalBabyBirths}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Lab/OT</span>
                    <span className="text-lg font-semibold text-pink-600">
                      {statistics.totalBirthsWithLabor}/{statistics.totalBirthsWithOt}
                    </span>
                  </div>
                </Card>
                {/* Total Pathology Card */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-red-100 to-pink-100 rounded-full shadow-md">
                      <Activity className="text-red-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">Total Pathology</p>
                      <p className="text-2xl font-bold text-gray-900">{statistics.totalPathology}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Lab Tests</span>
                    <span className="text-lg font-semibold text-red-600">{statistics.totalPathology}</span>
                  </div>
                </Card>
                {/* Total X-ray Card */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-full shadow-md">
                      <X className="text-yellow-600 h-6 w-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 text-sm">Total X-ray</p>
                      <p className="text-2xl font-bold text-gray-900">{statistics.totalXray}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Scans</span>
                    <span className="text-lg font-semibold text-yellow-600">{statistics.totalXray}</span>
                  </div>
                </Card>
              </div>

              {/* Payment Breakdown & Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Payment Breakdown */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <CreditCard className="mr-2 h-5 w-5" /> Payment Breakdown
                  </h2>
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-4 shadow-sm">
                      <h3 className="font-medium text-sky-800 mb-3">OPD Payments</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-sm">💵 Cash</span>
                          <span className="font-semibold text-sky-600">
                            {formatCurrency(statistics.opdCash)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-sm">💳 Online</span>
                          <span className="font-semibold text-sky-600">
                            {formatCurrency(statistics.opdOnline)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-sky-200">
                          <span className="text-sky-700 font-medium">Total OPD</span>
                          <span className="font-bold text-sky-700">
                            {formatCurrency(statistics.totalOpdAmount)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-4 shadow-sm">
                      <h3 className="font-medium text-orange-800 mb-3">IPD Total Collections</h3>
                      {ipdTotals ? (
                        <div className="mt-4 pt-4 border-t border-orange-200">
                          <div className="text-sm text-gray-600 space-y-1">
                            <div className="flex justify-between items-center">
                              <span>Cash Total:</span>
                              <span className="font-semibold">
                                {formatCurrency(ipdTotals.cash_total)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Online Total:</span>
                              <span className="font-semibold">
                                {formatCurrency(ipdTotals.online_total)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              (UPI: {formatCurrency(ipdTotals.online_upi_total)}, Card:{" "}
                              {formatCurrency(ipdTotals.online_card_total)}, Netbanking:{" "}
                              {formatCurrency(ipdTotals.online_netbanking_total)}, Cheque:{" "}
                              {formatCurrency(ipdTotals.online_cheque_total)})
                            </p>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-orange-200 mt-4">
                            <span className="text-orange-700 font-medium">
                              Net Deposit (Online + Cash):
                            </span>
                            <span className="font-bold text-orange-700">
                              {formatCurrency(ipdTotals.cash_total + ipdTotals.online_total)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 mt-4">Loading historical IPD totals...</p>
                      )}
                    </div>
                    <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg p-4 shadow-sm">
                      <div className="flex justify-between items-center text-lg font-semibold">
                        <span className="text-emerald-800 font-semibold">💰 Grand Total</span>
                        <span className="font-bold text-xl text-emerald-600">
                          {formatCurrency(statistics.totalRevenue)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
                {/* Appointments Overview Chart */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <Activity className="mr-2 h-5 w-5 text-gray-600" /> Appointments Overview
                  </h2>
                  <Bar
                    data={chartData}
                    options={{
                      responsive: true,
                      plugins: { legend: { position: "top" } },
                      scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } },
                      },
                    }}
                  />
                </Card>
              </div>
              {/* Doctor Consultations List & Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* List */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <UserCheck className="mr-2 h-5 w-5" /> Doctor Consultations
                  </h2>
                  {doctorConsultations.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Doctor Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Consultations
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {doctorConsultations.map((doc) => (
                            <tr key={doc.doctorName} className="hover:bg-gray-50">
                              <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                {doc.doctorName}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{doc.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <p>No consultation data for the selected period.</p>
                    </div>
                  )}
                </Card>
                {/* Chart */}
                <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <UserCheck className="mr-2 h-5 w-5" /> Top Doctors by Consultations
                  </h2>
                  {doctorConsultChartData.labels.length > 0 ? (
                    <Bar
                      data={doctorConsultChartData}
                      options={{
                        responsive: true,
                        plugins: { legend: { position: "top" } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                      }}
                    />
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <p>No data to display chart for the selected period.</p>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
          {/* Appointments/Patients Table */}
          <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <FileText className="mr-2 h-5 w-5 text-gray-600" />{" "}
                {filters.searchQuery ? "Patient Search Results" : "Appointments List"}
              </h2>
            </div>
            {isLoading ? (
              <div className="flex justify-center items-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500"></div>
                <span className="ml-3 text-gray-600">Loading data...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {filters.searchQuery ? (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            UHID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Patient Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Phone
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Age / Gender
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Action
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Patient
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Contact
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date & Time
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Services/Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Action
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filters.searchQuery ? (
                      searchedPatients.length > 0 ? (
                        searchedPatients.map((patient) => (
                          <tr key={patient.uhid} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {patient.uhid}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="p-2 bg-gray-100 rounded-full mr-3">
                                  <User className="h-4 w-4 text-gray-600" />
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {patient.name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{patient.phone}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{patient.age || "N/A"}</div>
                              <div className="text-xs text-gray-500">{patient.gender || "N/A"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Button
                                onClick={() => openPatientAppointmentsModal(patient)}
                                className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors shadow-sm"
                              >
                                View Appointments
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center">
                              <FileText className="h-12 w-12 text-gray-300 mb-4" />
                              <p className="text-gray-500 text-lg">
                                No patients found matching your search.
                              </p>
                              <p className="text-gray-400 text-sm">
                                Try a different name or phone number.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )
                    ) : filteredAppointments.length > 0 ? (
                      filteredAppointments.map((app) => (
                        <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="p-2 bg-gray-100 rounded-full mr-3">
                                <User className="h-4 w-4 text-gray-600" />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{app.name}</div>
                                <div className="text-xs text-gray-500">UHID: {app.patientId}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{app.phone}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {format(
                                parseISO(app.type === "OPD" || app.type === "OT" ? app.date : app.admission_date),
                                "dd MMM, yyyy",
                              )}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {app.type === "OPD" || app.type === "OT" ? app.time : app.admission_time}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(
                                app.type,
                              )}`}
                            >
                              {app.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {app.type === "OPD" && (
                              <div>
                                <div className="text-sm text-gray-600 mb-1">
                                  {getModalitiesSummary((app as OPDAppointmentDisplay).modalities)}
                                </div>
                                <div className="text-sm font-medium text-gray-900">
                                  {formatCurrency(
                                    (app as OPDAppointmentDisplay).payment.totalPaid,
                                  )}
                                </div>
                              </div>
                            )}
                            {app.type === "IPD" && (
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {formatCurrency(
                                    (app as IPDAppointmentDisplay).totalDeposit,
                                  )}
                                </div>
                                {((app as IPDAppointmentDisplay).remainingAmount ?? 0) > 0 && (
                                  <div className="text-xs text-red-500">
                                    Pending:{" "}
                                    {formatCurrency(
                                      (app as IPDAppointmentDisplay).remainingAmount!,
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {app.type === "OT" && (
                              <div className="text-sm text-gray-500">
                                Procedure: {(app as OTAppointmentDisplay).ot_type}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <Button
                              onClick={() => openModal(app)}
                              className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors shadow-sm"
                            >
                              View Details
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center">
                            <FileText className="h-12 w-12 text-gray-300 mb-4" />
                            <p className="text-gray-500 text-lg">No appointments found</p>
                            <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Appointment Details Modal */}
      <Dialog 
        open={isModalOpen} 
        onOpenChange={(newOpenState) => {
          if (newOpenState === false) {
            closeModal();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold mb-6 flex items-center">
              <div
                className={`p-3 rounded-full mr-4 shadow-md ${
                  selectedAppointment?.type === "OPD"
                    ? "bg-gradient-to-r from-sky-100 to-blue-100"
                    : selectedAppointment?.type === "IPD"
                    ? "bg-gradient-to-r from-orange-100 to-red-100"
                    : "bg-gradient-to-r from-purple-100 to-pink-100"
                }`}
              >
                {selectedAppointment?.type === "OPD" && (
                  <Activity className="text-sky-600 h-6 w-6" />
                )}
                {selectedAppointment?.type === "IPD" && (
                  <Layers className="text-orange-600 h-6 w-6" />
                )}
                {selectedAppointment?.type === "OT" && (
                  <Stethoscope className="text-purple-600 h-6 w-6" />
                )}
              </div>
              {selectedAppointment?.type} Appointment Details
            </DialogTitle>
            <DialogDescription className="sr-only">
              Patient ID: {selectedAppointment?.patientId}
            </DialogDescription>
          </DialogHeader>
          {modalLoading ? (
            <div className="flex justify-center items-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500"></div>
              <span className="ml-3 text-gray-600">Loading details...</span>
            </div>
          ) : (
            selectedAppointment && (
              <>
                {/* Patient Info */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-6 mb-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <User className="mr-2 h-5 w-5 text-gray-600" /> Patient Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-500">Patient Name</p>
                        <p className="font-medium text-lg">{selectedAppointment.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="font-medium">{selectedAppointment.phone}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Date</p>
                        <p className="font-medium">
                          {format(
                            parseISO(
                              selectedAppointment.type === "IPD"
                                ? selectedAppointment.admission_date
                                : selectedAppointment.date,
                            ),
                            "dd MMM, yyyy",
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-500">UHID</p>
                        <p className="font-medium">{selectedAppointment.patientId}</p>
                      </div>
                      {selectedAppointment.type === "IPD" && (
                        <div>
                          <p className="text-sm text-gray-500">Room Type</p>
                          <p className="font-medium">
                            {(selectedAppointment as IPDAppointmentDisplay).roomType}
                          </p>
                        </div>
                      )}
                      {selectedAppointment.type === "OT" && (
                        <div>
                          <p className="text-sm text-gray-500">IPD ID (for OT)</p>
                          <p className="font-medium">
                            {(selectedAppointment as OTAppointmentDisplay).ipd_id}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* OPD Details */}
                {selectedAppointment.type === "OPD" && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-sky-800 mb-4">OPD Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Time</p>
                            <p className="font-medium">
                              {(selectedAppointment as OPDAppointmentDisplay).time}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Appointment Type</p>
                            <p className="font-medium capitalize">
                              {(selectedAppointment as OPDAppointmentDisplay).appointment_type ||
                                "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Visit Type</p>
                            <p className="font-medium capitalize">
                              {(selectedAppointment as OPDAppointmentDisplay).visit_type || "N/A"}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Payment Method</p>
                            <p className="font-medium capitalize">
                              {(selectedAppointment as OPDAppointmentDisplay).payment.paymentMethod}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Total Amount</p>
                            <p className="font-bold text-xl text-sky-600">
                              {formatCurrency(
                                (selectedAppointment as OPDAppointmentDisplay).payment.totalPaid,
                              )}
                            </p>
                          </div>
                          {(selectedAppointment as OPDAppointmentDisplay).payment.discount > 0 && (
                            <div>
                              <p className="text-sm text-gray-500">Discount</p>
                              <p className="font-medium text-red-600">
                                {formatCurrency(
                                  (selectedAppointment as OPDAppointmentDisplay).payment.discount,
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      {(selectedAppointment as OPDAppointmentDisplay).additional_notes && (
                        <div className="mt-4 p-3 bg-white rounded-lg border border-sky-200 shadow-sm">
                          <p className="text-sm text-gray-500">Notes</p>
                          <p className="font-medium">
                            {(selectedAppointment as OPDAppointmentDisplay).additional_notes}
                          </p>
                        </div>
                      )}
                    </div>
                    {(selectedAppointment as OPDAppointmentDisplay).modalities.length > 0 && (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-purple-800 mb-4 flex items-center">
                          <FileText className="mr-2 h-5 w-5" /> Services & Modalities
                        </h3>
                        <div className="space-y-3">
                          {(selectedAppointment as OPDAppointmentDisplay).modalities.map(
                            (m: IModality, i: number) => (
                              <div
                                key={i}
                                className="border border-purple-200 rounded p-3 bg-white shadow-sm"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium capitalize">
                                    {m.type}
                                  </span>
                                  <span className="font-semibold text-purple-700">
                                    {formatCurrency(m.charges)}
                                  </span>
                                </div>
                                {m.doctor && (
                                  <div className="text-xs text-gray-600">
                                    <strong>Doctor:</strong> {m.doctor}
                                  </div>
                                )}
                                {m.specialist && (
                                  <div className="text-xs text-gray-600">
                                    <strong>Specialist:</strong> {m.specialist}
                                  </div>
                                )}
                                {m.service && (
                                  <div className="text-xs text-gray-600">
                                    <strong>Service:</strong> {m.service}
                                  </div>
                                )}
                                {m.visitType && (
                                  <div className="text-xs text-gray-600">
                                    <strong>Visit Type:</strong> {m.visitType}
                                  </div>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                        <div className="mt-4 p-4 bg-white rounded-lg border border-purple-200 shadow-sm">
                          <div className="flex justify-between items-center text-lg font-semibold">
                            <span className="text-purple-700">Total Charges:</span>
                            <span className="text-purple-600">
                              {formatCurrency(
                                (selectedAppointment as OPDAppointmentDisplay).payment.totalCharges,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                        <CreditCard className="mr-2 h-5 w-5" /> Payment Details
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Cash Amount:</span>
                            <span className="font-semibold text-green-700">
                              {formatCurrency(
                                (selectedAppointment as OPDAppointmentDisplay).payment.cashAmount,
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Online Amount:</span>
                            <span className="font-semibold text-blue-700">
                              {formatCurrency(
                                (selectedAppointment as OPDAppointmentDisplay).payment.onlineAmount,
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Charges:</span>
                            <span className="font-semibold">
                              {formatCurrency(
                                (selectedAppointment as OPDAppointmentDisplay).payment.totalCharges,
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Discount:</span>
                            <span className="font-semibold text-red-600">
                              {formatCurrency(
                                (selectedAppointment as OPDAppointmentDisplay).payment.discount,
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-green-700 font-bold">Total Paid:</span>
                            <span className="font-bold text-green-600">
                              {formatCurrency(
                                (selectedAppointment as OPDAppointmentDisplay).payment.totalPaid,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* IPD Details */}
                {selectedAppointment.type === "IPD" && (
                  <div className="space-y-6">
                    {(selectedAppointment as IPDAppointmentDisplay).service_detail &&
                      (selectedAppointment as IPDAppointmentDisplay).service_detail!.length > 0 && (
                        <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-6 shadow-sm">
                          <h3 className="text-lg font-semibold text-orange-800 mb-4 flex items-center">
                            <FileText className="mr-2 h-5 w-5" /> Services & Charges
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-orange-200">
                              <thead className="bg-orange-100">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                    Service
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                    Type
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                    Doctor
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                    Amount
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-orange-100">
                                {(selectedAppointment as IPDAppointmentDisplay).service_detail!.map(
                                  (s, i) => (
                                    <tr key={i} className="hover:bg-orange-50">
                                      <td className="px-4 py-2 text-sm text-gray-900">
                                        {s.serviceName}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-gray-600 capitalize">
                                        {s.type}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-gray-600">
                                        {s.doctorName || "-"}
                                      </td>
                                      <td className="px-4 py-2 text-sm font-medium text-orange-600">
                                        {formatCurrency(s.amount)}
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-4 p-4 bg-white rounded-lg border border-orange-200 shadow-sm">
                            <div className="flex justify-between items-center text-lg font-semibold">
                              <span className="text-orange-700">Total Service Amount:</span>
                              <span className="text-orange-600">
                                {formatCurrency(
                                  (selectedAppointment as IPDAppointmentDisplay).totalAmount,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    {(selectedAppointment as IPDAppointmentDisplay).payment_detail &&
                      (selectedAppointment as IPDAppointmentDisplay).payment_detail!.length > 0 && (
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 shadow-sm">
                          <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                            <CreditCard className="mr-2 h-5 w-5" /> Payment History
                          </h3>
                          <div className="space-y-3">
                            {(selectedAppointment as IPDAppointmentDisplay).payment_detail!.map(
                              (p, i) => (
                                <div
                                  key={p.id || i}
                                  className="flex justify-between items-center p-3 bg-white rounded-lg border border-green-200 shadow-sm"
                                >
                                  <div>
                                    <span className="font-medium text-green-700">
                                      {`${p.paymentType?.toUpperCase() || "N/A"} - ${
                                        p.type?.toUpperCase() || p.transactionType?.toUpperCase() || "N/A"
                                      }`}
                                    </span>
                                    {p.date && (
                                      <p className="text-sm text-gray-500">
                                        {format(parseISO(p.date), "dd MMM, yyyy")}
                                      </p>
                                    )}
                                  </div>
                                  <span className="font-bold text-green-600">
                                    {formatCurrency(p.amount)}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                          <div className="mt-4 p-4 bg-white rounded-lg border border-green-200 shadow-sm">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-green-700">Total Deposits:</span>
                                <span className="font-bold text-green-600">
                                  {formatCurrency(
                                    (selectedAppointment as IPDAppointmentDisplay).totalDeposit,
                                  )}
                                </span>
                              </div>
                              {(selectedAppointment as IPDAppointmentDisplay).totalRefunds > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600">Total Refunds:</span>
                                  <span className="font-bold text-red-600">
                                    {formatCurrency(
                                      (selectedAppointment as IPDAppointmentDisplay).totalRefunds,
                                    )}
                                  </span>
                                </div>
                              )}
                              {(selectedAppointment as IPDAppointmentDisplay).discount > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600">Total Discount:</span>
                                  <span className="font-bold text-orange-600">
                                    {formatCurrency(
                                      (selectedAppointment as IPDAppointmentDisplay).discount,
                                    )}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between border-t pt-2">
                                <span className="text-green-700 font-bold">Net Amount Paid:</span>
                                <span className="font-bold text-green-600">
                                  {formatCurrency(
                                    (selectedAppointment as IPDAppointmentDisplay).totalDeposit -
                                      (selectedAppointment as IPDAppointmentDisplay).totalRefunds,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                        <DollarSign className="mr-2 h-5 w-5" /> Financial Summary
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Total Services:</span>
                          <span className="font-semibold text-blue-700">
                            {formatCurrency(
                              (selectedAppointment as IPDAppointmentDisplay).totalAmount,
                            )}
                          </span>
                        </div>
                        {(selectedAppointment as IPDAppointmentDisplay).discount > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Discount Applied:</span>
                            <span className="font-semibold text-red-600">
                              {formatCurrency(
                                (selectedAppointment as IPDAppointmentDisplay).discount,
                              )}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Total Deposits:</span>
                          <span className="font-semibold text-green-700">
                            {formatCurrency(
                              (selectedAppointment as IPDAppointmentDisplay).totalDeposit,
                            )}
                          </span>
                        </div>
                        {(selectedAppointment as IPDAppointmentDisplay).totalRefunds > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Total Refunds Issued:</span>
                            <span className="font-semibold text-red-600">
                              {formatCurrency(
                                (selectedAppointment as IPDAppointmentDisplay).totalRefunds,
                              )}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-3 border-t border-blue-200">
                          <span className="text-blue-800 font-bold text-lg">Net Balance:</span>
                          <span
                            className={`font-bold text-xl ${
                              (selectedAppointment as IPDAppointmentDisplay).remainingAmount! > 0
                                ? "text-red-600"
                                : (selectedAppointment as IPDAppointmentDisplay).remainingAmount! <
                                  0
                                ? "text-green-600"
                                : "text-gray-800"
                            }`}
                          >
                            {formatCurrency(
                              (selectedAppointment as IPDAppointmentDisplay).remainingAmount!,
                            )}
                            {(selectedAppointment as IPDAppointmentDisplay).remainingAmount! > 0
                              ? " (Due)"
                              : (selectedAppointment as IPDAppointmentDisplay).remainingAmount! < 0
                              ? " (Refundable)"
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    {selectedAppointment.type === "IPD" &&
                      (selectedAppointment as IPDAppointmentDisplay).ipd_notes && (
                        <div className="mt-4 p-3 bg-white rounded-lg border border-orange-200 shadow-sm">
                          <p className="text-sm text-gray-500">IPD Note</p>
                          <p className="font-medium">
                            {(selectedAppointment as IPDAppointmentDisplay).ipd_notes}
                          </p>
                        </div>
                      )}
                  </div>
                )}
                {/* OT Details */}
                {selectedAppointment.type === "OT" && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-purple-800 mb-4 flex items-center">
                        <Stethoscope className="mr-2 h-5 w-5" /> OT Details
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">OT Type</p>
                            <p className="font-medium capitalize">
                              {(selectedAppointment as OTAppointmentDisplay).ot_type}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">OT Date</p>
                            <p className="font-medium">
                              {format(
                                parseISO((selectedAppointment as OTAppointmentDisplay).ot_date),
                                "dd MMM, yyyy",
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Time</p>
                            <p className="font-medium">
                              {(selectedAppointment as OTAppointmentDisplay).time}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Notes</p>
                            <p className="font-medium">
                              {(selectedAppointment as OTAppointmentDisplay).ot_notes || "No notes"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {(selectedAppointment as OTAppointmentDisplay).has_baby_birth && (
                        <div className="mt-6 p-4 bg-teal-50 rounded-lg border border-teal-200 shadow-inner">
                          <h4 className="text-md font-semibold text-teal-800 mb-3 flex items-center">
                            <User className="mr-2 h-4 w-4" /> Baby Birth Details
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Birth Date:</p>
                              <p className="font-medium text-gray-900">
                                {((selectedAppointment as OTAppointmentDisplay).baby_birth_date &&
                                  format(
                                    parseISO(
                                      (selectedAppointment as OTAppointmentDisplay).baby_birth_date!,
                                    ),
                                    "dd MMM, yyyy",
                                  )) ||
                                  "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Weight:</p>
                              <p className="font-medium text-gray-900">
                                {((selectedAppointment as OTAppointmentDisplay).baby_birth_weight !==
                                  null &&
                                  `${
                                    (selectedAppointment as OTAppointmentDisplay).baby_birth_weight
                                  } kg`) ||
                                  "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Gender:</p>
                              <p className="font-medium text-gray-900">
                                {(selectedAppointment as OTAppointmentDisplay).baby_birth_gender ||
                                  "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Location:</p>
                              <p className="font-medium text-gray-900">
                                {(selectedAppointment as OTAppointmentDisplay).location_type || "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      {/* Patient Appointments Details Modal - FIX APPLIED HERE */}
      <Dialog
        open={patientAppointmentsModalOpen}
        onOpenChange={(newOpenState) => {
          // This ensures that when the dialog tries to close (newOpenState === false), 
          // we run the cleanup function and satisfy the onOpenChange signature.
          if (newOpenState === false) {
            closePatientAppointmentsModal();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold mb-6 flex items-center">
              <User className="p-2 rounded-full mr-4 bg-gradient-to-r from-sky-100 to-blue-100 text-sky-600 h-10 w-10 shadow-md" />
              <span>
                Appointments for {selectedPatientForAppointments?.name} (UHID:{" "}
                {selectedPatientForAppointments?.uhid})
              </span>
            </DialogTitle>
            <DialogDescription>All recorded appointments for this patient.</DialogDescription>
          </DialogHeader>
          {patientAppointmentsLoading ? (
            <div className="flex justify-center items-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500"></div>
              <span className="ml-3 text-gray-600">Loading patient appointments...</span>
            </div>
          ) : (
            <>
              {patientAllAppointments.length > 0 ? (
                <div className="space-y-4">
                  {patientAllAppointments.map((app) => (
                    <div
                      key={app.id}
                      className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(
                            app.type,
                          )}`}
                        >
                          {app.type}
                        </span>
                        <span className="text-sm text-gray-600">
                          {format(
                            parseISO(app.type === "IPD" ? app.admission_date : app.date),
                            "dd MMM, yyyy",
                          )}{" "}
                          {" at "}
                          {app.type === "OPD" || app.type === "OT" ? app.time : app.admission_time}
                        </span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {app.type === "OPD" &&
                          `OPD Visit - ${getModalitiesSummary(
                            (app as OPDAppointmentDisplay).modalities,
                          )}`}
                        {app.type === "IPD" &&
                          `IPD Admission - ${formatCurrency(
                            (app as IPDAppointmentDisplay).totalAmount,
                          )}`}
                        {app.type === "OT" &&
                          `OT Procedure - ${(app as OTAppointmentDisplay).ot_type}`}
                      </p>
                      {app.type === "OPD" && (
                        <p className="text-sm text-gray-700">
                          Total Paid:{" "}
                          {formatCurrency(
                            (app as OPDAppointmentDisplay).payment.totalPaid,
                          )}
                        </p>
                      )}
                      {app.type === "IPD" && (
                        <p className="text-sm text-gray-700">
                          Net Deposit:{" "}
                          {formatCurrency(
                            (app as IPDAppointmentDisplay).totalDeposit,
                          )}
                        </p>
                      )}
                      <Button
                        onClick={() => openModal(app)}
                        className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors shadow-sm"
                      >
                        View Full Details
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <p>No appointments found for this patient.</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default DashboardUI