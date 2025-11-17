"use client"

import type React from "react"
import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import {
  useForm,
  useFieldArray,
  useWatch,
  type SubmitHandler,
  type FieldErrorsImpl,
  type UseFormGetValues,
  type UseFormSetValue,
  type Control,
  type UseFormRegister,
} from "react-hook-form"
import { FaEdit, FaTrash, FaRupeeSign, FaSave, FaPlus, FaPlusCircle, FaCopy, FaSyncAlt, FaCode, FaClock } from "react-icons/fa"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Edit } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { generateReportPdf } from "@/app/pathology/download-report/[registrationId]/pdf-generator"
import type { PatientData, BloodTestData } from "@/app/pathology/download-report/[registrationId]/types/report"

// ------------------------------------------------------------------
// INTERFACES
// ------------------------------------------------------------------
export interface AgeRangeItem {
  rangeKey: string
  rangeValue: string
}

export interface BloodTestParameter {
  name: string
  unit: string
  valueType: "text" | "number"
  defaultValue?: string | number
  formula?: string
  iscomment?: boolean
  range: {
    male: AgeRangeItem[]
    female: AgeRangeItem[]
  }
  suggestions?: {
    description: string
    shortName: string
  }[]
}

export interface BloodTestSubheading {
  title: string
  parameterNames: { name: string }[]
  is100?: boolean
}

export interface BloodTestFormInputs {
  testName: string
  price: number
  tpa_price?: number
  parameters: BloodTestParameter[]
  subheadings: BloodTestSubheading[]
  isOutsource?: boolean
  interpretation?: string
  // Temporary fields for form handling time
  estimatedHours: number
  estimatedMinutes: number
}

// TestData interface for Supabase, mapping to table columns
export interface TestData {
  id: number
  testName: string
  price: number
  tpa_price?: number
  isOutsource: boolean
  parameters: BloodTestParameter[]
  subheadings: BloodTestSubheading[]
  interpretation?: string
  estimated_time_mm?: string // Added field for DB column
  created_at: string
}

// Helper to safely fetch error messages
function getFieldErrorMessage(errors: any, path: string[]): string | undefined {
  let current = errors
  for (const p of path) {
    if (!current) return undefined
    current = current[p]
  }
  return typeof current?.message === "string" ? current.message : undefined
}

