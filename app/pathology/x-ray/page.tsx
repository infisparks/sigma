"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { UserPlus, FlaskConical, Stethoscope, Trash2, X, Plus, Search, CalendarDays, UserCircle, Phone } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { xrayData } from "./index" // Assuming this file exists
import { xrayPriceList as gautamiXrayPriceList, procedureList as gautamiProcedureList } from "./indexGautami" // Assuming this file exists
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * -----------------------------
 * Helpers and Constants
 * -----------------------------
 */

const TABLE = {
  PATIENT: "patient_detail",
  XRAY: "x-raydetail",
} as const

function throwIfError(error: any) {
  if (error) throw error
}

// Helper to calculate DOB based on age and age unit (from PatientEntry)
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

// Helper function for exponential backoff retry logic
const withRetry = async <T,>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
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

// Default hospital data maps (assuming these are defined in the original environment)
const examinationPriceMap = xrayData.xray_price_list.reduce<Record<string, any>>((acc, item) => {
  acc[item.examination] = item
  return acc
}, {})

const procedurePriceMap = xrayData.procedure.reduce<Record<string, any>>((acc, item) => {
  acc[item.name] = item
  return acc
}, {})

// Gautami hospital data maps (assuming these are defined in the original environment)
const gautamiExaminationPriceMap = gautamiXrayPriceList.reduce<Record<string, any>>((acc, item) => {
  acc[item.Examination] = item
  return acc
}, {})

const gautamiProcedurePriceMap = gautamiProcedureList.reduce<Record<string, any>>((acc, item) => {
  acc[item.Procedure] = item
  return acc
}, {})

const regularExaminations = xrayData.xray_price_list.map((item) => item.examination)
const procedureExaminations = xrayData.procedure.map((item) => item.name)

const gautamiRegularExaminations = gautamiXrayPriceList.map((item) => item.Examination)
const gautamiProcedureExaminations = gautamiProcedureList.map((item) => item.Procedure)

/**
 * -----------------------------
 * Types
 * -----------------------------
 */

interface XrayTest {
  examination: string
  amount: number
  xrayVia: string // "price" | "ward" | "icu" | "OPD_Amt" | "Portable" | "N/A"
}

interface PaymentEntry {
  amount: number
  paymentMode: string // "Cash" | "Online"
}

interface PatientSuggestion {
  id: number
  name: string
  number: number
  uhid: string
  title: string | null | undefined
  age: number
  age_unit: "year" | "month" | "day" // Must match DB enum
  gender: string
  address?: string
}

interface IFormState {
  name: string
  phoneNumber: string
  gender: string
  age: number
  ageUnit: "year" | "month" | "day" // Match DB enum for consistency
  title: string
  address: string
  uhid: string // New field to hold the patient's UHID
  hospitalName: string
  billNumber: string
  doctorName: string
  visitType: "OPD" | "IPD" | "Direct"
  tpa: "Yes" | "No"
  remark: string
  xrayTests: XrayTest[]
  totalAmount: number
  discount: number
  payments: PaymentEntry[]
  dateOfAppointment: Date
}

// Default form state function
const getDefaultFormState = (): IFormState => ({
    name: "",
    phoneNumber: "",
    gender: "",
    age: 0,
    ageUnit: "year", // Set default to match DB enum
    title: "",
    address: "",
    uhid: "", // Default to empty
    hospitalName: "Sigma Clinic",
    billNumber: "",
    doctorName: "",
    visitType: "OPD",
    tpa: "No",
    remark: "",
    xrayTests: [{ examination: "", amount: 0, xrayVia: "price" }],
    totalAmount: 0,
    discount: 0,
    payments: [],
    dateOfAppointment: new Date(),
});


/**
 * -----------------------------
 * Component
 * -----------------------------
 */
