"use client"

import type React from "react"

import { useEffect, useState, useCallback } from "react"

import { useForm, type SubmitHandler, type Path, type UseFormSetValue } from "react-hook-form"

import { useParams, useRouter } from "next/navigation"

import { supabase } from "@/lib/supabase" // Assuming your Supabase client is configured here

import { Droplet, User, AlertCircle, CheckCircle, Loader2, Calculator, CircleUserRound } from "lucide-react" // Using Lucide React icons

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { Input } from "@/components/ui/input"

import { Button } from "@/components/ui/button"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"

import { Separator } from "@/components/ui/separator"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { generateReportPdf } from "@/app/pathology/download-report/[registrationId]/pdf-generator"
import type { PatientData, CombinedTestGroup, HistoricalTestEntry, ComparisonTestSelection } from "@/app/pathology/download-report/[registrationId]/types/report"

// Import for the new PrimeReact AutoComplete component
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete"

/* ─────────────────── Types ─────────────────── */

interface SubParameterValue {
  name: string
  unit: string
  value: string | number
  range: string
  formula?: string
  valueType: "number" | "text"
}

interface TestParameterValue {
  name: string
  unit: string
  value: string | number
  range: string
  formula?: string
  valueType: "number" | "text"
  visibility?: string
  subparameters?: SubParameterValue[]
  suggestions?: { shortName: string; description: string }[]
}

interface SubHeading {
  title: string
  parameterNames: string[]
  is100?: boolean | string
}

interface TestStructure {
  parameter: TestParameterValue[]
  sub_heading: SubHeading[]
}

interface TestValueEntry {
  testId: string
  testName: string
  testType: string
  parameters: TestParameterValue[]
  subheadings?: SubHeading[]
  selectedParameters?: string[]
}

interface BloodValuesFormInputs {
  registrationId: string
  tests: TestValueEntry[]
}

export type IndexedParam = TestParameterValue & { originalIndex: number }

/* ───────────── Helpers ───────────── */

const parseRange = (rangeStr: string): { min?: number; max?: number } => {
  const range = rangeStr.trim()
  if (range === "") return {}
  const hyphenParts = range.split("-")
  if (hyphenParts.length === 2) {
    const min = Number.parseFloat(hyphenParts[0])
    const max = Number.parseFloat(hyphenParts[1])
    if (!isNaN(min) && !isNaN(max)) return { min, max }
  }

  if (range.startsWith("<")) {
    const max = Number.parseFloat(range.slice(1))
    if (!isNaN(max)) return { max }
  } else if (range.startsWith(">")) {
    const min = Number.parseFloat(range.slice(1))
    if (!isNaN(min)) return { min }
  }

  if (range.startsWith("≤")) {
    const max = Number.parseFloat(range.slice(1))
    if (!isNaN(max)) return { max }
  } else if (range.startsWith("≥")) {
    const min = Number.parseFloat(range.slice(1))
    if (!isNaN(min)) return { min }
  }

  return {}
}

const parseRangeKey = (key: string): { lower: number; upper: number } => {
  const unit = key.trim().slice(-1).toLowerCase()
  const [l, u] = key.slice(0, -1).split("-").map(Number)

  let lowerDays = l
  let upperDays = u

  switch (unit) {
    case "y":
      lowerDays = l * 365
      upperDays = u * 365
      break
    case "m":
      lowerDays = l * 30
      upperDays = u * 30
      break
    case "d":
      // Already in days, no conversion needed
      break
    default:
      // Default to days if no unit or unknown unit
      console.warn(`Unknown age unit: ${unit} in rangeKey: ${key}. Assuming days.`)
      break
  }
  return { lower: lowerDays, upper: upperDays }
}

const fmt3 = (n: number) => n.toFixed(3).replace(/\.?0+$/, "")

// Helper to extract parameter names from a formula string
const getFormulaDependencies = (formula: string): string[] => {
  const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g)
  const keywords = new Set(["Math", "abs", "round", "floor", "ceil", "min", "max", "log", "pow", "sqrt"])
  return Array.from(new Set(matches?.filter((m) => !keywords.has(m)) || []))
}

