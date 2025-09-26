"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Eye,
  Edit,
  Phone,
  XCircleIcon,
  UserIcon,
  CalendarIcon,
  IndianRupeeIcon as CurrencyRupeeIcon,
  BeakerIcon,
  MapPinIcon,
  FileTextIcon,
  CheckCircleIcon,
  ClockIcon,
} from "lucide-react"

interface BloodTest {
  testId: string
  testName: string
  price: number
  testType?: string
}

interface Registration {
  id: number
  visit_type: string
  registration_time: string
  discount_amount: number
  amount_paid: number
  bloodtest_data: BloodTest[]
  bloodtest_detail: Record<string, any>
  samplecollected_time?: string
  amount_paid_history?: any
}

interface Patient {
  id: number
  name: string
  number: number
  patient_id: string
  age: number
  day_type: string
  gender: string
  address: string
  title?: string
  total_day?: number
  created_at: string
  registrations?: Registration[]
}

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

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    fetchPatients()
  }, [])

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = patients.filter(
        (patient) =>
          patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          patient.patient_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          patient.number.toString().includes(searchTerm),
      )
      setFilteredPatients(filtered)
    } else {
      setFilteredPatients(patients)
    }
  }, [searchTerm, patients])

  const fetchPatients = async () => {
    try {
      const { data: patientsData, error: patientsError } = await supabase
        .from("zpatientdetial")
        .select(`
          id,
          name,
          number,
          patient_id,
          age,
          day_type,
          gender,
          address,
          title,
          total_day,
          created_at
        `)
        .order("created_at", { ascending: false })

      if (patientsError) throw patientsError

      // Fetch registrations for each patient
      const patientsWithRegistrations = await Promise.all(
        (patientsData || []).map(async (patient) => {
          const { data: registrations } = await supabase
            .from("zregistration")
            .select(`
              id, 
              visit_type, 
              registration_time,
              discount_amount, 
              amount_paid, 
              bloodtest_data,
              bloodtest_detail,
              samplecollected_time,
              amount_paid_history
            `)
            .eq("patient_id", patient.id)
            .order("registration_time", { ascending: false })

          return {
            ...patient,
            registrations: registrations || [],
          }
        }),
      )

      // Deduplicate by patient.id
      const uniquePatientsMap = new Map();
      patientsWithRegistrations.forEach((patient) => {
        if (!uniquePatientsMap.has(patient.id)) {
          uniquePatientsMap.set(patient.id, patient)
        }
      })
      const uniquePatients = Array.from(uniquePatientsMap.values());

      setPatients(uniquePatients)
      setFilteredPatients(uniquePatients)
    } catch (error) {
      console.error("Error fetching patients:", error)
    } finally {
      setLoading(false)
    }
  }

  const getAgeDisplay = (age: number, dayType: string) => {
    return `${age} ${dayType}${age > 1 ? "s" : ""}`
  }

  const calculateRegistrationAmounts = (registration: Registration) => {
    const testTotal = registration.bloodtest_data?.reduce((s, t) => s + t.price, 0) || 0
    const discount = registration.discount_amount || 0
    const paid = registration.amount_paid || 0
    const remaining = testTotal - discount - paid
    return { testTotal, discount, paid, remaining }
  }

  const isTestComplete = (registration: Registration, test: BloodTest): boolean => {
    if (test.testType?.toLowerCase() === "outsource") return true
    if (!registration.bloodtest_detail) return false

    const testKey = test.testName
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[.#$[\]]/g, "")
    const data = registration.bloodtest_detail[testKey]
    if (!data?.parameters) return false

    return data.parameters.every((par: any) => par.value !== "" && par.value != null)
  }

  const getRegistrationStatus = (registration: Registration) => {
    const sampleCollected = !!registration.samplecollected_time
    if (!sampleCollected) return { status: "Not Collected", color: "bg-red-100 text-red-800" }

    const allTestsComplete = registration.bloodtest_data?.every((test) => isTestComplete(registration, test)) ?? true
    if (allTestsComplete) return { status: "Completed", color: "bg-green-100 text-green-800" }

    return { status: "Pending", color: "bg-yellow-100 text-yellow-800" }
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        
        <div className="flex-1 p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
     
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Patients</h1>
            <p className="text-gray-600 mt-2">Manage all patient records and registrations</p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Patient Database</CardTitle>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search patients..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Badge variant="outline">{filteredPatients.length} patients</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Age/Gender</TableHead>
                      <TableHead>Registrations</TableHead>
                      <TableHead>Last Visit</TableHead>
                      <TableHead>Visit Type</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPatients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          {searchTerm ? "No patients found matching your search." : "No patients registered yet."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPatients.map((patient) => {
                        const latestRegistration = patient.registrations?.[0]
                        return (
                          <TableRow key={patient.id}>
                            <TableCell className="font-medium">{patient.patient_id}</TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{patient.name}</div>
                                {patient.address && (
                                  <div className="text-xs text-gray-500 truncate max-w-32">{patient.address}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Phone className="h-3 w-3 text-gray-400" />
                                <span className="text-sm">{patient.number}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="text-sm">{getAgeDisplay(patient.age, patient.day_type)}</div>
                                <div className="text-xs text-gray-500">{patient.gender}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{patient.registrations?.length || 0} visits</Badge>
                            </TableCell>
                            <TableCell>
                              {latestRegistration ? (
                                <div className="text-sm">{formatDate(latestRegistration.registration_time)}</div>
                              ) : (
                                <span className="text-gray-400 text-sm">No visits</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {latestRegistration ? (
                                <Badge variant={latestRegistration.visit_type === "opd" ? "default" : "secondary"}>
                                  {latestRegistration.visit_type.toUpperCase()}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(patient)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Patient Details Modal */}
      <AnimatePresence>
        {selectedPatient && (
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
                className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto relative"
              >
                {/* Modal Header */}
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setSelectedPatient(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserIcon className="h-8 w-8 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-800">{selectedPatient.name}</h3>
                      <p className="text-gray-500">Patient ID: {selectedPatient.patient_id}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span>
                          {getAgeDisplay(selectedPatient.age, selectedPatient.day_type)} • {selectedPatient.gender}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {selectedPatient.number}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-6">
                  {/* Patient Information */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2">
                      <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
                        <UserIcon className="h-4 w-4 mr-2 text-blue-600" />
                        Patient Information
                      </h4>
                      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-sm text-gray-600">Full Name:</span>
                            <p className="font-medium text-gray-900">{selectedPatient.name}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600">Patient ID:</span>
                            <p className="font-medium text-gray-900">{selectedPatient.patient_id}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600">Age:</span>
                            <p className="font-medium text-gray-900">
                              {getAgeDisplay(selectedPatient.age, selectedPatient.day_type)}
                            </p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600">Gender:</span>
                            <p className="font-medium text-gray-900">{selectedPatient.gender}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600 flex items-center">
                              <Phone className="h-3 w-3 mr-1" />
                              Phone:
                            </span>
                            <p className="font-medium text-gray-900">{selectedPatient.number}</p>
                          </div>
                          {selectedPatient.title && (
                            <div>
                              <span className="text-sm text-gray-600">Title:</span>
                              <p className="font-medium text-gray-900">{selectedPatient.title}</p>
                            </div>
                          )}
                        </div>
                        {selectedPatient.address && (
                          <div>
                            <span className="text-sm text-gray-600 flex items-center">
                              <MapPinIcon className="h-3 w-3 mr-1" />
                              Address:
                            </span>
                            <p className="font-medium text-gray-900 mt-1">{selectedPatient.address}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
                        <FileTextIcon className="h-4 w-4 mr-2 text-green-600" />
                        Registration Summary
                      </h4>
                      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {selectedPatient.registrations?.length || 0}
                          </div>
                          <div className="text-sm text-gray-600">Total Visits</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-gray-800">
                            {formatDate(selectedPatient.created_at)}
                          </div>
                          <div className="text-sm text-gray-600">First Registration</div>
                        </div>
                        {selectedPatient.registrations && selectedPatient.registrations.length > 0 && (
                          <div className="text-center">
                            <div className="text-lg font-semibold text-gray-800">
                              {formatDate(selectedPatient.registrations[0].registration_time)}
                            </div>
                            <div className="text-sm text-gray-600">Last Visit</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Registrations List */}
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
                      <CalendarIcon className="h-4 w-4 mr-2 text-purple-600" />
                      Registration History ({selectedPatient.registrations?.length || 0})
                    </h4>

                    {selectedPatient.registrations && selectedPatient.registrations.length > 0 ? (
                      <div className="space-y-4">
                        {selectedPatient.registrations.map((registration, index) => {
                          const { testTotal, discount, paid, remaining } = calculateRegistrationAmounts(registration)
                          const { status, color } = getRegistrationStatus(registration)

                          return (
                            <motion.div
                              key={registration.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: index * 0.1 }}
                              className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
                            >
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                                    <CalendarIcon className="h-5 w-5 text-purple-600" />
                                  </div>
                                  <div>
                                    <h5 className="font-semibold text-gray-800">Registration #{registration.id}</h5>
                                    <p className="text-sm text-gray-600">
                                      {formatDateTime(registration.registration_time)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={registration.visit_type === "opd" ? "default" : "secondary"}>
                                    {registration.visit_type.toUpperCase()}
                                  </Badge>
                                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${color}`}>
                                    {status}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Tests */}
                                <div>
                                  <h6 className="font-medium text-gray-800 mb-3 flex items-center">
                                    <BeakerIcon className="h-4 w-4 mr-2 text-teal-600" />
                                    Blood Tests ({registration.bloodtest_data?.length || 0})
                                  </h6>
                                  {registration.bloodtest_data && registration.bloodtest_data.length > 0 ? (
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                      {registration.bloodtest_data.map((test, testIndex) => {
                                        const isComplete = isTestComplete(registration, test)
                                        return (
                                          <div
                                            key={testIndex}
                                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                                          >
                                            <div className="flex items-center gap-2">
                                              {isComplete ? (
                                                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                              ) : (
                                                <ClockIcon className="h-4 w-4 text-yellow-500" />
                                              )}
                                              <span className="text-sm font-medium text-gray-800">{test.testName}</span>
                                            </div>
                                            <span className="text-sm font-semibold text-teal-600">
                                              {formatCurrency(test.price)}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-500">No tests assigned</p>
                                  )}
                                </div>

                                {/* Financial Details */}
                                <div>
                                  <h6 className="font-medium text-gray-800 mb-3 flex items-center">
                                    <CurrencyRupeeIcon className="h-4 w-4 mr-2 text-green-600" />
                                    Financial Details
                                  </h6>
                                  <div className="space-y-2">
                                    <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-gray-600">Test Total:</span>
                                      <span className="text-sm font-semibold text-gray-800">
                                        {formatCurrency(testTotal)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-gray-600">Discount:</span>
                                      <span className="text-sm font-semibold text-amber-600">
                                        {formatCurrency(discount)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-gray-600">Amount Paid:</span>
                                      <span className="text-sm font-semibold text-green-600">
                                        {formatCurrency(paid)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
                                      <span className="text-sm font-medium text-blue-800">Remaining:</span>
                                      <span
                                        className={`text-sm font-bold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}
                                      >
                                        {formatCurrency(remaining)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Sample Collection Status */}
                              {registration.samplecollected_time && (
                                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                                  <div className="flex items-center gap-2">
                                    <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                    <span className="text-sm font-medium text-green-800">
                                      Sample collected on {formatDateTime(registration.samplecollected_time)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-gray-50 rounded-xl">
                        <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500 font-medium">No registrations found</p>
                        <p className="text-gray-400 text-sm">This patient hasn't registered for any tests yet.</p>
                      </div>
                    )}
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
