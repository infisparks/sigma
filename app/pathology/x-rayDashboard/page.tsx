"use client"

import React, { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import {
  Stethoscope,
  Eye,
  Trash2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Edit,
  CreditCard,
  MoreHorizontal,
  Download,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { format, parseISO } from "date-fns"
import { useRouter } from "next/navigation"
import { downloadXrayBill } from "@/app/pathology/x-rayDashboard/x-rayDashboard-utils" // Import the new utility function

// Helper function to format date
const formatDate = (dateString: string): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
  return new Date(dateString).toLocaleDateString(undefined, options)
}

// Helper function for exponential backoff retry logic
const withRetry = async <T,>(fn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> => {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      await new Promise((res) => setTimeout(res, delay))
      return withRetry(fn, retries - 1, delay * 2)
    }
    throw error
  }
}

export default function XrayDashboardPage() {
  const router = useRouter()
  const [tableData, setTableData] = useState<any[]>([])
  const [filteredData, setFilteredData] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: format(new Date(), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  })
  const [quickDateRange, setQuickDateRange] = useState("Today")
  const [hospitalFilter, setHospitalFilter] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalData, setModalData] = useState<any | null>(null)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentModalData, setPaymentModalData] = useState<any | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    discount: 0,
    additionalPayment: 0,
    paymentMode: "Cash",
  })

  // Fetch initial data from Supabase
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const result = await withRetry(
      async () => await supabase.from("x-raydetail").select("*").order("created_at", { ascending: false }),
    )
    if (result.error) {
      console.error("Error fetching data:", result.error)
      setMessage("Failed to fetch data. Please try again.")
      setMessageType("error")
    } else {
      setTableData(result.data || [])
      setFilteredData(result.data || [])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle search and filter logic
  useEffect(() => {
    const lowercasedSearchTerm = searchTerm.toLowerCase()
    let updatedData = tableData.filter((item) => {
      const nameMatch = item.name?.toLowerCase().includes(lowercasedSearchTerm)
      const contactMatch = item.number?.includes(lowercasedSearchTerm)
      const billMatch = String(item.bill_number)?.includes(lowercasedSearchTerm)
      return nameMatch || contactMatch || billMatch
    })

    if (hospitalFilter !== "All") {
      updatedData = updatedData.filter((item) => {
        return item.Hospital_name === hospitalFilter
      })
    }

    // Date range filter
    const fromDate = dateRange.from ? parseISO(dateRange.from) : null
    const toDate = dateRange.to ? parseISO(dateRange.to) : null

    updatedData = updatedData.filter((item) => {
      if (!item.created_at) return false
      const itemDate = new Date(item.created_at)
      if (fromDate && itemDate.setHours(0, 0, 0, 0) < fromDate.setHours(0, 0, 0, 0)) return false
      if (toDate && itemDate.setHours(0, 0, 0, 0) > toDate.setHours(0, 0, 0, 0)) return false
      return true
    })

    setFilteredData(updatedData)
  }, [searchTerm, quickDateRange, dateRange, hospitalFilter, tableData])

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setDateRange((prev) => ({ ...prev, [name]: value }))
    setQuickDateRange("Custom")
  }

  const handleQuickDateRangeChange = (value: string) => {
    setQuickDateRange(value)
    const now = new Date()
    let newFromDate = ""
    let newToDate = ""
    if (value === "Today") {
      newFromDate = format(now, "yyyy-MM-dd")
      newToDate = format(now, "yyyy-MM-dd")
    } else if (value === "Last 7 days") {
      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      newFromDate = format(sevenDaysAgo, "yyyy-MM-dd")
      newToDate = format(now, "yyyy-MM-dd")
    } else if (value === "This Month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      newFromDate = format(startOfMonth, "yyyy-MM-dd")
      newToDate = format(endOfMonth, "yyyy-MM-dd")
    }
    setDateRange({ from: newFromDate, to: newToDate })
  }

  const toggleActionRow = (id: string) => {
    const newExpandedRows = new Set(expandedRows)
    if (newExpandedRows.has(id)) {
      newExpandedRows.delete(id)
    } else {
      newExpandedRows.add(id)
    }
    setExpandedRows(newExpandedRows)
  }

  // Handle delete action
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this registration?")) return

    setIsLoading(true)
    const result = await withRetry(async () => await supabase.from("x-raydetail").delete().eq("id", id))
    if (result.error) {
      console.error("Deletion error:", result.error)
      setMessage("Failed to delete the record.")
      setMessageType("error")
    } else {
      setMessage("Record deleted successfully.")
      setMessageType("success")
      fetchData()
      // Close expanded row if it was open
      const newExpandedRows = new Set(expandedRows)
      newExpandedRows.delete(id)
      setExpandedRows(newExpandedRows)
    }
    setIsLoading(false)
  }

  // Handle view action
  const handleView = (data: any) => {
    setModalData(data)
    setShowModal(true)
  }

  const handleEditDetails = (id: string) => {
    router.push(`/x-ray/${id}`)
  }

  const handleUpdatePayment = (data: any) => {
    setPaymentModalData(data)
    setPaymentForm({
      discount: 0,
      additionalPayment: 0,
      paymentMode: "Cash",
    })
    setShowPaymentModal(true)
  }

  const handlePaymentUpdate = async () => {
    if (!paymentModalData) return

    try {
      // Get current amount details
      const currentAmountDetail =
        typeof paymentModalData.amount_detail === "string"
          ? JSON.parse(paymentModalData.amount_detail)
          : paymentModalData.amount_detail

      // Handle both array format (old) and direct object format (new)
      let currentPayment
      if (Array.isArray(currentAmountDetail)) {
        currentPayment = currentAmountDetail[0] || {}
      } else if (currentAmountDetail && typeof currentAmountDetail === "object") {
        currentPayment = currentAmountDetail
      } else {
        currentPayment = {}
      }

      // Calculate new values based on the JSON format
      const currentTotalAmount = currentPayment.totalAmount || currentPayment.TotalAmount || 0
      const currentDiscount = Number(currentPayment.discount) || Number(currentPayment.Discount) || 0
      const newDiscount = currentDiscount + paymentForm.discount

      // Get existing payment history
      const existingPaymentHistory = currentPayment.paymentHistory || []

      // Create new payment entry if additional payment is provided
      const newPaymentHistory = [...existingPaymentHistory]
      if (paymentForm.additionalPayment > 0) {
        newPaymentHistory.push({
          amount: paymentForm.additionalPayment,
          paymentMode: paymentForm.paymentMode,
          time: new Date().toISOString(),
        })
      }

      // Create updated amount detail in the new JSON format
      const updatedAmountDetail = {
        totalAmount: currentTotalAmount,
        discount: newDiscount.toString(),
        paymentHistory: newPaymentHistory,
      }

      const result = await withRetry(
        async () =>
          await supabase
            .from("x-raydetail")
            .update({ amount_detail: updatedAmountDetail })
            .eq("id", paymentModalData.id),
      )

      if (result.error) {
        console.error("Payment update error:", result.error)
        setMessage("Failed to update payment.")
        setMessageType("error")
      } else {
        setMessage("Payment updated successfully.")
        setMessageType("success")
        setShowPaymentModal(false)
        fetchData()
      }
    } catch (error) {
      console.error("Payment update error:", error)
      setMessage("Failed to update payment.")
      setMessageType("error")
    }
  }

  return (
    <div className="flex-1 p-4 bg-gray-100 min-h-screen font-sans">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6 flex items-center">
        <Stethoscope className="mr-3 w-8 h-8 text-blue-600" />
        X-ray Dashboard
      </h1>

      {/* Data Table Section */}
      <div className="mt-8 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-3 md:mb-0 flex items-center">
            <Stethoscope className="mr-2 w-6 h-6 text-blue-600" />
            X-RAY Database
          </h2>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full md:w-auto">
            <div className="relative w-full sm:w-auto">
              <Input
                type="text"
                placeholder="Search by name, contact, bill..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500 w-full text-sm"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <div className="relative w-full sm:w-auto">
              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500 w-full text-sm">
                  <SelectValue placeholder="Hospital Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Hospitals</SelectItem>
                  <SelectItem value="MEDFORD HOSPITAL">MEDFORD HOSPITAL</SelectItem>
                  <SelectItem value="Gautami Medford NX Hospital">Gautami Medford NX Hospital</SelectItem>
                  <SelectItem value="Apex Clinic">Apex Clinic</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <div className="relative w-full sm:w-auto">
              <Select value={quickDateRange} onValueChange={handleQuickDateRangeChange}>
                <SelectTrigger className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500 w-full text-sm">
                  <SelectValue placeholder="Quick Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Today">Today</SelectItem>
                  <SelectItem value="Last 7 days">Last 7 days</SelectItem>
                  <SelectItem value="This Month">This Month</SelectItem>
                  <SelectItem value="Custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <div className="flex w-full sm:w-auto space-x-2">
              <Input
                type="date"
                name="from"
                value={dateRange.from}
                onChange={handleDateInputChange}
                className="pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500 w-full text-sm"
              />
              <Input
                type="date"
                name="to"
                value={dateRange.to}
                onChange={handleDateInputChange}
                className="pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500 w-full text-sm"
              />
            </div>
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={cn(
              "p-3 mb-4 rounded-lg font-medium text-sm",
              messageType === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
            )}
          >
            {message}
          </div>
        )}

        <Card className="overflow-hidden bg-white rounded-xl shadow-lg">
          <div className="overflow-x-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Patient Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Age</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Examination
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-center text-gray-500 text-sm">
                      Loading data...
                    </td>
                  </tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((row: any) => (
                    <React.Fragment key={row.id}>
                      <tr className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-gray-900">{row.name}</span>
                              {row.Hospital_name && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                                  {row.Hospital_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{row.number}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{`${row.age} ${row.age_unit}`}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                          <div className="max-h-16 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                            <ul className="list-disc list-inside space-y-1">
                              {(() => {
                                try {
                                  const data =
                                    typeof row["x-ray_detail"] === "string"
                                      ? JSON.parse(row["x-ray_detail"])
                                      : row["x-ray_detail"]
                                  return data && Array.isArray(data) ? (
                                    data.map((test: any, idx: number) => (
                                      <li key={idx} className="text-xs text-gray-700 truncate">
                                        {test.Examination}
                                      </li>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-400">No tests</span>
                                  )
                                } catch (error) {
                                  return <span className="text-xs text-gray-400">N/A</span>
                                }
                              })()}
                            </ul>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-700">
                          ₹{(() => {
                            try {
                              const data =
                                typeof row["amount_detail"] === "string"
                                  ? JSON.parse(row["amount_detail"])
                                  : row["amount_detail"]

                              if (Array.isArray(data)) {
                                return data[0]?.totalAmount || data[0]?.TotalAmount || "N/A"
                              } else if (data && typeof data === "object") {
                                return data.totalAmount || data.TotalAmount || "N/A"
                              }
                              return "N/A"
                            } catch (error) {
                              return "N/A"
                            }
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                          <Button
                            onClick={() => toggleActionRow(row.id)}
                            className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-xs"
                          >
                            <MoreHorizontal className="w-3 h-3" />
                            <span>Actions</span>
                            {expandedRows.has(row.id) ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </Button>
                        </td>
                      </tr>
                      {expandedRows.has(row.id) && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="flex flex-wrap gap-2 justify-center">
                              <Button
                                onClick={() => handleUpdatePayment(row)}
                                className="flex items-center space-x-1 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors text-xs"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>Update Payment</span>
                              </Button>
                              <Button
                                onClick={() => handleEditDetails(row.id)}
                                className="flex items-center space-x-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors text-xs"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Edit Details</span>
                              </Button>
                              <Button
                                onClick={() => handleView(row)}
                                className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-xs"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View</span>
                              </Button>
                              <Button
                                onClick={() => handleDelete(row.id)}
                                className="flex items-center space-x-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete Registration</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-center text-gray-500 text-sm">
                      No records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* View Details Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-6 rounded-xl shadow-2xl bg-white border border-gray-200">
          {modalData && (
            <>
              <DialogHeader className="mb-4">
                <DialogTitle className="text-2xl font-extrabold text-gray-800">
                  <span className="text-blue-600">{modalData.name}'s</span> X-ray Bill
                </DialogTitle>
                <p className="text-xs text-gray-500">Generated on {formatDate(modalData.created_at)}</p>
              </DialogHeader>

              <div className="space-y-4">
                <Card className="bg-gray-50 border border-gray-200 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-gray-700">Patient Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Name:</span> <span className="text-right">{modalData.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Phone Number:</span>{" "}
                      <span className="text-right">{modalData.number}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Gender:</span>{" "}
                      <span className="text-right">{modalData.gender || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Age:</span>{" "}
                      <span className="text-right">{`${modalData.age} ${modalData.age_unit}`}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Ref. Doctor:</span>{" "}
                      <span className="text-right">{modalData.Refer_doctorname || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Visit Type:</span>{" "}
                      <span className="text-right">{modalData.Visit_type || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">TPA:</span>{" "}
                      <span className="text-right">{modalData.Tpa || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Bill No.:</span>{" "}
                      <span className="text-right">{modalData.bill_number}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border border-gray-200 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-gray-700">X-ray Test Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(() => {
                      try {
                        const data =
                          typeof modalData["x-ray_detail"] === "string"
                            ? JSON.parse(modalData["x-ray_detail"])
                            : modalData["x-ray_detail"]
                        return data && Array.isArray(data) && data.length > 0 ? (
                          <div className="space-y-2">
                            {data.map((test: any, index: number) => (
                              <div
                                key={index}
                                className="flex justify-between items-center bg-gray-100 p-2 rounded-lg text-xs"
                              >
                                <span className="font-semibold">{test.Examination}</span>
                                <div className="flex-grow border-b border-dotted mx-3"></div>
                                <span className="font-normal">
                                  Via: {test.Xray_Via} • Amount: ₹{test.Amount}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-gray-400 text-xs">No tests recorded.</div>
                        )
                      } catch (error) {
                        return <div className="text-center text-red-500 text-xs">Error loading test details</div>
                      }
                    })()}

                    {/* Remark Section */}
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex justify-between items-start bg-blue-50 p-2 rounded-lg text-xs">
                        <span className="font-semibold text-blue-800">Remark:</span>
                        <span className="text-blue-700 max-w-xs text-right">{modalData.Remark || "N/A"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border border-gray-200 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-gray-700">Payment Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {(() => {
                      try {
                        const data =
                          typeof modalData["amount_detail"] === "string"
                            ? JSON.parse(modalData["amount_detail"])
                            : modalData["amount_detail"]

                        let payment
                        if (Array.isArray(data)) {
                          payment = data[0]
                        } else if (data && typeof data === "object") {
                          payment = data
                        } else {
                          return <div className="text-center text-gray-400">No payment details.</div>
                        }

                        if (!payment) return <div className="text-center text-gray-400">No payment details.</div>

                        const totalAmount = payment.totalAmount || payment.TotalAmount || 0
                        const discount = Number(payment.discount) || Number(payment.Discount) || 0

                        const totalPaid =
                          payment.paymentHistory && Array.isArray(payment.paymentHistory)
                            ? payment.paymentHistory.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
                            : payment.totalPaid || payment.TotalAmount || 0

                        const remainingAmount = Math.max(0, totalAmount - (totalPaid + discount))

                        return (
                          <div className="space-y-2">
                            <div className="flex justify-between font-medium">
                              <span>Total Amount:</span>
                              <span>₹{totalAmount}</span>
                            </div>
                            <div className="flex justify-between font-medium">
                              <span>Discount:</span>
                              <span className="text-red-600">- ₹{discount}</span>
                            </div>
                            <div className="flex justify-between font-medium">
                              <span>Total Paid:</span>
                              <span className="text-green-600">₹{totalPaid}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold text-blue-600 pt-2 border-t mt-2">
                              <span>Remaining Amount:</span>
                              <span>₹{remainingAmount}</span>
                            </div>
                            {payment.paymentHistory && payment.paymentHistory.length > 0 && (
                              <div className="pt-2 border-t">
                                <span className="font-semibold text-gray-700">Payment History:</span>
                                <div className="mt-1 space-y-1">
                                  {payment.paymentHistory.map((p: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs text-gray-600">
                                      <span>
                                        {p.paymentMode || p.mode} -{" "}
                                        {new Date(p.time || p.timestamp).toLocaleDateString()}
                                      </span>
                                      <span>₹{p.amount}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      } catch {
                        return <div className="text-center text-red-500">Error loading payment details</div>
                      }
                    })()}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-[500px] p-6 rounded-xl shadow-2xl bg-white border border-gray-200">
          {paymentModalData && (
            <>
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl font-bold text-gray-800">
                  Update Payment - {paymentModalData.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Current Payment Summary */}
                <Card className="bg-blue-50 border border-blue-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-blue-800">Current Payment Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {(() => {
                      try {
                        const data =
                          typeof paymentModalData.amount_detail === "string"
                            ? JSON.parse(paymentModalData.amount_detail)
                            : paymentModalData.amount_detail

                        // Handle both array format (old) and direct object format (new)
                        let payment
                        if (Array.isArray(data)) {
                          payment = data[0] || {}
                        } else if (data && typeof data === "object") {
                          payment = data
                        } else {
                          payment = {}
                        }

                        const totalAmount = payment.totalAmount || payment.TotalAmount || 0
                        const discount = Number(payment.discount) || Number(payment.Discount) || 0

                        // Calculate total paid from paymentHistory array
                        const totalPaid =
                          payment.paymentHistory && Array.isArray(payment.paymentHistory)
                            ? payment.paymentHistory.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
                            : 0

                        const remainingAmount = Math.max(0, totalAmount - (totalPaid + discount))

                        return (
                          <>
                            <div className="flex justify-between">
                              <span>Test Total Amount:</span>
                              <span className="font-semibold">₹{totalAmount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Current Discount:</span>
                              <span className="font-semibold text-red-600">₹{discount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Current Paid:</span>
                              <span className="font-semibold text-green-600">₹{totalPaid}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2">
                              <span className="font-bold">Remaining:</span>
                              <span className="font-bold text-blue-600">₹{remainingAmount}</span>
                            </div>
                          </>
                        )
                      } catch {
                        return <div className="text-red-500">Error loading payment data</div>
                      }
                    })()}
                  </CardContent>
                </Card>

                {/* Download Bill Button */}
                <Button
                  onClick={() => downloadXrayBill(paymentModalData)}
                  className="flex items-center w-full space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-semibold"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Bill</span>
                </Button>

                {/* Payment Update Form */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Additional Discount</Label>
                    <Input
                      type="number"
                      value={paymentForm.discount}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, discount: Number(e.target.value) }))}
                      className="mt-1 p-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Enter additional discount"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Additional Payment</Label>
                    <Input
                      type="number"
                      value={paymentForm.additionalPayment}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, additionalPayment: Number(e.target.value) }))
                      }
                      className="mt-1 p-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Enter additional payment"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Payment Mode</Label>
                    <Select
                      value={paymentForm.paymentMode}
                      onValueChange={(value) => setPaymentForm((prev) => ({ ...prev, paymentMode: value }))}
                    >
                      <SelectTrigger className="mt-1 p-2 border border-gray-300 rounded-lg text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <Button
                    onClick={handlePaymentUpdate}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-semibold"
                  >
                    Update Payment
                  </Button>
                  <Button
                    onClick={() => setShowPaymentModal(false)}
                    variant="outline"
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