/* ─────────────────── PDF Preview Helper ─────────────────── */
const getFormDataForPreview = (
  currentTests: TestValueEntry[],
  patientDetails: PatientData,
  fullPatientData: PatientData | null,
): PatientData | null => {
  if (!patientDetails || !fullPatientData) return null

  const bloodtestDetail: Record<string, any> = {}
  for (const t of currentTests) {
    const key = t.testName
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[.#$[\]]/g, "")

    const params = t.parameters
      .map((p) => {
        const subs = p.subparameters?.filter((sp) => sp.value !== "") ?? []
        if (p.value !== "" || subs.length) {
          const obj: any = { ...p, subparameters: subs }
          const strValue = String(p.value)
          if (/^[<>]/.test(strValue)) {
            obj.value = strValue
          } else if (p.valueType === "number" && strValue !== "") {
            const numValue = Number(strValue)
            if (strValue === "-" || strValue === ".") {
              obj.value = strValue
            } else {
              obj.value =
                isNaN(numValue) ? strValue : strValue.includes(".") && strValue.endsWith("0") ? strValue : numValue
            }
          }
          subs.forEach((sp) => {
            const spStr = String(sp.value)
            if (/^[<>]/.test(spStr)) {
              sp.value = spStr
            } else if (sp.valueType === "number" && spStr !== "") {
              const spNum = Number(spStr)
              if (spStr === "-" || spStr === ".") {
                sp.value = spStr
              } else {
                sp.value =
                  isNaN(spNum) ? spStr : spStr.includes(".") && spStr.endsWith("0") ? spStr : spNum
              }
            }
          })
          return obj
        }
        return null
      })
      .filter(Boolean) as TestParameterValue[]

    if (params.length > 0) {
      bloodtestDetail[key] = {
        parameters: params,
        testId: t.testId,
        testName: t.testName,
        subheadings: t.subheadings || [],
        createdAt: fullPatientData.bloodtest?.[key]?.createdAt || new Date().toISOString(),
        reportedOn: fullPatientData.bloodtest?.[key]?.reportedOn || new Date().toISOString(),
        enteredBy: fullPatientData.bloodtest?.[key]?.enteredBy || "unknown",
        interpretation: fullPatientData.bloodtest?.[key]?.interpretation || "",
      }
    }
  }

  return {
    ...fullPatientData,
    bloodtest: bloodtestDetail,
  }
}

/* ─────────────────── Main Form Component ─────────────────── */
const BloodValuesForm: React.FC = () => {
  const router = useRouter()
  const params = useParams()
  const registrationId = params.registrationId as string

  const [loading, setLoading] = useState(true)
  const [dbText, setDbText] = useState<string[]>([])
  const [warn100, setWarn100] = useState<Record<string, boolean>>({})
  const [patientDetails, setPatientDetails] = useState<PatientData | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [fullPatientData, setFullPatientData] = useState<PatientData | null>(null)

  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BloodValuesFormInputs>({
    defaultValues: { registrationId: registrationId || "", tests: [] },
  })

  /* ── Fetch autocomplete values ── */
  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase.from("autocomplete_values").select("value")
        if (error) throw error
        setDbText(data.map((row) => row.value))
      } catch (e) {
        console.error("Error fetching autocomplete values:", e)
      }
    })()
  }, [])

  /* ── Fetch patient’s booked tests and definitions ── */
  useEffect(() => {
    if (!registrationId) return
    ;(async () => {
      try {
        const { data: registrationData, error: registrationError } = await supabase
          .from("zregistration")
          .select(
            `
          *,
          patient_detail ( 
            patient_id, uhid, name, age, gender, number, total_day, title, age_unit 
          )
        `,
          )
          .eq("id", registrationId)
          .single()
        if (registrationError || !registrationData) {
          console.error("Error fetching registration:", registrationError)
          setLoading(false)
          return
        }

        const patient = registrationData.patient_detail as any
        const bookedTests = registrationData.bloodtest_data || []
        const storedBloodtestDetail = registrationData.bloodtest_detail || {}

        let ageDays = patient.age
        switch (patient.age_unit?.toLowerCase()) {
          case "year":
            ageDays *= 365
            break
          case "month":
            ageDays *= 30
            break
        }
        const genderKey = patient.gender?.toLowerCase() === "male" ? "male" : "female"
        console.log(`Patient age: ${patient.age} ${patient.age_unit}, calculated age in days: ${ageDays}`)

        const originalTestNames = (bookedTests || []).map((t: any) => t.testName)
        const { data: bloodTests, error: bloodTestError } = await supabase
          .from("zblood_test")
          .select(`id, test_name, interpretation`)
          .in("test_name", originalTestNames)

        if (bloodTestError) throw new Error(`Failed to fetch blood tests: ${bloodTestError.message}`)

        const testInterpretations: Record<string, string> = {}
        bloodTests.forEach((test: any) => {
          const slug = test.test_name
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[.#$[\]()]/g, "")
          testInterpretations[slug] = test.interpretation || ""
        })

        const mappedPatientData: PatientData = {
          id: patient.patient_id,
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          patientId: patient.uhid,
          contact: patient.number,
          total_day: patient.total_day,
          day_type: patient.age_unit,
          title: patient.title,
          hospitalName: registrationData.hospital_name,
          registration_id: registrationData.id,
          createdAt: registrationData.registration_time,
          sampleCollectedAt: registrationData.samplecollected_time,
          bloodtest_data: bookedTests,
          bloodtest_detail: storedBloodtestDetail,
          doctorName: registrationData.doctor_name,
        }

        const tests: TestValueEntry[] = await Promise.all(
          bookedTests.map(async (bt: any) => {
            const { data: testDefData, error: testDefError } = await supabase
              .from("zblood_test")
              .select("parameter, sub_heading")
              .eq("test_name", bt.testName)
              .single()

            if (testDefError || !testDefData) {
              console.warn(`Test definition not found for ${bt.testName}:`, testDefError)
              return {
                testId: bt.testId,
                testName: bt.testName,
                testType: bt.testType,
                parameters: [],
                subheadings: [],
                selectedParameters: bt.selectedParameters,
              } as TestValueEntry
            }

            const allParams = Array.isArray(testDefData.parameter) ? testDefData.parameter : []
            const subheadings = Array.isArray(testDefData.sub_heading) ? testDefData.sub_heading : []

            const wanted = bt.selectedParameters?.length
              ? allParams.filter((p: any) => bt.selectedParameters.includes(p.name))
              : allParams

            const params: TestParameterValue[] = wanted.map((p: any) => {
              const ranges = p.range?.[genderKey] || []
              let normal = ""
              for (const r of ranges) {
                const { lower, upper } = parseRangeKey(r.rangeKey)
                if (ageDays >= lower && ageDays <= upper) {
                  normal = r.rangeValue
                  break
                }
              }
              if (!normal && ranges.length) normal = ranges[ranges.length - 1].rangeValue

              const testKey = bt.testName
                .toLowerCase()
                .replace(/\s+/g, "_")
                .replace(/[.#$[\]]/g, "")
              const saved = storedBloodtestDetail?.[testKey]?.parameters?.find((q: any) => q.name === p.name)

              let subps
              if (Array.isArray(p.subparameters)) {
                subps = p.subparameters.map((s: any) => {
                  const sr = s.range?.[genderKey] || []
                  let sNorm = ""
                  for (const x of sr) {
                    const { lower, upper } = parseRangeKey(x.rangeKey)
                    if (ageDays >= lower && ageDays <= upper) {
                      sNorm = x.rangeValue
                      break
                    }
                  }
                  if (!sNorm && sr.length) sNorm = sr[sr.length - 1].rangeValue
                  const savedSp = saved?.subparameters?.find((z: any) => z.name === s.name)
                  return {
                    name: s.name,
                    unit: s.unit,
                    value: savedSp ? savedSp.value : "",
                    range: sNorm,
                    formula: s.formula || "",
                    valueType: s.valueType || "number",
                  } as SubParameterValue
                })
              }

              return {
                name: p.name,
                unit: p.unit,
                value: saved ? saved.value : p.defaultValue !== undefined ? p.defaultValue : "",
                range: normal,
                formula: p.formula || "",
                valueType: p.valueType || "number",
                visibility: p.visibility ?? "visible",
                ...(subps ? { subparameters: subps } : {}),
                ...(p.suggestions ? { suggestions: p.suggestions } : {}),
              } as TestParameterValue
            })

            return {
              testId: bt.testId,
              testName: bt.testName,
              testType: bt.testType,
              parameters: params,
              subheadings: subheadings,
              selectedParameters: bt.selectedParameters,
            } as TestValueEntry
          }),
        )

        const mappedBloodtestDetail: Record<string, any> = {}
        for (const t of tests) {
          const key = t.testName
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[.#$[\]]/g, "")
          mappedBloodtestDetail[key] = {
            parameters: t.parameters,
            subheadings: t.subheadings || [],
            reportedOn: storedBloodtestDetail[key]?.reportedOn || new Date().toISOString(),
            enteredBy: storedBloodtestDetail[key]?.enteredBy || "",
            testId: t.testId,
            testName: t.testName,
            interpretation: testInterpretations[key] || "",
          }
        }

        setPatientDetails(mappedPatientData)
        setFullPatientData({
          ...mappedPatientData,
          bloodtest: mappedBloodtestDetail,
        })

        reset({ registrationId, tests })
      } catch (e) {
        console.error("Error in fetching data for form:", e)
      } finally {
        setLoading(false)
      }
    })()
  }, [registrationId, reset])

  /* ══════════════ “Sum to 100” warning logic ══════════════ */
  const testsWatch = watch("tests")
  useEffect(() => {
    const warn: Record<string, boolean> = {}
    testsWatch.forEach((t, tIdx) => {
      t.subheadings?.forEach((sh, shIdx) => {
        if (!(sh.is100 === true || sh.is100 === "true")) return
        const tag = `${tIdx}-${shIdx}`
        const idxs = sh.parameterNames.map((n) => t.parameters.findIndex((p) => p.name === n)).filter((i) => i >= 0)
        let sum = 0
        idxs.forEach((i) => {
          const v = +testsWatch[tIdx].parameters[i].value
          if (!isNaN(v)) sum += v
        })
        warn[tag] = sum > 100.0001
      })
    })
    setWarn100(warn)
  }, [testsWatch])

  /* ══════════════ Automatic Formula recalculation ══════════════ */
  const calcFormulaOnce = useCallback(
    (tIdx: number, pIdx: number) => {
      const data = watch("tests")[tIdx]
      const p = data.parameters[pIdx]
      if (!p.formula || p.valueType !== "number") return

      const nums: Record<string, number> = {}
      data.parameters.forEach((x) => {
        const v = +x.value
        if (!isNaN(v)) nums[x.name] = v
      })

      let expr = p.formula
      Object.entries(nums).forEach(([k, v]) => {
        expr = expr.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), v + "")
      })

      try {
        const r = Function('"use strict";return (' + expr + ");")()
        if (!isNaN(r)) {
          const formatted = Number(r).toFixed(2)
          setValue(`tests.${tIdx}.parameters.${pIdx}.value`, formatted, { shouldValidate: false })
        }
      } catch (e) {
        console.error(`Error evaluating formula for ${p.name}:`, e)
      }
    },
    [setValue, watch],
  )

  useEffect(() => {
    testsWatch.forEach((test, tIdx) => {
      test.parameters.forEach((param, pIdx) => {
        if (param.formula && param.valueType === "number") {
          const dependencies = getFormulaDependencies(param.formula)
          const allDependenciesMet = dependencies.every((depName) => {
            const depParam = test.parameters.find((p) => p.name === depName)
            return depParam && !isNaN(+depParam.value)
          })
          if (allDependenciesMet) {
            calcFormulaOnce(tIdx, pIdx)
          }
        }
      })
    })
  }, [testsWatch, calcFormulaOnce])

  /* ══════════════ Numeric Change Handler ══════════════ */
  const numericChange = (v: string, t: number, p: number, sp?: number) => {
    const numericRegex = /^[<>]?-?\d*(\.\d{0,3})?$/
    const path =
      sp == null ? `tests.${t}.parameters.${p}.value` : `tests.${t}.parameters.${p}.subparameters.${sp}.value`
    if (v === "" || numericRegex.test(v)) {
      setValue(path as Path<BloodValuesFormInputs>, v, { shouldValidate: false })
    }
  }

  /* ══════════════ Build suggestions for text inputs ══════════════ */
  const buildMatches = (param: TestParameterValue, q: string): string[] => {
    const query = q.toLowerCase()
    if (Array.isArray(param.suggestions) && param.suggestions.length > 0) {
      const pool = param.suggestions.map((s) => s.description)
      return query ? pool.filter((d) => d.toLowerCase().includes(query)) : pool
    }
    return query ? dbText.filter((s) => s.toLowerCase().includes(query)) : dbText
  }

  /* ══════════════ Handle “fill remaining” for subheadings that sum to 100 ══════════════ */
  const fillRemaining = (tIdx: number, sh: SubHeading, lastIdx: number) => {
    const test = watch("tests")[tIdx]
    const idxs = sh.parameterNames.map((n) => test.parameters.findIndex((p) => p.name === n)).filter((i) => i >= 0)
    let total = 0
    idxs.slice(0, -1).forEach((i) => {
      const v = +test.parameters[i].value
      if (!isNaN(v)) total += v
    })
    const remainder = 100 - total
    const integerValue = Math.round(remainder)
    setValue(`tests.${tIdx}.parameters.${lastIdx}.value`, integerValue.toString(), { shouldValidate: false })
  }

  /* ══════════════ Submit handler: write back to Supabase ══════════════ */
  const onSubmit: SubmitHandler<BloodValuesFormInputs> = async (data) => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const fullEmail = userData.user?.email ?? ""
      const enteredBy = fullEmail.split("@")[0] || "unknown"

      const { data: existingRegData, error: fetchError } = await supabase
        .from("zregistration")
        .select("bloodtest_detail")
        .eq("id", data.registrationId)
        .single()
      if (fetchError) throw fetchError
      const existingBloodtestDetail = existingRegData?.bloodtest_detail || {}

      const bloodtestDetail: Record<string, any> = {}
      for (const t of data.tests) {
        const key = t.testName
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[.#$[\]]/g, "")
        const now = new Date().toISOString()

        const params = t.parameters
          .map((p) => {
            const subs = p.subparameters?.filter((sp) => sp.value !== "") ?? []
            if (p.value !== "" || subs.length) {
              const obj: any = { ...p, subparameters: subs }
              const strValue = String(p.value)
              if (/^[<>]/.test(strValue)) {
                obj.value = strValue
              } else if (p.valueType === "number" && strValue !== "") {
                const numValue = Number(strValue)
                if (strValue === "-" || strValue === ".") {
                  obj.value = strValue
                } else {
                  obj.value =
                    isNaN(numValue) ? strValue : strValue.includes(".") && strValue.endsWith("0") ? strValue : numValue
                }
              }
              subs.forEach((sp) => {
                const spStr = String(sp.value)
                if (/^[<>]/.test(spStr)) {
                  sp.value = spStr
                } else if (sp.valueType === "number" && spStr !== "") {
                  const spNum = Number(spStr)
                  if (spStr === "-" || spStr === ".") {
                    sp.value = spStr
                  } else {
                    sp.value =
                      isNaN(spNum) ? spStr : spStr.includes(".") && spStr.endsWith("0") ? spStr : spNum
                  }
                }
              })
              return obj
            }
            return null
          })
          .filter(Boolean) as TestParameterValue[]

        if (params.length > 0) {
          const existingReportedOn = existingBloodtestDetail[key]?.reportedOn
          const newReportedOn = existingReportedOn || now
          bloodtestDetail[key] = {
            parameters: params,
            testId: t.testId,
            subheadings: t.subheadings || [],
            createdAt: existingBloodtestDetail[key]?.createdAt || now,
            reportedOn: newReportedOn,
            enteredBy,
          }
        }
      }

      const mergedBloodtestDetail = {
        ...existingBloodtestDetail,
        ...bloodtestDetail,
      }

      const { error } = await supabase
        .from("zregistration")
        .update({ bloodtest_detail: mergedBloodtestDetail })
        .eq("id", data.registrationId)
      if (error) throw error

      alert("Saved!")
      router.push(`/pathology/download-report/${registrationId}`)
    } catch (e: any) {
      console.error("Save failed:", e.message)
      alert("Save failed: " + e.message)
    }
  }

  /* ══════════════ Preview Function ══════════════ */
  const handlePreview = async () => {
    if (!fullPatientData || !patientDetails) {
      alert("Patient data not loaded yet. Please wait.")
      return
    }

    try {
      const formDataForPreview = getFormDataForPreview(tests, patientDetails as PatientData, fullPatientData)

      if (!formDataForPreview) {
        alert("Could not prepare data for preview.")
        return
      }

      const blob = await generateReportPdf(
        formDataForPreview,
        Object.keys(formDataForPreview.bloodtest || {}),
        [],
        {},
        {},
        "normal",
        true,
        true,
        undefined,
        false,
      )
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setShowPreviewModal(true)
    } catch (error) {
      console.error("Error generating preview:", error)
      alert("Failed to generate report preview.")
    }
  }

  /* ── Early returns for missing registrationId or loading ── */
  if (!registrationId)
    return (
      <CenterCard icon={User} title="Registration Not Found">
        <Button onClick={() => router.push("/")}>Back</Button>
      </CenterCard>
    )

  if (loading)
    return (
      <CenterCard icon={Loader2} spin>
        Loading…
      </CenterCard>
    )

  const tests = watch("tests")

  return (
    <TooltipProvider>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-1">
        <Card className="w-full max-w-3xl relative shadow-lg">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pb-0.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Droplet className="h-4 w-4" />
            </div>
            <div className="grid gap-0">
              <CardTitle className="text-lg font-bold text-gray-800">Blood Test Analysis</CardTitle>
              <CardDescription className="text-gray-600 text-xs">
                Comprehensive data entry for patient blood test results.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-1">
            {patientDetails && (
              <Card className="mb-2 bg-blue-50 border-blue-200 shadow-sm">
                <CardContent className="p-1.5 flex items-center gap-2">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-200 text-blue-700 text-lg font-semibold">
                    {patientDetails.name ? (
                      patientDetails.name.charAt(0).toUpperCase()
                    ) : (
                      <CircleUserRound className="h-6 w-6" />
                    )}
                  </div>
                  <div className="grid gap-0">
                    <p className="text-base font-semibold text-gray-800">{patientDetails.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="font-medium">Patient ID:</span> {patientDetails.patientId}
                      <Separator orientation="vertical" className="h-3" />
                      <span className="font-medium">Reg ID:</span> {registrationId}
                    </div>
                    <div className="flex items-center gap-1 mt-0">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5">
                        Age: {patientDetails.age}
                      </Badge>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5">
                        Gender: {patientDetails.gender}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto space-y-1.5 pb-1">
                {tests.map((test, tIdx) => {
                  if (test.testType?.toLowerCase() === "outsource") {
                    return (
                      <Card key={test.testId} className="mb-1.5 border-l-4 border-yellow-500 bg-yellow-50 shadow-sm">
                        <CardContent className="p-2">
                          <div className="flex items-center gap-1.5 text-yellow-800">
                            <Droplet className="h-3.5 w-3.5" />
                            <h3 className="font-semibold text-sm">{test.testName}</h3>
                          </div>
                          <p className="mt-0.5 text-xs text-yellow-800">
                            This is an outsourced test. No data entry is required.
                          </p>
                        </CardContent>
                      </Card>
                    )
                  }
                  const sh = test.subheadings || []
                  const shNames = sh.flatMap((x) => x.parameterNames)
                  const globals = test.parameters
                    .map((p, i) => ({ ...p, originalIndex: i }))
                    .filter((p) => !shNames.includes(p.name))
                  return (
                    <Card key={test.testId} className="mb-1.5 border-l-4 border-blue-500 bg-card shadow-sm">
                      <CardHeader className="pb-0">
                        <div className="flex items-center gap-1.5">
                          <Droplet className="h-3.5 w-3.5 text-blue-600" />
                          <CardTitle className="text-sm text-gray-800">{test.testName}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {sh.length > 0 && globals.length > 0 && (
                          <>
                            <h4 className="mb-1 text-xs font-semibold text-gray-700">Global Parameters</h4>
                            <div className="grid gap-1">
                              {globals.map((p) => (
                                <ParamRow
                                  key={p.originalIndex}
                                  tIdx={tIdx}
                                  pIdx={p.originalIndex}
                                  param={p}
                                  value={tests[tIdx].parameters[p.originalIndex].value}
                                  setValue={setValue}
                                  errors={errors}
                                  numericChange={numericChange}
                                  calcOne={calcFormulaOnce}
                                  buildMatches={buildMatches}
                                />
                              ))}
                            </div>
                          </>
                        )}
                        {sh.length
                          ? sh.map((s, shIdx) => {
                              const tag = `${tIdx}-${shIdx}`
                              const list = test.parameters
                                .map((p, i) => ({ ...p, originalIndex: i }))
                                .filter((p) => s.parameterNames.includes(p.name))
                              const need100 = s.is100 === true || s.is100 === "true"
                              const last = list[list.length - 1]
                              return (
                                <div key={shIdx} className="mt-2">
                                  <h4
                                    className={cn(
                                      "mb-1 text-xs font-semibold text-gray-700",
                                      warn100[tag] && "text-red-600",
                                    )}
                                  >
                                    {s.title}
                                    {need100 && (
                                      <span className="ml-1 text-2xs font-normal text-gray-500">(must total 100%)</span>
                                    )}
                                  </h4>
                                  <div className="grid gap-1">
                                    {list.map((p) => {
                                      const isLast = need100 && p.originalIndex === last.originalIndex
                                      return (
                                        <ParamRow
                                          key={p.originalIndex}
                                          tIdx={tIdx}
                                          pIdx={p.originalIndex}
                                          param={{ ...p, originalIndex: p.originalIndex }}
                                          value={tests[tIdx].parameters[p.originalIndex].value}
                                          setValue={setValue}
                                          errors={errors}
                                          numericChange={numericChange}
                                          calcOne={calcFormulaOnce}
                                          isLastOf100={isLast}
                                          fillRemaining={() => fillRemaining(tIdx, s, p.originalIndex)}
                                          buildMatches={buildMatches}
                                        />
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })
                          : test.parameters.map((p, pIdx) => (
                              <ParamRow
                                key={pIdx}
                                tIdx={tIdx}
                                pIdx={pIdx}
                                param={{ ...p, originalIndex: pIdx }}
                                value={tests[tIdx].parameters[pIdx].value}
                                setValue={setValue}
                                errors={errors}
                                numericChange={numericChange}
                                calcOne={calcFormulaOnce}
                                buildMatches={buildMatches}
                              />
                            ))}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
              <div className="mt-2 border-t pt-2 flex gap-1.5">
                <Button type="submit" disabled={isSubmitting} className="flex-1 py-1.5 text-base">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-1.5 h-4 w-4" />
                      Save Results
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={handlePreview}
                  className="flex-1 py-1.5 text-base bg-gray-600 hover:bg-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  Preview Report
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      {showPreviewModal && pdfUrl && (
        <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Report Preview</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              <iframe src={pdfUrl} className="w-full h-full" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  URL.revokeObjectURL(pdfUrl)
                  setPdfUrl(null)
                  setShowPreviewModal(false)
                }}
              >
                Close and Clear
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  )
}

/* ─────────────────── ParamRow Component ─────────────────── */

type InputElement = HTMLInputElement | HTMLTextAreaElement

interface RowProps {
  tIdx: number
  pIdx: number
  param: IndexedParam
  value: string | number
  setValue: UseFormSetValue<BloodValuesFormInputs>
  errors: any
  numericChange: (v: string, t: number, p: number, sp?: number) => void
  calcOne: (t: number, p: number) => void
  buildMatches: (param: TestParameterValue, q: string) => string[]
  isLastOf100?: boolean
  fillRemaining?: () => void
}

const ParamRow: React.FC<RowProps> = ({
  tIdx,
  pIdx,
  param,
  value,
  setValue,
  errors,
  numericChange,
  calcOne,
  buildMatches,
  isLastOf100,
  fillRemaining,
}) => {
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])

  const numValue = Number.parseFloat(value as string)
  const parsedRange = parseRange(param.range)
  let isOutOfRange = false
  if (!isNaN(numValue)) {
    const { min, max } = parsedRange
    if (min !== undefined && max !== undefined) {
      isOutOfRange = numValue < min || numValue > max
    } else if (min !== undefined) {
      isOutOfRange = numValue < min
    } else if (max !== undefined) {
      isOutOfRange = numValue > max
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const form = e.currentTarget.form
      if (!form) return
      const focusable = Array.from(
        form.querySelectorAll('input:not([type="hidden"]), textarea, button:not([disabled])'),
      ) as (HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement)[]
      
      const idx = focusable.indexOf(e.currentTarget as any)
      if (idx > -1) {
        const next = focusable[idx + 1]
        if (next) next.focus()
      }
    }
  }

  // Search method for PrimeReact AutoComplete
  const searchSuggestions = (event: AutoCompleteCompleteEvent) => {
    const suggestions = buildMatches(param, event.query)
    setFilteredSuggestions(suggestions)
  }

  return (
    <div className="flex items-center rounded-lg border bg-background px-1.5 py-0.5 text-xs shadow-sm">
      <div className="flex flex-1 items-center gap-1">
        <Label htmlFor={`param-${tIdx}-${pIdx}`} className="font-medium text-foreground text-xs">
          {param.name}
          {param.unit && <span className="ml-0.5 text-2xs text-muted-foreground">({param.unit})</span>}
        </Label>
        {param.formula && param.valueType === "number" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={() => calcOne(tIdx, pIdx)}
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                aria-label="Calculate formula"
              >
                <Calculator className="h-2.5 w-2.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Calculate value using formula: {param.formula}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {isLastOf100 && (
          <Button
            type="button"
            onClick={fillRemaining}
            variant="outline"
            size="sm"
            className="ml-1 h-5 text-2xs text-green-600 border-green-600 hover:bg-green-50 hover:text-green-800 bg-transparent"
          >
            Calculate Rem.
          </Button>
        )}
      </div>
      {param.valueType === "number" ? (
        <div className="relative ml-1.5 w-28">
          <Input
            id={`param-${tIdx}-${pIdx}`}
            type="text"
            value={String(value ?? "")}
            onChange={(e) => numericChange(e.target.value, tIdx, pIdx)}
            onKeyDown={handleKeyDown}
            placeholder={"Value or >10 / <10"}
            className={cn("pr-6 h-6 text-xs", isOutOfRange && "border-red-500 bg-red-50 focus-visible:ring-red-500")}
          />
          {isOutOfRange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Value is outside normal range: {param.range}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : (
        <div className="relative ml-1.5 w-48">
          <AutoComplete
            id={`param-${tIdx}-${pIdx}`}
            value={String(value ?? "")}
            suggestions={filteredSuggestions}
            completeMethod={searchSuggestions}
            onChange={(e) =>
              setValue(`tests.${tIdx}.parameters.${pIdx}.value` as Path<BloodValuesFormInputs>, e.value, {
                shouldValidate: false,
              })
            }
            onKeyDown={handleKeyDown}
            placeholder="Text (suggestions available)"
            inputClassName="w-full h-6 text-xs p-2 border-input"
            className="w-full"
            panelClassName="text-xs"
            dropdown
          />
        </div>
      )}
      <div className="ml-1.5 flex-1 text-right text-muted-foreground text-2xs">
        Normal Range:{" "}
        <span className={cn("font-medium", isOutOfRange ? "text-red-600" : "text-green-600")}>{param.range}</span>
      </div>
    </div>
  )
}

/* ─────────────────── CenterCard Component ─────────────────── */

const CenterCard: React.FC<{
  icon: any
  title?: string
  spin?: boolean
  children: React.ReactNode
}> = ({ icon: Icon, title, spin, children }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-3">
    <Card className="w-full max-w-md text-center shadow-lg">
      <CardContent className="p-5">
        <Icon className={cn("mx-auto mb-2 h-9 w-9 text-primary", spin && "animate-spin")} />
        {title && <CardTitle className="mb-1 text-lg text-gray-800">{title}</CardTitle>}
        {children}
      </CardContent>
    </Card>
  </div>
)

export default BloodValuesForm