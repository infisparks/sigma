"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserCircle, Phone, Calendar, Clock, Plus, X, Search, Trash2, ArrowLeft, Hospital, Stethoscope } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

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
  const [time, mer] = time12.split(" ");
  let [hh, mm] = time.split(":").map(Number);
  if (mer === "PM" && hh < 12) hh += 12;
  if (mer === "AM" && hh === 12) hh = 0;
  return new Date(
    `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`,
  ).toISOString();
}

function convertUtcToKolkata(isoString: string) {
  const date = new Date(isoString);
  return new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
}

function isoToTime12(isoString: string) {
  const date = convertUtcToKolkata(isoString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function isoToDate(isoString: string) {
  const date = convertUtcToKolkata(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
function formatOpdDate(isoString: string | null | undefined): string {
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
  patientId?: string 
  registrationDate: string
  registrationTime: string
  tpa: boolean 
  originalSampleCollectedTime?: string 
  sendWhatsApp: boolean 
  sourceOpdId: number | null 
  sourceIpdId: number | null 
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

export default function EditPatientPage() {
  const params = useParams()
  const router = useRouter()
  const registrationId = params.registrationId as string

  /** default date + time */
  const initialDate = useMemo(() => new Date(), [])
  const defaultDate = initialDate.toISOString().slice(0, 10)
  const defaultTime = useMemo(() => {
    const h12 = initialDate.getHours() % 12 || 12
    const mer = initialDate.getHours() >= 12 ? "PM" : "AM"
    return `${String(h12).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")} ${mer}`
  }, [initialDate])

  /** ---------------- form ---------------- */
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IFormInput>({
    defaultValues: {
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
      patientId: "",
      registrationDate: defaultDate,
      registrationTime: defaultTime,
      discountAmount: 0,
      paymentEntries: [],
      tpa: false, 
      originalSampleCollectedTime: undefined,
      sendWhatsApp: false, 
      sourceOpdId: null, 
      sourceIpdId: null, 
    },
  })

  /** local state */
  const [doctorList, setDoctorList] = useState<{ id: number; doctor_name: string }[]>([])
  const [bloodRows, setBloodRows] = useState<BloodTestRow[]>([])
  const [showDoctorHints, setShowDoctorHints] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [patientDbId, setPatientDbId] = useState<number | null>(null) 
  const [opdRecords, setOpdRecords] = useState<OpdRegistration[]>([]) 
  const [ipdRecords, setIpdRecords] = useState<IpdRegistration[]>([]) 
  const [showSourceSelection, setShowSourceSelection] = useState(false) 

  const doctorHintsRef = useRef<HTMLDivElement | null>(null)
  const sourceSelectionRef = useRef<HTMLDivElement | null>(null)

  /** field arrays */
  const {
    fields: bloodTestFields,
    append: appendBloodTest,
    remove: removeBloodTest,
    replace: replaceBloodTests,
  } = useFieldArray({
    control,
    name: "bloodTests",
  })

  const {
    fields: paymentFields,
    append: appendPayment,
    remove: removePayment,
    replace: replacePayments,
  } = useFieldArray({
    control,
    name: "paymentEntries",
  })

  const watchUhid = watch("patientId")
  const watchVisitType = watch("visitType")

  // --- Source Selection Logic ---
  const handleVisitTypeChange = (newVisitType: "direct" | "opd" | "ipd") => {
    setValue("visitType", newVisitType as any);
    setValue("sourceOpdId", null);
    setValue("sourceIpdId", null);
    
    setShowSourceSelection(false);
    
    if (watchUhid && newVisitType !== 'direct') {
      fetchSourceRecords(watchUhid, newVisitType, true); 
    }
  };

  /**
   * Fetches OPD/IPD records for the current patient.
   * @param autoOpen If true, automatically shows the popover if records are found.
   */
  async function fetchSourceRecords(uhid: string, visitType: IFormInput['visitType'], autoOpen: boolean = false) {
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
        const formattedData = (data || []).map(record => ({
          ...record,
          // Extract the first element from the bed_management array or set to null
          bed_management: record.bed_management?.[0] || null,
        }));
        
        setIpdRecords(formattedData);

        if (formattedData.length > 0 && autoOpen) {
          setShowSourceSelection(true);
        } else if (formattedData.length === 0 && autoOpen) {
          alert(`No IPD records found for UHID: ${uhid}.`);
        }
      }
    } catch (error: any) {
      console.error("Error fetching source records:", error);
      alert(error.message || "Failed to fetch source records.");
      setShowSourceSelection(false);
    }
  }

  // Effect to clear records on UHID/VisitType change, but WITHOUT auto-opening the popover.
  useEffect(() => {
    if (watchUhid && watchVisitType !== 'direct') {
      fetchSourceRecords(watchUhid, watchVisitType, false);
    } else {
      setOpdRecords([]);
      setIpdRecords([]);
      setShowSourceSelection(false);
    }
  }, [watchUhid, watchVisitType]);
  // --- END Source Selection Logic ---


  /** fetch existing data (initial load) */
  useEffect(() => {
    if (!registrationId) return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data: registrationData, error: regError } = await supabase
          .from(TABLE.REGISTRATION)
          .select(
            `
            *,
            source_opd_id,
            source_ipd_id,
            ${TABLE.PATIENT} (
              patient_id, uhid, name, number, address, age, age_unit, gender, total_day, title, dob
            )
          `,
          )
          .eq("id", registrationId)
          .single()

        if (regError) throw regError
        if (!registrationData) throw new Error("Registration not found")

        const patient = registrationData[TABLE.PATIENT] as any
        if (!patient) throw new Error("Patient details not found")

        let initialVisitType: IFormInput['visitType'] = registrationData.visit_type || 'direct';
        if (registrationData.source_opd_id) {
          initialVisitType = 'opd';
        } else if (registrationData.source_ipd_id) {
          initialVisitType = 'ipd';
        } else if (initialVisitType !== 'opd' && initialVisitType !== 'ipd') {
          initialVisitType = 'direct';
        }

        let paymentEntries: PaymentEntry[] = []
        let discountAmount = 0

        if (registrationData.amount_paid_history) {
          const paymentHistory = registrationData.amount_paid_history as PaymentHistory
          paymentEntries = paymentHistory.paymentHistory || []
          discountAmount = paymentHistory.discount || 0
        }

        let bloodTests: BloodTestSelection[] = []
        if (registrationData.bloodtest_data) {
          bloodTests = Array.isArray(registrationData.bloodtest_data) ? registrationData.bloodtest_data : []
        }

        const formData: IFormInput = {
          hospitalName: registrationData.hospital_name || "MEDFORD HOSPITAL",
          visitType: initialVisitType,
          title: patient.title || "",
          name: patient.name || "",
          contact: patient.number?.toString() || "",
          age: patient.age || 0,
          dayType: patient.age_unit || "year", 
          gender: patient.gender || "",
          address: patient.address || "",
          email: "",
          doctorName: registrationData.doctor_name || "",
          bloodTests: bloodTests,
          discountAmount: discountAmount,
          paymentEntries: paymentEntries,
          patientId: patient.uhid || "", 
          registrationDate: registrationData.registration_time
            ? isoToDate(registrationData.registration_time)
            : defaultDate,
          registrationTime: registrationData.registration_time
            ? isoToTime12(registrationData.registration_time)
            : defaultTime,
          tpa: registrationData.tpa ?? false,
          originalSampleCollectedTime: registrationData.samplecollected_time,
          sendWhatsApp: false, 
          doctorId: null,
          sourceOpdId: registrationData.source_opd_id, 
          sourceIpdId: registrationData.source_ipd_id, 
        }

        reset(formData)
        replaceBloodTests(bloodTests)
        replacePayments(paymentEntries)
        setPatientDbId(patient.patient_id) 
        
        setShowSourceSelection(false); 

      } catch (err: any) {
        console.error("Error fetching patient data:", err)
        setError(err.message || "Failed to load patient data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [registrationId, reset, replaceBloodTests, replacePayments, defaultDate, defaultTime])

  /** fetch look‑ups */
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
  }, [])

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (doctorHintsRef.current && !doctorHintsRef.current.contains(target)) {
        setShowDoctorHints(false)
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


  /** auto‑select gender by title */
  const titleValue = watch("title")
  useEffect(() => {
    const male = new Set(["MR", "MAST", "BABA"])
    const female = new Set(["MS", "MISS", "MRS", "BABY", "SMT"])
    const none = new Set(["BABY OF", "DR", "", "."])
    if (male.has(titleValue)) setValue("gender", "male")
    else if (female.has(titleValue)) setValue("gender", "female")
    else if (none.has(titleValue)) setValue("gender", "")
  }, [titleValue, setValue])

  /** derived totals */
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

  /** handlers */
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

  /** submit */
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    if (data.bloodTests.length === 0) {
      alert("Please add at least one blood test before submitting.")
      return
    }
    if (!patientDbId) {
      alert("Patient ID not found. Cannot update.")
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
      const mult = data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1
      const totalDay = data.age * mult
      const dob = calculateDOB(data.age, data.dayType); 

      /* UPDATE PATIENT ROW (Patient details can change) */
      const { error: patientErr } = await supabase
          .from(TABLE.PATIENT)
          .update({
            name: data.name.toUpperCase(),
            number: Number(data.contact),
            address: data.address || "",
            age: data.age,
            age_unit: data.dayType, 
            gender: data.gender,
            uhid: data.patientId, 
            total_day: totalDay,
            title: data.title,
            dob: dob, 
          })
          .eq("patient_id", patientDbId) 

      throwIfError(patientErr)

      /* UPDATE REGISTRATION ROW */
      const isoTime = time12ToISO(data.registrationDate, data.registrationTime)

      const paymentHistoryData: PaymentHistory = {
        totalAmount: totalAmount,
        discount: discountAmount,
        paymentHistory: data.paymentEntries.length > 0 ? data.paymentEntries : [],
      }

      const totalAmountPaid = data.paymentEntries.reduce((sum, entry) => sum + entry.amount, 0)

      const { error: regErr } = await supabase
        .from(TABLE.REGISTRATION)
        .update({
          amount_paid: totalAmountPaid,
          visit_type: data.visitType,
          registration_time: isoTime,
          samplecollected_time: data.originalSampleCollectedTime || isoTime, 
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
        .eq("id", registrationId)

      throwIfError(regErr)

      // WhatsApp message logic 
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
          const whatsappMessage = `Dear *${patientName}*,\n\nYour registration has been UPDATED: *${registrationDate}* at *${registrationTime}* \n\n*Patient ID*: ${data.patientId}\n*Registration ID*: ${registrationId}\n*Tests Booked*: ${bloodTestNames}\n\n*Summary*:\n*Total Amount*: ₹${totalAmountFormatted}\n*Amount Paid*: ₹${totalPaidFormatted}\n*Remaining Balance*: ₹${remainingAmountFormatted}\n\nThank you for choosing us!`;
          
          // 3. Create new payload
          const whatsappPayload = {
            number: `91${patientContact}`,
            text: whatsappMessage,
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
              console.log("WhatsApp update sent successfully.");
            }
          })
          .catch((whatsappError) => {
            console.error("Error sending WhatsApp message:", whatsappError);
          });
        }
      }

      alert("Patient updated successfully ✅")
      router.back()
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
      handleVisitTypeChange("direct"); 
    };

    if (records.length === 0) return null; 

    return (
      <div
        ref={sourceSelectionRef}
        className="absolute z-[100] w-[95%] max-w-2xl bg-white border border-blue-400 rounded-lg shadow-xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4"
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
                      <TableCell className="py-1 px-2 text-xs">{formatOpdDate(r.date)}</TableCell>
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

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-600">Loading patient data...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-screen bg-gray-50">
      
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-red-500 mb-4">
              <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Error Loading Data</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.back()} className="mr-2">
              Go Back
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /** ------------------------------
   * JSX
   * ------------------------------ */

  return (
    <div className="flex h-screen bg-gray-50 relative">
      {/* Popover overlay */}
      {showSourceSelection && (
        <div className="absolute inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center">
          <SourceSelectionPopover />
        </div>
      )}
      
      <div className="flex-1 overflow-auto">
        <Card className="h-full rounded-none">
          <CardContent className="p-6 h-full">
            <form onSubmit={handleSubmit(onSubmit)} className="h-full">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Button type="button" variant="ghost" size="sm" onClick={() => router.back()} className="mr-3">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <UserCircle className="h-6 w-6 text-gray-600 mr-3" />
                  <h2 className="text-2xl font-bold text-gray-800">Edit Patient Details (ID: {registrationId})</h2>
                </div>
                <div className="flex items-center space-x-4">
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

              {/* Patient Information */}
              <div className="space-y-6">
                <div className="bg-white p-4 rounded-lg border">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Patient Information (UHID: {watch("patientId")})</h3>
                  <div className="grid grid-cols-12 gap-4 mb-4">
                    {/* title */}
                    <div className="col-span-2">
                      <Label className="text-sm">Title</Label>
                      <Select value={watch("title")} onValueChange={(v) => setValue("title", v)}>
                        <SelectTrigger className="h-10">
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

                    {/* name */}
                    <div className="col-span-6 relative">
                      <Label className="text-sm">Full Name</Label>
                      <div className="relative">
                        <Input
                          {...register("name", {
                            required: "Name is required",
                            onChange: (e) => {
                              setValue("name", e.target.value.toUpperCase())
                            },
                          })}
                          className="h-10 pl-10"
                          placeholder="Enter patient's full name"
                        />
                        <UserCircle className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                      </div>
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                    </div>

                    {/* phone */}
                    <div className="col-span-4">
                      <Label className="text-sm">Contact Number</Label>
                      <div className="relative">
                        <Input
                          {...register("contact", {
                            required: "Phone number is required",
                            pattern: { value: /^[0-9]{10}$/, message: "Phone number must be 10 digits" },
                          })}
                          className="h-10 pl-10"
                          placeholder="Enter 10-digit mobile number"
                        />
                        <Phone className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                      </div>
                      {errors.contact && <p className="text-red-500 text-xs mt-1">{errors.contact.message}</p>}
                    </div>
                  </div>

                  {/* age row */}
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-2">
                      <Label className="text-sm">Age</Label>
                      <Input
                        type="number"
                        {...register("age", {
                          required: "Age is required",
                          min: { value: 1, message: "Age must be positive" },
                          valueAsNumber: true,
                        })}
                        className="h-10"
                      />
                      {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
                    </div>

                    <div className="col-span-2">
                      <Label className="text-sm">Age Unit</Label>
                      <Select value={watch("dayType")} onValueChange={(v) => setValue("dayType", v as any)}>
                        <SelectTrigger className="h-10">
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
                      <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v)}>
                        <SelectTrigger className="h-10">
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
                        <SelectTrigger className="h-10">
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

                    <div className="col-span-2 relative">
                      <Label className="text-sm">Visit Type</Label>
                      <Select value={watch("visitType")} onValueChange={handleVisitTypeChange}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="opd">OPD</SelectItem>
                          <SelectItem value="ipd">IPD</SelectItem>
                        </SelectContent>
                      </Select>
                      {watch("sourceOpdId") !== null && (
                        <p className="text-xs text-green-600 mt-1 font-medium">OPD ID: {watch("sourceOpdId")}</p>
                      )}
                      {watch("sourceIpdId") !== null && (
                        <p className="text-xs text-green-600 mt-1 font-medium">IPD ID: {watch("sourceIpdId")}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* address / doctor */}
                <div className="bg-white p-4 rounded-lg border">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Address & Doctor</h3>
                  <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-4">
                      <Label className="text-sm">Address</Label>
                      <Textarea
                        {...register("address")}
                        className="min-h-[80px] resize-none"
                        placeholder="123 Main St, City"
                      />
                    </div>
                    <div className="col-span-4 relative" ref={doctorHintsRef}>
                      <Label className="text-sm">Doctor Name</Label>
                      <Input
                        {...register("doctorName", {
                          onChange: () => setShowDoctorHints(true),
                        })}
                        className="h-10"
                      />
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
                            onCheckedChange={v => setValue("tpa", !v)}
                            id="normal-checkbox"
                          />
                          <Label htmlFor="normal-checkbox" className="text-sm cursor-pointer">Normal</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={watch("tpa")}
                            onCheckedChange={v => setValue("tpa", !!v)}
                            id="tpa-checkbox"
                          />
                          <Label htmlFor="tpa-checkbox" className="text-sm cursor-pointer">TPA</Label>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 flex flex-col justify-end pb-1">
                      <Label className="text-sm mb-1">Send WhatsApp</Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={watch("sendWhatsApp")}
                          onCheckedChange={v => setValue("sendWhatsApp", !!v)}
                          id="send-whatsapp-checkbox"
                        />
                        <Label htmlFor="send-whatsapp-checkbox" className="text-sm cursor-pointer flex items-center gap-2">
                          <span className="text-green-600">📱</span>
                          SMS
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Blood tests */}
                <div className="bg-white p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">Blood Tests</h3>
                    <div className="flex items-center space-x-2">
                      <Button type="button" variant="outline" size="sm" onClick={addAllTests}>
                        Add All
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={removeAllTests}>
                        Remove All
                      </Button>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="Search tests..."
                          className="h-9 w-48"
                          value={searchText}
                          onChange={(e) => {
                            setSearchText(e.target.value)
                          }}
                        />
                        <Search className="h-4 w-4 absolute right-3 top-2.5 text-gray-400" />
                        {searchText.trim() && (
                          <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                            {unselectedTests
                              .filter((t) => t.test_name.toLowerCase().includes(searchText.toLowerCase()))
                              .map((t) => (
                                <li
                                  key={t.id}
                                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => addTestById(t.id)}
                                >
                                  {t.test_name} - ₹{t.price}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => selectedTestId && addTestById(selectedTestId)}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add
                      </Button>
                    </div>
                  </div>

                  {/* table */}
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50%]">Test Name</TableHead>
                          <TableHead className="w-[20%]">Price (₹)</TableHead>
                          <TableHead className="w-[20%]">Type</TableHead>
                          <TableHead className="w-[10%]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bloodTestFields.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                              No tests selected
                            </TableCell>
                          </TableRow>
                        ) : (
                          bloodTestFields.map((field, idx) => (
                            <TableRow key={field.id}>
                              <TableCell>{watch(`bloodTests.${idx}.testName` as const)}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  {...register(`bloodTests.${idx}.price` as const, { valueAsNumber: true })}
                                  className="h-8 w-24"
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={watch(`bloodTests.${idx}.testType` as const)}
                                  onValueChange={(v) => setValue(`bloodTests.${idx}.testType` as const, v as any)}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="inhospital">InHouse</SelectItem>
                                    <SelectItem value="outsource">Outsource</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
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

                {/* Payment Details */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-700">Payment Details</h3>
                      <Button type="button" variant="outline" size="sm" onClick={addPaymentEntry}>
                        <Plus className="h-4 w-4 mr-1" /> Add Payment
                      </Button>
                    </div>

                    {/* Discount */}
                    <div className="mb-4">
                      <Label className="text-sm">Discount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register("discountAmount", { valueAsNumber: true })}
                        placeholder="0"
                        className="h-10"
                      />
                    </div>

                    {/* Payment Entries */}
                    <div className="space-y-3">
                      {paymentFields.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>
                      ) : (
                        paymentFields.map((field, idx) => (
                          <div key={field.id} className="border rounded-lg p-3 bg-gray-50">
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
                                <Label className="text-xs">Mode</Label>
                                <Select
                                  value={watch(`paymentEntries.${idx}.paymentMode` as const)}
                                  onValueChange={(v) =>
                                    setValue(`paymentEntries.${idx}.paymentMode` as const, v as any)
                                  }
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

                  <div className="bg-white p-4 rounded-lg border">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Payment Summary</h3>
                    <div className="space-y-3 mb-6">
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
                          className={`font-semibold ${remainingAmount < 0 ? "text-red-600" : remainingAmount > 0 ? "text-orange-600" : "text-green-600"}`}
                        >
                          ₹{remainingAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Button type="submit" disabled={isSubmitting} className="w-full bg-green-600 hover:bg-green-700">
                      {isSubmitting ? "Updating..." : "Update Patient Record"}
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