// Helper to format minutes into readable string (e.g., 90 -> 1 hr 30 min)
function formatDuration(minutesStr: string | undefined | null) {
  if (!minutesStr) return "-"
  const totalMinutes = parseInt(minutesStr, 10)
  if (isNaN(totalMinutes) || totalMinutes === 0) return "-"
  
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`
  if (hours > 0) return `${hours} hr`
  return `${minutes} min`
}

// ------------------------------------------------------------------
// PARAMETER EDITOR
// ------------------------------------------------------------------
interface ParameterEditorProps {
  index: number
  control: Control<BloodTestFormInputs>
  register: UseFormRegister<BloodTestFormInputs>
  errors: FieldErrorsImpl<BloodTestFormInputs>
  remove: (index: number) => void
}

const ParameterEditor: React.FC<ParameterEditorProps> = ({ index, control, register, errors, remove }) => {
  const maleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.male`,
  })
  const femaleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.female`,
  })
  const suggestionsArray = useFieldArray({
    control,
    name: `parameters.${index}.suggestions`,
  })

  const paramNameErr = getFieldErrorMessage(errors, ["parameters", index.toString(), "name"])
  
  return (
    <div className="border p-4 rounded mb-4 bg-gray-50">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Parameter #{index + 1}</h3>
        <button type="button" onClick={() => remove(index)} className="text-red-500 hover:text-red-700">
          <FaTrash />
        </button>
      </div>

      {/* Parameter Name & Unit */}
      <div className="mt-2">
        <label className="block text-xs">Parameter Name</label>
        <input
          type="text"
          {...register(`parameters.${index}.name`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
        />
        {paramNameErr && <p className="text-red-500 text-xs">{paramNameErr}</p>}
      </div>
      <div className="mt-2">
        <label className="block text-xs">Unit</label>
        <input type="text" {...register(`parameters.${index}.unit`)} className="w-full border rounded px-2 py-1" />
      </div>

      {/* Value Type */}
      <div className="mt-2">
        <label className="block text-xs">Value Type</label>
        <select
          {...register(`parameters.${index}.valueType`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
        >
          <option value="">Select Value Type</option>
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
      </div>

      {/* Formula & Default */}
      <div className="flex gap-2 mt-2">
        <div className="w-1/2">
            <label className="block text-xs">Formula (optional)</label>
            <input
            type="text"
            {...register(`parameters.${index}.formula`)}
            placeholder="e.g. TOTAL - DIRECT"
            className="w-full border rounded px-2 py-1"
            />
        </div>
        <div className="w-1/2">
            <label className="block text-xs">Default Value</label>
            <input
            type="text"
            {...register(`parameters.${index}.defaultValue`)}
            className="w-full border rounded px-2 py-1"
            />
        </div>
      </div>

      {/* Comment checkbox */}
      <div className="mt-2 flex items-center space-x-2">
        <input type="checkbox" {...register(`parameters.${index}.iscomment`)} id={`comment-${index}`} />
        <label htmlFor={`comment-${index}`} className="text-xs">
          This row is a comment
        </label>
      </div>

      {/* Suggestions */}
      <div className="mt-4">
        <h4 className="text-xs font-medium">Suggestions</h4>
        {suggestionsArray.fields.map((field, sIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mt-1">
            <input
              type="text"
              placeholder="Full suggestion"
              {...register(`parameters.${index}.suggestions.${sIndex}.description`, { required: "Required" })}
              className="w-2/3 border rounded px-2 py-1"
            />
            <input
              type="text"
              placeholder="Short code"
              {...register(`parameters.${index}.suggestions.${sIndex}.shortName`, { required: "Required" })}
              className="w-1/3 border rounded px-2 py-1"
            />
            <button type="button" onClick={() => suggestionsArray.remove(sIndex)} className="text-red-500">
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => suggestionsArray.append({ description: "", shortName: "" })}
          className="mt-2 inline-flex items-center px-2 py-1 border border-green-600 text-green-600 rounded text-xs hover:bg-green-50"
        >
          <FaPlusCircle className="mr-1" /> Add Suggestion
        </button>
      </div>
      
      {/* Ranges - Male */}
      <div className="mt-4">
         <h4 className="text-xs font-medium">Male Ranges</h4>
         {maleRangesArray.fields.map((field, mIndex) => (
             <div key={field.id} className="flex items-center space-x-2 mt-1">
                 <input type="text" {...register(`parameters.${index}.range.male.${mIndex}.rangeKey`)} className="w-1/2 border rounded px-2 py-1" placeholder="Range Key" />
                 <input type="text" {...register(`parameters.${index}.range.male.${mIndex}.rangeValue`)} className="w-1/2 border rounded px-2 py-1" placeholder="Value" />
                 <button type="button" onClick={() => maleRangesArray.remove(mIndex)} className="text-red-500"><FaTrash /></button>
             </div>
         ))}
         <button type="button" onClick={() => maleRangesArray.append({ rangeKey: "", rangeValue: "" })} className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded text-xs hover:bg-blue-50"><FaPlus className="mr-1" /> Add Range</button>
      </div>
      
      {/* Ranges - Female */}
       <div className="mt-4">
         <h4 className="text-xs font-medium">Female Ranges</h4>
         {femaleRangesArray.fields.map((field, fIndex) => (
             <div key={field.id} className="flex items-center space-x-2 mt-1">
                 <input type="text" {...register(`parameters.${index}.range.female.${fIndex}.rangeKey`)} className="w-1/2 border rounded px-2 py-1" placeholder="Range Key" />
                 <input type="text" {...register(`parameters.${index}.range.female.${fIndex}.rangeValue`)} className="w-1/2 border rounded px-2 py-1" placeholder="Value" />
                 <button type="button" onClick={() => femaleRangesArray.remove(fIndex)} className="text-red-500"><FaTrash /></button>
             </div>
         ))}
         <button type="button" onClick={() => femaleRangesArray.append({ rangeKey: "", rangeValue: "" })} className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded text-xs hover:bg-blue-50"><FaPlus className="mr-1" /> Add Range</button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// SUBHEADING EDITOR
// ------------------------------------------------------------------
interface SubheadingEditorProps {
  index: number
  control: Control<BloodTestFormInputs>
  register: UseFormRegister<BloodTestFormInputs>
  errors: FieldErrorsImpl<BloodTestFormInputs>
  remove: (index: number) => void
  getValues: UseFormGetValues<BloodTestFormInputs>
  setValue: UseFormSetValue<BloodTestFormInputs>
}

const SubheadingEditor: React.FC<SubheadingEditorProps> = ({ index, control, register, errors, remove, getValues, setValue }) => {
    const paramNamesArray = useFieldArray({ control, name: `subheadings.${index}.parameterNames` })
    const globalParameters = useWatch({ control, name: "parameters" }) || []

    const handleParameterChange = (pIndex: number, newValue: string) => {
        if (!newValue) return
        const allSubheadings = getValues("subheadings") || []
        for (let shIndex = 0; shIndex < allSubheadings.length; shIndex++) {
          if (shIndex === index) continue
          const paramNames = allSubheadings[shIndex]?.parameterNames.map((p) => p.name) || []
          if (paramNames.includes(newValue)) {
            alert(`Parameter "${newValue}" is already used in another subheading!`)
            setValue(`subheadings.${index}.parameterNames.${pIndex}.name`, "")
            return
          }
        }
    }

    return (
        <div className="border p-4 rounded mb-4 bg-gray-100">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold">Subheading #{index + 1}</h3>
                <button type="button" onClick={() => remove(index)} className="text-red-500 hover:text-red-700"><FaTrash /></button>
            </div>
            <div className="mt-2">
                <label className="block text-xs">Title</label>
                <input type="text" {...register(`subheadings.${index}.title`, { required: "Required" })} className="w-full border rounded px-2 py-1" />
            </div>
            <div className="mt-2 flex items-center space-x-2">
                <input type="checkbox" {...register(`subheadings.${index}.is100`)} id={`is100-${index}`} />
                <label htmlFor={`is100-${index}`} className="text-xs">Sum to 100%</label>
            </div>
            <div className="mt-2">
                <h4 className="text-xs font-medium">Parameters</h4>
                {paramNamesArray.fields.map((field, pIndex) => (
                    <div key={field.id} className="flex items-center space-x-2 mt-1">
                         <select 
                            {...register(`subheadings.${index}.parameterNames.${pIndex}.name`, {
                                onChange: (e) => handleParameterChange(pIndex, e.target.value)
                            })} 
                            className="w-full border rounded px-2 py-1">
                            <option value="">Select Parameter</option>
                            {globalParameters.map((param, idx) => <option key={idx} value={param.name}>{param.name}</option>)}
                         </select>
                         <button type="button" onClick={() => paramNamesArray.remove(pIndex)} className="text-red-500"><FaTrash /></button>
                    </div>
                ))}
                 <button type="button" onClick={() => paramNamesArray.append({ name: "" })} className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded text-xs hover:bg-blue-50"><FaPlus className="mr-1" /> Add Parameter</button>
            </div>
        </div>
    )
}

// ------------------------------------------------------------------
// TEST MODAL (Create & Edit)
// ------------------------------------------------------------------
interface TestModalProps {
  testData?: TestData
  onClose: () => void
  onTestUpdated: () => void
}

const TestModal: React.FC<TestModalProps> = ({ testData, onClose, onTestUpdated }) => {
  
  // Calculate initial hours and minutes from total minutes (if exists)
  const initialTotalMinutes = testData?.estimated_time_mm ? parseInt(testData.estimated_time_mm, 10) : 0
  const initialHours = isNaN(initialTotalMinutes) ? 0 : Math.floor(initialTotalMinutes / 60)
  const initialMinutes = isNaN(initialTotalMinutes) ? 0 : initialTotalMinutes % 60

  const defaultValues = useMemo<BloodTestFormInputs>(
    () =>
      testData
        ? {
            testName: testData.testName,
            price: testData.price,
            tpa_price: testData.tpa_price ?? undefined,
            parameters: testData.parameters,
            subheadings: testData.subheadings.map((sh) => ({
              title: sh.title,
              parameterNames: sh.parameterNames,
              is100: sh.is100 || false,
            })),
            isOutsource: testData.isOutsource || false,
            interpretation: testData.interpretation || "",
            estimatedHours: initialHours,
            estimatedMinutes: initialMinutes
          }
        : {
            testName: "",
            price: 0,
            tpa_price: undefined,
            parameters: [
              {
                name: "",
                unit: "",
                valueType: "text",
                formula: "",
                iscomment: false,
                suggestions: [],
                range: { male: [{ rangeKey: "", rangeValue: "" }], female: [{ rangeKey: "", rangeValue: "" }] },
              },
            ],
            subheadings: [],
            isOutsource: false,
            interpretation: "",
            estimatedHours: 0,
            estimatedMinutes: 0
          },
    [testData, initialHours, initialMinutes],
  )

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    getValues,
    setValue,
    reset,
  } = useForm<BloodTestFormInputs>({ defaultValues })

  const paramFields = useFieldArray({ control, name: "parameters" })
  const subheadingFields = useFieldArray({ control, name: "subheadings" })
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // JSON editor toggle logic
  const [isJsonEditor, setIsJsonEditor] = useState(false)
  const [jsonContent, setJsonContent] = useState("")

  // Function to generate preview PDF - RESTORED
  const generatePreviewPdf = async () => {
    const currentFormData = getValues();

    // Define simplified types for parameters and subheadings
    interface PreviewParameter {
      name: string;
      unit: string;
      value: string | number;
      range: string;
      formula?: string;
      iscomment?: boolean;
      valueType?: "text" | "number";
    }

    interface PreviewSubheading {
      title: string;
      parameterNames: string[];
      is100?: boolean;
    }

    // Construct dummy PatientData based on current form structure
    const dummyParameters: PreviewParameter[] = currentFormData.parameters.map(p => ({
      name: p.name,
      unit: p.unit,
      value: p.valueType === "number" ? 1 : "Dummy Text",
      range: Array.isArray(p.range.male) && p.range.male.length > 0 ? p.range.male[0].rangeValue : "",
      formula: p.formula,
      iscomment: p.iscomment,
      valueType: p.valueType,
    }));

    const dummySubheadings: PreviewSubheading[] = currentFormData.subheadings.map(sh => ({
      title: sh.title,
      parameterNames: sh.parameterNames.map((pn: { name: string }) => pn.name),
      is100: sh.is100,
    }));

    const dummyBloodtestDetail: Record<string, BloodTestData> = {
      [currentFormData.testName.toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]()]/g, "").replace(/\//g, "")]: {
        testId: "dummy-id",
        parameters: dummyParameters as any, 
        subheadings: dummySubheadings as any,
        reportedOn: new Date().toISOString(),
        enteredBy: "Dummy User",
        type: currentFormData.isOutsource ? "outsource" : "inhouse",
        descriptions: [],
        interpretation: currentFormData.interpretation || "Dummy interpretation for " + currentFormData.testName,
      }
    };

    const dummyPatientData: PatientData = {
      id: 1, 
      name: "Preview Patient",
      age: 30,
      gender: "Male",
      patientId: "DP-001",
      contact: "1234567890",
      total_day: "30",
      day_type: "day",
      title: "Mr.",
      doctorName: "Dr. Preview",
      hospitalName: "Preview Hospital",
      registration_id: 101,
      createdAt: new Date().toISOString(),
      sampleCollectedAt: new Date().toISOString(),
      bloodtest_data: [{ testId: "dummy-id", testName: currentFormData.testName, price: currentFormData.price, testType: currentFormData.isOutsource ? "outsource" : "inhouse" }],
      bloodtest_detail: dummyBloodtestDetail,
      bloodtest: dummyBloodtestDetail,
    };

    try {
      const blob = await generateReportPdf(
        dummyPatientData,
        Object.keys(dummyPatientData.bloodtest || {}), 
        [], 
        {}, 
        {}, 
        "normal", 
        true, 
        true, 
        undefined, 
        false, 
      );
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("Error generating preview PDF:", error);
      alert("Failed to generate preview.");
    }
  };

  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
    console.log("TestModal: onSubmit triggered with data:", data)
    try {
      // Calculate total minutes for DB
      const totalMinutes = (Number(data.estimatedHours || 0) * 60) + Number(data.estimatedMinutes || 0)

      const payload: any = {
        test_name: data.testName,
        price: data.price,
        tpa_price: data.tpa_price,
        outsource: data.isOutsource,
        parameter: data.parameters,
        sub_heading: data.subheadings.map((sh) => ({
          title: sh.title,
          parameterNames: sh.parameterNames.map((p) => p.name),
          is100: sh.is100,
        })),
        interpretation: data.interpretation,
        estimated_time_mm: String(totalMinutes) // Save as string to match DB schema
      }
      if (data.tpa_price !== undefined && data.tpa_price !== null) {
        payload.tpa_price = data.tpa_price
      }

      if (testData) {
        const { error } = await supabase.from("zblood_test").update({ ...payload }).eq("id", testData.id)
        if (error) throw error
        alert("Test updated successfully!")
      } else {
        const { error } = await supabase.from("zblood_test").insert({ ...payload })
        if (error) throw error
        alert("Test created successfully!")
      }
      onTestUpdated()
      onClose()
    } catch (err: any) {
      console.error("TestModal: Error saving test:", err.message)
      alert(`Error saving test: ${err.message}`)
    }
  }

  const handleDelete = async () => {
    if (!testData) return
    if (!window.confirm("Delete this test?")) return
    try {
      const { error } = await supabase.from("zblood_test").delete().eq("id", testData.id)
      if (error) throw error
      alert("Deleted!")
      onTestUpdated()
      onClose()
    } catch (err: any) {
      alert(`Error deleting test: ${err.message}`)
    }
  }

  const handleSaveJson = async () => {
    try {
      const parsed = JSON.parse(jsonContent)
      const transformedSubheadings = parsed.subheadings.map((sh: any) => ({
        title: sh.title,
        parameterNames: sh.parameterNames.map((p: any) => p.name),
        is100: parsed.is100 === "true" || parsed.is100 === true,
      }))

      const payload: any = {
        test_name: parsed.testName,
        price: parsed.price,
        tpa_price: parsed.tpa_price,
        outsource: parsed.isOutsource,
        parameter: parsed.parameters,
        sub_heading: transformedSubheadings,
        interpretation: parsed.interpretation,
        estimated_time_mm: "1100" // Default for JSON paste if not provided
      }
      
      if (parsed.tpa_price !== undefined && parsed.tpa_price !== null) { payload.tpa_price = parsed.tpa_price }

      if (testData) {
        const { error } = await supabase.from("zblood_test").update({ ...payload }).eq("id", testData.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("zblood_test").insert({ ...payload })
        if (error) throw error
      }
      alert("Saved!")
      onTestUpdated()
      onClose()
    } catch (e: any) {
      alert("Invalid JSON or error saving: " + e.message)
    }
  }

  const handleSwitchToForm = () => {
    try {
      const parsedJson = JSON.parse(jsonContent)
      const transformedSubheadings = parsedJson.subheadings.map((sh: any) => ({
        title: sh.title,
        parameterNames: (sh.parameterNames || []).map((name: string | { name: string }) =>
          typeof name === "string" ? { name } : name,
        ),
        is100: sh.is100 === "true" || sh.is100 === true,
      }))
      reset({ ...parsedJson, subheadings: transformedSubheadings })
      setIsJsonEditor(false)
    } catch (e: any) {
      alert("Invalid JSON – can’t switch." + e.message)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        {/* Header - WITH BUTTONS ON TOP */}
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white z-10 pb-2 border-b">
          <h2 className="text-xl font-bold flex items-center">
            {testData ? <><FaEdit className="mr-2" /> Edit Test</> : <><FaPlusCircle className="mr-2" /> New Test</>}
          </h2>
          <div className="flex items-center gap-2">
             {/* Save and Delete Buttons Moved Here */}
             {testData && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center px-3 py-1 bg-red-100 border border-red-200 text-red-600 rounded hover:bg-red-200 text-sm"
                >
                  <FaTrash className="mr-1" /> Delete
                </button>
              )}
              {!isJsonEditor && (
                <button
                    type="submit"
                    form="blood-test-form" // Link to the form ID
                    className="inline-flex items-center px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 shadow text-sm font-medium"
                >
                    <FaSave className="mr-1" />
                    {testData ? "Save Changes" : "Create Test"}
                </button>
              )}
              <button onClick={onClose} className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded ml-2 text-sm">
                Close
              </button>
          </div>
        </div>

        {/* Editor-mode toggle */}
        <div className="flex justify-end mb-4">
          {isJsonEditor ? (
            <button onClick={handleSwitchToForm} className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 mr-2 text-xs">
              <FaSyncAlt className="mr-1" /> Form Mode
            </button>
          ) : (
            <button onClick={() => { setJsonContent(JSON.stringify(getValues(), null, 2)); setIsJsonEditor(true); }} className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 mr-2 text-xs">
              <FaCode className="mr-1" /> JSON Mode
            </button>
          )}
          <button type="button" onClick={generatePreviewPdf} className="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 ml-2 text-xs">
            <FaCode className="mr-1" /> Preview
          </button>
        </div>

        {isJsonEditor ? (
          /* JSON editor */
          <>
            <textarea value={jsonContent} onChange={(e) => setJsonContent(e.target.value)} className="w-full h-80 border rounded px-3 py-2 font-mono" />
            <div className="flex justify-end mt-4">
              <button onClick={handleSaveJson} className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                <FaSave className="mr-1" /> Save JSON
              </button>
            </div>
          </>
        ) : (
          /* FORM mode */
          <form id="blood-test-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            {/* Row 1: Name and Price */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium">Test Name</label>
                    <input type="text" {...register("testName", { required: "Required" })} className="w-full border rounded px-3 py-2" />
                </div>
                <div className="w-1/4">
                    <label className="block text-sm font-medium">Price (₹)</label>
                    <input type="number" step="0.01" {...register("price", { required: "Required", valueAsNumber: true })} className="w-full border rounded px-3 py-2" />
                </div>
                <div className="w-1/4">
                    <label className="block text-sm font-medium">TPA (Opt)</label>
                    <input type="number" step="0.01" {...register("tpa_price", { valueAsNumber: true })} className="w-full border rounded px-3 py-2" />
                </div>
            </div>

            {/* Row 2: Estimated Time */}
            <div className="p-3 bg-blue-50 rounded-md border border-blue-100">
                <label className="block text-sm font-medium mb-2 flex items-center text-blue-900">
                    <FaClock className="mr-2" /> Estimated Completion Time
                </label>
                <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            min="0"
                            placeholder="0"
                            {...register("estimatedHours")} 
                            className="w-20 border rounded px-3 py-2 text-right" 
                        />
                        <span className="text-sm text-gray-600">Hours</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            min="0" 
                            max="59"
                            placeholder="0"
                            {...register("estimatedMinutes")} 
                            className="w-20 border rounded px-3 py-2 text-right" 
                        />
                        <span className="text-sm text-gray-600">Minutes</span>
                    </div>
                    <div className="text-xs text-gray-500 ml-2 italic">
                        (Saves as total minutes to database)
                    </div>
                </div>
            </div>

            {/* Outsource */}
            <div>
              <label className="flex items-center text-sm font-medium cursor-pointer">
                <input type="checkbox" {...register("isOutsource")} className="mr-2 h-4 w-4" />
                Outsource this test?
              </label>
            </div>

            {/* Parameters */}
            <div>
              <label className="block text-sm font-medium">Global Parameters</label>
              {paramFields.fields.map((field, idx) => (
                <ParameterEditor key={field.id} index={idx} control={control} register={register} errors={errors as FieldErrorsImpl<BloodTestFormInputs>} remove={paramFields.remove} />
              ))}
              <button type="button" onClick={() => paramFields.append({ name: "", unit: "", valueType: "text", formula: "", iscomment: false, range: { male: [{ rangeKey: "", rangeValue: "" }], female: [{ rangeKey: "", rangeValue: "" }] }, suggestions: [] } as BloodTestParameter)} className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50">
                <FaPlus className="mr-1" /> Add Parameter
              </button>
            </div>

            {/* Subheadings */}
            <div>
              <label className="block text-sm font-medium">Subheadings</label>
              <div className="space-y-4">
                {subheadingFields.fields.map((field, idx) => (
                  <SubheadingEditor key={field.id} index={idx} control={control} register={register} errors={errors as FieldErrorsImpl<BloodTestFormInputs>} remove={subheadingFields.remove} getValues={getValues} setValue={setValue} />
                ))}
              </div>
              <button type="button" onClick={() => subheadingFields.append({ title: "", parameterNames: [], is100: false } as BloodTestSubheading)} className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50">
                <FaPlus className="mr-1" /> Add Subheading
              </button>
            </div>

            {/* Interpretation */}
            <div>
              <label className="block text-sm font-medium">Interpretation</label>
              <textarea {...register("interpretation")} className="w-full border rounded px-3 py-2 h-24" placeholder="Enter test interpretation..." />
            </div>
          </form>
        )}
      </div>

      {/* Preview Dialog */}
      {showPreviewModal && <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Report Preview</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-hidden">{pdfUrl ? <iframe src={pdfUrl} className="w-full h-full" /> : <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>}</div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => { setShowPreviewModal(false); if (pdfUrl) URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }}>Close</Button></div>
        </DialogContent>
      </Dialog>}
    </div>
  )
}

// Interpretation Modal
interface InterpretationModalProps { testData?: TestData; onClose: () => void; onInterpretationSaved: () => void; }
const InterpretationModal: React.FC<InterpretationModalProps> = ({ testData, onClose, onInterpretationSaved }) => {
  const [interpretationText, setInterpretationText] = useState(testData?.interpretation || "");
  const [isSaving, setIsSaving] = useState(false);
  const handleSaveInterpretation = async () => {
    if (!testData) return; setIsSaving(true);
    try { const { error } = await supabase.from("zblood_test").update({ interpretation: interpretationText }).eq("id", testData.id); if (error) throw error; alert("Saved!"); onInterpretationSaved(); } 
    catch (error: any) { alert(`Error: ${error.message}`); } finally { setIsSaving(false); }
  };
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-xl">
        <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Interpretation</h2><button onClick={onClose}>Close</button></div>
        <textarea value={interpretationText} onChange={(e) => setInterpretationText(e.target.value)} className="w-full border rounded px-3 py-2 h-48 mb-4" />
        <div className="flex justify-end"><button onClick={handleSaveInterpretation} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Save</button></div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// MAIN PAGE COMPONENT
// ------------------------------------------------------------------
export default function BloodTestsPage() {
  const [bloodTests, setBloodTests] = useState<TestData[]>([])
  const [filteredTests, setFilteredTests] = useState<TestData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [selectedTest, setSelectedTest] = useState<TestData | null>(null)
  const [showInterpretationModal, setShowInterpretationModal] = useState(false)
  const [selectedTestForInterpretation, setSelectedTestForInterpretation] = useState<TestData | null>(null)

  useEffect(() => { fetchBloodTests() }, [])

  useEffect(() => {
    if (searchTerm.trim()) {
      setFilteredTests(bloodTests.filter((test) => test.testName.toLowerCase().includes(searchTerm.toLowerCase())))
    } else {
      setFilteredTests(bloodTests)
    }
  }, [searchTerm, bloodTests])

  const fetchBloodTests = async () => {
    try {
      // Added estimated_time_mm to select query
      const { data, error } = await supabase
        .from("zblood_test")
        .select("id, test_name, price, tpa_price, outsource, parameter, sub_heading, created_at, interpretation, estimated_time_mm")
        .order("test_name")

      if (error) throw error

      const mappedData: TestData[] = (data || []).map((item: any) => ({
        id: item.id,
        testName: item.test_name,
        price: item.price,
        tpa_price: item.tpa_price ?? undefined,
        isOutsource: item.outsource,
        parameters: item.parameter || [],
        subheadings: (item.sub_heading || []).map((sh: any) => ({
          title: sh.title,
          parameterNames: (sh.parameterNames || []).map((name: string) => ({ name })),
          is100: sh.is100 === true || sh.is100 === "true",
        })),
        interpretation: item.interpretation || undefined,
        estimated_time_mm: item.estimated_time_mm, // Map new field
        created_at: item.created_at,
      }))

      setBloodTests(mappedData)
      setFilteredTests(mappedData)
    } catch (error) {
      console.error("Error fetching blood tests:", error)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (test: TestData) => { setSelectedTest(test); setShowModal(true); }
  const openCreate = () => { setSelectedTest(null); setShowModal(true); }
  const closeModal = () => { setShowModal(false); setSelectedTest(null); fetchBloodTests(); }
  
  const openInterpretationModal = (test: TestData) => { setSelectedTestForInterpretation(test); setShowInterpretationModal(true); }
  const closeInterpretationModal = () => { setShowInterpretationModal(false); setSelectedTestForInterpretation(null); fetchBloodTests(); }

  if (loading) return <div className="p-8 text-gray-500">Loading tests...</div>

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Blood Tests</h1>
            <p className="text-gray-600 mt-2">Manage all available blood tests and their pricing</p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Test Database</CardTitle>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input placeholder="Search tests..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 w-64" />
                  </div>
                  <Badge variant="outline">{filteredTests.length} tests</Badge>
                  <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" /> Add Test
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Price (₹)</TableHead>
                      {/* Added Est. Time Column */}
                      <TableHead>Est. Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Parameters</TableHead>
                      <TableHead>Subheadings</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTests.map((test) => (
                      <TableRow key={test.id}>
                        <TableCell className="font-medium">{test.testName}</TableCell>
                        <TableCell>₹{test.price}</TableCell>
                        {/* Display Formatted Duration */}
                        <TableCell>
                             <div className="flex items-center text-gray-600">
                                <FaClock className="mr-2 text-gray-400 h-3 w-3" />
                                {formatDuration(test.estimated_time_mm)}
                             </div>
                        </TableCell>
                        <TableCell><Badge variant={test.isOutsource ? "destructive" : "default"}>{test.isOutsource ? "Outsource" : "InHouse"}</Badge></TableCell>
                        <TableCell>{test.parameters?.length || 0} params</TableCell>
                        <TableCell>{test.subheadings?.length || 0} sections</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(test)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openInterpretationModal(test)} className="text-blue-500"><FaPlus className="h-4 w-4 mr-1" /> Notes</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {showModal && <TestModal testData={selectedTest || undefined} onClose={closeModal} onTestUpdated={closeModal} />}
      {showInterpretationModal && <InterpretationModal testData={selectedTestForInterpretation || undefined} onClose={closeInterpretationModal} onInterpretationSaved={closeInterpretationModal} />}
    </div>
  )
}