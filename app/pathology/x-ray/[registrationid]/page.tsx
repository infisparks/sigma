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
// Assuming these file paths are correct in your environment
import { xrayData } from "../index" 
import { xrayPriceList as gautamiXrayData } from "../indexGautami" 
import { format } from "date-fns"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar" // Assuming Calendar is imported from ui/calendar

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

// Helper to calculate DOB based on age and age unit (for patient table update)
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

// Data maps (used for calculating prices)
const examinationPriceMap = xrayData.xray_price_list.reduce<Record<string, any>>((acc, item) => {
  acc[item.examination] = item
  return acc
}, {})
const procedurePriceMap = xrayData.procedure.reduce<Record<string, any>>((acc, item) => {
  acc[item.name] = item
  return acc
}, {})
const gautamiExaminationPriceMap = gautamiXrayData.reduce<Record<string, any>>((acc, item) => {
  acc[item.Examination] = item
  return acc
}, {})

const regularExaminations = xrayData.xray_price_list.map((item) => item.examination)
const procedureExaminations = xrayData.procedure.map((item) => item.name)
const gautamiExaminations = gautamiXrayData.map((item) => item.Examination)

/**
 * -----------------------------
 * Types
 * -----------------------------
 */

interface XrayTest {
  examination: string
  amount: number
  xrayVia: string 
}

interface PaymentEntry {
  amount: number
  paymentMode: string 
}

interface IFormState {
  // Patient fields (editable)
  uhid: string // Stored from fetched X-ray record
  title: string
  name: string
  phoneNumber: string
  gender: string
  age: number
  ageUnit: 'year' | 'month' | 'day' // Must match DB enum
  address: string

  // X-ray fields (editable)
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
}

// Initial form state (match IFormState structure)
const initialFormData: IFormState = {
  uhid: "",
  title: "",
  name: "",
  phoneNumber: "",
  gender: "",
  age: 0,
  ageUnit: "year", 
  address: "",

  hospitalName: "Sigma Clinic",
  billNumber: "",
  doctorName: "", 
  visitType: "OPD", 
  tpa: "No", 
  remark: "", 
  xrayTests: [{ examination: "", amount: 0, xrayVia: "Price" }],
  totalAmount: 0,
  discount: 0,
  payments: [],
}

interface XrayDetailPageProps {
  params: {
    registrationid: string
  }
}

/**
 * -----------------------------
 * Component
 * -----------------------------
 */
