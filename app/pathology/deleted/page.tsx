"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { motion, AnimatePresence } from "framer-motion"
import {
  TrashIcon,
  EyeIcon,
  CalendarIcon,
  UserIcon,
  XCircleIcon,
  SearchIcon,
  FilterIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  AlertTriangleIcon,
  InfoIcon,
  IndianRupeeIcon as CurrencyRupeeIcon,
  BeakerIcon,
  PhoneIcon,
  MapPinIcon,
  UserCheckIcon,
} from "lucide-react"


/* --------------------  Types  -------------------- */
interface BloodTest {
  testId: string
  testName: string
  price: number
  testType?: string
}

interface DeletedAppointment {
  id: number
  // Fields directly from deleted_data table
  registration_id: number // Assuming this is the original registration ID
  visit_type: string
  registration_time: string
  discount_amount: number
  amount_paid: number
  bloodtest_data: BloodTest[]
  bloodtest_detail: Record<string, any>
  samplecollected_time?: string
  amount_paid_history?: any
  deleted: boolean
  deleted_time: string

  // Fields from patient_detail, flattened for convenience
  patient_id: string // This is the patient's UHID (patient_detail.uhid)
  name: string
  age: number
  gender: string
  number: string
  address: string
  day_type?: string // Will map to age_unit
  total_day?: number
  title?: string
}

