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
  Download, // Kept for use in payment modal, but Eye is used for view bill
  MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { format, parseISO } from "date-fns"
import { useRouter } from "next/navigation"

// --- PDF Generation Utility Imports ---
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { toWords } from "number-to-words"
// IMPORTANT: Ensure this path is correct for your project
import letterhead from "../../../public/bill.png"

// --- Constants ---
const TABLE = {
  XRAY_DETAIL: "x-raydetail",
} as const

// --- Types for Data Consistency ---
interface PaymentHistoryEntry {
  amount: number;
  paymentMode: string;
  time: string;
}

interface AmountDetail {
  totalAmount: number;
  discount: number;
  paymentHistory: PaymentHistoryEntry[];
}

interface XrayDetail {
  Examination: string;
  Xray_Via: string;
  Amount: number;
}

interface PatientDetails {
  uhid: string;
  name: string;
  number: string | number;
  age: number;
  age_unit: 'year' | 'month' | 'day';
  gender: string;
  title: string;
  address: string;
}

interface DashboardRow {
  id: string | number; // Can be string or number
  created_at: string;
  Hospital_name: string;
  Refer_doctorname: string;
  Visit_type: string;
  Tpa: string;
  Remark: string;
  amount_detail: AmountDetail;
  "x-ray_detail": XrayDetail[];
  patient_uhid: PatientDetails | null;
}
// --- END Types ---

// Helper function to format date
const formatDate = (dateString: string): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
  return new Date(dateString).toLocaleString(undefined, options)
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

// Helper to safely parse JSON/Object from DB
const safeParseJson = (data: any): any => {
  if (!data) return null;
  try {
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch {
    return null;
  }
}

// Helper to get payment details from the amount_detail column
const getPaymentSummary = (amountDetail: any) => {
  const data = safeParseJson(amountDetail);

  let payment: any = {};
  if (Array.isArray(data)) {
    payment = data[0] || {};
  } else if (data && typeof data === 'object') {
    payment = data;
  }

  const totalAmount = Number(payment.totalAmount) || Number(payment.TotalAmount) || 0;
  const discount = Number(payment.discount) || Number(payment.Discount) || 0;

  const paymentHistory: PaymentHistoryEntry[] = (payment.paymentHistory || []).map((p: any) => ({
    amount: Number(p.amount) || 0,
    paymentMode: p.paymentMode || 'Cash',
    time: p.time || new Date().toISOString(),
  }));

  const totalPaid = paymentHistory.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
  const remainingAmount = Math.max(0, totalAmount - (totalPaid + discount));

  return { totalAmount, discount, totalPaid, remainingAmount, paymentHistory };
}


/**
 * Helper to send WhatsApp notification for payment updates
 */
const sendPaymentWhatsAppNotification = async (
  contactNumber: string,
  patientName: string,
  regId: string | number,
  financials: { total: number; paidNow: number; totalPaid: number; balance: number }
) => {
  const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || ""
  if (!apiKey) return

  const messageText = `Dear *${patientName}*,\n\nWe have received a payment of *₹${financials.paidNow.toFixed(2)}* for your X-ray Registration (ID: ${regId}).\n\n*Updated Payment Summary:*\n💰 Total Bill: ₹${financials.total.toFixed(2)}\n✅ Total Paid: ₹${financials.totalPaid.toFixed(2)}\n⚠️ Remaining Balance: ₹${financials.balance.toFixed(2)}\n\nThank you for choosing Cigma Clinic!`

  try {
    await fetch("https://evo.infispark.in/message/sendText/cigmadiagnostic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey
      },
      body: JSON.stringify({
        number: `91${contactNumber}`,
        text: messageText
      }),
    });
    console.log(`✅ WhatsApp payment update sent to ${contactNumber}`);
  } catch (error) {
    console.error("❌ WhatsApp Error:", error);
  }
}

