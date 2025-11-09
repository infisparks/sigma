"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserCircle, Phone, Calendar, Clock, Plus, X, Search, Trash2, Hospital, Stethoscope } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"
import { useUserRole } from "@/hooks/useUserRole"

/**
 * -----------------------------
 * Helpers and constants
 * -----------------------------
 */

const TABLE = {
  PATIENT: "patient_detail",
  REGISTRATION: "zregistration",
  DOCTOR: "zdoctorlist",
  PACKAGE: "zpackages",
  BLOOD: "zblood_test",
  OPD_REGISTRATION: "opd_registration", 
  IPD_REGISTRATION: "ipd_registration", 
  BED_MANAGEMENT: "bed_management", 
} as const

function throwIfError(error: any) {
  if (error) throw error
}

function time12ToISO(date: string, time12: string) {
  const [time, mer] = time12.split(" ")
  let [hh, mm] = time.split(":").map(Number)
  if (mer === "PM" && hh < 12) hh += 12
  if (mer === "AM" && hh === 12) hh = 0
  return new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).toISOString()
}

/**
 * Helper to calculate DOB based on age and age unit
 */
function calculateDOB(age: number, unit: 'year' | 'month' | 'day'): string {
    const today = new Date();
    const dob = new Date(today);
    dob.setHours(0, 0, 0, 0); 

    if (unit === 'year') {
        dob.setFullYear(dob.getFullYear() - age);
    } else if (unit === 'month') {
        dob.setMonth(dob.getMonth() - age);
    } else if (unit === 'day') {
        dob.setDate(dob.getDate() - age);
    }

    return dob.toISOString().split('T')[0];
}

// Helper to format ISO date string to a readable date/time (for OPD)
function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
}

/**
 * -----------------------------
 * Types
 * -----------------------------
 */

interface BloodTestRow {
  id: number
  test_name: string
  price: number
  outsource: boolean
}

interface BloodTestSelection {
  testId: number
  testName: string
  price: number
  testType: "inhospital" | "outsource"
}

interface PaymentEntry {
  amount: number
  paymentMode: "online" | "cash"
  time: string
}

interface PaymentHistory {
  totalAmount: number
  discount: number
  paymentHistory: PaymentEntry[]
}

interface IFormInput {
  hospitalName: string
  visitType: "direct" | "opd" | "ipd" 
  title: string
  name: string
  contact: string
  age: number
  dayType: "year" | "month" | "day" 
  gender: string
  address?: string
  email?: string
  doctorName: string
  doctorId: number | null
  bloodTests: BloodTestSelection[]
  discountAmount: number
  paymentEntries: PaymentEntry[]
  uhid?: string 
  registrationDate: string
  registrationTime: string
  tpa: boolean
  selectedPackageId?: string
  sendWhatsApp: boolean
  sourceOpdId: number | null 
  sourceIpdId: number | null 
}

interface PackageType {
  id: number
  package_name: string
  tests: BloodTestSelection[]
  discountamount: number
}

interface PatientSuggestion {
  id: number
  name: string
  number: number
  uhid: string
  title?: string
  age: number
  age_unit: "year" | "month" | "day"
  gender: string
  address?: string
}

interface OpdRegistration {
  opd_id: number;
  date: string; 
  refer_by: string;
}

interface IpdRegistration {
  ipd_id: number;
  admission_date: string; 
  admission_time: string; 
  under_care_of_doctor: string;
  bed_id: number;
  discharge_date: string | null; 
  bed_management: { bed_number: string | null; room_type: string | null; } | null; 
}


/**
 * -----------------------------
 * Component
 * -----------------------------
 */