/* --------------------  Utilities  -------------------- */
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/* --------------------  Component  -------------------- */
export default function DeletedAppointments() {
  const [deletedAppointments, setDeletedAppointments] = useState<DeletedAppointment[]>([])
  const [selectedAppointment, setSelectedAppointment] = useState<DeletedAppointment | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFilter, setDateFilter] = useState("")
  const [visitTypeFilter, setVisitTypeFilter] = useState("all")
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)

  // Fetch deleted appointments
  const fetchDeletedAppointments = async () => {
    setIsLoading(true)
    try {
      // Fetch deleted data and join with patient_detail to get patient details
      const { data: deletedData, error: deletedError } = await supabase
        .from("zdeleted_data")
        .select(
          `
          *,
          patient_detail (
            name, age, gender, number, address, age_unit, total_day, title, uhid
          )
          `,
        )
        .order("deleted_time", { ascending: false })

      if (deletedError) throw deletedError

      const appointmentsWithPatientDetails: DeletedAppointment[] = (deletedData || []).map((appointmentRow: any) => {
        // --- FIX APPLIED: Use patient_detail ---
        const patientDetail = appointmentRow.patient_detail || {}
        return {
          id: appointmentRow.id,
          registration_id: appointmentRow.registration_id,
          visit_type: appointmentRow.visit_type || "",
          registration_time: appointmentRow.registration_time,
          discount_amount: appointmentRow.discount_amount || 0,
          amount_paid: appointmentRow.amount_paid || 0,
          bloodtest_data: appointmentRow.bloodtest_data || [],
          bloodtest_detail: appointmentRow.bloodtest_detail || {},
          samplecollected_time: appointmentRow.samplecollected_time,
          amount_paid_history: appointmentRow.amount_paid_history || null,
          deleted: appointmentRow.deleted || false,
          deleted_time: appointmentRow.deleted_time,
          // Flattened patient details from patient_detail
          // --- FIX APPLIED: Use 'uhid' for patient_id, 'age_unit' for day_type ---
          patient_id: patientDetail.uhid || String(appointmentRow.patient_id), 
          name: patientDetail.name || "Unknown",
          age: patientDetail.age || 0,
          gender: patientDetail.gender || "Unknown",
          number: patientDetail.number || "No contact",
          address: patientDetail.address || "No address",
          day_type: patientDetail.age_unit,
          total_day: patientDetail.total_day,
          title: patientDetail.title,
        }
      })

      setDeletedAppointments(appointmentsWithPatientDetails)
      console.log("Deleted appointments loaded:", appointmentsWithPatientDetails?.length || 0)
    } catch (error: any) {
      console.error("Error fetching deleted appointments:", error.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDeletedAppointments()
  }, [])

  // Filter appointments
  const filteredAppointments = useMemo(() => {
    return deletedAppointments.filter((appointment) => {
      // Search filter
      const searchLower = searchTerm.toLowerCase()
      const matchesSearch =
        !searchTerm ||
        appointment.name?.toLowerCase().includes(searchLower) ||
        appointment.patient_id?.toLowerCase().includes(searchLower) || // patient_id is now UHID
        appointment.number?.includes(searchTerm)

      // Date filter
      const matchesDate =
        !dateFilter ||
        appointment.deleted_time?.startsWith(dateFilter) ||
        appointment.registration_time?.startsWith(dateFilter)

      // Visit type filter
      const matchesVisitType = visitTypeFilter === "all" || appointment.visit_type === visitTypeFilter

      return matchesSearch && matchesDate && matchesVisitType
    })
  }, [deletedAppointments, searchTerm, dateFilter, visitTypeFilter])

  // Calculate stats
  const stats = useMemo(() => {
    const total = deletedAppointments.length
    const today = new Date().toISOString().split("T")[0]
    const deletedToday = deletedAppointments.filter((apt) => apt.deleted_time?.startsWith(today)).length
    const totalRevenueLost = deletedAppointments.reduce((sum, apt) => {
      const testTotal = apt.bloodtest_data?.reduce((s, t) => s + t.price, 0) || 0
      return sum + testTotal
    }, 0)
    const totalPaidLost = deletedAppointments.reduce((sum, apt) => sum + (apt.amount_paid || 0), 0)

    return {
      total,
      deletedToday,
      totalRevenueLost,
      totalPaidLost,
    }
  }, [deletedAppointments])

  return (
    <div className="flex h-screen bg-gray-50">
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrashIcon className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Deleted Appointments</h1>
                <p className="text-gray-600 mt-1">View and manage deleted appointment records</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[
              {
                icon: TrashIcon,
                label: "Total Deleted",
                value: stats.total,
                color: "from-red-500 to-red-600",
                textColor: "text-red-600",
              },
              {
                icon: CalendarIcon,
                label: "Deleted Today",
                value: stats.deletedToday,
                color: "from-orange-500 to-orange-600",
                textColor: "text-orange-600",
              },
              {
                icon: CurrencyRupeeIcon,
                label: "Revenue Lost",
                value: formatCurrency(stats.totalRevenueLost),
                color: "from-purple-500 to-purple-600",
                textColor: "text-purple-600",
                isAmount: true,
              },
              {
                icon: CurrencyRupeeIcon,
                label: "Paid Amount Lost",
                value: formatCurrency(stats.totalPaidLost),
                color: "from-indigo-500 to-indigo-600",
                textColor: "text-indigo-600",
                isAmount: true,
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">{stat.label}</p>
                      <p className={`text-2xl font-bold ${stat.textColor}`}>
                        {stat.isAmount ? stat.value : stat.value}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${stat.color}`}>
                      <stat.icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-6"
          >
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                className="p-4 border-b border-gray-100 flex justify-between items-center cursor-pointer"
                onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              >
                <h2 className="text-base font-semibold flex items-center text-gray-800">
                  <FilterIcon className="h-4 w-4 mr-2 text-red-600" />
                  Filters & Search
                </h2>
                {isFiltersExpanded ? (
                  <ChevronUpIcon className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                )}
              </div>

              <AnimatePresence>
                {isFiltersExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          placeholder="Search by name, ID, or phone..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                        />
                      </div>

                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="date"
                          value={dateFilter}
                          onChange={(e) => setDateFilter(e.target.value)}
                          className="pl-10 w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                        />
                      </div>

                      <select
                        value={visitTypeFilter}
                        onChange={(e) => setVisitTypeFilter(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                      >
                        <option value="all">All Visit Types</option>
                        <option value="opd">OPD</option>
                        <option value="ipd">IPD</option>
                      </select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Deleted Appointments Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-base font-semibold flex items-center text-gray-800">
                <FileTextIcon className="h-4 w-4 mr-2 text-red-600" />
                Deleted Appointments
                {isLoading && <span className="ml-2 text-sm text-gray-500">(Loading...)</span>}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-3 text-left font-medium">Patient Info</th>
                    <th className="px-4 py-3 text-left font-medium">Visit Type</th>
                    <th className="px-4 py-3 text-left font-medium">Registration Date</th>
                    <th className="px-4 py-3 text-left font-medium">Deleted Date</th>
                    <th className="px-4 py-3 text-left font-medium">Tests</th>
                    <th className="px-4 py-3 text-left font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAppointments.map((appointment) => {
                    const testTotal = appointment.bloodtest_data?.reduce((s, t) => s + t.price, 0) || 0

                    return (
                      <motion.tr
                        key={appointment.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="hover:bg-red-50 transition-colors duration-150"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                <UserIcon className="h-5 w-5 text-red-600" />
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{appointment.name}</div>
                              <div className="text-sm text-gray-500">ID: {appointment.patient_id}</div>
                              <div className="text-xs text-gray-400">
                                {/* FIX APPLIED: Use day_type which is now mapped from age_unit */}
                                {appointment.age}{appointment.day_type?.charAt(0).toUpperCase() || 'Y'} • {appointment.gender}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              appointment.visit_type === "opd"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {appointment.visit_type?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{formatDate(appointment.registration_time)}</td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-red-600 font-medium">{formatDate(appointment.deleted_time)}</div>
                          <div className="text-xs text-gray-500">
                            {formatDateTime(appointment.deleted_time).split(", ")[1]}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {appointment.bloodtest_data?.length || 0} tests
                          </div>
                          <div className="text-xs text-gray-500">
                            {appointment.samplecollected_time ? "Sample collected" : "Not collected"}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-bold text-gray-900">{formatCurrency(testTotal)}</div>
                          <div className="text-xs text-green-600">
                            Paid: {formatCurrency(appointment.amount_paid || 0)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => setSelectedAppointment(appointment)}
                            className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors duration-200 shadow-sm"
                          >
                            <EyeIcon className="h-3.5 w-3.5 mr-1.5" />
                            View Details
                          </button>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>

              {filteredAppointments.length === 0 && !isLoading && (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                    <TrashIcon className="h-8 w-8 text-red-400" />
                  </div>
                  <p className="text-gray-500 font-medium">No deleted appointments found</p>
                  <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Appointment Details Modal */}
      <AnimatePresence>
        {selectedAppointment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen px-4 py-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative"
              >
                {/* Modal Header */}
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setSelectedAppointment(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertTriangleIcon className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">Deleted Appointment Details</h3>
                      <p className="text-gray-500 text-sm">
                        {selectedAppointment.name} • ID: {selectedAppointment.patient_id}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Patient Information */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                        <UserCheckIcon className="h-4 w-4 mr-2 text-blue-600" />
                        Patient Information
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Name:</span>
                          <span className="text-sm font-medium text-gray-900">{selectedAppointment.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Patient ID:</span>
                          <span className="text-sm font-medium text-gray-900">{selectedAppointment.patient_id}</span>
                        </div>
                         <div className="flex justify-between">
                           <span className="text-sm text-gray-600">Age:</span>
                           {/* FIX APPLIED: Use day_type which is now mapped from age_unit */}
                           <span className="text-sm font-medium text-gray-900">{selectedAppointment.age} {selectedAppointment.day_type || 'years'}</span>
                         </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Gender:</span>
                          <span className="text-sm font-medium text-gray-900">{selectedAppointment.gender}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600 flex items-center">
                            <PhoneIcon className="h-3 w-3 mr-1" />
                            Phone:
                          </span>
                          <span className="text-sm font-medium text-gray-900">{selectedAppointment.number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600 flex items-center">
                            <MapPinIcon className="h-3 w-3 mr-1" />
                            Address:
                          </span>
                          <span className="text-sm font-medium text-gray-900 text-right max-w-xs">
                            {selectedAppointment.address}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Appointment Information */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-2 text-green-600" />
                        Appointment Information
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Visit Type:</span>
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              selectedAppointment.visit_type === "opd"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {selectedAppointment.visit_type?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Registration Date:</span>
                          <span className="text-sm font-medium text-gray-900">
                            {formatDateTime(selectedAppointment.registration_time)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Sample Status:</span>
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              selectedAppointment.samplecollected_time
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {selectedAppointment.samplecollected_time ? "Collected" : "Not Collected"}
                          </span>
                        </div>
                        {selectedAppointment.samplecollected_time && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Sample Collected:</span>
                            <span className="text-sm font-medium text-gray-900">
                              {formatDateTime(selectedAppointment.samplecollected_time)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Deletion Information */}
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <h4 className="font-semibold text-red-800 mb-3 flex items-center">
                        <AlertTriangleIcon className="h-4 w-4 mr-2 text-red-600" />
                        Deletion Information
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-red-600">Deleted Date:</span>
                          <span className="text-sm font-medium text-red-800">
                            {formatDateTime(selectedAppointment.deleted_time)}
                          </span>
                        </div>
                        {/* Removed deleted_by and delete_reason as they are no longer stored in deleted_data */}
                      </div>
                    </div>

                    {/* Financial Information */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                        <CurrencyRupeeIcon className="h-4 w-4 mr-2 text-purple-600" />
                        Financial Information
                      </h4>
                      <div className="space-y-3">
                        {(() => {
                          const testTotal = selectedAppointment.bloodtest_data?.reduce((s, t) => s + t.price, 0) || 0
                          const amountPaid = selectedAppointment.amount_paid || 0
                          const discount = selectedAppointment.discount_amount || 0
                          const remaining = testTotal - discount - amountPaid

                          return (
                            <>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Test Total:</span>
                                <span className="text-sm font-bold text-gray-900">{formatCurrency(testTotal)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Discount:</span>
                                <span className="text-sm font-medium text-amber-600">{formatCurrency(discount)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Amount Paid:</span>
                                <span className="text-sm font-medium text-green-600">{formatCurrency(amountPaid)}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t border-gray-200">
                                <span className="text-sm font-medium text-gray-800">Remaining:</span>
                                <span
                                  className={`text-sm font-bold ${remaining > 0 ? "text-red-600" : "text-gray-600"}`}
                                >
                                  {formatCurrency(remaining)}
                                </span>
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Blood Tests */}
                  {selectedAppointment.bloodtest_data && selectedAppointment.bloodtest_data.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                        <BeakerIcon className="h-4 w-4 mr-2 text-teal-600" />
                        Blood Tests ({selectedAppointment.bloodtest_data.length})
                      </h4>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {selectedAppointment.bloodtest_data.map((test, index) => (
                            <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="font-medium text-gray-900 text-sm mb-1">{test.testName}</div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-500">{test.testType || "Standard"}</span>
                                <span className="text-sm font-bold text-teal-600">{formatCurrency(test.price)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Additional Information */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="flex items-start gap-2">
                      <InfoIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-blue-800 mb-1">Important Information</p>
                        <p className="text-xs text-blue-700">
                          This appointment data has been permanently deleted from the active system. This record is
                          maintained for audit and reference purposes only.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}