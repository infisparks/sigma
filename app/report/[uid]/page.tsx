"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { FileDown, Loader2, Hospital, User, Calendar, CheckCircle, ShieldCheck } from "lucide-react"
import { generateReportPdf } from "@/app/pathology/download-report/[registrationId]/pdf-generator"
import type { PatientData, BloodTestData } from "@/app/pathology/download-report/[registrationId]/types/report"

// Helper to slugify test names (reusing logic from pathology page)
const slugifyTestName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.#$[\]()]/g, "")

function PublicReportDownloader() {
  const params = useParams()
  const uid = params.uid as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportData, setReportData] = useState<any>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    if (!uid) return

    const fetchReport = async () => {
      try {
        setLoading(true)
        // Using the secure RPC function we created
        const { data, error: rpcError } = await supabase.rpc('get_registration_by_key', { p_key: uid })

        if (rpcError) throw rpcError
        if (!data) throw new Error("Report not found or has been removed.")

        setReportData(data)
      } catch (err: any) {
        console.error("Fetch error:", err)
        setError(err.message || "Failed to load report")
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [uid])

  const handleDownload = async () => {
    if (!reportData) return
    setIsDownloading(true)
    try {
      const { registration, patient } = reportData

      // Parse blood test detail if it's a string
      let parsedDetail = registration.bloodtest_detail
      if (typeof parsedDetail === "string") {
        parsedDetail = JSON.parse(parsedDetail)
      }

      let parsedData = registration.bloodtest_data
      if (typeof parsedData === "string") {
        parsedData = JSON.parse(parsedData)
      }

      // Map to the format expected by generateReportPdf
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
        hospitalName: registration.hospital_name,
        registration_id: registration.id,
        createdAt: registration.registration_time,
        sampleCollectedAt: registration.samplecollected_time,
        bloodtest_data: parsedData || [],
        bloodtest_detail: parsedDetail || {},
        doctorName: registration.doctor_name,
        key: registration.key,
      }

      // Map detail to BloodTestData objects
      const bloodtestMap: Record<string, BloodTestData> = {}
      const masterInterpretations = reportData.master_interpretations || {}

      if (parsedDetail) {
        Object.entries(parsedDetail).forEach(([key, value]: [string, any]) => {
          // Look up interpretation by slug or name
          const testName = (parsedData || []).find((t: any) => slugifyTestName(t.testName) === key)?.testName || ""
          const interpretation = masterInterpretations[testName.toLowerCase()] || masterInterpretations[key.replace(/_/g, " ").toLowerCase()] || ""

          bloodtestMap[key] = {
            testId: key,
            parameters: value.parameters || [],
            subheadings: value.subheadings || [],
            descriptions: value.descriptions || [],
            reportedOn: value.reportedOn || null,
            enteredBy: value.enteredBy,
            interpretation: interpretation, // Injected interpretation here
          }
        })
      }
      mappedPatientData.bloodtest = bloodtestMap

      const selectedTests = Object.keys(bloodtestMap)

      // Generate PDF
      const blob = await generateReportPdf(
        mappedPatientData,
        selectedTests,
        [], // combinedGroups
        {}, // historicalTestsData
        {}, // comparisonSelections
        "normal",
        true, // includeLetterhead
        true, // skipCover
        undefined, // aiSuggestions
        false, // includeAiSuggestionsPage
        {} // testDisplayOptions
      )

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Report_${patient.name.replace(/\s+/g, "_")}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Download error:", err)
      alert("Failed to generate PDF. Please try again.")
    } finally {
      setIsDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Verifying Report Key...</p>
        </div>
      </div>
    )
  }

  if (error || !reportData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Report Link</h1>
          <p className="text-slate-600 mb-6">{error || "This report link is invalid or has expired."}</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold hover:bg-slate-800 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const { registration, patient } = reportData

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
        {/* Header Section */}
        <div className="bg-blue-600 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Hospital size={120} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4 bg-white/20 w-fit px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
              <CheckCircle size={16} />
              Secure Report Access
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-2">Report Ready</h1>
            <p className="text-blue-100 opacity-90">Your medical results are verified and ready for download.</p>
          </div>
        </div>

        {/* Info Section */}
        <div className="p-8">
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="bg-white p-2 rounded-xl shadow-sm text-blue-600">
                <User size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Patient Name</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  {patient.title} {patient.name}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Date</p>
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <Calendar size={18} className="text-blue-600" />
                  {new Date(registration.registration_time).toLocaleDateString()}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                <div className="flex items-center gap-2 text-green-600 font-bold italic">
                  <CheckCircle size={18} />
                  COMPLETED
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold text-lg shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="w-6 h-6" />
                    Download PDF Report
                  </>
                )}
              </button>
              <p className="text-center text-slate-400 text-sm mt-4">
                Powered by Cigma Pathology System
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PublicReportDownloader />
    </Suspense>
  )
}