export default function PatientEntry() {
  const router = useRouter()
  const { role } = useUserRole()

  useEffect(() => {
    if (role === 'xray') {
      router.replace('/x-rayDashboard')
    }
  }, [role, router])

  if (role === 'xray') {
    return null
  }

  const initialDate = useMemo(() => new Date(), [])
  const defaultDate = initialDate.toISOString().slice(0, 10)
  const defaultTime = useMemo(() => {
    const h12 = initialDate.getHours() % 12 || 12
    const mer = initialDate.getHours() >= 12 ? "PM" : "AM"
    return `${String(h12).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")} ${mer}`
  }, [initialDate])

  const getDefaultFormValues = useMemo(
    () => (): IFormInput => ({
      hospitalName: "MEDFORD HOSPITAL",
      visitType: "direct", 
      title: "",
      name: "",
      contact: "",
      age: 0,
      dayType: "year",
      gender: "",
      address: "",
      email: "",
      doctorName: "",
      doctorId: null,
      bloodTests: [],
      uhid: "",
      registrationDate: defaultDate,
      registrationTime: defaultTime,
      discountAmount: 0,
      paymentEntries: [],
      tpa: false,
      selectedPackageId: "",
      sendWhatsApp: true,
      sourceOpdId: null, 
      sourceIpdId: null, 
    }),
    [defaultDate, defaultTime],
  )

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IFormInput>({
    defaultValues: getDefaultFormValues(),
  })

  const [doctorList, setDoctorList] = useState<{ id: number; doctor_name: string }[]>([])
  const [bloodRows, setBloodRows] = useState<BloodTestRow[]>([])
  const [packageRows, setPackageRows] = useState<PackageType[]>([])
  const [patientHints, setPatientHints] = useState<PatientSuggestion[]>([])
  const [showPatientHints, setShowPatientHints] = useState(false)
  const [showDoctorHints, setShowDoctorHints] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null)
  const [opdRecords, setOpdRecords] = useState<OpdRegistration[]>([]) 
  const [ipdRecords, setIpdRecords] = useState<IpdRegistration[]>([]) 
  const [showSourceSelection, setShowSourceSelection] = useState(false) 

  const isExistingPatient = Boolean(watch("uhid"))
  const patientHintsRef = useRef<HTMLDivElement | null>(null)
  const doctorHintsRef = useRef<HTMLDivElement | null>(null)
  const testSearchRef = useRef<HTMLDivElement | null>(null)
  const sourceSelectionRef = useRef<HTMLDivElement | null>(null)

  const {
    fields: bloodTestFields,
    append: appendBloodTest,
    remove: removeBloodTest,
  } = useFieldArray({
    control,
    name: "bloodTests",
  })
  const {
    fields: paymentFields,
    append: appendPayment,
    remove: removePayment,
  } = useFieldArray({
    control,
    name: "paymentEntries",
  })

  // Data Fetching useEffect (Initial loads)
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from(TABLE.DOCTOR).select("id, doctor_name").order("doctor_name")
      throwIfError(error)
      setDoctorList(data ?? [])
    })()
    ;(async () => {
      const { data, error } = await supabase
        .from(TABLE.BLOOD)
        .select("id, test_name, price, outsource")
        .order("test_name")
      throwIfError(error)
      setBloodRows(data ?? [])
    })()
    ;(async () => {
      const { data, error } = await supabase.from(TABLE.PACKAGE).select("id, package_name, tests, discountamount")
      throwIfError(error)
      setPackageRows(data ?? [])
    })()
  }, [])

  // Auto-set gender based on title
  const titleValue = watch("title")
  useEffect(() => {
    const male = new Set(["MR", "MAST", "BABA"])
    const female = new Set(["MS", "MISS", "MRS", "BABY", "SMT"])
    const none = new Set(["BABY OF", "DR", "", "."])
    if (male.has(titleValue)) setValue("gender", "male")
    else if (female.has(titleValue)) setValue("gender", "female")
    else if (none.has(titleValue)) setValue("gender", "")
  }, [titleValue, setValue])

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (patientHintsRef.current && !patientHintsRef.current.contains(target)) {
        setShowPatientHints(false)
      }
      if (doctorHintsRef.current && !doctorHintsRef.current.contains(target)) {
        setShowDoctorHints(false)
      }
      if (testSearchRef.current && !testSearchRef.current.contains(target)) {
        setSearchText("")
      }
      if (sourceSelectionRef.current && !sourceSelectionRef.current.contains(target) && showSourceSelection) {
        const isSelectTrigger = (target as HTMLElement).closest('.SelectTrigger');
        if (!isSelectTrigger) {
          setShowSourceSelection(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showSourceSelection])


  // Patient Search/Hints logic
  const watchName = watch("name")
  const watchContact = watch("contact")
  useEffect(() => {
    const searchString = (watchName.trim() || watchContact.trim())
    if (!searchString || searchString.length < 2) {
      setPatientHints([])
      return
    }

    const timer = setTimeout(async () => {
      let query = supabase
        .from(TABLE.PATIENT)
        .select("id:patient_id, name, number, uhid, title, age, age_unit, gender, address")
        .limit(10)

      if (watchName.trim().length >= 2) {
        query = query.ilike("name", `${watchName.trim()}%`)
      } else if (watchContact.trim().length >= 2) {
        query = query.like("number", `${watchContact.trim()}%`)
      } else {
        setPatientHints([])
        return
      }

      const { data, error } = await query

      const suggestions: PatientSuggestion[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        number: p.number,
        uhid: p.uhid,
        title: p.title,
        age: p.age,
        age_unit: p.age_unit,
        gender: p.gender,
        address: p.address,
      }))

      throwIfError(error)
      setPatientHints(suggestions)
      setShowPatientHints(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [watchName, watchContact])

  const bloodTests = watch("bloodTests")
  const discountAmount = watch("discountAmount") || 0
  const paymentEntries = watch("paymentEntries") || []
  const totalAmount = bloodTests.reduce((s, t) => s + (t.price || 0), 0)
  const totalPaid = paymentEntries.reduce((s, p) => s + (p.amount || 0), 0)
  const remainingAmount = totalAmount - discountAmount - totalPaid
  const unselectedTests = useMemo(
    () => bloodRows.filter((t) => !bloodTests.some((bt) => bt.testId === t.id)),
    [bloodRows, bloodTests],
  )

  const watchUhid = watch("uhid")
  const watchVisitType = watch("visitType")

  // Logic for showing source selection popover (Triggers when patient/visit type changes)
  useEffect(() => {
    if (watchUhid && watchVisitType !== 'direct') {
      setValue("sourceOpdId", null);
      setValue("sourceIpdId", null);
      // Fetch and open popover if records exist (autoOpen=true)
      fetchSourceRecords(watchUhid, watchVisitType, true); 
    } else {
      setOpdRecords([]);
      setIpdRecords([]);
      setShowSourceSelection(false);
    }
  }, [watchUhid, watchVisitType]);

  async function fetchSourceRecords(uhid: string, visitType: IFormInput['visitType'], autoOpen: boolean = false) {
    console.log(`Attempting to fetch ${visitType.toUpperCase()} records for UHID: ${uhid}`);
    try {
      if (visitType === 'opd') {
        const { data, error } = await supabase
          .from(TABLE.OPD_REGISTRATION)
          .select("opd_id, date, refer_by")
          .eq("uhid", uhid)
          .order("date", { ascending: false })
          .limit(10);
        throwIfError(error);
        setOpdRecords(data || []);
        if ((data || []).length > 0 && autoOpen) {
          setShowSourceSelection(true);
        } else if ((data || []).length === 0 && autoOpen) {
          alert(`No existing OPD records found for UHID: ${uhid}.`);
        }
      } else if (visitType === 'ipd') {
        const { data, error } = await supabase
          .from(TABLE.IPD_REGISTRATION)
          .select(`
            ipd_id, 
            admission_date, 
            admission_time, 
            under_care_of_doctor, 
            bed_id, 
            discharge_date,
            bed_management (bed_number, room_type) 
          `)
          .eq("uhid", uhid) 
          .order("admission_date", { ascending: false })
          .limit(10);
        
        throwIfError(error);
        
        // FIX APPLIED: Map the data to correctly format the bed_management object
        // This resolves the TypeScript error 2345
        const formattedData = (data || []).map(record => ({
          ...record,
          // Extract the first element from the bed_management array or set to null
          bed_management: record.bed_management?.[0] || null,
        }));
        
        setIpdRecords(formattedData);

        if (formattedData.length > 0 && autoOpen) {
          setShowSourceSelection(true);
        } else if (formattedData.length === 0 && autoOpen) {
          alert(`No IPD records found for UHID: ${uhid}. Please check RLS permissions on ipd_registration.`);
        }
      }
    } catch (error: any) {
      console.error("Error fetching source records:", error);
      alert(error.message || "Failed to fetch source records (Check RLS/Network).");
      setShowSourceSelection(false);
    }
  }


  async function handlePatientSelect(p: PatientSuggestion) {
    // Set all patient-related fields
    setValue("name", p.name)
    setValue("contact", p.number.toString())
    setValue("age", p.age)
    setValue("dayType", p.age_unit)
    setValue("gender", p.gender)
    setValue("title", p.title || "")
    setValue("address", p.address || "")

    // Set UHID LAST to ensure the watch effect sees the new value
    setValue("uhid", p.uhid) 
    
    // Reset source IDs and visit type
    setValue("visitType", "direct")
    setValue("sourceOpdId", null)
    setValue("sourceIpdId", null)
    setShowSourceSelection(false)
    setOpdRecords([])
    setIpdRecords([])

    setShowPatientHints(false)

    // Fetch latest doctor name from zregistration (or opd/ipd)
    const { data: registrationData, error: registrationError } = await supabase
        .from(TABLE.REGISTRATION)
        .select("doctor_name")
        .eq("UHID", p.uhid)
        .order("registration_time", { ascending: false })
        .limit(1)

    if (registrationError) {
        console.error("Error fetching latest registration:", registrationError)
    } else if (registrationData && registrationData.length > 0) {
        setValue("doctorName", registrationData[0].doctor_name || "")
    } else {
        setValue("doctorName", "")
    }
  }

  function handleNewPatient() {
    setValue("uhid", "")
    // Also clear doctor name and reset visit type when starting a new patient
    setValue("doctorName", "")
    setValue("visitType", "direct")
    setValue("sourceOpdId", null)
    setValue("sourceIpdId", null)
    setShowSourceSelection(false)
  }

  function addTestById(id: number) {
    const t = bloodRows.find((x) => x.id === id)
    if (!t) return
    appendBloodTest({
      testId: t.id,
      testName: t.test_name,
      price: t.price,
      testType: t.outsource ? "outsource" : "inhospital",
    })
    setSelectedTestId(null)
    setSearchText("")
  }

  function addAllTests() {
    unselectedTests.forEach((t) => addTestById(t.id))
  }

  function removeAllTests() {
    for (let i = bloodTestFields.length - 1; i >= 0; i--) removeBloodTest(i)
  }

  function addPaymentEntry() {
    const currentTime = time12ToISO(watch("registrationDate"), watch("registrationTime"))
    appendPayment({
      amount: 0,
      paymentMode: "online",
      time: currentTime,
    })
  }

  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    if (data.bloodTests.length === 0) {
      alert("Please add at least one blood test before submitting.")
      return
    }

    if (data.visitType === 'opd' && data.sourceOpdId === null) {
      alert("Please select a source OPD registration.")
      return
    }
    if (data.visitType === 'ipd' && data.sourceIpdId === null) {
      alert("Please select a source IPD registration.")
      return
    }

    try {
      let finalUHID: string = data.uhid!

      const dob = calculateDOB(data.age, data.dayType);
      const mult = data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1
      const totalDay = data.age * mult

      if (isExistingPatient) {
        const { error: updateErr } = await supabase
          .from(TABLE.PATIENT)
          .update({
            name: data.name.toUpperCase(),
            number: Number(data.contact),
            age: data.age,
            age_unit: data.dayType,
            total_day: totalDay,
            gender: data.gender,
            address: data.address || "",
            title: data.title,
            dob: dob, 
          })
          .eq("uhid", finalUHID)
        throwIfError(updateErr)
      } else {
        const { data: patientRow, error: patientErr } = await supabase
          .from(TABLE.PATIENT)
          .insert({
            name: data.name.toUpperCase(),
            number: Number(data.contact),
            address: data.address || "",
            age: data.age,
            age_unit: data.dayType,
            gender: data.gender,
            total_day: totalDay,
            title: data.title,
            dob: dob, 
          })
          .select("uhid") 
          .single()
        throwIfError(patientErr)
        if (!patientRow) {
          throw new Error("Failed to create new patient: patientRow is null")
        }
        finalUHID = patientRow.uhid
      }

      const isoTime = time12ToISO(data.registrationDate, data.registrationTime)
      const paymentHistoryData: PaymentHistory = {
        totalAmount: totalAmount,
        discount: discountAmount,
        paymentHistory: data.paymentEntries.length > 0 ? data.paymentEntries : [],
      }
      const totalAmountPaid = data.paymentEntries.reduce((sum, entry) => sum + entry.amount, 0)
      
      const { data: regData, error: regErr } = await supabase
        .from(TABLE.REGISTRATION)
        .insert({
          "UHID": finalUHID,
          amount_paid: totalAmountPaid,
          visit_type: data.visitType,
          registration_time: isoTime,
          samplecollected_time: isoTime,
          discount_amount: discountAmount,
          hospital_name: data.hospitalName,
          payment_mode: data.paymentEntries.length > 0 ? data.paymentEntries[0].paymentMode : "online",
          bloodtest_data: data.bloodTests,
          amount_paid_history: paymentHistoryData,
          doctor_name: data.doctorName,
          tpa: data.tpa,
          source_opd_id: data.visitType === 'opd' ? data.sourceOpdId : null,
          source_ipd_id: data.visitType === 'ipd' ? data.sourceIpdId : null,
        })
        .select()
        .single()
      throwIfError(regErr)
      const registrationId = regData.id
      const patientContact = data.contact
      const patientName = data.name
      const registrationDate = data.registrationDate
      const registrationTime = data.registrationTime
      const totalAmountFormatted = totalAmount.toFixed(2)
      const totalPaidFormatted = totalPaid.toFixed(2)
      const remainingAmountFormatted = remainingAmount.toFixed(2)
      const bloodTestNames = data.bloodTests.map((test) => test.testName).join(", ") || "No blood tests booked."

      if (data.sendWhatsApp) {
        // 1. Get API Key
        const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || "";

        if (!apiKey) {
          console.error("WhatsApp API Key is missing. Check NEXT_PUBLIC_WHATSAPP_API_KEY environment variable.");
          // Don't block the submission, just log the error
        } else {
          // 2. Create Message
          const whatsappCaption = `Dear *${patientName}*,\n\nWe have received your request for: *${registrationDate}* at *${registrationTime}* \n\n*UHID (Patient ID)*: ${finalUHID}\n*Registration ID*: ${registrationId}\n*Tests Booked*: ${bloodTestNames}\n\n*Summary*:\n*Total Amount*: ₹${totalAmountFormatted}\n*Amount Paid*: ₹${totalPaidFormatted}\n*Remaining Balance*: ₹${remainingAmountFormatted}\n\nThank you for choosing us!`;

          // 3. Create new payload
          const whatsappPayload = {
            number: `91${patientContact}`,
            text: whatsappCaption,
          };

          // 4. Send asynchronously (using fetch, no need to await in a way that blocks UI)
          fetch("https://evo.infispark.in/message/sendText/medfordlab", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": apiKey, // Use the 'apikey' header
            },
            body: JSON.stringify(whatsappPayload),
          })
            .then(async (response) => {
              if (!response.ok) {
                const errorData = await response.json();
                console.warn(`Failed to send WhatsApp message: ${errorData.message || 'Unknown error'}`);
              } else {
                console.log("WhatsApp registration message sent successfully.");
              }
            })
            .catch((whatsappError) => {
              console.error("Error sending WhatsApp message:", whatsappError);
            });
        }
      }

      alert(isExistingPatient
        ? "New registration added to existing patient successfully ✅"
        : "New patient and registration saved successfully ✅"
      )
      reset(getDefaultFormValues())
    } catch (err: any) {
      console.error(err)
      alert(err.message ?? "Unexpected error – check console")
    }
  }

  // Source Selection Popover Component
  const SourceSelectionPopover = () => {
    if (!showSourceSelection) return null;

    const isOpd = watchVisitType === 'opd';
    const records = isOpd ? opdRecords : ipdRecords;
    const selectedId = isOpd ? watch("sourceOpdId") : watch("sourceIpdId");

    const handleSelect = (id: number, doctorName: string) => {
      if (isOpd) {
        setValue("sourceOpdId", id);
        setValue("sourceIpdId", null);
      } else {
        setValue("sourceIpdId", id);
        setValue("sourceOpdId", null);
      }
      setValue("doctorName", doctorName);
      setShowSourceSelection(false);
    };

    const clearSelection = () => {
      setValue("sourceOpdId", null);
      setValue("sourceIpdId", null);
      setValue("visitType", "direct");
      setShowSourceSelection(false);
    };

    if (records.length === 0) return null; 

    return (
      <div
        ref={sourceSelectionRef}
        className="absolute z-20 w-[95%] max-w-2xl bg-white border border-blue-400 rounded-lg shadow-xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4"
      >
        <div className="flex justify-between items-center mb-3 border-b pb-2">
          <h4 className="text-xl font-bold text-blue-600 flex items-center">
            {isOpd ? <Stethoscope className="h-5 w-5 mr-2" /> : <Hospital className="h-5 w-5 mr-2" />}
            Select Source {isOpd ? "OPD" : "IPD"} Registration
          </h4>
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection} className="h-8 w-8 p-0">
            <X className="h-5 w-5 text-gray-500" />
          </Button>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Patient: <span className="font-semibold">{watch("name")}</span> (UHID: <span className="font-semibold">{watchUhid}</span>)
        </p>

        <div className="max-h-60 overflow-y-auto border rounded">
          <Table className="min-w-full">
            <TableHeader className="sticky top-0 bg-gray-50">
              <TableRow>
                <TableHead className="py-1 px-2 w-[10%]">ID</TableHead>
                <TableHead className="py-1 px-2 w-[25%]">{isOpd ? "Date/Time" : "Admission Date"}</TableHead>
                <TableHead className="py-1 px-2 w-[45%]">{isOpd ? "Referred By" : "Doctor / Room Info"}</TableHead> 
                {!isOpd && <TableHead className="py-1 px-2 w-[10%]">Status</TableHead>}
                <TableHead className="py-1 px-2 w-[10%] text-center">Select</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isOpd
                ? (records as OpdRegistration[]).map((r) => (
                    <TableRow key={r.opd_id} className={r.opd_id === selectedId ? 'bg-blue-50' : ''}>
                      <TableCell className="py-1 px-2 text-xs">{r.opd_id}</TableCell>
                      <TableCell className="py-1 px-2 text-xs">{formatDate(r.date)}</TableCell>
                      <TableCell className="py-1 px-2 text-xs">{r.refer_by}</TableCell>
                      <TableCell className="py-1 px-2 text-center">
                        <Checkbox
                          checked={r.opd_id === selectedId}
                          onCheckedChange={() => handleSelect(r.opd_id, r.refer_by)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                : (records as IpdRegistration[]).map((r) => {
                    const status = r.discharge_date ? 'Discharged' : 'Active';
                    const bedNumber = r.bed_management?.bed_number ?? 'N/A';
                    const roomType = r.bed_management?.room_type ?? 'N/A'; 
                    return (
                      <TableRow key={r.ipd_id} className={r.ipd_id === selectedId ? 'bg-blue-50' : ''}>
                        <TableCell className="py-1 px-2 text-xs">{r.ipd_id}</TableCell>
                        <TableCell className="py-1 px-2 text-xs">{`${r.admission_date} @ ${r.admission_time}`}</TableCell>
                        <TableCell className="py-1 px-2 text-xs">
                          <div className="font-medium truncate" title={r.under_care_of_doctor}>{r.under_care_of_doctor}</div>
                          <div className="text-gray-500 text-[10px]">
                            Bed: **{bedNumber}** / Room: {roomType}
                          </div>
                        </TableCell>
                        <TableCell className="py-1 px-2 text-xs">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {status}
                          </span>
                        </TableCell>
                        <TableCell className="py-1 px-2 text-center">
                          <Checkbox
                            checked={r.ipd_id === selectedId}
                            onCheckedChange={() => handleSelect(r.ipd_id, r.under_care_of_doctor)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 text-right">
          <Button type="button" onClick={() => setShowSourceSelection(false)} disabled={!selectedId} className="bg-blue-600 hover:bg-blue-700">
            Confirm Selection
          </Button>
        </div>
      </div>
    );
  };
  // END Source Selection Popover Component

  return (
    <div className="flex h-screen bg-gray-50 relative">
      {/* Popover overlay */}
      {showSourceSelection && (
        <div className="absolute inset-0 bg-black bg-opacity-30 z-10 flex items-center justify-center">
          <SourceSelectionPopover />
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <Card className="h-full rounded-none">
          <CardContent className="p-3 h-full">
            <form onSubmit={handleSubmit(onSubmit)} className="h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <UserCircle className="h-6 w-6 text-gray-600 mr-2" />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Patient Entry</h2>
                    {isExistingPatient && (
                      <p className="text-sm text-blue-600 font-medium">Adding new registration to existing patient</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center text-sm">
                    <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                    <input type="date" {...register("registrationDate")} className="p-2 border rounded text-sm w-40" />
                  </div>
                  <div className="flex items-center text-sm">
                    <Clock className="h-4 w-4 text-gray-500 mr-2" />
                    <input
                      type="text"
                      {...register("registrationTime")}
                      className="p-2 border rounded text-sm w-32"
                      placeholder="12:00 PM"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-white p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-700">Patient Information</h3>
                    {isExistingPatient && (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm text-blue-600 font-medium">Existing Patient Selected (UHID: {watch("uhid")})</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleNewPatient()
                            setValue("name", "")
                            setValue("contact", "")
                            setValue("uhid", "")
                            setValue("doctorName", "")
                          }}
                        >
                          Clear & Add New
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-12 gap-2 mb-3">
                    <div className="col-span-2">
                      <Label className="text-sm">Title</Label>
                      <Select
                        value={watch("title")}
                        onValueChange={(v) => setValue("title", v)}
                        disabled={isExistingPatient}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {[".", "MR", "MRS", "MAST", "BABA", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map((t) => (
                            <SelectItem key={t} value={t}>
                              {t === "." ? "NoTitle" : t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 relative" ref={patientHintsRef}>
                      <Label className="text-sm">Full Name</Label>
                      <div className="relative">
                        <Input
                          {...register("name", {
                            required: "Name is required",
                            onChange: (e) => {
                              if (!isExistingPatient) {
                                setShowPatientHints(true)
                                setValue("name", e.target.value.toUpperCase())
                                handleNewPatient()
                              }
                            },
                          })}
                          className={`h-8 pl-10 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                          placeholder="Type at least 2 letters..."
                          onFocus={() => setShowPatientHints(true)}
                        />
                        <UserCircle className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
                      </div>
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                      {showPatientHints && patientHints.length > 0 && (
                        <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                          {patientHints.map((p) => (
                            <li
                              key={p.id}
                              className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                              onClick={() => handlePatientSelect(p)}
                            >
                              <div className="font-medium text-gray-900">
                                <span className="text-blue-600 font-bold mr-2">UHID: {p.uhid}</span>
                                {p.title && p.title !== "." ? `${p.title} ` : ""}{p.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {p.number} • {p.age}
                                {p.age_unit.charAt(0).toUpperCase()} • {p.gender}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="col-span-4">
                      <Label className="text-sm">Contact Number</Label>
                      <div className="relative">
                        <Input
                          {...register("contact", {
                            required: "Phone number is required",
                            pattern: { value: /^[0-9]{10}$/, message: "Phone number must be 10 digits" },
                            onChange: () => setShowPatientHints(true)
                          })}
                          className={`h-8 pl-10 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                          placeholder="Enter 10-digit mobile number"
                          onFocus={() => setShowPatientHints(true)}
                        />
                        <Phone className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
                      </div>
                      {errors.contact && <p className="text-red-500 text-xs mt-1">{errors.contact.message}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-2">
                      <Label className="text-sm">Age</Label>
                      <Input
                        type="number"
                        {...register("age", {
                          required: "Age is required",
                          min: { value: 0, message: "Age must be positive" },
                          valueAsNumber: true
                        })}
                        className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                      />
                      {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
                    </div>
                    <div className="col-span-2">
                      <Label className="text-sm">Age Unit</Label>
                      <Select
                        value={watch("dayType")}
                        onValueChange={(v) => setValue("dayType", v as any)}
                      >
                        <SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="year">Year</SelectItem>
                          <SelectItem value="month">Month</SelectItem>
                          <SelectItem value="day">Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-sm">Gender</Label>
                      <Select
                        value={watch("gender")}
                        onValueChange={(v) => setValue("gender", v)}
                      >
                        <SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                          <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-sm">Hospital</Label>
                      <Select value={watch("hospitalName")} onValueChange={(v) => setValue("hospitalName", v)}>
                        <SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEDFORD HOSPITAL">MEDFORD HOSPITAL</SelectItem>
                          <SelectItem value="Gautami Medford NX Hospital">Gautami Medford NX Hospital</SelectItem>
                          <SelectItem value="Apex Clinic">Apex Clinic</SelectItem>

                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-sm">Visit Type</Label>
                      <Select
                        value={watch("visitType")}
                        onValueChange={(v) => setValue("visitType", v as any)}
                        disabled={!isExistingPatient} 
                      >
                        <SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="opd" disabled={!isExistingPatient}>OPD</SelectItem>
                          <SelectItem value="ipd" disabled={!isExistingPatient}>IPD</SelectItem>
                        </SelectContent>
                      </Select>
                       {/* Show source ID if selected */}
                      {watch("sourceOpdId") !== null && (
                        <p className="text-xs text-green-600 mt-1 font-medium">OPD ID: {watch("sourceOpdId")}</p>
                      )}
                      {watch("sourceIpdId") !== null && (
                        <p className="text-xs text-green-600 mt-1 font-medium">IPD ID: {watch("sourceIpdId")}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border">
                  <h3 className="text-lg font-semibold text-gray-700">Address & Doctor</h3>
                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-5">
                      <Label className="text-sm">Address</Label>
                      <Textarea
                        {...register("address")}
                        className={`min-h-[50px] resize-none ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                        placeholder="123 Main St, City"
                      />
                    </div>
                    <div className="col-span-5 relative" ref={doctorHintsRef}>
                      <Label className="text-sm">Doctor Name</Label>
                      <Input
                        {...register("doctorName", {
                          required: "Referring doctor is required",
                          onChange: () => setShowDoctorHints(true),
                        })}
                        className="h-8"
                      />
                      {errors.doctorName && <p className="text-red-500 text-xs mt-1">{errors.doctorName.message}</p>}
                      {showDoctorHints && doctorList.length > 0 && (
                        <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                          {doctorList
                            .filter((d) => d.doctor_name.toLowerCase().startsWith(watch("doctorName").toLowerCase()))
                            .map((d) => (
                              <li
                                key={d.id}
                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  setValue("doctorName", d.doctor_name)
                                  setValue("doctorId", d.id)
                                  setShowDoctorHints(false)
                                }}
                              >
                                {d.doctor_name}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                    <div className="col-span-2 flex flex-col justify-end pb-1">
                      <Label className="text-sm mb-1">Type</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!watch("tpa")}
                            onCheckedChange={(v) => setValue("tpa", !v)}
                            id="normal-checkbox"
                          />
                          <Label htmlFor="normal-checkbox" className="text-sm cursor-pointer">
                            Normal
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={watch("tpa")}
                            onCheckedChange={(v) => setValue("tpa", !!v)}
                            id="tpa-checkbox"
                          />
                          <Label htmlFor="tpa-checkbox" className="text-sm cursor-pointer">
                            TPA
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Checkbox
                      checked={watch("sendWhatsApp")}
                      onCheckedChange={(v) => setValue("sendWhatsApp", !!v)}
                      id="whatsapp-checkbox"
                    />
                    <Label htmlFor="whatsapp-checkbox" className="text-sm cursor-pointer flex items-center gap-2">
                      <span className="text-green-600">📱</span>
                      Send WhatsApp SMS
                    </Label>
                  </div>
                </div>

                <div className="bg-white p-1 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-semibold text-gray-700">Blood Tests</h3>
                    <div className="flex items-center space-x-1">
                      <div className="flex items-center mr-2">
                        <Label className="text-xs mr-1">Package</Label>
                        <Select
                          value={watch("selectedPackageId") || "none"}
                          onValueChange={async (pkgId) => {
                            setValue("selectedPackageId", pkgId)
                            if (!pkgId || pkgId === "none") return
                            const pkg = packageRows.find((p) => String(p.id) === String(pkgId))
                            if (pkg) {
                              removeAllTests()
                              pkg.tests.forEach((t) => {
                                appendBloodTest({
                                  testId: t.testId,
                                  testName: t.testName,
                                  price: t.price,
                                  testType: t.testType,
                                })
                              })
                              setValue("discountAmount", pkg.discountamount || 0)
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-48">
                            <SelectValue placeholder="Select package" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Package</SelectItem>
                            {packageRows.map((pkg) => (
                              <SelectItem key={pkg.id} value={String(pkg.id)}>
                                {pkg.package_name} (₹{pkg.discountamount} OFF)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addAllTests}>
                        Add All
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={removeAllTests}>
                        Remove All
                      </Button>
                      <div className="relative" ref={testSearchRef}>
                        <Input
                          type="text"
                          placeholder="Search tests..."
                          className="h-7 w-40"
                          value={searchText}
                          onChange={(e) => {
                            setSearchText(e.target.value)
                          }}
                        />
                        <Search className="h-4 w-4 absolute right-3 top-2 text-gray-400" />
                        {searchText.trim() && (
                          <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-32 overflow-y-auto text-sm shadow-lg">
                            {unselectedTests
                              .filter((t) => t.test_name.toLowerCase().includes(searchText.toLowerCase()))
                              .map((t) => (
                                <li
                                  key={t.id}
                                  className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => addTestById(t.id)}
                                >
                                  {t.test_name} - ₹{t.price}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50%] py-1 px-2">Test Name</TableHead>
                          <TableHead className="w-[20%] py-1 px-2">Price (₹)</TableHead>
                          <TableHead className="w-[20%] py-1 px-2">Type</TableHead>
                          <TableHead className="w-[10%] py-1 px-2" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bloodTestFields.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-2 text-gray-500">
                              No tests selected
                            </TableCell>
                          </TableRow>
                        ) : (
                          bloodTestFields.map((field, idx) => (
                            <TableRow key={field.id}>
                              <TableCell className="py-1 px-2">{watch(`bloodTests.${idx}.testName` as const)}</TableCell>
                              <TableCell className="py-1 px-2">
                                <Input
                                  type="number"
                                  {...register(`bloodTests.${idx}.price` as const, { valueAsNumber: true })}
                                  className="h-7 w-20"
                                  disabled={
                                    (watch(`bloodTests.${idx}.testName` as const) || "").trim().toLowerCase() !==
                                    "histopathology"
                                  }
                                />
                              </TableCell>
                              <TableCell className="py-1 px-2">
                                <Select
                                  value={watch(`bloodTests.${idx}.testType` as const)}
                                  onValueChange={(v) => setValue(`bloodTests.${idx}.testType` as const, v as any)}
                                >
                                  <SelectTrigger className="h-7">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="inhospital">InHouse</SelectItem>
                                    <SelectItem value="outsource">Outsource</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-1 px-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => removeBloodTest(idx)}
                                >
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-700">Payment Details</h3>
                      <Button type="button" variant="outline" size="sm" onClick={addPaymentEntry}>
                        <Plus className="h-4 w-4 mr-1" /> Add Payment
                      </Button>
                    </div>
                    <div className="mb-3">
                      <Label className="text-sm">Discount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register("discountAmount", { valueAsNumber: true })}
                        placeholder="0"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-2">
                      {paymentFields.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>
                      ) : (
                        paymentFields.map((field, idx) => (
                          <div key={field.id} className="border rounded-lg p-2 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Payment {idx + 1}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => removePayment(idx)}
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Amount (₹)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...register(`paymentEntries.${idx}.amount` as const, { valueAsNumber: true })}
                                  className="h-8"
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <Label className="xs">Mode</Label>
                                <Select
                                  value={watch(`paymentEntries.${idx}.paymentMode` as const)}
                                  onValueChange={(v) => setValue(`paymentEntries.${idx}.paymentMode` as const, v as any)}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="online">Online</SelectItem>
                                    <SelectItem value="cash">Cash</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border">
                    <h3 className="text-lg font-semibold text-gray-700">Payment Summary</h3>
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between">
                        <span>Total Amount:</span>
                        <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discount:</span>
                        <span className="font-medium">₹{discountAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Paid:</span>
                        <span className="font-medium">₹{totalPaid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-semibold">Remaining Amount:</span>
                        <span
                          className={`font-semibold ${
                            remainingAmount < 0 ? "text-red-600" : remainingAmount > 0 ? "text-orange-600" : "text-green-600"
                          }`}
                        >
                          ₹{remainingAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700">
                      {isSubmitting
                        ? "Submitting..."
                        : isExistingPatient
                          ? "Add New Registration"
                          : "Save Patient Record"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}