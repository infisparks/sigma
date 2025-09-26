"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  RefreshCw,
  Search,
  User,
  Calendar,
  Phone,
  MapPin,
  Stethoscope,
  IndianRupeeIcon,
  FileText, // For prescription icon
  BeakerIcon, // For blood test icon
  ClipboardList, // For viewing tests
  Loader2,
} from "lucide-react"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns"
import Image from "next/image"

// Patient detail object
interface PatientDetail {
  patient_id: number
  name: string
  number: string | null
  age: number | null
  gender: string | null
  address: string | null
  age_unit: string | null
  uhid: string
}

// OPD Appointment as used in the component
interface OPDAppointment {
  opd_id: number
  created_at: string
  date: string // The actual appointment date (timestamp without time zone)
  refer_by: string | null
  service_info: any[] | null
  payment_info: any
  uhid_from_registration: string
  patient_detail: PatientDetail | null
  bill_no: number // Add bill_no to the interface
  has_prescription?: boolean // New field to indicate if a prescription exists
}

// Blood Test from zblood_test table
interface BloodTest {
  id: number
  test_name: string
  price: number
}

// Modal State
interface ModalState {
  isOpen: boolean
  appointment: OPDAppointment | null
}

const OPDListPrescriptionPage = () => {
  const [appointments, setAppointments] = useState<OPDAppointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<OPDAppointment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState("today")
  const [isLoading, setIsLoading] = useState(false)
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, appointment: null })
  const router = useRouter()

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("opd_registration")
        .select(
          `
          opd_id, created_at, date, refer_by, "additional Notes", service_info, payment_info, uhid, bill_no,
          patient_detail:patient_detail!opd_registration_uhid_fkey (
            patient_id, name, number, age, gender, address, age_unit, uhid
          ),
          opd_prescriptions(id)
        `
        )
        .order("date", { ascending: false })

      if (error) {
        toast.error("Failed to fetch appointments: " + error.message)
        return
      }

      const processedData: OPDAppointment[] = (data || []).map((appt: any) => ({
        opd_id: appt.opd_id,
        created_at: appt.created_at,
        date: appt.date,
        refer_by: appt.refer_by,
        service_info: appt.service_info,
        payment_info: appt.payment_info,
        uhid_from_registration: appt.uhid,
        patient_detail: appt.patient_detail,
        bill_no: appt.bill_no,
        has_prescription: appt.opd_prescriptions?.length > 0,
      }))
      setAppointments(processedData)
    } catch (err) {
      console.error("Error fetching appointments:", err)
      toast.error("An unexpected error occurred while fetching appointments.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const filterAppointments = useCallback(() => {
    let filtered = appointments

    const today = startOfDay(new Date())
    const endOfToday = endOfDay(new Date())
    const startOfThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
    const endOfThisWeek = endOfWeek(new Date(), { weekStartsOn: 1 }) // Sunday

    if (activeTab === "today") {
      filtered = filtered.filter(appt => {
        const apptDate = parseISO(appt.date)
        return apptDate >= today && apptDate <= endOfToday
      })
    } else if (activeTab === "week") {
      filtered = filtered.filter(appt => {
        const apptDate = parseISO(appt.date)
        return apptDate >= startOfThisWeek && apptDate <= endOfThisWeek
      })
    }

    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase()
      filtered = filtered.filter(
        appt =>
          appt.patient_detail?.name.toLowerCase().includes(lowerCaseSearchTerm) ||
          String(appt.patient_detail?.number).toLowerCase().includes(lowerCaseSearchTerm) ||
          appt.uhid_from_registration.toLowerCase().includes(lowerCaseSearchTerm) ||
          String(appt.opd_id).toLowerCase().includes(lowerCaseSearchTerm)
      )
    }

    setFilteredAppointments(filtered)
  }, [appointments, searchTerm, activeTab])

  useEffect(() => {
    filterAppointments()
  }, [appointments, searchTerm, activeTab, filterAppointments])

  const getTotalAmount = (paymentInfo: any) => {
    if (!paymentInfo) return 0
    return (paymentInfo.cashAmount || 0) + (paymentInfo.onlineAmount || 0)
  }

  const getAppointmentType = (serviceInfo: any[] | null) => {
    if (!serviceInfo || serviceInfo.length === 0) return "N/A"
    const types = serviceInfo.map(s => s.type)
    const uniqueTypes = [...new Set(types)]
    return uniqueTypes.join(", ")
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    try {
      return format(parseISO(dateString), "MMM dd, yyyy")
    } catch (error) {
      console.error("Error formatting date:", dateString, error)
      return "Invalid Date"
    }
  }

  const handleViewPrescription = (opd_id: number) => {
    router.push(`/opd/prescription/${opd_id}`)
  }

  const handleOpenBloodTestModal = (appointment: OPDAppointment) => {
    setModalState({ isOpen: true, appointment })
  }

  const handleViewBloodTests = (opd_id: number) => {
    router.push(`/opd/bloodtest/${opd_id}`)
  }

  return (
    <Layout>
      <div className="space-y-8 bg-gray-50 min-h-screen p-0">
        <div className="flex justify-center mb-0">
          <Image
            src="/banner.png"
            alt="Hospital Banner"
            width={1300}
            height={300}
            className="rounded-lg shadow-md transition-all duration-300 hover:shadow-lg"
          />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900">OPD Prescription Management</h1>
            <p className="text-lg text-gray-600 mt-1">Manage prescriptions and book lab tests for OPD patients</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <TabsList className="grid w-full grid-cols-3 bg-gray-200 rounded-lg p-1 md:w-auto">
              <TabsTrigger
                value="today"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-md transition-all"
              >
                Today
              </TabsTrigger>
              <TabsTrigger
                value="week"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-md transition-all"
              >
                This Week
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-md transition-all"
              >
                All Appointments
              </TabsTrigger>
            </TabsList>
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Search by patient name, phone, or UHID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
              />
            </div>
          </div>
          <TabsContent value="today">
            <AppointmentsList
              filteredAppointments={filteredAppointments}
              isLoading={isLoading}
              getAppointmentType={getAppointmentType}
              getTotalAmount={getTotalAmount}
              formatDate={formatDate}
              handleViewPrescription={handleViewPrescription}
              handleBookBloodTest={handleOpenBloodTestModal}
              handleViewBloodTests={handleViewBloodTests}
              searchTerm={searchTerm}
              label="Today's Appointments"
            />
          </TabsContent>
          <TabsContent value="week">
            <AppointmentsList
              filteredAppointments={filteredAppointments}
              isLoading={isLoading}
              getAppointmentType={getAppointmentType}
              getTotalAmount={getTotalAmount}
              formatDate={formatDate}
              handleViewPrescription={handleViewPrescription}
              handleBookBloodTest={handleOpenBloodTestModal}
              handleViewBloodTests={handleViewBloodTests}
              searchTerm={searchTerm}
              label="This Week's Appointments"
            />
          </TabsContent>
          <TabsContent value="all">
            <AppointmentsList
              filteredAppointments={filteredAppointments}
              isLoading={isLoading}
              getAppointmentType={getAppointmentType}
              getTotalAmount={getTotalAmount}
              formatDate={formatDate}
              handleViewPrescription={handleViewPrescription}
              handleBookBloodTest={handleOpenBloodTestModal}
              handleViewBloodTests={handleViewBloodTests}
              searchTerm={searchTerm}
              label="All Appointments"
            />
          </TabsContent>
        </Tabs>
      </div>
      {modalState.appointment && (
        <BloodTestModal
          isOpen={modalState.isOpen}
          onClose={() => setModalState({ isOpen: false, appointment: null })}
          appointment={modalState.appointment}
        />
      )}
    </Layout>
  )
}

