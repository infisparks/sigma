// app/ipd/management/page.tsx
"use client"
import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Edit,
  Users,
  Home,
  XCircle,
  CheckCircle,
  FileText,
  Clipboard,
  Stethoscope,
  RefreshCw,
  IndianRupeeIcon,
  Trash2,
  UserCheck,
  Calendar,
  Phone,
  Droplet, // New icon for Blood Test
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import Image from "next/image"

// --- Type Definitions ---
interface PatientDetailSupabase {
  patient_id: number
  name: string
  number: number | null
  age: number | null
  gender: string | null
  address: string | null
  age_unit: string | null
  dob: string | null
  uhid: string
}
interface BedManagementSupabase {
  id: number
  room_type: string
  bed_number: number
  bed_type: string
  status: string
}
interface PaymentDetailItemSupabase {
  amount: number
  type?: string
  paymentType?: string
  amountType?: string
  transactionType?: string
}
interface ServiceDetailItemSupabase {}
interface DischargeSummaryRecord {
  id: string
  discharge_type: string | null
}
interface IPDRegistrationSupabase {
  ipd_id: number
  discharge_date: string | null
  uhid: string
  bed_id: number | null
  payment_detail: PaymentDetailItemSupabase[] | null
  patient_detail: PatientDetailSupabase | null
  bed_management: BedManagementSupabase | null
  discharge_summaries: DischargeSummaryRecord[] | null
  tpa: boolean | null
  under_care_of_doctor: string | null
}
interface BillingRecord {
  ipdId: string
  uhid: string
  patientId: number | string
  name: string
  mobileNumber: string
  depositAmount: number
  roomType: string
  bedNumber: number | string
  status: "Active" | "Discharged" | "Discharged Partially" | "Death"
  dischargeDate: string | null
  dischargeType: string | null
  admissionDate: string | null
  admissionTime: string | null
  age: number | null
  gender: string | null
  address: string | null
  ageUnit: string | null
  dob: string | null
  relativeName: string | null
  relativePhone: number | null
  relativeAddress: string | null
  paymentDetails: PaymentDetailItemSupabase[] | null
  serviceDetails: ServiceDetailItemSupabase[] | null
  admissionSource: string | null
  admissionType: string | null
  underCareOfDoctor: string | null
  tpa: boolean | null
}
// --- End Type Definitions ---

// Helper function to process a single record into BillingRecord format
const processToBillingRecord = (
  record: IPDRegistrationSupabase,
  formatRoomType: (roomType: string) => string,
): BillingRecord => {
  const totalDeposits = (record.payment_detail || []).reduce((sum, payment) => {
    const amtType = payment.amountType?.toLowerCase()
    if (amtType === "advance" || amtType === "deposit" || amtType === "settlement") {
      return sum + (Number(payment.amount) || 0)
    }
    return sum
  }, 0)
  const totalRefunds = (record.payment_detail || []).reduce((sum, payment) => {
    if (payment.type?.toLowerCase() === "refund") {
      return sum + (Number(payment.amount) || 0)
    }
    return sum
  }, 0)
  const netDeposit = totalDeposits - totalRefunds
  const dischargeSummary = record.discharge_summaries?.[0]
  const dischargeType = dischargeSummary?.discharge_type || null
  let status: BillingRecord["status"]
  if (record.discharge_date) {
    status = dischargeType === "Death" ? "Death" : "Discharged"
  } else if (dischargeType === "Discharge Partially") {
    status = "Discharged Partially"
  } else {
    status = "Active"
  }
  return {
    ipdId: String(record.ipd_id),
    uhid: record.uhid,
    patientId: record.patient_detail?.patient_id || "N/A",
    name: record.patient_detail?.name || "Unknown",
    mobileNumber: record.patient_detail?.number ? String(record.patient_detail.number) : "N/A",
    depositAmount: netDeposit,
    roomType: record.bed_management?.room_type ? formatRoomType(record.bed_management.room_type) : "N/A",
    bedNumber: record.bed_management?.bed_number || "N/A",
    status: status,
    dischargeDate: record.discharge_date,
    dischargeType: dischargeType,
    admissionDate: null,
    admissionTime: null,
    age: record.patient_detail?.age ?? null,
    gender: record.patient_detail?.gender ?? null,
    address: record.patient_detail?.address ?? null,
    ageUnit: record.patient_detail?.age_unit ?? null,
    dob: record.patient_detail?.dob ?? null,
    relativeName: null,
    relativePhone: null,
    relativeAddress: null,
    paymentDetails: record.payment_detail,
    serviceDetails: null,
    admissionSource: null,
    admissionType: null,
    underCareOfDoctor: record.under_care_of_doctor,
    tpa: record.tpa,
  }
}