// ------------------------------------------
// --- PDF VIEW UTILITY ---
// ------------------------------------------
export const viewXrayBill = async (data: DashboardRow) => {
  try {
    const response = await fetch(letterhead.src)
    if (!response.ok) {
      throw new Error("Network response was not ok for letterhead image.")
    }
    const imageBlob = await response.blob()

    const bgDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(imageBlob)
    })

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH)
    doc.setFont("helvetica", "normal").setFontSize(12)

    const patient = data.patient_uhid
    const xrayDetails = safeParseJson(data["x-ray_detail"]) || []
    const { totalAmount, discount, totalPaid, remainingAmount } = getPaymentSummary(data.amount_detail)

    const billNumber = data?.id ? String(data.id).slice(-6) : "N/A"

    let y = 70
    const margin = 14
    const colMid = pageW / 2
    const leftKeyX = margin
    const leftColonX = margin + 40
    const leftValueX = margin + 44
    const rightKeyX = colMid + margin
    const rightColonX = colMid + margin + 40
    const rightValueX = colMid + margin + 44

    const drawRow = (kL: string, vL: string | string[], kR: string, vR: string) => {
      doc.text(kL, leftKeyX, y)
      doc.text(":", leftColonX, y)
      const vLArray = Array.isArray(vL) ? vL : [vL]
      doc.text(vLArray, leftValueX, y)
      const lines = vLArray.length
      if (lines > 1) {
        y += (lines - 1) * 6
      }
      doc.text(kR, rightKeyX, y)
      doc.text(":", rightColonX, y)
      doc.text(vR, rightValueX, y)
      y += 6
    }

    const fullName = patient?.name || "N/A"
    const nameColumnWidth = pageW / 2 + margin - leftValueX - 4
    const nameLines = doc.splitTextToSize(fullName, nameColumnWidth)

    drawRow("Name", nameLines, "Bill No.", billNumber)
    drawRow(
      "Age / Gender",
      `${patient?.age || "N/A"} ${patient?.age_unit?.charAt(0).toUpperCase() || "Y"} / ${patient?.gender || "N/A"}`,
      "Registration Date",
      new Date(data.created_at).toLocaleDateString(),
    )
    drawRow("Ref. Doctor", data.Refer_doctorname || "N/A", "Contact", String(patient?.number || "N/A"));

    y += 4

    autoTable(doc, {
      head: [["Test Name", "Service", "Amount (Rs)"]],
      body: xrayDetails.map((test: any) => [test.Examination, "X-RAY", test.Amount.toFixed(2)]),
      startY: y,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 11 },
      headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
      columnStyles: { 2: { fontStyle: "bold", halign: "right" } },
      margin: { left: margin, right: margin },
    })
    y = (doc as any).lastAutoTable.finalY + 10

    const paymentSummaryRows = [
      ["Test Total", totalAmount.toFixed(2)],
      ["Discount", discount.toFixed(2)],
      ["Amount Paid", totalPaid.toFixed(2)],
      ["Remaining", remainingAmount.toFixed(2)],
    ]

    autoTable(doc, {
      head: [["Description", "Amount (₹)"]],
      body: paymentSummaryRows,
      startY: y,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 11 },
      headStyles: { textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles: {
        0: { fontStyle: "normal", cellWidth: 40 },
        1: { fontStyle: "bold", halign: "right", cellWidth: 40 },
      },
      margin: { left: pageW - 80 - margin, right: margin },
    })

    y = (doc as any).lastAutoTable.finalY + 8

    const remainingWords = toWords(Math.round(remainingAmount))
    doc
      .setFontSize(10)
      .text(`(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`, pageW - margin, y, {
        align: "right",
      })
    y += 12

    doc
      .setFont("helvetica", "italic")
      .setFontSize(10)
      .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" })

    // --- MODIFICATION: Open PDF in new tab instead of downloading ---
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    // The URL does not need to be revoked immediately, the browser will handle it when the new tab is closed.

  } catch (error) {
    console.error("Failed to generate or view PDF:", error)
    alert("Failed to create the bill PDF. Please check the console for errors.")
  }
}

// ------------------------------------------
// --- XrayDashboardPage Component ---
// ------------------------------------------

