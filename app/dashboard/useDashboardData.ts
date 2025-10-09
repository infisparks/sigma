// useDashboardData.ts
import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import {
  format,
  differenceInDays,
  addDays,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns"
import { toast } from "sonner"
import { Activity, AlertTriangle, Clock, Layers, Stethoscope, UserCheck, X } from "lucide-react"

// --- Type Definitions (Re-exported for use in UI component) ---

export interface Doctor {
  id: string
  dr_name: string
  opd_charge?: number
  department?: string
  specialist?: string
}

export interface IModality {
  charges: number
  doctor?: string
  specialist?: string
  type: "consultation" | "casualty" | "xray" | "pathology" | "ipd" | "radiology" | "custom"
  visitType?: string
  service?: string
}

export interface IPayment {
  cashAmount: number
  createdAt: string
  discount: number
  onlineAmount: number
  paymentMethod: string
  totalCharges: number
  totalPaid: number
}

export interface PatientDetailFromSupabase {
  uhid: string
  name: string | null
  number: string | null
  age: number | null
  gender: string | null
  address: string | null
}

export interface OPDRegistrationSupabase {
  opd_id: string
  created_at: string
  patient_id: number | null
  date: string
  refer_by: string | null
  "additional Notes": string | null
  service_info: IModality[] | null
  payment_info: IPayment | null
  bill_no: number
  uhid: string
  patient_detail?: PatientDetailFromSupabase[] | null
  "appointment_type"?: string | null
  "visit_type"?: string | null
}

export interface IPDService {
  amount: number
  serviceName: string
  type: string
  doctorName?: string
  createdAt: string
}

export interface IPDPayment {
  id?: string
  amount: number
  paymentType: "cash" | "online" | "bill_reduction" | string
  type: "advance" | "refund" | "deposit" | "settlement" | string
  date: string
  createdAt: string
  through?: string
  transactionType?: string
  amountType?: string
}

export interface IPDRegistrationSupabase {
  ipd_id: number
  uhid: string
  admission_date: string
  admission_time: string | null
  under_care_of_doctor: string | null
  payment_detail: IPDPayment[] | null
  service_detail: IPDService[] | null
  created_at: string
  bed_id: number | null
  bed_management?: { room_type: string }[] | null
  patient_detail?: PatientDetailFromSupabase[] | null
  ipd_notes?: string | null
  tpa?: boolean
}

export interface OTDetailsSupabase {
  id: string
  ipd_id: number | null
  uhid: string
  ot_type: "Major" | "Minor"
  ot_notes: string | null
  ot_date: string
  created_at: string
  patient_detail?: PatientDetailFromSupabase[] | null
  has_baby_birth: boolean | null
  baby_birth_date: string | null
  baby_birth_weight: number | null
  baby_birth_gender: "Male" | "Female" | "Other" | null
  location_type?: string
}

export interface OPDAppointmentDisplay extends OPDRegistrationSupabase {
  type: "OPD"
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  modalities: IModality[]
  payment: IPayment
  message: string
  patient_uhid_from_opd_table: string
  additional_notes: string | null
  service_info: IModality[] | null
  payment_info: IPayment | null
}

export interface IPDAppointmentDisplay extends IPDRegistrationSupabase {
  type: "IPD"
  id: string
  patientId: string
  name: string
  phone: string
  totalAmount: number
  totalDeposit: number
  totalRefunds: number
  discount: number
  remainingAmount: number
  roomType: string
}

export interface OTAppointmentDisplay extends OTDetailsSupabase {
  type: "OT"
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  message: string
}

export type CombinedAppointment = OPDAppointmentDisplay | IPDAppointmentDisplay | OTAppointmentDisplay

export interface PatientInfo {
  uhid: string
  name: string
  phone: string
  age: number | null
  address: string | null
  gender: string | null
}

export interface FilterState {
  searchQuery: string
  filterType: "week" | "today" | "month" | "dateRange"
  selectedMonth: string
  startDate: string
  endDate: string
  showOnlyOpd: boolean
  showOnlyIpd: boolean
  showOnlyOt: boolean
  showOnlyBabyBirth: boolean
}

export interface DashboardStats {
  totalOpdCount: number
  totalOpdAmount: number
  totalIpdCount: number
  totalIpdAmount: number
  overallIpdRefunds: number
  totalOtCount: number
  totalBabyBirths: number
  totalTpaIpd: number
  totalMajorOt: number
  totalMinorOt: number
  totalPathology: number
  totalDialysis: number
  totalXray: number
  totalDischarges: number
  totalBirthsWithLabor: number
  totalBirthsWithOt: number
  opdCash: number
  opdOnline: number
  ipdCash: number
  ipdOnline: number
  totalRevenue: number
}

export interface IpdTotals {
  cash_total: number
  online_total: number
  online_upi_total: number
  online_card_total: number
  online_netbanking_total: number
  online_cheque_total: number
}
// --- Helper Functions ---

const getDayRangeForQuery = (dateString: string) => {
  const start = `${dateString}T00:00:00+05:30`
  const end = `${dateString}T23:59:59+05:30`
  return { start, end }
}

const getTodayDateRange = () => {
  const now = new Date()
  const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
  const istDateString = istFormatter.format(now)

  return {
    ...getDayRangeForQuery(istDateString),
    displayDate: istDateString,
  }
}

const getThisWeekRange = () => {
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const startOfWeekIST = startOfWeek(istNow, { weekStartsOn: 1 })
  const endOfWeekIST = endOfWeek(istNow, { weekStartsOn: 1 })

  const start = format(startOfWeekIST, "yyyy-MM-dd'T'00:00:00+05:30")
  const end = format(endOfWeekIST, "yyyy-MM-dd'T'23:59:59+05:30")

  return {
    start,
    end,
    displayStart: format(startOfWeekIST, "yyyy-MM-dd"),
    displayEnd: format(endOfWeekIST, "yyyy-MM-dd"),
  }
}

const getMonthRange = (monthYear: string) => {
  const [year, month] = monthYear.split("-").map(Number)
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const startOfPeriod = startOfMonth(firstDayOfMonth)
  const endOfPeriod = endOfMonth(firstDayOfMonth)

  const start = format(startOfPeriod, "yyyy-MM-dd'T'00:00:00+05:30")
  const end = format(endOfPeriod, "yyyy-MM-dd'T'23:59:59+05:30")

  return {
    start,
    end,
    displayStart: format(startOfPeriod, "yyyy-MM-dd"),
    displayEnd: format(endOfPeriod, "yyyy-MM-dd"),
  }
}

async function fetchPatientDetailByUhid(uhid: string): Promise<PatientDetailFromSupabase | null> {
  if (!uhid) return null
  const { data, error } = await supabase
    .from("patient_detail")
    .select("uhid, name, number, age, gender, address")
    .eq("uhid", uhid)
    .single()
  if (error) return null
  return data as PatientDetailFromSupabase
}

async function fetchRoomTypeByBedId(bed_id: number | null): Promise<string | null> {
  if (!bed_id) return null
  const { data, error } = await supabase
    .from("bed_management")
    .select("room_type")
    .eq("id", bed_id)
    .single()
  if (error) return null
  return data?.room_type || null
}

// --- Custom Hook ---

export const useDashboardData = () => {
  const [opdAppointments, setOpdAppointments] = useState<OPDAppointmentDisplay[]>([])
  const [ipdAppointments, setIpdAppointments] = useState<IPDAppointmentDisplay[]>([])
  const [otAppointments, setOtAppointments] = useState<OTAppointmentDisplay[]>([])
  const [doctors, setDoctors] = useState<{ [key: string]: Doctor }>({})
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: "",
    filterType: "today",
    selectedMonth: format(new Date(), "yyyy-MM"),
    startDate: "",
    endDate: "",
    showOnlyOpd: false,
    showOnlyIpd: false,
    showOnlyOt: false,
    showOnlyBabyBirth: false,
  })
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [selectedAppointment, setSelectedAppointment] = useState<CombinedAppointment | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [modalLoading, setModalLoading] = useState<boolean>(false)
  const [searchedPatients, setSearchedPatients] = useState<PatientInfo[]>([])
  const [selectedPatientForAppointments, setSelectedPatientForAppointments] = useState<PatientInfo | null>(null)
  const [patientAppointmentsModalOpen, setPatientAppointmentsModalOpen] = useState<boolean>(false)
  const [patientAppointmentsLoading, setPatientAppointmentsLoading] = useState<boolean>(false)
  const [patientAllAppointments, setPatientAllAppointments] = useState<CombinedAppointment[]>([])
  const [babyBirthsData, setBabyBirthsData] = useState<OTDetailsSupabase[]>([])
  const [totalDownloadedBytes, setTotalDownloadedBytes] = useState(0)
  const [searchDownloadedBytes, setSearchDownloadedBytes] = useState(0)
  const [ipdTotals, setIpdTotals] = useState<IpdTotals | null>(null)
  const [totalPathologyCount, setTotalPathologyCount] = useState<number>(0)
  const [totalDialysisCount, setTotalDialysisCount] = useState<number>(0)
  const [totalXrayCount, setTotalXrayCount] = useState<number>(0)
  const [totalDischarges, setTotalDischarges] = useState<number>(0)

  // --- Date Range Computation ---
  const currentDateRange = useMemo(() => {
    let range: { start: string; end: string; displayStart: string; displayEnd: string }

    switch (filters.filterType) {
      case "today": {
        const todayRange = getTodayDateRange()
        range = {
          start: todayRange.start,
          end: todayRange.end,
          displayStart: todayRange.displayDate,
          displayEnd: todayRange.displayDate,
        }
        break
      }
      case "month": {
        range = getMonthRange(filters.selectedMonth)
        break
      }
      case "dateRange": {
        const startRange = getDayRangeForQuery(filters.startDate)
        const endRange = getDayRangeForQuery(filters.endDate)
        range = {
          start: startRange.start,
          end: endRange.end,
          displayStart: filters.startDate,
          displayEnd: filters.endDate,
        }
        break
      }
      case "week":
      default: {
        range = getThisWeekRange()
        break
      }
    }

    return {
      start: range.start,
      end: range.end,
      displayStart: range.displayStart,
      displayEnd: range.displayEnd,
    }
  }, [filters])

  // --- Initial Doctor Fetch ---
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const { data } = await supabase.from("doctor").select("id, dr_name, department, specialist, opd_charge")
        const doctorsMap: { [key: string]: Doctor } = {}
        data?.forEach((doc: any) => {
          doctorsMap[String(doc.id)] = {
            id: String(doc.id),
            dr_name: doc.dr_name,
            department: doc.department,
            specialist: doc.specialist,
            opd_charge: doc.opd_charge || 0,
          }
        })
        setDoctors(doctorsMap)
      } catch (err) {
        console.error("Failed to fetch doctors (exception):", err)
        setDoctors({})
      }
    }
    fetchDoctors()
  }, [])

  // --- IPD Totals Fetch (RPC) ---
  useEffect(() => {
    async function fetchTotals() {
      if (!currentDateRange.start || !currentDateRange.end) {
        setIpdTotals(null)
        return
      }
      const { data, error } = await supabase.rpc("get_ipd_total_amount", {
        start_date: currentDateRange.displayStart,
        end_date: currentDateRange.displayEnd,
      })

      if (error) {
        console.error("Error fetching IPD totals:", error)
        setIpdTotals(null)
      } else if (data && data.length > 0) {
        setIpdTotals(data[0])
      } else {
        setIpdTotals(null)
      }
    }
    fetchTotals()
  }, [currentDateRange])

  // --- Main Data Fetching Logic (OPD, IPD, OT, Totals) ---
  useEffect(() => {
    const fetchAppointments = async () => {
      const isRefresh = !isLoading
      if (isRefresh) setRefreshing(true)
      setIsLoading(true)

      setOpdAppointments([])
      setIpdAppointments([])
      setOtAppointments([])
      setSearchedPatients([])
      setTotalDownloadedBytes(0)

      if (filters.searchQuery) {
        // --- Search mode ---
        const searchQ = filters.searchQuery.trim()
        if (searchQ.length < 3) {
          setIsLoading(false)
          setSearchedPatients([])
          setSearchDownloadedBytes(0)
          setRefreshing(false)
          return
        }

        const q = searchQ.toLowerCase()
        try {
          let mergedResults: Record<string, PatientDetailFromSupabase> = {}

          const { data: nameUhidData, error: nameUhidError } = await supabase
            .from("patient_detail")
            .select("uhid, name, number, age, gender, address")
            .or(`name.ilike.%${q}%,uhid.ilike.%${q}%`)
            .limit(20)

          if (nameUhidError) throw nameUhidError
          ;(nameUhidData || []).forEach((p) => {
            if (p.uhid) mergedResults[p.uhid] = p
          })

          if (/^\d+$/.test(searchQ)) {
            const { data: phoneData, error: phoneError } = await supabase
              .from("patient_detail")
              .select("uhid, name, number, age, gender, address")
              .eq("number", searchQ)
              .limit(20)

            if (phoneError) throw phoneError
            ;(phoneData || []).forEach((p) => {
              if (p.uhid) mergedResults[p.uhid] = p
            })
          }

          const mappedPatients: PatientInfo[] = Object.values(mergedResults).map((p) => ({
            uhid: p.uhid,
            name: p.name || "Unknown",
            phone: p.number || "N/A",
            age: p.age || null,
            address: p.address || null,
            gender: p.gender || null,
          }))
          setSearchedPatients(mappedPatients)
          setSearchDownloadedBytes(JSON.stringify(mappedPatients).length)
        } catch (err) {
          console.error("Error searching patients:", err)
          toast.error("Failed to search patients.")
          setSearchedPatients([])
          setSearchDownloadedBytes(0)
        } finally {
          setIsLoading(false)
          setRefreshing(false)
        }
        return
      }

      // --- Date filter mode ---
      const { start, end, displayStart: todayDateString } = currentDateRange
      if (!start || !end) {
        setIsLoading(false)
        if (isRefresh) setRefreshing(false)
        return
      }

      try {
        // 1. Fetch OPD data
        let opdData: OPDRegistrationSupabase[] | null = []
        if (!filters.showOnlyIpd && !filters.showOnlyOt && !filters.showOnlyBabyBirth) {
          let opdQuery = supabase
            .from("opd_registration")
            .select(
              `
              opd_id, created_at, patient_id, date, refer_by, "additional Notes", service_info, payment_info, bill_no, uhid
            `,
            )
            .gte('created_at', start).lte('created_at', end)

          const { data, error } = await opdQuery
          if (error) throw error
          opdData = data
        }

        const mappedOpd: OPDAppointmentDisplay[] = await Promise.all(
          ((opdData as OPDRegistrationSupabase[]) || []).map(async (appt) => {
            const patientDetail = await fetchPatientDetailByUhid(appt.uhid)
            const createdAtDate = parseISO(appt.created_at)

            return {
              ...appt,
              type: "OPD",
              id: String(appt.opd_id),
              patientId: patientDetail?.uhid || appt.uhid || "N/A",
              name: patientDetail?.name || "Unknown",
              phone: patientDetail?.number ? String(patientDetail.number) : "N/A",
              date: format(createdAtDate, "yyyy-MM-dd"),
              time: format(createdAtDate, "HH:mm"),
              modalities: (appt.service_info as IModality[]) || [],
              payment: (appt.payment_info as IPayment) || {
                cashAmount: 0,
                createdAt: "",
                discount: 0,
                onlineAmount: 0,
                paymentMethod: "cash",
                totalCharges: 0,
                totalPaid: 0,
              },
              message: appt["additional Notes"] || "",
              patient_uhid_from_opd_table: appt.uhid,
              additional_notes: appt["additional Notes"],
              bill_no: appt.bill_no,
              appointment_type: (appt as any).appointment_type,
              visit_type: (appt as any).visit_type,
            }
          }),
        )
        setOpdAppointments(mappedOpd)

        // 2. Fetch IPD data
        let ipdData: IPDRegistrationSupabase[] | null = []
        if (!filters.showOnlyOpd && !filters.showOnlyOt && !filters.showOnlyBabyBirth) {
          let ipdQuery = supabase
            .from("ipd_registration")
            .select(
              `
              ipd_id, uhid, admission_date, admission_time, under_care_of_doctor, payment_detail, service_detail, created_at, bed_id, ipd_notes, tpa
            `,
            )
            .gte('created_at', start).lte('created_at', end)

          const { data, error } = await ipdQuery
          if (error) throw error
          ipdData = data
        }

        const mappedIpd: IPDAppointmentDisplay[] = await Promise.all(
          ((ipdData as IPDRegistrationSupabase[]) || []).map(async (ipdRecord) => {
            const payments = (ipdRecord.payment_detail || []) as IPDPayment[]
            let totalDeposit = 0
            let totalRefunds = 0
            let totalDiscount = 0

            payments.forEach((p) => {
              const amtType = p.amountType?.toLowerCase()
              const pType = p.type?.toLowerCase()
              const pPaymentType = p.paymentType?.toLowerCase()
              const pTransactionType = p.transactionType?.toLowerCase()

              if (
                amtType === "advance" ||
                amtType === "deposit" ||
                amtType === "settlement" ||
                pType === "advance" ||
                pType === "deposit" ||
                pTransactionType === "settlement"
              ) {
                totalDeposit += p.amount
              } else if (amtType === "refund" || pType === "refund" || pTransactionType === "refund") {
                totalRefunds += p.amount
              } else if (amtType === "discount" || pType === "discount" || pPaymentType === "bill_reduction") {
                totalDiscount += p.amount
              }
            })

            const services = (ipdRecord.service_detail || []) as IPDService[]
            const totalServiceAmount = services.reduce((sum, s) => sum + s.amount, 0)
            const remaining = totalServiceAmount - totalDeposit - totalDiscount + totalRefunds

            const patientDetail = await fetchPatientDetailByUhid(ipdRecord.uhid)
            const roomType = await fetchRoomTypeByBedId(ipdRecord.bed_id)
            const createdAtDate = parseISO(ipdRecord.created_at)

            return {
              ...ipdRecord,
              type: "IPD",
              id: String(ipdRecord.ipd_id),
              patientId: patientDetail?.uhid || ipdRecord.uhid || "N/A",
              name: patientDetail?.name || "Unknown",
              phone: patientDetail?.number ? String(patientDetail.number) : "N/A",
              totalAmount: totalServiceAmount,
              totalDeposit: totalDeposit,
              totalRefunds: totalRefunds,
              discount: totalDiscount,
              remainingAmount: remaining,
              roomType: roomType || "N/A",
              admission_date: format(createdAtDate, "yyyy-MM-dd"),
              admission_time: format(createdAtDate, "HH:mm"),
              ipd_notes: ipdRecord.ipd_notes || null,
              tpa: ipdRecord.tpa,
            }
          }),
        )
        setIpdAppointments(mappedIpd)

        // 3. Fetch OT data
        let otData: OTDetailsSupabase[] | null = []
        if (!filters.showOnlyOpd && !filters.showOnlyIpd) {
          let otQuery = supabase
            .from("ot_details")
            .select(
              `
              id, ipd_id, uhid, ot_type, ot_notes, ot_date, created_at, has_baby_birth, baby_birth_date, baby_birth_weight, baby_birth_gender, location_type
            `,
            )
            .order("created_at", { ascending: false })

          const filterStart = filters.filterType === 'today' ? `${todayDateString}T00:00:00+05:30` : start;
          const filterEnd = filters.filterType === 'today' ? `${todayDateString}T23:59:59+05:30` : end;
          
          otQuery = otQuery.gte('ot_date', filterStart).lte('ot_date', filterEnd)

          if (filters.showOnlyBabyBirth) {
            otQuery = otQuery.eq('has_baby_birth', true)
          }

          const { data, error } = await otQuery
          if (error) throw error
          otData = data
        }

        setBabyBirthsData((otData || []).filter(ot => ot.has_baby_birth) as OTDetailsSupabase[])

        const mappedOt: OTAppointmentDisplay[] = await Promise.all(
          ((otData as OTDetailsSupabase[]) || []).map(async (otRecord) => {
            const patientDetail = await fetchPatientDetailByUhid(otRecord.uhid)
            let otDate: Date
            try {
              otDate = parseISO(otRecord.ot_date)
            } catch (error) {
              otDate = parseISO(`${otRecord.ot_date}T00:00:00`)
            }
            const createdAtDate = parseISO(otRecord.created_at)
            
            return {
              ...otRecord,
              type: "OT",
              id: otRecord.id,
              patientId: patientDetail?.uhid || otRecord.uhid || "N/A",
              name: patientDetail?.name || "Unknown",
              phone: patientDetail?.number ? String(patientDetail.number) : "N/A",
              date: format(otDate, "yyyy-MM-dd"),
              time: format(createdAtDate, "HH:mm"),
              message: otRecord.ot_notes || "No notes",
            }
          }),
        )
        setOtAppointments(mappedOt)

        setTotalDownloadedBytes(
          JSON.stringify(mappedOpd).length + JSON.stringify(mappedIpd).length + JSON.stringify(mappedOt).length,
        )

        // 4. Fetch Pathology count (zregistration)
        try {
          const { data: pathologyData, error: pathologyError } = await supabase
            .from("zregistration")
            .select("id", { count: 'exact' })
            .gte("created_at", start)
            .lte("created_at", end)

          if (pathologyError) throw pathologyError
          setTotalPathologyCount(pathologyData?.length || 0)
        } catch (e) {
          console.error('Error fetching pathology count:', e)
          setTotalPathologyCount(0)
        }

        // 5. Fetch X-ray count (x-raydetail) - FIX APPLIED HERE
        try {
          const { data: xrayData, error: xrayError } = await supabase
            .from("x-raydetail") // Corrected table name based on hint
            .select("id", { count: 'exact' })
            .gte("created_at", start)
            .lte("created_at", end)

          if (xrayError) {
            console.error('Supabase X-ray fetch error:', xrayError)
             // Check for the known error code and use 0 if it fails to ensure the dashboard loads
            if (xrayError.code === "PGRST205") {
                toast.warning("X-ray table name might be misconfigured in Supabase. Using 0 for count.")
                setTotalXrayCount(0)
            } else {
                throw xrayError
            }
          }
          setTotalXrayCount(xrayData?.length || 0)
        } catch (e) {
          console.error('Error fetching X-ray count:', e)
          setTotalXrayCount(0)
        }
        
        // 6. Calculate Total Dialysis (from OPD)
        let dialysisCount = 0
        mappedOpd.forEach((opd) => {
          if (opd.service_info) {
            opd.service_info.forEach((service) => {
              if (service.type?.toLowerCase() === 'casualty' && service.service?.toLowerCase().includes('dialysis')) {
                dialysisCount++
              }
            })
          }
        })
        setTotalDialysisCount(dialysisCount)

        // 7. Fetch Discharges
        try {
          const { data: dischargeData, error: dischargeError } = await supabase
            .from('discharge_summaries')
            .select('id', { count: 'exact' })
            .gte('last_updated', start).lte('last_updated', end)

          if (dischargeError) throw dischargeError
          setTotalDischarges(dischargeData?.length || 0)
        } catch (e) {
          console.error('Error fetching discharge summaries:', e)
          setTotalDischarges(0)
        }
      } catch (err) {
        console.error("Error fetching data for date range:", err)
        toast.error("Failed to load data for the selected period.")
      } finally {
        setIsLoading(false)
        if (isRefresh) setRefreshing(false)
      }
    }
    fetchAppointments()
  }, [filters.searchQuery, currentDateRange, filters.showOnlyOpd, filters.showOnlyIpd, filters.showOnlyOt, filters.showOnlyBabyBirth])

  // --- Statistics Computation ---
  const statistics: DashboardStats = useMemo(() => {
    const totalOpdAmt = opdAppointments.reduce((sum, a) => sum + (a.payment?.totalPaid || 0), 0)
    const totalIpdDeposits = ipdAppointments.reduce((sum, a) => sum + a.totalDeposit, 0)
    const totalIpdRefunds = ipdAppointments.reduce((sum, a) => sum + a.totalRefunds, 0)
    const opdCash = opdAppointments.reduce((sum, a) => sum + (a.payment?.cashAmount || 0), 0)
    const opdOnline = opdAppointments.reduce((sum, a) => sum + (a.payment?.onlineAmount || 0), 0)

    const ipdCash = ipdAppointments.reduce(
      (sum, a) =>
        sum +
        (a.payment_detail || [])
          .filter((p) => {
            const amtType = p.amountType?.toLowerCase()
            const pType = p.type?.toLowerCase()
            const pPaymentType = p.paymentType?.toLowerCase()
            const pTransactionType = p.transactionType?.toLowerCase()
            return (
              p.paymentType?.toLowerCase() === "cash" &&
              (amtType === "advance" || amtType === "deposit" || amtType === "settlement" || pType === "advance" || pType === "deposit" || pTransactionType === "settlement")
            )
          })
          .reduce((s, p) => s + Number(p.amount), 0),
      0,
    )
    const ipdOnline = ipdAppointments.reduce(
      (sum, a) =>
        sum +
        (a.payment_detail || [])
          .filter((p) => {
            const amtType = p.amountType?.toLowerCase()
            const pType = p.type?.toLowerCase()
            const pPaymentType = p.paymentType?.toLowerCase()
            const pTransactionType = p.transactionType?.toLowerCase()
            return (
              p.paymentType?.toLowerCase() === "online" &&
              (amtType === "advance" || amtType === "deposit" || amtType === "settlement" || pType === "advance" || pType === "deposit" || pTransactionType === "settlement")
            )
          })
          .reduce((s, p) => s + Number(p.amount), 0),
      0,
    )

    return {
      totalOpdCount: opdAppointments.length,
      totalOpdAmount: totalOpdAmt,
      totalIpdCount: ipdAppointments.length,
      totalIpdAmount: totalIpdDeposits - totalIpdRefunds,
      overallIpdRefunds: totalIpdRefunds,
      totalOtCount: otAppointments.length,
      totalBabyBirths: babyBirthsData.length,
      totalTpaIpd: ipdAppointments.filter((ipd) => ipd.tpa).length,
      totalMajorOt: otAppointments.filter((ot) => ot.ot_type?.toLowerCase() === 'major').length,
      totalMinorOt: otAppointments.filter((ot) => ot.ot_type?.toLowerCase() === 'minor').length,
      totalPathology: totalPathologyCount,
      totalDialysis: totalDialysisCount,
      totalXray: totalXrayCount,
      totalDischarges: totalDischarges,
      totalBirthsWithLabor: babyBirthsData.filter((ot) => ot.location_type === 'Labour Room').length,
      totalBirthsWithOt: babyBirthsData.filter((ot) => ot.location_type === 'OT').length,
      opdCash,
      opdOnline,
      ipdCash,
      ipdOnline,
      totalRevenue: totalOpdAmt + (ipdTotals?.cash_total || 0) + (ipdTotals?.online_total || 0),
    }
  }, [opdAppointments, ipdAppointments, otAppointments, ipdTotals, totalPathologyCount, totalDialysisCount, totalXrayCount, totalDischarges, babyBirthsData])

  // --- Filtered Appointments List ---
  const filteredAppointments = useMemo(() => {
    if (filters.searchQuery) {
      return []
    }
    let all: CombinedAppointment[] = [...opdAppointments, ...ipdAppointments, ...otAppointments]

    if (filters.showOnlyOpd) {
      all = all.filter((app) => app.type === "OPD")
    }
    if (filters.showOnlyIpd) {
      all = all.filter((app) => app.type === "IPD")
    }
    if (filters.showOnlyOt) {
      all = all.filter((app) => app.type === "OT")
    }
    if (filters.showOnlyBabyBirth) {
      all = all.filter((app) => app.type === "OT" && (app as OTAppointmentDisplay).has_baby_birth)
    }

    const list = all

    list.sort((a, b) => {
      const getDateAndTime = (app: CombinedAppointment) => {
        let dateStr: string
        let timeStr: string | null

        if (app.type === "IPD") {
          dateStr = app.admission_date
          timeStr = app.admission_time
        } else if (app.type === "OT") {
          dateStr = app.date
          timeStr = app.time
        } else {
          dateStr = app.date
          timeStr = app.time
        }
        return parseISO(`${dateStr}T${timeStr || "00:00"}`)
      }

      const dateTimeA = getDateAndTime(a)
      const dateTimeB = getDateAndTime(b)

      return dateTimeB.getTime() - dateTimeA.getTime()
    })
    return list
  }, [opdAppointments, ipdAppointments, otAppointments, filters])

  // --- Doctor Consultations Chart Data ---
  const doctorConsultations = useMemo(() => {
    const map = new Map<string, number>()
    opdAppointments.forEach((a) =>
      a.modalities
        .filter((m) => m.type === "consultation" && m.doctor)
        .forEach((m) => map.set(m.doctor!, (map.get(m.doctor!) || 0) + 1)),
    )
    return Array.from(map.entries())
      .map(([doctorName, count]) => ({ doctorName, count }))
      .sort((a, b) => b.count - a.count)
  }, [opdAppointments])

  const doctorConsultChartData = useMemo(() => {
    const top = doctorConsultations.slice(0, 10)
    return {
      labels: top.map((d) => d.doctorName),
      datasets: [
        {
          label: "Consultations",
          data: top.map((d) => d.count),
          backgroundColor: "rgba(75,192,192,0.6)",
          borderWidth: 1,
        },
      ],
    }
  }, [doctorConsultations])

  // --- Last 3 days chart data ---
  const chartData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd")
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd")
    const dayBeforeYesterday = format(addDays(new Date(), -2), "yyyy-MM-dd")

    const opdCounts: Record<string, number> = { [dayBeforeYesterday]: 0, [yesterday]: 0, [today]: 0 }
    opdAppointments.forEach((a) => {
      const dateKey = format(parseISO(a.created_at), "yyyy-MM-dd")
      if (opdCounts[dateKey] !== undefined) opdCounts[dateKey]++
    })

    const ipdCounts: Record<string, number> = { [dayBeforeYesterday]: 0, [yesterday]: 0, [today]: 0 }
    ipdAppointments.forEach((a) => {
      const dateKey = format(parseISO(a.created_at), "yyyy-MM-dd")
      if (ipdCounts[dateKey] !== undefined) ipdCounts[dateKey]++
    })

    return {
      labels: [dayBeforeYesterday, yesterday, today],
      datasets: [
        {
          label: "OPD Appointments",
          data: [opdCounts[dayBeforeYesterday], opdCounts[yesterday], opdCounts[today]],
          backgroundColor: "rgba(54,162,235,0.6)",
        },
        {
          label: "IPD Admissions",
          data: [ipdCounts[dayBeforeYesterday], ipdCounts[yesterday], ipdCounts[today]],
          backgroundColor: "rgba(255,99,132,0.6)",
        },
      ],
    }
  }, [opdAppointments, ipdAppointments])

  // --- Handlers ---

  const handleDateRangeChange = useCallback(
    (startStr: string, endStr: string) => {
      if (startStr && endStr) {
        const startDate = parseISO(startStr)
        const endDate = parseISO(endStr)

        const diff = differenceInDays(endDate, startDate)
        if (diff > 30) {
          toast.error("Date range cannot exceed 30 days")
          const maxEnd = addDays(startDate, 30)
          setFilters((p) => ({
            ...p,
            startDate: startStr,
            endDate: format(maxEnd, "yyyy-MM-dd"),
            filterType: "dateRange",
          }))
        } else {
          setFilters((p) => ({
            ...p,
            startDate: startStr,
            endDate: endStr,
            filterType: "dateRange",
          }))
        }
      } else {
        setFilters((p) => ({ ...p, startDate: startStr, endDate: endStr }))
      }
    },
    [],
  )

  const handleFilterChange = useCallback((upd: Partial<FilterState>) => {
    // Helper to reset filters when changing mode
    const baseReset = {
      startDate: "",
      endDate: "",
      selectedMonth: format(new Date(), "yyyy-MM"),
      searchQuery: "",
      showOnlyOpd: upd.showOnlyOpd || false,
      showOnlyIpd: upd.showOnlyIpd || false,
      showOnlyOt: upd.showOnlyOt || false,
      showOnlyBabyBirth: upd.showOnlyBabyBirth || false,
    }

    if (upd.filterType === "today" || upd.filterType === "week" || upd.filterType === "month" || upd.filterType === "dateRange") {
      setFilters((p) => ({ ...p, ...baseReset, ...upd }))
    } else {
      setFilters((p) => ({ ...p, ...upd }))
    }
  }, [])

  const resetFilters = useCallback(() =>
    setFilters({
      searchQuery: "",
      filterType: "today",
      selectedMonth: format(new Date(), "yyyy-MM"),
      startDate: "",
      endDate: "",
      showOnlyOpd: false,
      showOnlyIpd: false,
      showOnlyOt: false,
      showOnlyBabyBirth: false,
    }), [])

  const openModal = useCallback((app: CombinedAppointment) => {
    setModalLoading(true)
    setIsModalOpen(true)
    setSelectedAppointment(app)
    setModalLoading(false)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setSelectedAppointment(null)
  }, [])

  const fetchAllAppointmentsForPatient = useCallback(async (uhid: string) => {
    setPatientAppointmentsLoading(true)
    const allPatientApps: CombinedAppointment[] = []

    try {
      // Fetch OPD
      const { data: opdData } = await supabase.from("opd_registration").select(`opd_id, created_at, date, refer_by, "additional Notes", service_info, payment_info, bill_no, uhid, patient_id`).eq("uhid", uhid).order("created_at", { ascending: false })
      const patientDetail = await fetchPatientDetailByUhid(uhid)

      const mappedOpd: OPDAppointmentDisplay[] = ((opdData as OPDRegistrationSupabase[]) || []).map((appt) => {
        const createdAtDate = parseISO(appt.created_at)
        return {
          ...appt,
          type: "OPD",
          id: String(appt.opd_id),
          patientId: patientDetail?.uhid || appt.uhid || "N/A",
          name: patientDetail?.name || "Unknown",
          phone: patientDetail?.number ? String(patientDetail.number) : "N/A",
          date: format(createdAtDate, "yyyy-MM-dd"),
          time: format(createdAtDate, "HH:mm"),
          modalities: (appt.service_info as IModality[]) || [],
          payment: (appt.payment_info as IPayment) || { cashAmount: 0, createdAt: "", discount: 0, onlineAmount: 0, paymentMethod: "cash", totalCharges: 0, totalPaid: 0 },
          message: appt["additional Notes"] || "",
          patient_uhid_from_opd_table: appt.uhid,
          additional_notes: appt["additional Notes"],
          bill_no: appt.bill_no,
          appointment_type: (appt as any).appointment_type,
          visit_type: (appt as any).visit_type,
        }
      })
      allPatientApps.push(...mappedOpd)

      // Fetch IPD
      const { data: ipdData } = await supabase.from("ipd_registration").select(`ipd_id, uhid, admission_date, admission_time, under_care_of_doctor, payment_detail, service_detail, created_at, bed_id, ipd_notes, tpa`).eq("uhid", uhid).order("created_at", { ascending: false })

      const mappedIpd: IPDAppointmentDisplay[] = await Promise.all(((ipdData as IPDRegistrationSupabase[]) || []).map(async (ipdRecord) => {
        const payments = (ipdRecord.payment_detail || []) as IPDPayment[]
        let totalDeposit = 0, totalRefunds = 0, totalDiscount = 0
        payments.forEach((p) => {
          const amtType = p.amountType?.toLowerCase();
          const pType = p.type?.toLowerCase();
          const pPaymentType = p.paymentType?.toLowerCase();
          const pTransactionType = p.transactionType?.toLowerCase();
          if (amtType === "advance" || amtType === "deposit" || amtType === "settlement" || pType === "advance" || pType === "deposit" || pTransactionType === "settlement") totalDeposit += p.amount;
          else if (amtType === "refund" || pType === "refund" || pTransactionType === "refund") totalRefunds += p.amount;
          else if (amtType === "discount" || pType === "discount" || pPaymentType === "bill_reduction") totalDiscount += p.amount;
        })
        const totalServiceAmount = (ipdRecord.service_detail || [] as IPDService[]).reduce((sum, s) => sum + s.amount, 0)
        const remaining = totalServiceAmount - totalDeposit - totalDiscount + totalRefunds
        const roomType = await fetchRoomTypeByBedId(ipdRecord.bed_id)
        const createdAtDate = parseISO(ipdRecord.created_at)

        return {
          ...ipdRecord,
          type: "IPD",
          id: String(ipdRecord.ipd_id),
          patientId: uhid,
          name: patientDetail?.name || "Unknown",
          phone: patientDetail?.number ? String(patientDetail.number) : "N/A",
          totalAmount: totalServiceAmount,
          totalDeposit: totalDeposit,
          totalRefunds: totalRefunds,
          discount: totalDiscount,
          remainingAmount: remaining,
          roomType: roomType || "N/A",
          admission_date: format(createdAtDate, "yyyy-MM-dd"),
          admission_time: format(createdAtDate, "HH:mm"),
        } as IPDAppointmentDisplay
      }))
      allPatientApps.push(...mappedIpd)

      // Fetch OT
      const { data: otData } = await supabase.from("ot_details").select(`id, ipd_id, uhid, ot_type, ot_notes, ot_date, created_at, has_baby_birth, baby_birth_date, baby_birth_weight, baby_birth_gender, location_type`).eq("uhid", uhid).order("created_at", { ascending: false })

      const mappedOt: OTAppointmentDisplay[] = ((otData as OTDetailsSupabase[]) || []).map((otRecord) => {
        let otDate: Date
        try { otDate = parseISO(otRecord.ot_date) } catch (error) { otDate = parseISO(`${otRecord.ot_date}T00:00:00`) }
        const createdAtDate = parseISO(otRecord.created_at)

        return {
          ...otRecord,
          type: "OT",
          id: otRecord.id,
          patientId: uhid,
          name: patientDetail?.name || "Unknown",
          phone: patientDetail?.number ? String(patientDetail.number) : "N/A",
          date: format(otDate, "yyyy-MM-dd"),
          time: format(createdAtDate, "HH:mm"),
          message: otRecord.ot_notes || "No notes",
        } as OTAppointmentDisplay
      })
      allPatientApps.push(...mappedOt)

      setPatientAllAppointments(
        allPatientApps.sort((a, b) => {
          const getDateAndTime = (app: CombinedAppointment) => {
            const dateStr = app.type === "IPD" ? app.admission_date : app.date
            const timeStr = app.type === "IPD" ? app.admission_time : app.time
            return parseISO(`${dateStr}T${timeStr || "00:00"}`)
          }
          return getDateAndTime(b).getTime() - getDateAndTime(a).getTime()
        }),
      )
    } catch (err) {
      console.error("Error fetching patient's appointments:", err)
      toast.error("Failed to load patient's appointments.")
      setPatientAllAppointments([])
    } finally {
      setPatientAppointmentsLoading(false)
    }
  }, [])

  const openPatientAppointmentsModal = useCallback(async (patient: PatientInfo) => {
    setSelectedPatientForAppointments(patient)
    setPatientAppointmentsModalOpen(true)
    await fetchAllAppointmentsForPatient(patient.uhid)
  }, [fetchAllAppointmentsForPatient])

  const closePatientAppointmentsModal = useCallback(() => {
    setPatientAppointmentsModalOpen(false)
    setSelectedPatientForAppointments(null)
    setPatientAllAppointments([])
  }, [])
  
  // --- Public Interface ---
  return {
    // State
    filters,
    isLoading,
    refreshing,
    selectedAppointment,
    isModalOpen,
    modalLoading,
    searchedPatients,
    selectedPatientForAppointments,
    patientAppointmentsModalOpen,
    patientAppointmentsLoading,
    patientAllAppointments,
    currentDateRange,
    doctors,
    ipdTotals,
    
    // Data
    statistics,
    filteredAppointments,
    doctorConsultChartData,
    chartData,
    doctorConsultations,
    
    // Handlers
    handleFilterChange,
    handleDateRangeChange,
    resetFilters,
    openModal,
    closeModal,
    openPatientAppointmentsModal,
    closePatientAppointmentsModal,
    setFilters,
    
    // Utility for UI
    totalDownloadedBytes,
    searchDownloadedBytes,
  }
}