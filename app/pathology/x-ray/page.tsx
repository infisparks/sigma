"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { UserPlus, FlaskConical, Stethoscope, Trash2, X, Plus, Search, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { xrayData } from "./index"
import { xrayPriceList as gautamiXrayPriceList, procedureList as gautamiProcedureList } from "./indexGautami"
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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

// Default hospital data maps
const examinationPriceMap = xrayData.xray_price_list.reduce<Record<string, any>>((acc, item) => {
  acc[item.examination] = item
  return acc
}, {})

const procedurePriceMap = xrayData.procedure.reduce<Record<string, any>>((acc, item) => {
  acc[item.name] = item
  return acc
}, {})

// Gautami hospital data maps
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

// Main X-ray page component
export default function XrayPage() {
  const [formData, setFormData] = useState({
    name: "",
    phoneNumber: "",
    gender: "", // New gender state
    age: "",
    ageUnit: "Years",
    hospitalName: "MEDFORD HOSPITAL",
    billNumber: "",
    doctorName: "", // New field for Doctor Name
    visitType: "OPD", // New field for Visit Type with default OPD
    tpa: "No", // New field for TPA with default No
    remark: "", // New field for Remark
    xrayTests: [{ examination: "", amount: 0, xrayVia: "price" }], // Default to "price"
    totalAmount: 0,
    discount: 0,
    payments: [] as { amount: number; paymentMode: string }[],
    dateOfAppointment: new Date(), // New field for date of appointment
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({})
  const searchInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const isGautamiHospital = () => {
    return formData.hospitalName === "Gautami Medford NX Hospital"
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

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      xrayTests: [{ examination: "", amount: 0, xrayVia: isGautamiHospital() ? "OPD_Amt" : "price" }],
    }))
  }, [formData.hospitalName])

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
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
    const newTests = [...formData.xrayTests]
    const { examinationMap, procedureMap } = getCurrentDataMaps()

    if (name === "examination") {
      // Find the price data based on the selected examination
      const xrayItem = examinationMap[value]
      const procedureItem = procedureMap[value]
      let amount = 0

      // Automatically set the default xrayVia and amount
      const isProcedure = isProcedureExamination(value)
      let xrayVia = isProcedure ? "N/A" : newTests[index].xrayVia; // Keep current via for regular, or set N/A for procedure

      // Specific logic for Medford Hospital's default "Price"
      if (!isGautamiHospital() && !isProcedure) {
        xrayVia = "price";
      } else if (isGautamiHospital() && !isProcedure) {
        xrayVia = "OPD_Amt";
      }

      if (xrayItem) {
        // Use the new xrayVia to determine the price
        amount = xrayItem[xrayVia] || 0
      } else if (procedureItem) {
        if (isGautamiHospital()) {
          amount = procedureItem.Amount || 0
        } else {
          amount = procedureItem.price || 0
        }
      }

      newTests[index] = {
        ...newTests[index],
        examination: value,
        amount: amount,
        xrayVia: xrayVia
      }
      setSearchTerms((prev) => ({ ...prev, [index]: "" }))
    } else if (name === "xrayVia") {
      // When X-ray Via changes, update the amount based on the current examination
      const currentExam = newTests[index].examination
      const { examinationMap } = getCurrentDataMaps()
      const xrayItem = examinationMap[currentExam]
      let amount = 0
      if (xrayItem) {
        amount = xrayItem[value] || 0
      }
      newTests[index] = { ...newTests[index], xrayVia: value, amount: amount }
    }
    setFormData((prev) => ({ ...prev, xrayTests: newTests }))
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
    const newPayments = [...formData.payments]
    newPayments[index] = { ...newPayments[index], [field]: field === "amount" ? Number(value) : value }
    setFormData((prev) => ({ ...prev, payments: newPayments }))
  }

  const totalPaid = formData.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
  const remainingAmount = Math.max(0, formData.totalAmount - formData.discount - totalPaid)

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage("")
    setMessageType("")

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

      const dataToInsert = {
        name: formData.name,
        number: formData.phoneNumber,
        gender: formData.gender || null, // Storing gender data
        age: formData.age,
        age_unit: formData.ageUnit,
        Hospital_name: formData.hospitalName,
        bill_number: formData.billNumber || null,
        Refer_doctorname: formData.doctorName || null,
        Visit_type: formData.visitType,
        Tpa: formData.tpa,
        Remark: formData.remark || null,
        amount_detail: amountDetail,
        "x-ray_detail": xrayDetail,
        created_at: formData.dateOfAppointment.toISOString(), // Update created_at with the selected date
      }

      // Insert data into Supabase
      const result = await withRetry(async () => await supabase.from("x-raydetail").insert(dataToInsert))

      if (result.error) {
        console.error("Submission error:", result.error)
        setMessage(`Failed to submit the form: ${result.error.message || "Unknown error"}`)
        setMessageType("error")
      } else {
        setMessage("Form submitted successfully!")
        setMessageType("success")
        // Reset form
        setFormData({
          name: "",
          phoneNumber: "",
          gender: "",
          age: "",
          ageUnit: "Years",
          hospitalName: "MEDFORD HOSPITAL",
          billNumber: "",
          doctorName: "",
          visitType: "OPD",
          tpa: "No",
          remark: "",
          xrayTests: [{ examination: "", amount: 0, xrayVia: "price" }],
          totalAmount: 0,
          discount: 0,
          payments: [],
          dateOfAppointment: new Date(), // Reset date of appointment
        })
        setSearchTerms({})
      }
    } catch (err) {
      console.error("Unexpected error:", err)
      setMessage("An unexpected error occurred.")
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
          {/* Personal Information Section */}
          <div className="mb-2 p-1 bg-blue-50 rounded-lg border border-blue-200">
            <h2 className="text-lg font-bold text-blue-800 mb-1 flex items-center">
              <UserPlus className="mr-1 w-4 h-4 text-blue-600" />
              Patient Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="name">
                  Patient Name
                </Label>
                <Input
                  type="text"
                  name="name"
                  id="name"
                  placeholder="Enter full name"
                  value={formData.name}
                  onChange={handleChange}
                  className="p-1 border border-gray-300 rounded-md focus-visible:ring-blue-500"
                  required
                />
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="phoneNumber">
                  Phone Number
                </Label>
                <Input
                  type="tel"
                  name="phoneNumber"
                  id="phoneNumber"
                  placeholder="Enter phone number"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                />
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="gender">
                  Gender
                </Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, gender: value }))}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="billNumber">
                  Bill Number
                </Label>
                <Input
                  type="text"
                  name="billNumber"
                  id="billNumber"
                  placeholder="Enter bill number"
                  value={formData.billNumber}
                  onChange={handleChange}
                  className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                />
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="age">
                  Age
                </Label>
                <Input
                  type="number"
                  name="age"
                  id="age"
                  placeholder="Enter age"
                  value={formData.age}
                  onChange={handleChange}
                  className="p-2 border border-gray-300 rounded-lg focus-visible:ring-blue-500"
                />
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="ageUnit">
                  Age Unit
                </Label>
                <Select
                  value={formData.ageUnit}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, ageUnit: value }))}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Select age unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Years">Years</SelectItem>
                    <SelectItem value="Month">Month</SelectItem>
                    <SelectItem value="Day">Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="hospitalName">
                  Hospital Name
                </Label>
                <Select
                  value={formData.hospitalName}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, hospitalName: value }))}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Select hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEDFORD HOSPITAL">MEDFORD HOSPITAL</SelectItem>
                    <SelectItem value="Gautami Medford NX Hospital">Gautami Medford NX Hospital</SelectItem>
                    <SelectItem value="Apex Clinic">Apex Clinic</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
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
                />
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="visitType">
                  Visit Type
                </Label>
                <Select
                  value={formData.visitType}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, visitType: value }))}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPD">OPD</SelectItem>
                    <SelectItem value="IPD">IPD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="tpa">
                  TPA
                </Label>
                <Select
                  value={formData.tpa}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, tpa: value }))}
                >
                  <SelectTrigger className="p-2 h-auto border border-gray-300 rounded-lg focus-visible:ring-blue-500">
                    <SelectValue placeholder="Select TPA" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor="dateOfAppointment">
                  Date of Appointment
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.dateOfAppointment && "text-muted-foreground",
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formData.dateOfAppointment ? (
                        <span>{format(formData.dateOfAppointment, "PPP")}</span>
                      ) : (
                        <span>Pick a date</span>
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
                className="bg-green-600 hover:bg-green-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-colors duration-200"
              >
                <UserPlus className="mr-1 h-3 w-3" /> Add Test
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
                  className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 p-1 bg-white rounded-md shadow-sm border border-gray-200 mt-1"
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
                        <div className="sticky top-0 bg-white border-b border-gray-200 p-2">
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
                    <Label className="text-sm font-semibold text-gray-700 mb-1" htmlFor={`xrayVia-${index}`}>
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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-colors duration-200"
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
                    <span className="text-xs font-semibold text-gray-900">₹{formData.totalAmount}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-gray-200">
                    <span className="text-xs font-medium text-gray-600">Discount:</span>
                    <span className="text-xs font-semibold text-gray-900">₹{formData.discount}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-gray-200">
                    <span className="text-xs font-medium text-gray-600">Total Paid:</span>
                    <span className="text-xs font-semibold text-gray-900">₹{totalPaid}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b-2 border-gray-300">
                    <span className="text-xs font-medium text-gray-600">Remaining Amount:</span>
                    <span className={`text-xs font-bold ${remainingAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                      ₹{remainingAmount}
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
              {isSubmitting ? "Submitting..." : "Submit Entry"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}