export default function XrayPage() {
  const [formData, setFormData] = useState<IFormState>(getDefaultFormState())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({})
  const [patientHints, setPatientHints] = useState<PatientSuggestion[]>([])
  const [showPatientHints, setShowPatientHints] = useState(false)

  const searchInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const patientHintsRef = useRef<HTMLDivElement | null>(null)

  const isExistingPatient = useMemo(() => Boolean(formData.uhid), [formData.uhid])

  const isGautamiHospital = () => {
    return formData.hospitalName === "Sigma clinic"
  }

  const getCurrentDataMaps = () => {
    if (isGautamiHospital()) {
      return {
        examinationMap: gautamiExaminationPriceMap,
        procedureMap: gautamiProcedurePriceMap,
        regularExams: gautamiRegularExaminations,
        procedureExams: gautamiProcedureExaminations,
      }
    }
    return {
      examinationMap: examinationPriceMap,
      procedureMap: procedurePriceMap,
      regularExams: regularExaminations,
      procedureExams: procedureExaminations,
    }
  }

  const getXrayViaOptions = () => {
    if (isGautamiHospital()) {
      return [
        { value: "OPD_Amt", label: "OPD Amount" },
        { value: "Portable", label: "Portable" },
      ]
    }
    return [
      { value: "price", label: "Price" },
      { value: "ward", label: "Ward" },
      { value: "icu", label: "ICU" },
    ]
  }

  // Calculate total amount whenever x-ray tests change
  useEffect(() => {
    const total = formData.xrayTests.reduce((sum, test) => sum + (test.amount || 0), 0)
    setFormData((prev) => ({ ...prev, totalAmount: total }))
  }, [formData.xrayTests])

  // Reset xrayTests to default via when hospital changes
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      xrayTests: [{ examination: "", amount: 0, xrayVia: isGautamiHospital() ? "OPD_Amt" : "price" }],
    }))
  }, [formData.hospitalName])
  
  // Click outside handlers
  useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        const target = event.target as Node
        if (patientHintsRef.current && !patientHintsRef.current.contains(target)) {
          setShowPatientHints(false)
        }
      }
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Patient Search/Hints logic
  useEffect(() => {
    const searchName = formData.name.trim()
    const searchContact = formData.phoneNumber.trim()
    const searchString = (searchName || searchContact)
    
    if (isExistingPatient || !searchString || searchString.length < 2) {
      setPatientHints([])
      return
    }

    const timer = setTimeout(async () => {
      let query = supabase
        .from(TABLE.PATIENT)
        .select("id:patient_id, name, number, uhid, title, age, age_unit, gender, address")
        .limit(10)

      if (searchName.length >= 2) {
        query = query.ilike("name", `${searchName}%`)
      } else if (searchContact.length >= 2) {
        query = query.like("number", `${searchContact}%`)
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
  }, [formData.name, formData.phoneNumber, isExistingPatient])


  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    // Auto-clear UHID if user starts typing in name or number again
    setFormData((prev) => {
        // If user is editing name or phoneNumber and UHID is set, clear patient-specific fields
        if ((name === "name" || name === "phoneNumber") && prev.uhid) {
            return { ...prev, uhid: "", title: "", address: "", age: 0, gender: "" }
        }
        return { ...prev, [name]: value }
    });

    // Auto-set title based on gender, if gender is changed manually
    if (name === 'gender') {
        setFormData((prev) => {
            if (prev.title === '') {
                const newTitle = value === 'male' ? 'MR' : value === 'female' ? 'MS' : '';
                return { ...prev, title: newTitle };
            }
            return prev;
        });
    }
  }

  const handleSelectChange = (name: keyof IFormState, value: string | number) => {
    setFormData((prev) => ({ 
        ...prev, 
        [name]: name === 'age' || name === 'discount' ? Number(value) : value 
    }))
  }
  
  const handlePatientSelect = async (p: PatientSuggestion) => {
      // Set all patient-related fields
      setFormData((prev) => ({
        ...prev,
        name: p.name,
        phoneNumber: p.number.toString(),
        age: p.age,
        ageUnit: p.age_unit,
        gender: p.gender,
        title: p.title || "",
        address: p.address || "",
        uhid: p.uhid, // Crucially set the UHID
      }))

      setShowPatientHints(false)
  }

  const handleNewPatient = () => {
    setFormData((prev) => ({
        ...getDefaultFormState(),
        // Keep non-patient specific data
        hospitalName: prev.hospitalName,
        dateOfAppointment: prev.dateOfAppointment,
    }))
  }

  const isProcedureExamination = (examination: string) => {
    const { procedureExams } = getCurrentDataMaps()
    return procedureExams.includes(examination)
  }

  const handleSearchChange = (index: number, searchTerm: string) => {
    setSearchTerms((prev) => ({ ...prev, [index]: searchTerm }))
    setTimeout(() => {
      const inputRef = searchInputRefs.current[index]
      if (inputRef) {
        inputRef.focus()
      }
    }, 0)
  }

  const getFilteredExaminations = (index: number) => {
    const searchTerm = searchTerms[index] || ""
    const { regularExams, procedureExams } = getCurrentDataMaps()

    if (!searchTerm) {
      return { regular: regularExams, procedures: procedureExams }
    }

    const filteredRegular = regularExams.filter((exam) => exam.toLowerCase().includes(searchTerm.toLowerCase()))
    const filteredProcedures = procedureExams.filter((exam) => exam.toLowerCase().includes(searchTerm.toLowerCase()))

    return { regular: filteredRegular, procedures: filteredProcedures }
  }

  const handleTestSelectChange = (index: number, name: string, value: string) => {
    setFormData((prev) => {
      const newTests = [...prev.xrayTests]
      const { examinationMap, procedureMap } = getCurrentDataMaps()

      if (name === "examination") {
        const xrayItem = examinationMap[value]
        const procedureItem = procedureMap[value]
        let amount = 0
        
        const isProcedure = isProcedureExamination(value)
        let xrayVia = isProcedure ? "N/A" : newTests[index].xrayVia;

        if (!isGautamiHospital() && !isProcedure) {
          xrayVia = "price";
        } else if (isGautamiHospital() && !isProcedure) {
          xrayVia = "OPD_Amt";
        }

        if (xrayItem) {
          amount = xrayItem[xrayVia] || 0
        } else if (procedureItem) {
          amount = isGautamiHospital() ? procedureItem.Amount || 0 : procedureItem.price || 0
        }

        newTests[index] = {
          ...newTests[index],
          examination: value,
          amount: amount,
          xrayVia: xrayVia
        }
        setSearchTerms((prev) => ({ ...prev, [index]: "" }))
      } else if (name === "xrayVia") {
        const currentExam = newTests[index].examination
        const { examinationMap } = getCurrentDataMaps()
        const xrayItem = examinationMap[currentExam]
        let amount = 0
        if (xrayItem) {
          amount = xrayItem[value] || 0
        }
        newTests[index] = { ...newTests[index], xrayVia: value, amount: amount }
      }
      return { ...prev, xrayTests: newTests }
    })
  }

  // Add a new X-ray test section
  const handleAddTest = () => {
    const defaultXrayVia = isGautamiHospital() ? "OPD_Amt" : "price"
    setFormData((prev) => ({
      ...prev,
      xrayTests: [...prev.xrayTests, { examination: "", amount: 0, xrayVia: defaultXrayVia }],
    }))
  }

  // Remove an X-ray test section
  const handleRemoveTest = (index: number) => {
    if (formData.xrayTests.length > 1) {
      const newTests = formData.xrayTests.filter((_, i) => i !== index)
      setFormData((prev) => ({ ...prev, xrayTests: newTests }))
      setSearchTerms((prev) => {
        const newSearchTerms = { ...prev }
        delete newSearchTerms[index]
        return newSearchTerms
      })
    }
  }

  const handleAddPayment = () => {
    setFormData((prev) => ({
      ...prev,
      payments: [...prev.payments, { amount: 0, paymentMode: "Cash" }],
    }))
  }

  const handleRemovePayment = (index: number) => {
    const newPayments = formData.payments.filter((_, i) => i !== index)
    setFormData((prev) => ({ ...prev, payments: newPayments }))
  }

  const handlePaymentChange = (index: number, field: string, value: string | number) => {
    setFormData((prev) => {
        const newPayments = [...prev.payments]
        newPayments[index] = { 
            ...newPayments[index], 
            [field]: field === "amount" ? Number(value) : value 
        }
        return { ...prev, payments: newPayments }
    })
  }

  const totalPaid = formData.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
  const remainingAmount = Math.max(0, formData.totalAmount - formData.discount - totalPaid)
  const totalDay = formData.age * (formData.ageUnit === "year" ? 360 : formData.ageUnit === "month" ? 30 : 1);


  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage("")
    setMessageType("")

    if (formData.name.trim() === "" || formData.doctorName.trim() === "" || formData.age === 0) {
        setIsSubmitting(false);
        setMessage("Please fill in the patient's Name, Age, and Doctor Name.");
        setMessageType("error");
        return;
    }
    
    // Validation Check: Ensure xrayVia is selected for non-procedure tests
    const isXrayViaValid = formData.xrayTests.every(test => {
      return isProcedureExamination(test.examination) || (test.examination && test.xrayVia);
    });

    if (!isXrayViaValid) {
      setIsSubmitting(false)
      setMessage("Please select a 'X-ray Via' option for all non-procedure examinations.")
      setMessageType("error")
      return
    }

    try {
        let finalUHID: string = formData.uhid;
        const dob = calculateDOB(formData.age, formData.ageUnit);

        // 1. Handle Patient Detail (Insert New or Update Existing)
        if (isExistingPatient) {
            // Update existing patient record
            const { error: updateErr } = await withRetry(async () => 
                supabase
                    .from(TABLE.PATIENT)
                    .update({
                        name: formData.name.toUpperCase(),
                        number: Number(formData.phoneNumber) || null,
                        age: formData.age,
                        age_unit: formData.ageUnit,
                        total_day: totalDay,
                        gender: formData.gender,
                        address: formData.address || "",
                        title: formData.title || null,
                        dob: dob, 
                    })
                    .eq("uhid", finalUHID)
            );
            throwIfError(updateErr);
        } else {
            // Insert new patient and get the auto-generated UHID
            const { data: patientRow, error: patientErr } = await withRetry(async () => 
                supabase
                    .from(TABLE.PATIENT)
                    .insert({
                        name: formData.name.toUpperCase(),
                        number: Number(formData.phoneNumber) || null,
                        address: formData.address || "",
                        age: formData.age,
                        age_unit: formData.ageUnit,
                        gender: formData.gender,
                        total_day: totalDay,
                        title: formData.title || null,
                        dob: dob,
                    })
                    .select("uhid")
                    .single()
            );
            throwIfError(patientErr);
            if (!patientRow) {
                throw new Error("Failed to create new patient: patientRow is null");
            }
            finalUHID = patientRow.uhid;
        }


      // 2. Prepare X-ray and Payment Details for x-raydetail table
      const amountDetail = {
        totalAmount: formData.totalAmount,
        discount: formData.discount,
        paymentHistory: formData.payments.map((payment) => ({
          amount: payment.amount,
          paymentMode: payment.paymentMode.toLowerCase(),
          time: new Date().toISOString(),
        })),
      }

      const xrayDetail = formData.xrayTests.map((test) => {
        const isProcedure = isProcedureExamination(test.examination)
        return {
          Examination: test.examination,
          Xray_Via: isProcedure ? "N/A" : test.xrayVia,
          Amount: test.amount,
        }
      })
      
      // FIX: Removed 'name', 'number', and 'amount_paid' to match the existing schema
      const dataToInsert = {
        patient_uhid: finalUHID, 
        created_at: formData.dateOfAppointment.toISOString(),
        "Hospital_name": formData.hospitalName,
        bill_number: formData.billNumber || null,
        "Refer_doctorname": formData.doctorName || null,
        "Visit_type": formData.visitType,
        "Tpa": formData.tpa,
        "Remark": formData.remark || null,
        "x-ray_detail": xrayDetail,
        amount_detail: amountDetail,
      }

      const result = await withRetry(async () => await supabase.from(TABLE.XRAY).insert(dataToInsert))

      if (result.error) {
        console.error("Submission error:", result.error)
        setMessage(`Failed to submit the form: ${result.error.message || "Unknown error"}`)
        setMessageType("error")
      } else {
        setMessage(`X-ray registration successful for UHID: ${finalUHID}`)
        setMessageType("success")
        setFormData(getDefaultFormState())
        setSearchTerms({})
      }
    } catch (err: any) {
      console.error("Unexpected error:", err)
      setMessage(err.message ?? "An unexpected error occurred.")
      setMessageType("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 p-1 bg-gray-100 min-h-screen font-sans">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1 flex items-center">
        <Stethoscope className="mr-2 w-6 h-6 text-blue-600" />
        X-ray Entry Portal
      </h1>
      <Card className="bg-white p-1 rounded-xl shadow-lg border border-gray-200">
        <form onSubmit={handleSubmit}>
          {/* Patient Information Section */}
          <div className="mb-2 p-1 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-bold text-blue-800 flex items-center">
                <UserPlus className="mr-1 w-4 h-4 text-blue-600" />
                Patient Information
                </h2>
                {isExistingPatient && (
                    <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-600 font-medium">UHID: {formData.uhid}</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleNewPatient}
                        className="h-7 px-2 py-0 text-xs"
                    >
                        Clear & Add New
                    </Button>
                    </div>
                )}
            </div>
            {/* Reordered fields: Title, Name, Phone Number */}
            <div className="grid grid-cols-12 gap-1">
              {/* Title - Reduced width (col-span-3) */}
              <div className="col-span-3 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="title">
                  Title
                </Label>
                <Select
                    value={formData.title}
                    onValueChange={(value) => handleSelectChange("title", value)}
                    disabled={isExistingPatient}
                >
                    <SelectTrigger className={cn("p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500", isExistingPatient && "bg-blue-100")}>
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
              
              {/* Name and UHID Hint Logic - Increased width (col-span-5) */}
              <div className="col-span-5 flex flex-col relative" ref={patientHintsRef}>
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="name">
                  Patient Name
                </Label>
                <div className="relative">
                    <Input
                        type="text"
                        name="name"
                        id="name"
                        placeholder="Type name (2+ chars) to search"
                        value={formData.name}
                        onChange={(e) => {
                            handleChange(e);
                            setFormData((prev) => ({ ...prev, name: e.target.value.toUpperCase() }));
                            if (!isExistingPatient) setShowPatientHints(true);
                        }}
                        onFocus={() => {
                            if (!isExistingPatient) setShowPatientHints(true)
                        }}
                        className={cn("p-1 border border-gray-300 rounded-md focus-visible:ring-blue-500 pl-8", isExistingPatient && "bg-blue-100")}
                        required
                        readOnly={isExistingPatient}
                    />
                    <UserCircle className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
                {showPatientHints && patientHints.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-10 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
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
                                {p.number} • {p.age} {p.age_unit} • {p.gender}
                            </div>
                            </li>
                        ))}
                    </ul>
                )}
              </div>
              {/* Phone Number - Increased width (col-span-4) */}
              <div className="col-span-4 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="phoneNumber">
                  Phone Number
                </Label>
                <div className="relative">
                    <Input
                        type="tel"
                        name="phoneNumber"
                        id="phoneNumber"
                        placeholder="Enter 10-digit number"
                        value={formData.phoneNumber}
                        onChange={(e) => {
                            handleChange(e);
                            if (!isExistingPatient) setShowPatientHints(true);
                        }}
                        onFocus={() => {
                            if (!isExistingPatient) setShowPatientHints(true)
                        }}
                        className={cn("p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500 pl-8", isExistingPatient && "bg-blue-100")}
                        readOnly={isExistingPatient}
                    />
                    <Phone className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              
              {/* Second row fields: Age, Age Unit, Gender, Address, Bill Number, Hospital Name, Doctor Name, Visit Type, TPA, Date of Appointment */}
              
              {/* Age (col-span-2) */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="age">
                  Age
                </Label>
                <Input
                  type="number"
                  name="age"
                  id="age"
                  placeholder="Age"
                  value={formData.age}
                  onChange={handleChange}
                  className={cn("p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500", isExistingPatient && "bg-blue-100")}
                  required
                  readOnly={isExistingPatient}
                />
              </div>
              {/* Age Unit (col-span-2) */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="ageUnit">
                  Unit
                </Label>
                <Select
                  value={formData.ageUnit}
                  onValueChange={(value) => handleSelectChange("ageUnit", value as "year" | "month" | "day")}
                  disabled={isExistingPatient}
                >
                  <SelectTrigger className={cn("p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500", isExistingPatient && "bg-blue-100")}>
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">Year</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Gender (col-span-2) */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="gender">
                  Gender
                </Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => handleSelectChange("gender", value)}
                  disabled={isExistingPatient}
                >
                  <SelectTrigger className={cn("p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500", isExistingPatient && "bg-blue-100")}>
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Address (col-span-6) */}
              <div className="col-span-6 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="address">
                  Address
                </Label>
                <Input
                    type="text"
                    name="address"
                    id="address"
                    placeholder="Enter patient address"
                    value={formData.address}
                    onChange={handleChange}
                    className={cn("p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500", isExistingPatient && "bg-blue-100")}
                    readOnly={isExistingPatient}
                />
              </div>
              
              {/* Bill Number (col-span-3) */}
              <div className="col-span-3 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="billNumber">
                  Bill No.
                </Label>
                <Input
                  type="text"
                  name="billNumber"
                  id="billNumber"
                  placeholder="Bill number"
                  value={formData.billNumber}
                  onChange={handleChange}
                  className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                />
              </div>
              {/* Hospital Name (col-span-3) */}
              <div className="col-span-3 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="hospitalName">
                  Hospital
                </Label>
                <Select
                  value={formData.hospitalName}
                  onValueChange={(value) => handleSelectChange("hospitalName", value)}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Select hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sigma Clinic">Sigma Clinic</SelectItem>
                  
                  </SelectContent>
                </Select>
              </div>
              {/* Doctor Name (col-span-3) */}
              <div className="col-span-3 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="doctorName">
                  Doctor Name
                </Label>
                <Input
                  type="text"
                  name="doctorName"
                  id="doctorName"
                  placeholder="Refer by"
                  value={formData.doctorName}
                  onChange={handleChange}
                  className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                  required
                />
              </div>
              {/* Visit Type (col-span-1) */}
              <div className="col-span-1 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="visitType">
                  Visit
                </Label>
                <Select
                  value={formData.visitType}
                  onValueChange={(value) => handleSelectChange("visitType", value)}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Direct">Direct</SelectItem>
                    <SelectItem value="OPD">OPD</SelectItem>
                    <SelectItem value="IPD">IPD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* TPA (col-span-1) */}
              <div className="col-span-1 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="tpa">
                  TPA
                </Label>
                <Select
                  value={formData.tpa}
                  onValueChange={(value) => handleSelectChange("tpa", value)}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Yes/No" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Date of Appointment (col-span-1) */}
              <div className="col-span-1 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="dateOfAppointment">
                  Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal h-auto py-2 px-1 text-xs",
                        !formData.dateOfAppointment && "text-muted-foreground",
                      )}
                    >
                      <CalendarDays className="mr-1 h-3 w-3" />
                      {formData.dateOfAppointment ? (
                        <span className="truncate">{format(formData.dateOfAppointment, "PPP")}</span>
                      ) : (
                        <span>Pick date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.dateOfAppointment}
                      onSelect={(date) =>
                        setFormData((prev) => ({ ...prev, dateOfAppointment: date || new Date() }))
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <hr className="my-2 border-gray-200" />

          {/* X-ray Test Section */}
          <div className="mb-2 p-1 bg-green-50 rounded-lg border border-green-200">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-lg font-bold text-green-800 flex items-center">
                <FlaskConical className="mr-1 w-4 h-4 text-green-600" />
                X-ray Tests
              </h2>
              <Button
                type="button"
                onClick={handleAddTest}
                className="bg-green-600 hover:bg-green-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-colors duration-200 h-7"
              >
                <Plus className="mr-1 h-3 w-3" /> Add Test
              </Button>
            </div>

            {/* Remark Field - Separate Box */}
            <div className="mb-2 p-2 bg-white rounded-md shadow-sm border border-gray-200">
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Remark</Label>
              <Input
                type="text"
                name="remark"
                id="remark"
                placeholder="Enter any additional remarks"
                value={formData.remark}
                onChange={handleChange}
                className="p-1 border border-gray-300 rounded-md focus-visible:ring-blue-500"
              />
            </div>
            {formData.xrayTests.map((test, index) => {
              const filteredExams = getFilteredExaminations(index)
              const xrayViaOptions = getXrayViaOptions()
              return (
                <div
                  key={index}
                  className="relative grid grid-cols-1 md:grid-cols-3 gap-1 p-1 bg-white rounded-md shadow-sm border border-gray-200 mt-1"
                >
                  {formData.xrayTests.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => handleRemoveTest(index)}
                      className="absolute top-1 right-1 p-1 h-5 w-5 text-red-500 hover:bg-red-100"
                      variant="ghost"
                      title="Remove Test"
                    >
                      <X className="w-2 h-2" />
                    </Button>
                  )}
                  {/* Examination Dropdown */}
                  <div className="flex flex-col">
                    <Label className="text-xs font-semibold text-gray-700 mb-1" htmlFor={`examination-${index}`}>
                      Examination
                    </Label>
                    <Select
                      value={test.examination}
                      onValueChange={(value) => handleTestSelectChange(index, "examination", value)}
                    >
                      <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500 hover:border-blue-400 transition-colors duration-200 bg-white shadow-sm">
                        <SelectValue placeholder="Select Examination" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                        <div className="sticky top-0 bg-white border-b border-gray-200 p-2 z-20">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                              ref={(el) => {
                                searchInputRefs.current[index] = el
                              }}
                              type="text"
                              placeholder="Search examinations..."
                              value={searchTerms[index] || ""}
                              onChange={(e) => handleSearchChange(index, e.target.value)}
                              className="pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus-visible:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              autoComplete="off"
                            />
                          </div>
                        </div>

                        {/* Regular Examinations Section */}
                        {filteredExams.regular.length > 0 && (
                          <div className="px-2 py-1">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1 bg-gray-50 rounded-md mb-1">
                              Regular Examinations ({filteredExams.regular.length})
                            </div>
                            {filteredExams.regular.map((exam) => (
                              <SelectItem
                                key={exam}
                                value={exam}
                                className="relative pl-6 pr-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 cursor-pointer rounded-md transition-colors duration-150"
                              >
                                <span className="block truncate">{exam}</span>
                              </SelectItem>
                            ))}
                          </div>
                        )}

                        {/* Divider */}
                        {filteredExams.regular.length > 0 && filteredExams.procedures.length > 0 && (
                          <div className="border-t border-gray-200 my-1"></div>
                        )}

                        {/* Procedure Section */}
                        {filteredExams.procedures.length > 0 && (
                          <div className="px-2 py-1">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1 bg-orange-50 rounded-md mb-1">
                              Procedures ({filteredExams.procedures.length})
                            </div>
                            {filteredExams.procedures.map((exam) => (
                              <SelectItem
                                key={exam}
                                value={exam}
                                className="relative pl-6 pr-3 py-2 text-sm hover:bg-orange-50 focus:bg-orange-50 cursor-pointer rounded-md transition-colors duration-150"
                              >
                                <span className="block truncate">{exam}</span>
                              </SelectItem>
                            ))}
                          </div>
                        )}

                        {/* No results message */}
                        {filteredExams.regular.length === 0 &&
                          filteredExams.procedures.length === 0 &&
                          searchTerms[index] && (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center">
                              No examinations found for "{searchTerms[index]}"
                            </div>
                          )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col">
                    <Label className="text-xs font-semibold text-gray-700 mb-1" htmlFor={`xrayVia-${index}`}>
                      X-ray Via
                    </Label>
                    {isProcedureExamination(test.examination) ? (
                      <Input
                        type="text"
                        value="N/A"
                        readOnly
                        className="p-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                      />
                    ) : (
                      <Select
                        value={test.xrayVia}
                        onValueChange={(value) => handleTestSelectChange(index, "xrayVia", value)}
                        disabled={!test.examination} // Disable until an examination is selected
                      >
                        <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                          <SelectValue placeholder="Select via" />
                        </SelectTrigger>
                        <SelectContent>
                          {xrayViaOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {/* Amount */}
                  <div className="flex flex-col">
                    <Label className="text-xs font-semibold text-gray-700 mb-1" htmlFor={`amount-${index}`}>
                      Amount
                    </Label>
                    <Input
                      type="number"
                      name="amount"
                      id={`amount-${index}`}
                      value={test.amount}
                      readOnly
                      className="p-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <hr className="my-2 border-gray-200" />

          <div className="mb-2 p-1 bg-indigo-50 rounded-lg border border-indigo-200">
            <h2 className="text-lg font-bold text-indigo-800 mb-1 flex items-center">
              <FlaskConical className="mr-1 w-4 h-4 text-indigo-600" />
              Payment Details
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1">
              {/* Payment Detail Box */}
              <div className="bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-base font-semibold text-gray-800">Payment Detail</h3>
                  <Button
                    type="button"
                    onClick={handleAddPayment}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-colors duration-200 h-7"
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add Payment
                  </Button>
                </div>

                {/* Discount Field */}
                <div className="mb-1">
                  <Label className="text-xs font-semibold text-gray-700 mb-1" htmlFor="discount">
                    Discount
                  </Label>
                  <Input
                    type="number"
                    name="discount"
                    id="discount"
                    value={formData.discount}
                    onChange={handleChange}
                    className="p-1 border border-gray-300 rounded-md focus-visible:ring-blue-500"
                    placeholder="Enter discount amount"
                  />
                </div>

                {/* Payment Entries */}
                {formData.payments.map((payment, index) => (
                  <div
                    key={index}
                    className="relative grid grid-cols-2 gap-1 p-1 bg-gray-50 rounded-md border border-gray-200 mb-1"
                  >
                    <Button
                      type="button"
                      onClick={() => handleRemovePayment(index)}
                      className="absolute top-1 right-1 p-1 h-4 w-4 text-red-500 hover:bg-red-100"
                      variant="ghost"
                      title="Remove Payment"
                    >
                      <X className="w-2 h-2" />
                    </Button>

                    <div className="flex flex-col">
                      <Label className="text-xs font-medium text-gray-700 mb-1">Amount</Label>
                      <Input
                        type="number"
                        value={payment.amount}
                        onChange={(e) => handlePaymentChange(index, "amount", e.target.value)}
                        className="p-1 border border-gray-300 rounded-md focus-visible:ring-blue-500"
                        placeholder="Enter amount"
                      />
                    </div>

                    <div className="flex flex-col">
                      <Label className="text-xs font-medium text-gray-700 mb-1">Mode</Label>
                      <Select
                        value={payment.paymentMode}
                        onValueChange={(value) => handlePaymentChange(index, "paymentMode", value)}
                      >
                        <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Online">Online</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Payment Summary Box */}
              <div className="bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-base font-semibold text-gray-800 mb-1">Payment Summary</h3>

                <div className="space-y-1">
                  <div className="flex justify-between items-center py-1 border-b border-gray-200">
                    <span className="text-xs font-medium text-gray-600">Total Amount:</span>
                    <span className="text-xs font-semibold text-gray-900">₹{formData.totalAmount.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-gray-200">
                    <span className="text-xs font-medium text-gray-600">Discount:</span>
                    <span className="text-xs font-semibold text-gray-900">₹{formData.discount.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-gray-200">
                    <span className="text-xs font-medium text-gray-600">Total Paid:</span>
                    <span className="text-xs font-semibold text-gray-900">₹{totalPaid.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b-2 border-gray-300">
                    <span className="text-xs font-medium text-gray-600">Remaining Amount:</span>
                    <span className={`text-xs font-bold ${remainingAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                      ₹{remainingAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Form Submission and Message */}
          {message && (
            <div
              className={cn(
                "p-1 mb-1 rounded-md font-medium",
                messageType === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
              )}
            >
              {message}
            </div>
          )}

          <div className="flex justify-center">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-6 rounded-full shadow-md transition-transform duration-200 hover:scale-105 disabled:bg-gray-400"
            >
              {isSubmitting ? "Submitting..." : isExistingPatient ? "Save New X-ray Entry" : "Save Patient & X-ray Entry"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}