export default function XrayDashboardPage() {
  const router = useRouter()
  const [tableData, setTableData] = useState<DashboardRow[]>([])
  const [filteredData, setFilteredData] = useState<DashboardRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: format(new Date(), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  })
  const [quickDateRange, setQuickDateRange] = useState("Today")
  const [hospitalFilter, setHospitalFilter] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalData, setModalData] = useState<DashboardRow | null>(null)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentModalData, setPaymentModalData] = useState<DashboardRow | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    discount: 0,
    additionalPayment: 0,
    paymentMode: "Cash",
    sendWhatsApp: true,
  })

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const result = await withRetry(
      async () =>
        await supabase
          .from(TABLE.XRAY_DETAIL)
          .select(
            `
          id,
          created_at,
          Hospital_name,
          Refer_doctorname,
          Visit_type,
          Tpa,
          Remark,
          amount_detail,
          x-ray_detail,
          patient_uhid (uhid, name, number, age, age_unit, gender, title, address)
        `,
          )
          .order("created_at", { ascending: false }),
    )

    if (result.error) {
      console.error("Error fetching data:", result.error)
      setMessage("Failed to fetch data. Please try again.")
      setMessageType("error")
    } else {
      setTableData((result.data as DashboardRow[]) || [])
      setFilteredData((result.data as DashboardRow[]) || [])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const lowercasedSearchTerm = searchTerm.toLowerCase()
    let updatedData = tableData.filter((item) => {
      const patient = item.patient_uhid
      const nameMatch = patient?.name?.toLowerCase().includes(lowercasedSearchTerm)
      const contactMatch = patient?.number?.toString().includes(lowercasedSearchTerm)
      const uhidMatch = patient?.uhid?.toLowerCase().includes(lowercasedSearchTerm)
      return nameMatch || contactMatch || uhidMatch
    })

    if (hospitalFilter !== "All") {
      updatedData = updatedData.filter((item) => item.Hospital_name === hospitalFilter)
    }

    const fromDate = dateRange.from ? parseISO(dateRange.from) : null
    const toDate = dateRange.to ? parseISO(dateRange.to) : null

    updatedData = updatedData.filter((item) => {
      if (!item.created_at) return false
      const itemDate = new Date(item.created_at)
      const dateOnlyItem = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime();

      const fromDateOnly = fromDate ? new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime() : null;
      const toDateOnly = toDate ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime() : null;

      if (fromDateOnly && dateOnlyItem < fromDateOnly) return false
      if (toDateOnly && dateOnlyItem > toDateOnly) return false
      return true
    })

    setFilteredData(updatedData)
  }, [searchTerm, dateRange, hospitalFilter, tableData])

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
      const sevenDaysAgo = new Date(now.setDate(now.getDate() - 6))
      newFromDate = format(sevenDaysAgo, "yyyy-MM-dd")
      newToDate = format(new Date(), "yyyy-MM-dd")
    } else if (value === "This Month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      newFromDate = format(startOfMonth, "yyyy-MM-dd")
      newToDate = format(now, "yyyy-MM-dd")
    }
    setDateRange({ from: newFromDate, to: newToDate })
  }

  const toggleActionRow = (id: string | number) => {
    const newExpandedRows = new Set(expandedRows)
    const idAsString = String(id);
    if (newExpandedRows.has(idAsString)) {
      newExpandedRows.delete(idAsString)
    } else {
      newExpandedRows.add(idAsString)
    }
    setExpandedRows(newExpandedRows)
  }

  const handleDelete = async (id: string | number) => {
    if (!confirm("Are you sure you want to delete this registration?")) return

    setIsLoading(true)
    const result = await withRetry(async () => await supabase.from(TABLE.XRAY_DETAIL).delete().eq("id", id))
    if (result.error) {
      console.error("Deletion error:", result.error)
      setMessage("Failed to delete the record.")
      setMessageType("error")
    } else {
      setMessage("Record deleted successfully.")
      setMessageType("success")
      fetchData()
      const newExpandedRows = new Set(expandedRows)
      newExpandedRows.delete(String(id))
      setExpandedRows(newExpandedRows)
    }
    setIsLoading(false)
  }

  const handleViewDetails = (data: DashboardRow) => {
    setModalData(data)
    setShowModal(true)
  }

  const handleEditDetails = (id: string | number) => {
    router.push(`/pathology/x-ray/${id}`)
  }

  const handleUpdatePayment = (data: DashboardRow) => {
    setPaymentModalData(data)
    setPaymentForm({
      discount: 0,
      additionalPayment: 0,
      paymentMode: "Cash",
      sendWhatsApp: true,
    })
    setShowPaymentModal(true)
  }

  const handlePaymentUpdate = async () => {
    if (!paymentModalData) return

    try {
      const {
        totalAmount,
        discount: currentDiscount,
        totalPaid,
        paymentHistory: existingPaymentHistory,
      } = getPaymentSummary(paymentModalData.amount_detail)

      const newDiscount = currentDiscount + paymentForm.discount
      const newPaymentHistory = [...existingPaymentHistory]
      if (paymentForm.additionalPayment > 0) {
        newPaymentHistory.push({
          amount: paymentForm.additionalPayment,
          paymentMode: paymentForm.paymentMode,
          time: new Date().toISOString(),
        } as PaymentHistoryEntry)
      }

      const updatedAmountDetail: AmountDetail = {
        totalAmount: totalAmount,
        discount: newDiscount,
        paymentHistory: newPaymentHistory,
      }

      const result = await withRetry(
        async () =>
          await supabase
            .from(TABLE.XRAY_DETAIL)
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

        // --- NEW: Send WhatsApp Notification for Payment ---
        if (paymentForm.sendWhatsApp && paymentForm.additionalPayment > 0 && paymentModalData.patient_uhid?.number) {
          const nextTotalPaid = totalPaid + paymentForm.additionalPayment;
          const nextRemaining = totalAmount - newDiscount - nextTotalPaid;
          await sendPaymentWhatsAppNotification(
            String(paymentModalData.patient_uhid.number),
            paymentModalData.patient_uhid.name,
            paymentModalData.id,
            {
              total: totalAmount,
              paidNow: paymentForm.additionalPayment,
              totalPaid: nextTotalPaid,
              balance: nextRemaining
            }
          );
        }

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
                placeholder="Search by name, contact, UHID..."
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
                  <SelectItem value="">Cigma Clinic</SelectItem>

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
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Patient Name (UHID)</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Contact / Age</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Examination</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Total Amt (Paid/Rem)</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Hospital / Dr.</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-3 text-center text-gray-500 text-sm">Loading data...</td></tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((row) => {
                    const patient = row.patient_uhid
                    const { totalAmount, totalPaid, remainingAmount } = getPaymentSummary(row.amount_detail)
                    const xrayDetails: XrayDetail[] = safeParseJson(row["x-ray_detail"]) || []

                    return (
                      <React.Fragment key={row.id}>
                        <tr className="hover:bg-gray-50 transition-colors duration-150">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900">{patient?.name || "N/A"}</span>
                              <span className="text-xs text-blue-600 font-semibold">UHID: {patient?.uhid || "N/A"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-gray-700 block">{String(patient?.number || "N/A")}</span>
                            <span className="text-xs text-gray-500">{`${patient?.age || "N/A"} ${patient?.age_unit?.charAt(0).toUpperCase() || "Y"}`}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                            <div className="max-h-12 overflow-y-auto">
                              <ul className="list-disc list-inside space-y-1">
                                {xrayDetails.length > 0 ? xrayDetails.map((test, idx) => (
                                  <li key={idx} className="text-xs text-gray-700 truncate">{test.Examination}</li>
                                )) : <span className="text-xs text-gray-400">No tests</span>}
                              </ul>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-bold text-gray-700 block">₹{totalAmount.toFixed(2)}</span>
                            <span className="text-xs text-green-600 font-medium">Paid: ₹{totalPaid.toFixed(2)}</span>
                            <span className={cn("text-xs font-medium block", remainingAmount > 0 ? "text-red-600" : "text-gray-500")}>Rem: ₹{remainingAmount.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 border border-gray-200">{row.Hospital_name}</span>
                            <span className="text-xs text-gray-500 block mt-1">{row.Refer_doctorname || 'Self/N/A'}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                            <Button onClick={() => toggleActionRow(row.id)} className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-xs">
                              <MoreHorizontal className="w-3 h-3" />
                              <span>Actions</span>
                              {expandedRows.has(String(row.id)) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </Button>
                          </td>
                        </tr>
                        {expandedRows.has(String(row.id)) && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex flex-wrap gap-2 justify-start">
                                <Button onClick={() => handleUpdatePayment(row)} className="flex items-center space-x-1 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors text-xs"><CreditCard className="w-3 h-3" /><span>Update Payment</span></Button>
                                <Button onClick={() => handleEditDetails(row.id)} className="flex items-center space-x-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors text-xs"><Edit className="w-3 h-3" /><span>Edit Details</span></Button>
                                <Button onClick={() => handleViewDetails(row)} className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-xs"><Eye className="w-3 h-3" /><span>View Details</span></Button>
                                <Button onClick={() => viewXrayBill(row)} className="flex items-center space-x-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors text-xs"><Eye className="w-3 h-3" /><span>View Bill</span></Button>
                                <Button onClick={() => handleDelete(row.id)} className="flex items-center space-x-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs"><Trash2 className="w-3 h-3" /><span>Delete Registration</span></Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                ) : (
                  <tr><td colSpan={6} className="px-4 py-3 text-center text-gray-500 text-sm">No records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-6 rounded-xl shadow-2xl bg-white border border-gray-200">
          {modalData && (
            <>
              <DialogHeader className="mb-4">
                <DialogTitle className="text-2xl font-extrabold text-gray-800"><span className="text-blue-600">{modalData.patient_uhid?.name || 'Patient'}</span> X-ray Bill</DialogTitle>
                <p className="text-xs text-gray-500">Registration ID: {String(modalData.id)} | Date: {formatDate(modalData.created_at)}</p>
              </DialogHeader>
              <div className="space-y-4">
                <Card className="bg-gray-50 border border-gray-200 shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-lg font-bold text-gray-700">Patient Information</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="flex justify-between items-center"><span className="font-semibold">UHID:</span> <span className="text-right">{modalData.patient_uhid?.uhid || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="font-semibold">Name:</span> <span className="text-right">{modalData.patient_uhid?.name || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="font-semibold">Phone Number:</span> <span className="text-right">{String(modalData.patient_uhid?.number || 'N/A')}</span></div>
                    <div className="flex justify-between items-center"><span className="font-semibold">Gender:</span> <span className="text-right">{modalData.patient_uhid?.gender || "N/A"}</span></div>
                    <div className="flex justify-between items-center"><span className="font-semibold">Age:</span> <span className="text-right">{`${modalData.patient_uhid?.age || 'N/A'} ${modalData.patient_uhid?.age_unit?.charAt(0).toUpperCase() || 'Y'}`}</span></div>
                    <div className="flex justify-between items-center"><span className="font-semibold">Ref. Doctor:</span> <span className="text-right">{modalData.Refer_doctorname || "N/A"}</span></div>
                    <div className="flex justify-between items-center"><span className="font-semibold">Visit Type:</span> <span className="text-right">{modalData.Visit_type || "N/A"}</span></div>
                    <div className="flex justify-between items-center"><span className="font-semibold">TPA:</span> <span className="text-right">{modalData.Tpa || "N/A"}</span></div>
                  </CardContent>
                </Card>
                <Card className="bg-white border border-gray-200 shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-lg font-bold text-gray-700">X-ray Test Details</CardTitle></CardHeader>
                  <CardContent>
                    {(() => {
                      const xrayData: XrayDetail[] = safeParseJson(modalData["x-ray_detail"]) || [];
                      return xrayData.length > 0 ? (
                        <div className="space-y-2">
                          {xrayData.map((test, index) => (
                            <div key={index} className="flex justify-between items-center bg-gray-100 p-2 rounded-lg text-xs">
                              <span className="font-semibold">{test.Examination}</span>
                              <div className="flex-grow border-b border-dotted mx-3"></div>
                              <span className="font-normal">Via: {test.Xray_Via || 'N/A'} • Amount: ₹{test.Amount}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-center text-gray-400 text-xs">No tests recorded.</div>
                    })()}
                    <div className="pt-3 mt-3 border-t border-gray-200">
                      <div className="flex justify-between items-start bg-blue-50 p-2 rounded-lg text-xs">
                        <span className="font-semibold text-blue-800">Remark:</span>
                        <span className="text-blue-700 max-w-xs text-right">{modalData.Remark || "N/A"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white border border-gray-200 shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-lg font-bold text-gray-700">Payment Summary</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {(() => {
                      const { totalAmount, discount, totalPaid, remainingAmount, paymentHistory } = getPaymentSummary(modalData.amount_detail);
                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between font-medium"><span>Total Amount:</span><span>₹{totalAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between font-medium"><span>Discount:</span><span className="text-red-600">- ₹{discount.toFixed(2)}</span></div>
                          <div className="flex justify-between font-medium"><span>Total Paid:</span><span className="text-green-600">₹{totalPaid.toFixed(2)}</span></div>
                          <div className="flex justify-between text-sm font-bold text-blue-600 pt-2 border-t mt-2"><span>Remaining Amount:</span><span>₹{remainingAmount.toFixed(2)}</span></div>
                          {paymentHistory.length > 0 && (
                            <div className="pt-2 border-t">
                              <span className="font-semibold text-gray-700">Payment History:</span>
                              <div className="mt-1 space-y-1">
                                {paymentHistory.map((p, idx) => (
                                  <div key={idx} className="flex justify-between text-xs text-gray-600">
                                    <span>{p.paymentMode || 'N/A'} - {format(parseISO(p.time), 'dd MMM yyyy hh:mm a')}</span>
                                    <span>₹{p.amount.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
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
              <DialogHeader className="mb-4"><DialogTitle className="text-xl font-bold text-gray-800">Update Payment - {paymentModalData.patient_uhid?.name || 'Patient'}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Card className="bg-blue-50 border border-blue-200">
                  <CardHeader className="pb-2"><CardTitle className="text-lg font-semibold text-blue-800">Current Payment Status</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {(() => {
                      const { totalAmount, discount, totalPaid, remainingAmount } = getPaymentSummary(paymentModalData.amount_detail);
                      return (
                        <>
                          <div className="flex justify-between"><span>Test Total Amount:</span><span className="font-semibold">₹{totalAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Current Discount:</span><span className="font-semibold text-red-600">₹{discount.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Current Paid:</span><span className="font-semibold text-green-600">₹{totalPaid.toFixed(2)}</span></div>
                          <div className="flex justify-between border-t pt-2"><span className="font-bold">Remaining:</span><span className="font-bold text-blue-600">₹{remainingAmount.toFixed(2)}</span></div>
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>
                <Button onClick={() => viewXrayBill(paymentModalData)} className="flex items-center w-full space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-semibold"><Eye className="w-4 h-4" /><span>View Bill</span></Button>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Additional Discount</Label>
                    <Input type="number" value={paymentForm.discount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, discount: Number(e.target.value) }))} className="mt-1 p-2 border border-gray-300 rounded-lg text-sm" placeholder="Enter additional discount" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Additional Payment</Label>
                    <Input type="number" value={paymentForm.additionalPayment} onChange={(e) => setPaymentForm((prev) => ({ ...prev, additionalPayment: Number(e.target.value) }))} className="mt-1 p-2 border border-gray-300 rounded-lg text-sm" placeholder="Enter additional payment" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Payment Mode</Label>
                    <Select value={paymentForm.paymentMode} onValueChange={(value) => setPaymentForm((prev) => ({ ...prev, paymentMode: value }))}>
                      <SelectTrigger className="mt-1 p-2 border border-gray-300 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Online">Online</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 py-2">
                    <Checkbox
                      id="xray-modal-send-whatsapp"
                      checked={paymentForm.sendWhatsApp}
                      onCheckedChange={(checked) => setPaymentForm((prev) => ({ ...prev, sendWhatsApp: !!checked }))}
                    />
                    <Label htmlFor="xray-modal-send-whatsapp" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      <span className="text-green-600 text-lg">📱</span>
                      Send WhatsApp Notification
                    </Label>
                  </div>
                </div>
                <div className="flex space-x-3 pt-4">
                  <Button onClick={handlePaymentUpdate} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-semibold">Update Payment</Button>
                  <Button onClick={() => setShowPaymentModal(false)} variant="outline" className="flex-1 py-2 rounded-lg text-sm font-semibold">Cancel</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}