interface AppointmentsListProps {
  filteredAppointments: OPDAppointment[]
  isLoading: boolean
  getAppointmentType: (serviceInfo: any[] | null) => string
  getTotalAmount: (paymentInfo: any) => number
  formatDate: (dateString: string) => string
  handleViewPrescription: (opd_id: number) => void
  handleBookBloodTest: (appointment: OPDAppointment) => void
  handleViewBloodTests: (opd_id: number) => void
  searchTerm: string
  label: string
}

const AppointmentsList: React.FC<AppointmentsListProps> = ({
  filteredAppointments,
  isLoading,
  getAppointmentType,
  getTotalAmount,
  formatDate,
  handleViewPrescription,
  handleBookBloodTest,
  handleViewBloodTests,
  searchTerm,
  label,
}) => {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-500 text-lg flex flex-col items-center">
        <RefreshCw className="h-8 w-8 animate-spin mb-4 text-emerald-600" />
        Loading appointments...
      </div>
    )
  }

  if (filteredAppointments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-lg">
        {searchTerm ? "No appointments found matching your search." : `No appointments found for this period.`}
        <p className="mt-2 text-base">Please select another time frame or refine your search.</p>
      </div>
    )
  }

  return (
    <Card className="mb-6 shadow-lg border border-gray-200 rounded-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-2xl font-bold text-gray-800">
          <span>{label}</span>
          <Badge
            variant="secondary"
            className="bg-emerald-100 text-emerald-800 px-3 py-1 text-base rounded-full"
          >
            {filteredAppointments.length} appointments
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredAppointments.map(appointment => (
            <Card
              key={appointment.opd_id}
              className="border-l-8 border-emerald-500 shadow-md hover:shadow-lg transition-shadow duration-200 rounded-xl overflow-hidden"
            >
              <CardContent className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-extrabold text-xl text-gray-900">
                      {appointment.patient_detail?.name || <span className="text-red-600">Unknown Patient</span>}
                    </h3>
                    <Badge
                      variant="outline"
                      className="bg-blue-100 text-blue-800 px-2 py-1 text-sm rounded-full"
                    >
                      {getAppointmentType(appointment.service_info)}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-700">
                    <span className="font-semibold">UHID:</span>
                    <span>{appointment.patient_detail?.uhid || appointment.uhid_from_registration}</span>
                  </div>
                  {!appointment.patient_detail && (
                    <div className="text-sm text-red-600">
                      <span>⚠️ No patient details found for UHID: </span>
                      <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                        {appointment.uhid_from_registration}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
                    <div className="flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <span>{appointment.patient_detail?.number ?? <span className="text-red-600">N/A</span>}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <span>
                        Age: {appointment.patient_detail?.age ?? <span className="text-red-600">N/A</span>}
                        {appointment.patient_detail?.age_unit ? ` ${appointment.patient_detail.age_unit}` : ""}
                        {" | "}
                        {appointment.patient_detail?.gender || <span className="text-red-600">N/A</span>}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>{formatDate(appointment.date)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <IndianRupeeIcon className="h-4 w-4 text-gray-500" />
                      <span>Amount: ₹{getTotalAmount(appointment.payment_info)}</span>
                    </div>
                  </div>
                  {appointment.refer_by && (
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold">Referred by:</span> {appointment.refer_by}
                    </div>
                  )}
                </div>
                <div className="flex flex-col space-y-3 sm:ml-6 w-full sm:w-auto">
                  <Button
                    size="sm"
                    className={`${
                      appointment.has_prescription ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                    } text-white shadow-sm`}
                    onClick={() => handleViewPrescription(appointment.opd_id)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {appointment.has_prescription ? "View Prescription" : "Add Prescription"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-indigo-500 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                    onClick={() => handleBookBloodTest(appointment)}
                  >
                    <BeakerIcon className="h-4 w-4 mr-2" />
                    Book Blood Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-400 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    onClick={() => handleViewBloodTests(appointment.opd_id)}
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    View Blood Tests
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Blood Test Booking Modal Component
interface BloodTestModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: OPDAppointment
}

const BloodTestModal: React.FC<BloodTestModalProps> = ({ isOpen, onClose, appointment }) => {
  const [allTests, setAllTests] = useState<BloodTest[]>([])
  const [selectedTests, setSelectedTests] = useState<Set<number>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const fetchBloodTests = async () => {
        setIsLoading(true)
        const { data, error } = await supabase
          .from("zblood_test")
          .select("id, test_name, price")
          .order("test_name", { ascending: true })

        if (error) {
          toast.error("Failed to fetch blood tests: " + error.message)
        } else {
          setAllTests(data || [])
        }
        setIsLoading(false)
      }
      fetchBloodTests()
    } else {
      // Reset state on close
      setAllTests([])
      setSelectedTests(new Set())
      setSearchTerm("")
    }
  }, [isOpen])

  const filteredTests = useMemo(() => {
    return allTests.filter(test => test.test_name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [allTests, searchTerm])

  const handleTestSelection = (testId: number) => {
    setSelectedTests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(testId)) {
        newSet.delete(testId)
      } else {
        newSet.add(testId)
      }
      return newSet
    })
  }

  const handleSubmit = async () => {
    if (selectedTests.size === 0) {
      toast.warning("Please select at least one test to book.")
      return
    }
    if (!appointment.patient_detail) {
      toast.error("Cannot book test: Patient details are missing.")
      return
    }

    setIsSubmitting(true)
    const testsToBook = allTests.filter(test => selectedTests.has(test.id))
    const totalAmount = testsToBook.reduce((sum, test) => sum + test.price, 0)
    const currentTime = new Date().toISOString()

    const newRegistrationData = {
      UHID: appointment.patient_detail.uhid,
      amount_paid: 0,
      visit_type: "opd",
      registration_time: currentTime,
      samplecollected_time: currentTime,
      discount_amount: 0,
      hospital_name: "MEDFORD HOSPITAL",
      payment_mode: "online",
      bloodtest_detail: null, // Left empty as per requirement
      bloodtest_data: testsToBook.map(test => ({
        price: test.price,
        testId: test.id,
        testName: test.test_name,
        testType: "inhospital",
      })),
      amount_paid_history: JSON.stringify({
        discount: 0,
        totalAmount: totalAmount,
        paymentHistory: [],
      }),
      doctor_name: appointment.refer_by,
      tpa: "false",
      source_opd_id: appointment.opd_id,
      is_enterbydoctor: true,
    }

    const { error } = await supabase.from("zregistration").insert([newRegistrationData])

    if (error) {
      toast.error("Failed to book blood test: " + error.message)
    } else {
      toast.success("Blood test(s) booked successfully!")
      onClose()
    }
    setIsSubmitting(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Book Blood Test</DialogTitle>
          <DialogDescription>
            Search and select tests for{" "}
            <span className="font-bold text-emerald-700">{appointment.patient_detail?.name}</span> (UHID:{" "}
            {appointment.patient_detail?.uhid}).
          </DialogDescription>
        </DialogHeader>

        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Search for a blood test..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-72 w-full rounded-md border p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : filteredTests.length > 0 ? (
            <div className="space-y-2">
              {filteredTests.map(test => (
                <div
                  key={test.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id={`test-${test.id}`}
                      checked={selectedTests.has(test.id)}
                      onCheckedChange={() => handleTestSelection(test.id)}
                    />
                    <label htmlFor={`test-${test.id}`} className="text-sm font-medium leading-none cursor-pointer">
                      {test.test_name}
                    </label>
                  </div>
                  <span className="text-sm text-gray-600">₹{test.price}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500">No tests found.</p>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || selectedTests.size === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Booking...
              </>
            ) : (
              `Book ${selectedTests.size} Test(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default OPDListPrescriptionPage