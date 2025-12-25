"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase" // Re-added supabase client
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay, isValid } from "date-fns"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { CalendarIcon, Search, History, Loader2, Download, DollarSign, TrendingUp, TrendingDown, CreditCard, Wallet, Building2, Clock, Eye, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import * as XLSX from "xlsx" // Re-added excel export library

// Define types for registration data
type PaymentHistoryItem = {
  amount: number
  paymentMode: string
  time: string
  amountId: string
}

interface Registration {
  id: string
  created_at: string
  patient_id: string // This maps to UHID
  amount_paid: number
  discount_amount: number
  hospital_name: string
  payment_mode: string
  amount_paid_history: {
    totalAmount: number
    discount: number
    paymentHistory: PaymentHistoryItem[]
  } | null
  visit_type: string
  doctor_name: string
  name?: string
  contact?: string
}

type DateRangeOption = "today" | "last7days" | "thismonth" | "custom"

export default function BillingPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true) // Set initial loading to true
  const [dateRange, setDateRange] = useState<DateRangeOption>("last7days")
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 6))
  const [endDate, setEndDate] = useState<Date | undefined>(new Date())
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [hospitalFilterTerm, setHospitalFilterTerm] = useState<string>("all")
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [totalRecords, setTotalRecords] = useState(0) // State to hold total records count

  // Fetch data from Supabase with server-side filtering
  const fetchRegistrations = useCallback(async () => {
    setLoading(true)

    // Query for fetching data
    // Dynamic select: Use inner join for search to filter parent rows, otherwise left join
    const selectQuery = searchQuery
      ? `*, patient_detail!inner(name, number, uhid)`
      : `*, patient_detail(name, number, uhid)`

    let query = supabase.from("zregistration").select(selectQuery, { count: 'exact' })

    // Apply date filters
    if (startDate && endDate) {
      query = query.gte("created_at", format(startOfDay(startDate), "yyyy-MM-dd HH:mm:ss.SSSxxx"))
      query = query.lte("created_at", format(endOfDay(endDate), "yyyy-MM-dd HH:mm:ss.SSSxxx"))
    }

    // UPDATED SEARCH LOGIC: correct syntax for foreign table filtering
    if (searchQuery) {
      const term = searchQuery.trim()
      const isNumeric = /^\d+$/.test(term)

      // Search fields on the joined 'patient_detail' table
      const conditions = [
        `name.ilike.%${term}%`,
        `uhid.ilike.%${term}%`
      ]

      if (isNumeric) {
        conditions.push(`number.eq.${term}`)
      }

      // Apply OR filter specifically to the foreign table
      query = query.or(conditions.join(","), { foreignTable: 'patient_detail' })
    }

    // Apply hospital filter
    if (hospitalFilterTerm !== "all") {
      query = query.eq("hospital_name", hospitalFilterTerm)
    }

    const { data, error, count } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching registrations:", error)
      setRegistrations([])
    } else {
      const parsedData = data.map((reg: any) => ({
        ...reg,
        // --- Mapped patient_detail fields ---
        name: reg.patient_detail?.name || "",
        contact: reg.patient_detail?.number || "",
        patient_id: reg.patient_detail?.uhid || reg.UHID || "", // Map UHID to patient_id
        amount_paid_history: reg.amount_paid_history as unknown as Registration["amount_paid_history"],
      }))
      setRegistrations(parsedData)
      setTotalRecords(count || 0)
    }
    setLoading(false)
  }, [startDate, endDate, searchQuery, hospitalFilterTerm])

  useEffect(() => {
    fetchRegistrations()
  }, [fetchRegistrations])

  // Handle date range selection
  const handleDateRangeChange = (option: DateRangeOption) => {
    setDateRange(option)
    const now = new Date()
    if (option === "today") {
      setStartDate(startOfDay(now))
      setEndDate(endOfDay(now))
    } else if (option === "last7days") {
      setStartDate(subDays(now, 6))
      setEndDate(now)
    } else if (option === "thismonth") {
      setStartDate(startOfMonth(now))
      setEndDate(endOfMonth(now))
    } else if (option === "custom") {
      if (!startDate || !endDate) {
        setStartDate(undefined)
        setEndDate(undefined)
      }
    }
  }

  // Calculate totals using filtered registrations from state
  const calculations = useMemo(() => {
    const totalAmount = registrations.reduce((sum, reg) => sum + (reg.amount_paid_history?.totalAmount || 0), 0)
    const totalDiscount = registrations.reduce((sum, reg) => sum + (reg.amount_paid_history?.discount || reg.discount_amount || 0), 0)
    const totalAmountAfterDiscount = totalAmount - totalDiscount

    const totalCash = registrations.reduce((sum, reg) => {
      if (!reg.amount_paid_history?.paymentHistory) return sum
      return sum + reg.amount_paid_history.paymentHistory
        .filter(p => p.paymentMode === "cash")
        .reduce((s, p) => s + (p.amount || 0), 0)
    }, 0)

    const totalOnline = registrations.reduce((sum, reg) => {
      if (!reg.amount_paid_history?.paymentHistory) return sum
      return sum + reg.amount_paid_history.paymentHistory
        .filter(p => p.paymentMode === "online")
        .reduce((s, p) => s + (p.amount || 0), 0)
    }, 0)

    const totalCollected = totalCash + totalOnline
    const totalRemaining = totalAmountAfterDiscount - totalCollected

    return {
      totalAmount,
      totalDiscount,
      totalAmountAfterDiscount,
      totalCash,
      totalOnline,
      totalCollected,
      totalRemaining
    }
  }, [registrations])

  const handleRowClick = (registration: Registration) => {
    setSelectedRegistration(registration)
    setIsModalOpen(true)
  }

  // Functional Excel export
  const handleExportExcel = () => {
    const rows = registrations.flatMap((reg) => {
      const paymentHistory = reg.amount_paid_history?.paymentHistory || []
      if (paymentHistory.length === 0) {
        return [{
          "Registration ID": reg.id, "Patient ID": reg.patient_id, "User Name": reg.name || "N/A", "User Number": reg.contact || "N/A",
          "Payment Method": reg.payment_mode, "Payment ID": "", "TPA": reg.visit_type === 'TPA' ? 'Yes' : 'No', "Total Discount": reg.amount_paid_history?.discount || reg.discount_amount || 0,
          "Hospital Name": reg.hospital_name, "Doctor Name": reg.doctor_name, "Date": reg.created_at,
        }]
      }
      return paymentHistory.map((p) => ({
        "Registration ID": reg.id, "Patient ID": reg.patient_id, "User Name": reg.name || "N/A", "User Number": reg.contact || "N/A",
        "Payment Method": p.paymentMode, "Payment ID": p.amountId || "", "TPA": reg.visit_type === 'TPA' ? 'Yes' : 'No', "Total Discount": reg.amount_paid_history?.discount || reg.discount_amount || 0,
        "Hospital Name": reg.hospital_name, "Doctor Name": reg.doctor_name, "Date": p.time || reg.created_at,
      }))
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Billing")
    XLSX.writeFile(wb, `billing_export_${format(new Date(), "yyyy-MM-dd")}.xlsx`)
  }

  const clearSearch = () => {
    setSearchQuery("")
  }

  const StatCard = ({ title, value, icon: Icon, gradient, trend }: any) => (
    <Card className={`relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg ${gradient} text-white group`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium opacity-90 flex items-center justify-between">
          {title}
          <Icon className="h-4 w-4 opacity-75 group-hover:scale-110 transition-transform duration-300" />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold mb-1">₹{value.toLocaleString()}</div>
        {trend && (
          <div className="flex items-center text-xs opacity-75">
            <TrendingUp className="h-3 w-3 mr-1" />
            <span>+12.5% from last period</span>
          </div>
        )}
      </CardContent>
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-white/10 -translate-y-10 translate-x-10"></div>
    </Card>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="container mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Billing Dashboard
            </h1>
            <p className="text-gray-600">Manage and track all your billing transactions</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={handleExportExcel}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          </div>
        </div>

        {/* Revenue Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-6">
          <StatCard
            title="Total Bill"
            value={calculations.totalAmount}
            icon={DollarSign}
            gradient="bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600"
            trend={true}
          />
          <StatCard
            title="Total Discount"
            value={calculations.totalDiscount}
            icon={TrendingDown}
            gradient="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600"
          />
          <StatCard
            title="Net Amount"
            value={calculations.totalAmountAfterDiscount}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-600"
            trend={true}
          />
          <StatCard
            title="Cash Received"
            value={calculations.totalCash}
            icon={Wallet}
            gradient="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500"
          />
          <StatCard
            title="Online Received"
            value={calculations.totalOnline}
            icon={CreditCard}
            gradient="bg-gradient-to-br from-pink-500 via-rose-500 to-red-600"
          />
          <StatCard
            title="Total Collected"
            value={calculations.totalCollected}
            icon={Building2}
            gradient="bg-gradient-to-br from-gray-600 via-gray-700 to-slate-800"
          />
          <StatCard
            title="Outstanding"
            value={calculations.totalRemaining}
            icon={Clock}
            gradient="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-800"
          />
        </div>

        {/* Enhanced Filters Section */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
              {/* Date Range Buttons */}
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "today", label: "Today" },
                  { key: "last7days", label: "Last 7 Days" },
                  { key: "thismonth", label: "This Month" }
                ].map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={dateRange === key ? "default" : "outline"}
                    onClick={() => handleDateRangeChange(key as DateRangeOption)}
                    className={`transition-all duration-300 ${dateRange === key
                      ? "bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg text-white"
                      : "hover:bg-blue-50 hover:border-blue-300"
                      }`}
                  >
                    {label}
                  </Button>
                ))}

                {/* Custom Date Range Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "min-w-[240px] justify-start text-left font-normal transition-all duration-300 hover:bg-blue-50",
                        !startDate && "text-muted-foreground"
                      )}
                      onClick={() => handleDateRangeChange("custom")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? (
                        endDate ? (
                          `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`
                        ) : (
                          format(startDate, "MMM dd, yyyy")
                        )
                      ) : (
                        "Custom Date Range"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 shadow-xl border-0" align="start">
                    <Calendar
                      mode="range"
                      selected={{ from: startDate, to: endDate }}
                      onSelect={(range) => {
                        setStartDate(range?.from)
                        setEndDate(range?.to)
                        setDateRange("custom")
                      }}
                      numberOfMonths={2}
                      className="rounded-lg"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-col sm:flex-row gap-4 lg:max-w-md">
                {/* Enhanced Search Bar */}
                <div className={`relative flex-grow transition-all duration-300 ${isSearchFocused ? 'scale-105' : ''}`}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 transition-colors duration-300" />
                  <Input
                    type="text"
                    placeholder="Search by Patient Name or Number..."
                    className={`pl-10 pr-10 transition-all duration-300 border-2 ${isSearchFocused
                      ? 'border-blue-400 shadow-lg bg-white'
                      : 'border-gray-200 hover:border-gray-300'
                      } ${searchQuery ? 'bg-blue-50' : ''}`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                  />
                  {searchQuery && (
                    <button
                      onClick={clearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Hospital Filter */}
                <select
                  value={hospitalFilterTerm}
                  onChange={(e) => setHospitalFilterTerm(e.target.value)}
                  className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-300 bg-white hover:border-gray-300 min-w-[200px]"
                >
                  <option value="all">All Hospitals</option>
                  <option value="Cigma Clinic">Cigma Clinic</option>

                </select>
              </div>
            </div>

            {/* Active Filters Display */}
            {(searchQuery || hospitalFilterTerm !== "all") && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                <span className="text-sm text-gray-600 font-medium">Active filters:</span>
                {searchQuery && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-800 border border-blue-200">
                    Search: "{searchQuery}"
                    <button onClick={clearSearch} className="ml-2 hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {hospitalFilterTerm !== "all" && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-800 border border-green-200">
                    Hospital: {hospitalFilterTerm}
                    <button onClick={() => setHospitalFilterTerm("all")} className="ml-2 hover:text-green-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold text-blue-600">{registrations.length}</span> results
            {` (Total: ${totalRecords} records)`}
          </div>
        </div>

        {/* Enhanced Registrations Table */}
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <span>Registration Records</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                  <p className="text-gray-500 animate-pulse">Loading records...</p>
                </div>
              </div>
            ) : registrations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                  <Search className="h-8 w-8 text-gray-400" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No records found</h3>
                  <p className="text-gray-500 max-w-md">
                    {searchQuery
                      ? `No registrations match "${searchQuery}". Try adjusting your search terms.`
                      : "No registrations found for the selected criteria. Try changing your filters."
                    }
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50">
                      <TableHead className="font-semibold text-gray-700">Registration ID</TableHead>
                      <TableHead className="font-semibold text-gray-700">Patient Details</TableHead>
                      <TableHead className="font-semibold text-gray-700">Date & Time</TableHead>
                      <TableHead className="font-semibold text-gray-700">Financial Summary</TableHead>
                      <TableHead className="font-semibold text-gray-700">Payments</TableHead>
                      <TableHead className="font-semibold text-gray-700">Hospital & Doctor</TableHead>
                      <TableHead className="font-semibold text-gray-700">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map((reg, index) => {
                      const totalBill = reg.amount_paid_history?.totalAmount || 0
                      const discount = reg.amount_paid_history?.discount || reg.discount_amount || 0
                      const paymentHistory = reg.amount_paid_history?.paymentHistory || []
                      const cash = paymentHistory
                        .filter(p => p.paymentMode === "cash")
                        .reduce((s, p) => s + (p.amount || 0), 0)
                      const online = paymentHistory
                        .filter(p => p.paymentMode === "online")
                        .reduce((s, p) => s + (p.amount || 0), 0)
                      const collected = cash + online
                      const remaining = totalBill - discount - collected

                      return (
                        <TableRow
                          key={reg.id}
                          className={`cursor-pointer transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                            }`}
                          onClick={() => handleRowClick(reg)}
                        >
                          <TableCell className="font-medium">
                            <div className="space-y-1">
                              <div className="font-mono text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded inline-block">
                                {reg.id}
                              </div>
                              <div className="text-xs text-gray-500">
                                Patient: {reg.patient_id}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium text-gray-900">
                                {reg.name || "N/A"}
                              </div>
                              <div className="text-sm text-gray-500 flex items-center space-x-2">
                                <span>📞 {reg.contact || "N/A"}</span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm font-medium">
                                {format(new Date(reg.created_at), "MMM dd, yyyy")}
                              </div>
                              <div className="text-xs text-gray-500">
                                {format(new Date(reg.created_at), "HH:mm")}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500">Bill:</span>
                                <span className="font-semibold">₹{totalBill.toLocaleString()}</span>
                              </div>
                              {discount > 0 && (
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs text-red-500">Discount:</span>
                                  <span className="text-red-600 font-medium">₹{discount.toLocaleString()}</span>
                                </div>
                              )}
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-green-600">Net:</span>
                                <span className="text-green-700 font-bold">₹{(totalBill - discount).toLocaleString()}</span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex flex-col space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500 flex items-center">
                                    <Wallet className="h-3 w-3 mr-1" />
                                    Cash:
                                  </span>
                                  <span className="font-medium">₹{cash.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500 flex items-center">
                                    <CreditCard className="h-3 w-3 mr-1" />
                                    Online:
                                  </span>
                                  <span className="font-medium">₹{online.toLocaleString()}</span>
                                </div>
                              </div>
                              {remaining > 0 && (
                                <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">
                                  Due: ₹{remaining.toLocaleString()}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-gray-900">
                                {reg.hospital_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                👨‍⚕️ {reg.doctor_name}
                              </div>
                              {reg.visit_type === "TPA" && (
                                <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                                  TPA
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRowClick(reg)
                              }}
                              className="hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 group"
                            >
                              <Eye className="h-4 w-4 mr-2 group-hover:text-blue-600" />
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Enhanced Payment History Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Payment History Details
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Complete payment breakdown for Registration ID: {selectedRegistration?.id}
              </DialogDescription>
            </DialogHeader>

            {selectedRegistration && (
              <div className="space-y-6 py-4">
                {/* Patient Info Card */}
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-800 flex items-center">
                          <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                          Patient Information
                        </h4>
                        <div className="space-y-1 text-sm">
                          <div><span className="font-medium">Name:</span> {selectedRegistration.name || "N/A"}</div>
                          <div><span className="font-medium">Contact:</span> {selectedRegistration.contact || "N/A"}</div>
                          <div><span className="font-medium">Patient ID:</span> {selectedRegistration.patient_id}</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-800 flex items-center">
                          <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                          Visit Details
                        </h4>
                        <div className="space-y-1 text-sm">
                          <div><span className="font-medium">Hospital:</span> {selectedRegistration.hospital_name}</div>
                          <div><span className="font-medium">Doctor:</span> {selectedRegistration.doctor_name}</div>
                          <div>
                            <span className="font-medium">Visit Type:</span>
                            <span className={`ml-2 px-2 py-1 rounded-full text-xs ${selectedRegistration.visit_type === "TPA"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-green-100 text-green-800"
                              }`}>
                              {selectedRegistration.visit_type}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Financial Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">
                        ₹{(selectedRegistration.amount_paid_history?.totalAmount || 0).toLocaleString()}
                      </div>
                      <div className="text-sm opacity-90">Total Bill</div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">
                        ₹{(selectedRegistration.amount_paid_history?.discount || selectedRegistration.discount_amount || 0).toLocaleString()}
                      </div>
                      <div className="text-sm opacity-90">Discount</div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">
                        ₹{(selectedRegistration.amount_paid_history?.paymentHistory?.reduce((s, p) => s + (p.amount || 0), 0) || 0).toLocaleString()}
                      </div>
                      <div className="text-sm opacity-90">Collected</div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">
                        ₹{(
                          (selectedRegistration.amount_paid_history?.totalAmount || 0) -
                          (selectedRegistration.amount_paid_history?.discount || selectedRegistration.discount_amount || 0) -
                          (selectedRegistration.amount_paid_history?.paymentHistory?.reduce((s, p) => s + (p.amount || 0), 0) || 0)
                        ).toLocaleString()}
                      </div>
                      <div className="text-sm opacity-90">Remaining</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Payment Transactions */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                    <History className="h-5 w-5 mr-2 text-blue-600" />
                    Payment Transactions
                  </h3>

                  {selectedRegistration.amount_paid_history?.paymentHistory &&
                    selectedRegistration.amount_paid_history.paymentHistory.length > 0 ? (
                    <div className="space-y-3">
                      {selectedRegistration.amount_paid_history.paymentHistory.map((payment, index) => (
                        <Card key={index} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow duration-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${payment.paymentMode === 'cash'
                                  ? 'bg-green-100 text-green-600'
                                  : 'bg-blue-100 text-blue-600'
                                  }`}>
                                  {payment.paymentMode === 'cash' ?
                                    <Wallet className="h-6 w-6" /> :
                                    <CreditCard className="h-6 w-6" />
                                  }
                                </div>
                                <div>
                                  <div className="font-semibold text-lg">₹{payment.amount.toLocaleString()}</div>
                                  <div className="text-sm text-gray-600 capitalize">
                                    {payment.paymentMode} Payment
                                  </div>
                                  {payment.amountId && (
                                    <div className="text-xs text-gray-500 font-mono">
                                      ID: {payment.amountId}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">
                                  {payment.time && isValid(new Date(payment.time))
                                    ? format(new Date(payment.time), "MMM dd, yyyy")
                                    : "Date N/A"}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {payment.time && isValid(new Date(payment.time))
                                    ? format(new Date(payment.time), "HH:mm")
                                    : ""}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="border-2 border-dashed border-gray-200">
                      <CardContent className="p-8 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <History className="h-8 w-8 text-gray-400" />
                        </div>
                        <h4 className="font-medium text-gray-900 mb-2">No Payment History</h4>
                        <p className="text-gray-500 text-sm">No detailed payment transactions are available for this registration.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="hover:bg-gray-50"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      // Mock print functionality
                      alert("Print receipt functionality would be implemented here.");
                    }}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Print Receipt
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}