export default function IPDManagementPage() {
  const [allIpdRecords, setAllIpdRecords] = useState<IPDRegistrationSupabase[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge" | "discharge-partially">(
    "non-discharge",
  )
  const [selectedWard, setSelectedWard] = useState("All")
  const [selectedTPA, setSelectedTPA] = useState<"All" | "Yes" | "No">("All")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()

  // State for server-side search on Discharged tab
  const [dischargedSearchResults, setDischargedSearchResults] = useState<BillingRecord[]>([])
  const [dischargedPhoneSearch, setDischargedPhoneSearch] = useState("")
  const [dischargedUhidSearch, setDischargedUhidSearch] = useState("")
  const [dischargedNameSearch, setDischargedNameSearch] = useState("")
  const [isSearchingDischarged, setIsSearchingDischarged] = useState(false)
  const [hasSearchedDischarged, setHasSearchedDischarged] = useState(false)

  const formatRoomType = useCallback((roomType: string) => {
    if (!roomType) return "N/A"
    return roomType.charAt(0).toUpperCase() + roomType.slice(1).toLowerCase()
  }, [])

  // Fetch only non-discharged records on initial load for performance
  const fetchIPDRecords = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const { data, error } = await supabase
        .from("ipd_registration")
        .select(
          `
          ipd_id, discharge_date, uhid, bed_id, payment_detail, tpa, under_care_of_doctor,
          patient_detail (patient_id, name, number, age, gender, address, age_unit, dob, uhid),
          bed_management (id, room_type, bed_number, bed_type, status),
          discharge_summaries (id, discharge_type)
          `,
        )
        .is("discharge_date", null)
        .order("created_at", { ascending: false })
      if (error) throw error
      setAllIpdRecords((data as unknown as IPDRegistrationSupabase[]) || [])
    } catch (error) {
      console.error("Error fetching IPD records:", error)
      toast.error("Failed to load active IPD records.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchIPDRecords()
  }, [fetchIPDRecords])
  
  // Clean up server-side search state when switching tabs
  useEffect(() => {
    if (selectedTab !== 'discharge') {
        setDischargedSearchResults([]);
        setHasSearchedDischarged(false);
        setDischargedPhoneSearch('');
        setDischargedUhidSearch('');
        setDischargedNameSearch('');
    }
  }, [selectedTab]);

  const handleDischargedSearch = async () => {
    if (!dischargedPhoneSearch && !dischargedUhidSearch && !dischargedNameSearch) {
      toast.info("Please enter a Phone Number, UHID, or Name to search.")
      return
    }
    if (dischargedUhidSearch && (dischargedUhidSearch.length !== 5 || !/^\d+$/.test(dischargedUhidSearch))) {
      toast.error("UHID search requires the last 5 digits.")
      return
    }

    setIsSearchingDischarged(true)
    setHasSearchedDischarged(true)
    setDischargedSearchResults([])

    try {
      const selectStatement = `
        ipd_id, discharge_date, uhid, bed_id, payment_detail, tpa, under_care_of_doctor,
        patient_detail!inner(patient_id, name, number, age, gender, address, age_unit, dob, uhid),
        bed_management(id, room_type, bed_number, bed_type, status),
        discharge_summaries(id, discharge_type)
      `

      let query = supabase.from("ipd_registration").select(selectStatement).not("discharge_date", "is", null)

      if (dischargedPhoneSearch) {
        query = query.eq("patient_detail.number", dischargedPhoneSearch)
      } else if (dischargedUhidSearch) {
        query = query.like("uhid", `%${dischargedUhidSearch}`)
      } else if (dischargedNameSearch) {
        query = query.ilike("patient_detail.name", `%${dischargedNameSearch}%`)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) throw error
      
      const processed = (data as unknown as IPDRegistrationSupabase[]).map(record =>
        processToBillingRecord(record, formatRoomType),
      )
      setDischargedSearchResults(processed)
      if (processed.length === 0) {
        toast.info("No discharged records found for the given criteria.")
      }
    } catch (error) {
      console.error("Error searching discharged records:", error)
      toast.error("Failed to search discharged records.")
    } finally {
      setIsSearchingDischarged(false)
    }
  }

  const processedRecords = useMemo(
    () => allIpdRecords.map(record => processToBillingRecord(record, formatRoomType)),
    [allIpdRecords, formatRoomType],
  )

  const nonDischargedRecords = useMemo(
    () => processedRecords.filter(record => record.status === "Active"),
    [processedRecords],
  )

  const partiallyDischargedRecords = useMemo(
    () => processedRecords.filter(record => record.status === "Discharged Partially"),
    [processedRecords],
  )

  // Client-side filtering for active and partial tabs
  const filteredActiveRecords = useMemo(() => {
    let currentRecords: BillingRecord[] =
      selectedTab === "non-discharge" ? nonDischargedRecords : partiallyDischargedRecords

    if (selectedWard !== "All") {
      currentRecords = currentRecords.filter(rec => rec.roomType.toLowerCase() === selectedWard.toLowerCase())
    }
    if (selectedTPA !== "All") {
      currentRecords = currentRecords.filter(rec => (selectedTPA === "Yes" ? rec.tpa === true : rec.tpa === false))
    }
    const term = searchTerm.trim().toLowerCase()
    if (term) {
      currentRecords = currentRecords.filter(
        rec =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber?.toLowerCase().includes(term) ||
          rec.uhid.toLowerCase().includes(term),
      )
    }
    return currentRecords
  }, [nonDischargedRecords, partiallyDischargedRecords, searchTerm, selectedTab, selectedWard, selectedTPA])
  
  // Client-side filtering for server-side search results
  const filteredDischargedRecords = useMemo(() => {
    if (!hasSearchedDischarged) return [];
    let records = dischargedSearchResults;
    if (selectedWard !== "All") {
      records = records.filter(rec => rec.roomType.toLowerCase() === selectedWard.toLowerCase())
    }
    if (selectedTPA !== "All") {
      records = records.filter(rec => (selectedTPA === "Yes" ? rec.tpa === true : rec.tpa === false))
    }
    return records;
  }, [dischargedSearchResults, selectedWard, selectedTPA, hasSearchedDischarged])

  const uniqueWards = useMemo(() => {
    const wards = new Set<string>()
    allIpdRecords.forEach(record => {
      if (record.bed_management?.room_type) {
        wards.add(formatRoomType(record.bed_management.room_type))
      }
    })
    return Array.from(wards)
  }, [allIpdRecords, formatRoomType])

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }, [])

  const handleRowClick = useCallback((record: BillingRecord) => {
    router.push(`/ipd/billing/${record.ipdId}`)
  }, [router])
  
  const handleEditRecord = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/ipd/appointment/${record.ipdId}`)
  }, [router])

  const handleManagePatient = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/ipd/manage/${record.ipdId}`)
  }, [router])

  const handleIPDRecord = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/ipdrecord/${record.ipdId}`)
  }, [router])

  const handleOTForm = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/ipd/ot/${record.ipdId}`)
  }, [router])
  
  // --- UPDATED HANDLER for Blood Test: Pass ipdId ---
  const handleBloodTest = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    // Navigate to the blood test page, passing the IPD ID
    router.push(`/ipd/bloodtest/${record.ipdId}`)
  }, [router])
  // --- END UPDATED HANDLER ---

  const handleDeleteRecord = useCallback(async (record: BillingRecord) => {
    try {
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration").select("bed_id").eq("ipd_id", record.ipdId).single()
      if (ipdError) throw ipdError
      const { error: deleteError } = await supabase.from("ipd_registration").delete().eq("ipd_id", record.ipdId)
      if (deleteError) throw deleteError
      if (ipdData?.bed_id) {
        await supabase.from("bed_management").update({ status: "available" }).eq("id", ipdData.bed_id)
      }
      toast.success(`Successfully deleted IPD record for ${record.name}`)
      fetchIPDRecords()
    } catch (error) {
      toast.error("Failed to delete IPD record")
    }
  }, [fetchIPDRecords])

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-screen items-center justify-center">
          <RefreshCw className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50/50">
        <div className="container mx-auto px-3 py-6 max-w-full">
          {/* Header Banner */}
          <div className="mb-6 flex justify-center">
            <Image 
              src="/banner.png" 
              alt="Hospital Banner" 
              width={1200} 
              height={150} 
              className="rounded-lg shadow-md h-24 sm:h-32 md:h-40 object-cover"
            />
          </div>

          {/* Main Content Card */}
          <Card className="shadow-sm border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)}>
                {/* Tab Navigation and Search */}
                <div className="space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <TabsList className="bg-gray-100 flex w-full lg:w-auto overflow-x-auto">
                      <TabsTrigger value="non-discharge" className="flex-1 lg:flex-none text-xs sm:text-sm whitespace-nowrap">
                        <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        Active ({nonDischargedRecords.length})
                      </TabsTrigger>
                      <TabsTrigger value="discharge-partially" className="flex-1 lg:flex-none text-xs sm:text-sm whitespace-nowrap">
                        <Clipboard className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        Partial ({partiallyDischargedRecords.length})
                      </TabsTrigger>
                      <TabsTrigger value="discharge" className="flex-1 lg:flex-none text-xs sm:text-sm whitespace-nowrap">
                        <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        Discharged
                      </TabsTrigger>
                    </TabsList>
                    
                    {/* Search Controls */}
                    {selectedTab === 'discharge' ? (
                      <div className="flex gap-2 items-center w-full lg:w-auto flex-wrap">
                        <Input
                          type="text"
                          value={dischargedPhoneSearch}
                          onChange={(e) => {
                            setDischargedPhoneSearch(e.target.value);
                            if (e.target.value) {
                              setDischargedUhidSearch('');
                              setDischargedNameSearch('');
                            }
                          }}
                          placeholder="Phone"
                          className="flex-1 min-w-[100px] h-9 text-sm"
                        />
                        <Input
                          type="text"
                          value={dischargedUhidSearch}
                          onChange={(e) => {
                            setDischargedUhidSearch(e.target.value);
                            if (e.target.value) {
                              setDischargedPhoneSearch('');
                              setDischargedNameSearch('');
                            }
                          }}
                          placeholder="UHID"
                          className="flex-1 min-w-[80px] h-9 text-sm"
                        />
                        <Input
                          type="text"
                          value={dischargedNameSearch}
                          onChange={(e) => {
                            setDischargedNameSearch(e.target.value);
                            if (e.target.value) {
                              setDischargedPhoneSearch('');
                              setDischargedUhidSearch('');
                            }
                          }}
                          placeholder="Name"
                          className="flex-1 min-w-[100px] h-9 text-sm"
                        />
                        <Button 
                          onClick={handleDischargedSearch} 
                          disabled={isSearchingDischarged} 
                          size="sm" 
                          className="px-3 h-9"
                        >
                          <Search className={`h-3 w-3 sm:h-4 sm:w-4 sm:mr-1 ${isSearchingDischarged ? "animate-spin" : ""}`} />
                          <span className="hidden sm:inline">Search</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center w-full lg:w-auto">
                        <div className="relative flex-1 lg:min-w-[300px]">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                          <Input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search by name, ID, mobile, UHID..."
                            className="pl-8 sm:pl-10 h-9 text-sm"
                          />
                        </div>
                        <Button 
                          onClick={fetchIPDRecords} 
                          disabled={isRefreshing} 
                          variant="outline" 
                          size="sm"
                          className="px-3 h-9"
                        >
                          <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Home className="h-4 w-4 text-gray-600" />
                        <h3 className="text-sm font-medium text-gray-800">Room Type</h3>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge 
                          variant={selectedWard === "All" ? "default" : "outline"} 
                          onClick={() => setSelectedWard("All")} 
                          className="cursor-pointer text-xs px-2 py-1"
                        >
                          All
                        </Badge>
                        {uniqueWards.map(ward => (
                          <Badge 
                            key={ward} 
                            variant={selectedWard === ward ? "default" : "outline"} 
                            onClick={() => setSelectedWard(ward)} 
                            className="cursor-pointer text-xs px-2 py-1"
                          >
                            {ward}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <IndianRupeeIcon className="h-4 w-4 text-gray-600" />
                        <h3 className="text-sm font-medium text-gray-800">TPA Status</h3>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge 
                          variant={selectedTPA === "All" ? "default" : "outline"} 
                          onClick={() => setSelectedTPA("All")} 
                          className="cursor-pointer text-xs px-2 py-1"
                        >
                          All
                        </Badge>
                        <Badge 
                          variant={selectedTPA === "Yes" ? "default" : "outline"} 
                          onClick={() => setSelectedTPA("Yes")} 
                          className="cursor-pointer text-xs px-2 py-1 bg-purple-600 text-white hover:bg-purple-700 border-purple-600"
                        >
                          TPA
                        </Badge>
                        <Badge 
                          variant={selectedTPA === "No" ? "default" : "outline"} 
                          onClick={() => setSelectedTPA("No")} 
                          className="cursor-pointer text-xs px-2 py-1 bg-gray-600 text-white hover:bg-gray-700 border-gray-600"
                        >
                          Non-TPA
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tab Content */}
                <div className="mt-6">
                  <TabsContent value="non-discharge" className="mt-0">
                    {renderPatientsTable(filteredActiveRecords, handleRowClick, handleEditRecord, handleManagePatient, handleIPDRecord, handleOTForm, handleBloodTest, handleDeleteRecord, isRefreshing, formatCurrency)}
                  </TabsContent>
                  <TabsContent value="discharge-partially" className="mt-0">
                    {renderPatientsTable(filteredActiveRecords, handleRowClick, handleEditRecord, handleManagePatient, handleIPDRecord, handleOTForm, handleBloodTest, handleDeleteRecord, isRefreshing, formatCurrency)}
                  </TabsContent>
                  <TabsContent value="discharge" className="mt-0">
                    { !hasSearchedDischarged ? (
                        <div className="text-center py-16 bg-white rounded-lg border border-gray-100">
                          <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-700 mb-2">Search Discharged Patients</h3>
                          <p className="text-gray-500 text-sm">Enter phone number, UHID, or name to search</p>
                        </div>
                      ) :
                      renderPatientsTable(filteredDischargedRecords, handleRowClick, handleEditRecord, handleManagePatient, handleIPDRecord, handleOTForm, handleBloodTest, handleDeleteRecord, isSearchingDischarged, formatCurrency)
                    }
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  )
}

function renderPatientsTable(
  records: BillingRecord[],
  handleRowClick: (record: BillingRecord) => void,
  handleEditRecord: (e: React.MouseEvent, record: BillingRecord) => void,
  handleManagePatient: (e: React.MouseEvent, record: BillingRecord) => void,
  handleIPDRecord: (e: React.MouseEvent, record: BillingRecord) => void,
  handleOTForm: (e: React.MouseEvent, record: BillingRecord) => void,
  handleBloodTest: (e: React.MouseEvent, record: BillingRecord) => void, // NEW PROP
  handleDeleteRecord: (record: BillingRecord) => void,
  isLoading: boolean,
  formatCurrency: (amount: number) => string,
) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-3 text-sm text-gray-600">Loading...</p>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-lg border border-gray-100">
        <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">No patients found</h3>
        <p className="text-gray-500 text-sm">No records match your current criteria</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">#</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs min-w-[200px]">Patient Details</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Contact</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Deposit</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Room</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Doctor</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Status</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700 text-xs min-w-[240px]">Actions</th> {/* Increased min-width */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((record, index) => (
                <tr
                  key={record.ipdId}
                  onClick={() => handleRowClick(record)}
                  className="hover:bg-gray-25 transition-colors cursor-pointer"
                >
                  <td className="px-3 py-2 text-gray-600 text-xs font-mono">
                    {String(index + 1).padStart(2, '0')}
                  </td>
                  
                  {/* Patient Details Column */}
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{record.name}</span>
                        {record.tpa && (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs px-1.5 py-0.5">
                            TPA
                          </Badge>
                        )}
                        {record.gender && (
                          <Badge 
                            variant="outline" 
                            className={`text-xs px-1.5 py-0.5 ${
                              record.gender.toLowerCase() === 'male' 
                                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                : record.gender.toLowerCase() === 'female'
                                ? 'bg-pink-50 text-pink-700 border-pink-200'
                                : 'bg-gray-50 text-gray-700 border-gray-200'
                            }`}
                          >
                            {record.gender.charAt(0).toUpperCase()}
                          </Badge>
                        )}
                        {record.age && (
                          <span className="text-xs text-gray-500">
                            {record.age}{record.ageUnit ? record.ageUnit.charAt(0) : 'Y'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="font-mono">ID:</span> {record.ipdId}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="font-mono">UHID:</span> {record.uhid}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Contact Column */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 text-sm">
                      <Phone className="h-3 w-3 text-gray-400" />
                      <span className="font-mono text-gray-700">{record.mobileNumber}</span>
                    </div>
                  </td>

                  {/* Deposit Column */}
                  <td className="px-3 py-2">
                    <span className={`font-medium text-sm ${
                      record.depositAmount >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {formatCurrency(record.depositAmount)}
                    </span>
                  </td>

                  {/* Room Column */}
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                        {record.roomType}
                      </Badge>
                      <div className="text-xs text-gray-500">Bed {record.bedNumber}</div>
                    </div>
                  </td>

                  {/* Doctor Column */}
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-1">
                      <UserCheck className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-gray-700 leading-tight">
                        {record.underCareOfDoctor || 'Not Assigned'}
                      </span>
                    </div>
                  </td>

                  {/* Status Column */}
                  <td className="px-3 py-2">
                    {record.status === "Discharged" ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">
                        Discharged
                      </Badge>
                    ) : record.status === "Discharged Partially" ? (
                      <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                        Partial
                      </Badge>
                    ) : record.status === "Death" ? (
                      <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
                        Death
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                        Active
                      </Badge>
                    )}
                  </td>

                  {/* Actions Column */}
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={e => handleEditRecord(e, record)}
                            className="h-8 w-8 text-xs hover:bg-blue-100 text-blue-600 border-blue-200"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit Patient Details</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={e => handleManagePatient(e, record)}
                            className="h-8 w-8 text-xs hover:bg-green-100 text-green-600 border-green-200"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Manage Records</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={e => handleIPDRecord(e, record)}
                            className="h-8 w-8 text-xs hover:bg-purple-100 text-purple-600 border-purple-200"
                          >
                            <Clipboard className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View IPD Record</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={e => handleOTForm(e, record)}
                            className="h-8 w-8 text-xs hover:bg-teal-100 text-teal-600 border-teal-200"
                          >
                            <Stethoscope className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>OT Form</TooltipContent>
                      </Tooltip>
                      {/* --- NEW BLOOD TEST BUTTON --- */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={e => handleBloodTest(e, record)}
                            className="h-8 w-8 text-xs hover:bg-indigo-100 text-indigo-600 border-indigo-200"
                          >
                            <Droplet className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Blood Test</TooltipContent>
                      </Tooltip>
                      {/* --- END NEW BLOOD TEST BUTTON --- */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={e => e.stopPropagation()} 
                            className="h-8 w-8 text-xs hover:bg-red-100 text-red-600 border-red-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete IPD Record</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete the IPD record for <strong>{record.name}</strong>? 
                              This will make the bed available again. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteRecord(record)} 
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  )
}