export default function XrayDetailPage({ params }: XrayDetailPageProps) {
  const [formData, setFormData] = useState<IFormState>(initialFormData)
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({})
  const searchInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [initialHospitalName, setInitialHospitalName] = useState("")
  
  const registrationId = params.registrationid

  const isGautamiHospital = (hospitalName: string) => {
    return hospitalName === "Sigma clinic"
  }
  
  // Helper to ensure values are cast to correct types for the form state
  const handleSelectChange = (name: keyof IFormState, value: string | number) => {
    setFormData((prev) => ({ 
        ...prev, 
        [name]: ['age', 'discount', 'totalAmount'].includes(name as string) ? Number(value) : value 
    }))
  }

  const getXrayViaOptions = (hospitalName: string) => {
    if (isGautamiHospital(hospitalName)) {
      return [
        { value: "OPD_Amt", label: "OPD Amount" },
        { value: "Portable", label: "Portable" },
      ]
    }
    return [
      { value: "Price", label: "Price" },
      { value: "Ward", label: "Ward" },
      { value: "ICU", label: "ICU" },
    ]
  }

  const isProcedureExamination = (examination: string) => {
    // This is hardcoded logic derived from the XrayEntry page - kept for consistency
    return ["HSG", "IVP", "BMFT", "BM SWALLOW"].includes(examination) || procedureExaminations.includes(examination)
  }

  const getExaminationList = (hospitalName: string) => {
    if (isGautamiHospital(hospitalName)) {
      return { regular: gautamiExaminations, procedures: [] }
    }
    return { regular: regularExaminations, procedures: procedureExaminations }
  }
  
  // Function to calculate amount based on all factors
  const calculateAmount = (examination: string, xrayVia: string, hospitalName: string) => {
    const isGautami = isGautamiHospital(hospitalName)
    // Convert to lowercase for lookup in the price map which uses lowercase keys like 'price', 'ward', 'icu'
    const viaKey = xrayVia.toLowerCase()
    
    if (isGautami) {
      const gautamiItem = gautamiExaminationPriceMap[examination]
      // Gautami uses 'OPD_Amt' or 'Portable' keys (case-sensitive)
      return gautamiItem ? (gautamiItem[xrayVia] || 0) : 0
    }
    
    // Check procedures first for default hospital
    const procedureItem = procedurePriceMap[examination]
    if (procedureItem) {
      return procedureItem.price || 0
    }

    // Check regular examinations (uses lowercase keys: 'price', 'ward', 'icu')
    const xrayItem = examinationPriceMap[examination]
    if (xrayItem) {
      return xrayItem[viaKey] || 0
    }
    
    return 0
  }

  // Fetch data on initial load
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true)
      
      if (!registrationId) {
        setMessage("No registration ID provided.")
        setMessageType("error")
        setLoading(false)
        return
      }

      // 1. Fetch X-ray Detail
      const { data: xrayData, error: xrayError } = await withRetry(async () =>
        supabase.from(TABLE.XRAY).select("*").eq("id", registrationId).single(),
      )

      if (xrayError || !xrayData) {
        console.error("Fetch X-ray error:", xrayError)
        setMessage(`Failed to fetch X-ray data: ${xrayError?.message || "Record not found."}`)
        setLoading(false)
        return
      }
      
      const patientUhid = xrayData.patient_uhid;
      if (!patientUhid) {
          setMessage("X-ray record is missing a patient UHID. Cannot fetch patient details.");
          setLoading(false);
          return;
      }

      // 2. Fetch Patient Detail using UHID
      const { data: patientData, error: patientError } = await withRetry(async () => 
          supabase.from(TABLE.PATIENT).select("*").eq("uhid", patientUhid).single()
      );

      if (patientError || !patientData) {
          console.error("Fetch Patient error:", patientError);
          setMessage(`Failed to fetch patient details: ${patientError?.message || "Patient not found."}`);
          setLoading(false);
          return;
      }


      const hospitalName = xrayData.Hospital_name || "Sigma Clinic"
      const isGautami = isGautamiHospital(hospitalName)

      setInitialHospitalName(hospitalName)

      // Normalize Xray_Via from stored lowercase/N/A values to UI case (Price, Ward, ICU, OPD_Amt, Portable)
      const normalizeXrayVia = (storedVia: string, isGautami: boolean) => {
        if (storedVia === "N/A" || isProcedureExamination(storedVia)) return "N/A";
        
        const upperVia = storedVia.toUpperCase();

        if (isGautami) {
            if (upperVia.includes('OPD')) return "OPD_Amt";
            if (upperVia.includes('PORTABLE')) return "Portable";
            return "OPD_Amt"; // Default for Gautami
        }
        
        // Default Hospital
        if (upperVia.includes('PRICE') || upperVia.includes('DIRECT')) return "Price";
        if (upperVia.includes('WARD')) return "Ward";
        if (upperVia.includes('ICU')) return "ICU";
        return "Price"; // Default for Medford
      };


      // Format fetched data to fit the IFormState
      const formattedData: IFormState = {
        // Patient Details
        uhid: patientData.uhid,
        title: patientData.title || "",
        name: patientData.name || "",
        phoneNumber: patientData.number ? String(patientData.number) : "",
        gender: patientData.gender || "",
        age: patientData.age || 0,
        ageUnit: patientData.age_unit as 'year' | 'month' | 'day' || "year",
        address: patientData.address || "",
        
        // X-ray Details
        hospitalName: hospitalName,
        billNumber: xrayData.bill_number || "",
        doctorName: xrayData.Refer_doctorname || "",
        visitType: xrayData.Visit_type as "OPD" | "IPD" | "Direct" || "OPD",
        tpa: xrayData.Tpa as "Yes" | "No" || "No",
        remark: xrayData.Remark || "",
        
        xrayTests:
          (xrayData["x-ray_detail"] || []).length > 0
            ? (xrayData["x-ray_detail"] || []).map((test: any) => {
                const normalizedVia = normalizeXrayVia(test.Xray_Via, isGautami)

                return {
                  examination: test.Examination,
                  amount: test.Amount,
                  xrayVia: normalizedVia,
                }
              })
            : [{ examination: "", amount: 0, xrayVia: isGautami ? "OPD_Amt" : "Price" }],
            
        totalAmount: xrayData.amount_detail?.totalAmount || 0,
        discount: xrayData.amount_detail?.discount || 0,
        payments: (xrayData.amount_detail?.paymentHistory || []).map((payment: any) => ({
          amount: payment.amount,
          // Payments stored in lowercase in DB, normalize to 'Cash'/'Online' for UI Select
          paymentMode: payment.paymentMode === 'cash' ? 'Cash' : 'Online',
        })),
      }

      setFormData(formattedData)
      setLoading(false)
    }

    fetchAllData()
  }, [registrationId])


  // Calculate total amount whenever x-ray tests change
  useEffect(() => {
    const total = formData.xrayTests.reduce((sum, test) => sum + (test.amount || 0), 0)
    setFormData((prev) => ({ ...prev, totalAmount: total }))
  }, [formData.xrayTests])

  // Reset xrayTests if hospital changes
  useEffect(() => {
    if (formData.hospitalName !== initialHospitalName) {
      setFormData((prev) => ({
        ...prev,
        xrayTests: [
          { examination: "", amount: 0, xrayVia: isGautamiHospital(prev.hospitalName) ? "OPD_Amt" : "Price" },
        ],
      }))
      setSearchTerms({})
      setInitialHospitalName(formData.hospitalName)
    }
  }, [formData.hospitalName, initialHospitalName])


  // Handle basic form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
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
    const examList = getExaminationList(formData.hospitalName)

    if (!searchTerm) {
      return examList
    }

    const filteredRegular = examList.regular.filter((exam) => exam.toLowerCase().includes(searchTerm.toLowerCase()))
    const filteredProcedures = examList.procedures.filter((exam) =>
      exam.toLowerCase().includes(searchTerm.toLowerCase()),
    )

    return { regular: filteredRegular, procedures: filteredProcedures }
  }

  const handleTestSelectChange = (index: number, name: string, value: string) => {
    setFormData((prev) => {
        const newTests = [...prev.xrayTests]
        
        if (name === "examination") {
          const isGautami = isGautamiHospital(prev.hospitalName);
          const isProc = isProcedureExamination(value);
          
          let xrayVia = newTests[index].xrayVia;
          
          if (isProc && !isGautami) {
            xrayVia = 'N/A'; // Procedures for Medford always N/A
          } else if (isGautami) {
             xrayVia = xrayVia === 'N/A' || xrayVia === '' ? "OPD_Amt" : xrayVia; // Gautami default to OPD_Amt
          } else {
             xrayVia = xrayVia === 'N/A' || xrayVia === '' ? "Price" : xrayVia; // Medford default to Price
          }
          
          const amount = calculateAmount(value, xrayVia, prev.hospitalName)
    
          newTests[index] = {
            ...newTests[index],
            examination: value,
            amount: amount,
            xrayVia: xrayVia,
          }
          setSearchTerms((prev) => ({ ...prev, [index]: "" }))
        } else if (name === "xrayVia") {
          const currentExam = newTests[index].examination
          const amount = calculateAmount(currentExam, value, prev.hospitalName)
    
          newTests[index] = { ...newTests[index], xrayVia: value, amount: amount }
        }
        return { ...prev, xrayTests: newTests }
    })
  }

  const handleAddTest = () => {
    const defaultXrayVia = isGautamiHospital(formData.hospitalName) ? "OPD_Amt" : "Price"
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
    const newPayments = [...formData.payments]
    newPayments[index] = { ...newPayments[index], [field]: field === "amount" ? Number(value) : value }
    setFormData((prev) => ({ ...prev, payments: newPayments }))
  }

  const totalPaid = formData.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
  const remainingAmount = Math.max(0, formData.totalAmount - formData.discount - totalPaid)
  const totalDay = formData.age * (formData.ageUnit === "year" ? 360 : formData.ageUnit === "month" ? 30 : 1);


  // Handle form update
  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage("")
    setMessageType("")
    
    if (!formData.uhid) {
        setMessage("Error: Patient UHID is missing. Cannot update.");
        setMessageType("error");
        setIsSubmitting(false);
        return;
    }
    
    try {
      // 1. Prepare data for X-ray table update
      const amountDetail = {
        totalAmount: formData.totalAmount,
        discount: formData.discount,
        paymentHistory: formData.payments.map((payment) => ({
          amount: payment.amount,
          // Store payment mode back in lowercase for consistency with original schema
          paymentMode: payment.paymentMode.toLowerCase(),
          time: new Date().toISOString(), // Use current time for update timestamp
        })),
      }

      const xrayDetail = formData.xrayTests.map((test) => {
        const isProcedure = isProcedureExamination(test.examination)
        return {
          Examination: test.examination,
          // Store 'N/A' for procedures, otherwise store the value.
          Xray_Via: isProcedure ? "N/A" : test.xrayVia,
          Amount: test.amount,
        }
      })

      const xrayDataToUpdate = {
        Hospital_name: formData.hospitalName,
        bill_number: formData.billNumber || null,
        Refer_doctorname: formData.doctorName || null,
        Visit_type: formData.visitType,
        Tpa: formData.tpa,
        Remark: formData.remark || null,
        amount_detail: amountDetail,
        "x-ray_detail": xrayDetail,
      }

      // 2. Prepare data for Patient table update
      const patientDataToUpdate = {
          name: formData.name.toUpperCase(),
          number: Number(formData.phoneNumber) || null,
          age: formData.age,
          age_unit: formData.ageUnit,
          total_day: totalDay,
          gender: formData.gender,
          address: formData.address || "",
          title: formData.title || null,
          dob: calculateDOB(formData.age, formData.ageUnit),
      };
      
      // Execute Patient Detail update
      const { error: patientUpdateError } = await withRetry(async () =>
          supabase.from(TABLE.PATIENT).update(patientDataToUpdate).eq("uhid", formData.uhid)
      );
      throwIfError(patientUpdateError);

      // Execute X-ray Detail update
      const { error: xrayUpdateError } = await withRetry(async () =>
        supabase.from(TABLE.XRAY).update(xrayDataToUpdate).eq("id", registrationId),
      )
      throwIfError(xrayUpdateError);


      setMessage("Registration and Patient details updated successfully! ✅")
      setMessageType("success")

    } catch (err: any) {
      console.error("Unexpected error:", err)
      setMessage(`An unexpected error occurred: ${err.message || "Check console."}`)
      setMessageType("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <p className="text-xl text-gray-700">Loading patient data for Registration ID: {registrationId}...</p>
      </div>
    )
  }

  // Helper to ensure 'gender' and 'ageUnit' are treated as strings for select components
  const formStateAsString = formData as unknown as Record<keyof IFormState, string>;
  const patientUhidDisplay = formData.uhid || "N/A";

  return (
    <div className="flex-1 p-1 bg-gray-100 min-h-screen font-sans">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1 flex items-center">
        <Stethoscope className="mr-2 w-6 h-6 text-blue-600" />
        X-ray Update Portal 
      </h1>
      <p className="text-sm text-gray-600 mb-2">Editing Registration ID: <span className="font-bold text-blue-600">{registrationId}</span> (UHID: {patientUhidDisplay})</p>
      
      <Card className="bg-white p-1 rounded-xl shadow-lg border border-gray-200">
        <form onSubmit={handleUpdate}>
          {/* Patient Information Section */}
          <div className="mb-2 p-1 bg-blue-50 rounded-lg border border-blue-200">
            <h2 className="text-lg font-bold text-blue-800 mb-1 flex items-center">
              <UserPlus className="mr-1 w-4 h-4 text-blue-600" />
              Patient & Visit Information
            </h2>
            
            {/* Patient Name, Title, and Phone Number row */}
            <div className="grid grid-cols-12 gap-1 mb-1">
              {/* Title (col-span-2) */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="title">Title</Label>
                <Select
                    value={formStateAsString.title}
                    onValueChange={(value) => handleSelectChange("title", value)}
                >
                    <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                        <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                        {[".", "MR", "MRS", "MAST", "BABA", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map((t) => (
                            <SelectItem key={t} value={t}>{t === "." ? "NoTitle" : t}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
              
              {/* Name (col-span-5) */}
              <div className="col-span-5 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="name">Patient Name</Label>
                <div className="relative">
                    <Input
                        type="text"
                        name="name"
                        id="name"
                        placeholder="Enter full name"
                        value={formData.name}
                        onChange={(e) => handleChange(e)}
                        className="p-1 border border-gray-300 rounded-md focus-visible:ring-blue-500 pl-8"
                        required
                    />
                    <UserCircle className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              
              {/* Phone Number (col-span-5) */}
              <div className="col-span-5 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="phoneNumber">Phone Number</Label>
                <div className="relative">
                    <Input
                        type="tel"
                        name="phoneNumber"
                        id="phoneNumber"
                        placeholder="Enter 10-digit number"
                        value={formData.phoneNumber}
                        onChange={(e) => handleChange(e)}
                        className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500 pl-8"
                    />
                    <Phone className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
            
            {/* Age, Unit, Gender, Address row */}
            <div className="grid grid-cols-12 gap-1">
              {/* Age (col-span-2) */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="age">Age</Label>
                <Input
                  type="number"
                  name="age"
                  id="age"
                  placeholder="Age"
                  value={formData.age}
                  onChange={(e) => handleSelectChange('age', e.target.value)}
                  className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                  required
                />
              </div>
              {/* Age Unit (col-span-2) */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="ageUnit">Unit</Label>
                <Select
                  value={formStateAsString.ageUnit}
                  onValueChange={(value) => handleSelectChange("ageUnit", value)}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
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
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="gender">Gender</Label>
                <Select
                  value={formStateAsString.gender}
                  onValueChange={(value) => handleSelectChange("gender", value)}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
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
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="address">Address</Label>
                <Input
                    type="text"
                    name="address"
                    id="address"
                    placeholder="Enter patient address"
                    value={formData.address}
                    onChange={handleChange}
                    className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                />
              </div>
              
              {/* Visit Details Row */}
              {/* Bill Number (col-span-2) - Reduced width */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="billNumber">Bill No.</Label>
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
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="hospitalName">Hospital</Label>
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

              {/* Doctor Name (col-span-4) */}
              <div className="col-span-4 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="doctorName">Doctor Name</Label>
                <Input
                  type="text"
                  name="doctorName"
                  id="doctorName"
                  placeholder="Refer by"
                  value={formData.doctorName}
                  onChange={handleChange}
                  className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                />
              </div>
              
              {/* Visit Type (col-span-1) */}
              <div className="col-span-1 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="visitType">Visit</Label>
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
              {/* TPA (col-span-2) */}
              <div className="col-span-2 flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="tpa">TPA</Label>
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
                className="bg-green-600 hover:bg-green-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-transform duration-200 hover:scale-105 h-7"
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
              const xrayViaOptions = getXrayViaOptions(formData.hospitalName)
              const isProc = isProcedureExamination(test.examination)
              
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
                      <Trash2 className="w-2 h-2" />
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
                              {isGautamiHospital(formData.hospitalName) ? "Gautami Exams" : "Regular Exams"}
                              ({filteredExams.regular.length})
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

                        {/* Procedure Section - Only for non-Gautami hospitals */}
                        {filteredExams.procedures.length > 0 && !isGautamiHospital(formData.hospitalName) && (
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
                    <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor={`xrayVia-${index}`}>
                      X-ray Via
                    </Label>
                    {isProc && !isGautamiHospital(formData.hospitalName) ? (
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
                        disabled={isProc}
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
                    <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor={`amount-${index}`}>
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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-transform duration-200 hover:scale-105 h-7"
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
                    onChange={(e) => handleSelectChange('discount', e.target.value)}
                    className="p-1 border border-gray-300 rounded-md focus-visible:ring-blue-500"
                    placeholder="Enter discount amount"
                  />
                </div>

                {/* Payment Entries */}
                {formData.payments.map((payment, index) => (
                  <div
                    key={index}
                    className="relative grid grid-cols-1 md:grid-cols-2 gap-1 p-1 bg-gray-50 rounded-md border border-gray-200 mb-1"
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
              {isSubmitting ? "Updating..." : "Update Registration"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}