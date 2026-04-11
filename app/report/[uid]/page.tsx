"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { FileDown, Loader2, Hospital, User, Calendar, CheckCircle, ShieldCheck } from "lucide-react"
import { generateReportPdf } from "@/app/pathology/download-report/[registrationId]/pdf-generator"
import type { PatientData, BloodTestData } from "@/app/pathology/download-report/[registrationId]/types/report"

// Helper to slugify test names
const slugifyTestName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.#$[\]()]/g, "")

// Create a clean client specifically for public access to avoid JWS signature issues from old sessions
const publicSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false, // Don't look for or save old login data
    }
  }
)

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
        setError(null)

        // Optimized Raw Fetch for production
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_registration_by_key`
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ p_key: uid })
        })

        if (!response.ok) {
          throw new Error("Could not verify report access. Please try scanning again.")
        }

        const data = await response.json()
        setReportData(data)
      } catch (err: any) {
        console.error("Public Fetch Exception:", err)
        setError(err.message || "Failed to load report")
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [uid])

  const [downloadFinished, setDownloadFinished] = useState(false)

  // Automatically trigger download once data is ready
  useEffect(() => {
    if (reportData && !loading && !error && !isDownloading && !downloadFinished) {
      handleDownload()
    }
  }, [reportData, loading])

  const handleDownload = async () => {
    if (!reportData || isDownloading) return
    setIsDownloading(true)
    try {
      const { registration, patient, master_interpretations } = reportData

      const parsedDetail = typeof registration.bloodtest_detail === "string" 
        ? JSON.parse(registration.bloodtest_detail) 
        : registration.bloodtest_detail
      const parsedData = typeof registration.bloodtest_data === "string" 
        ? JSON.parse(registration.bloodtest_data) 
        : registration.bloodtest_data

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

      const bloodtestMap: Record<string, BloodTestData> = {}
      const masterInterps = master_interpretations || {}

      if (parsedDetail) {
        Object.entries(parsedDetail).forEach(([key, value]: [string, any]) => {
          const testName = (parsedData || []).find((t: any) => slugifyTestName(t.testName) === key)?.testName || ""
          const interpretation = masterInterps[testName.toLowerCase()] || masterInterps[key.replace(/_/g, " ").toLowerCase()] || ""
          bloodtestMap[key] = {
            testId: key,
            parameters: value.parameters || [],
            subheadings: value.subheadings || [],
            descriptions: value.descriptions || [],
            reportedOn: value.reportedOn || null,
            enteredBy: value.enteredBy,
            interpretation,
          }
        })
      }
      mappedPatientData.bloodtest = bloodtestMap

      const blob = await generateReportPdf(mappedPatientData, Object.keys(bloodtestMap), [], {}, {}, "normal", true, true)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Report_${patient.name.replace(/\s+/g, "_")}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setDownloadFinished(true)
      
      // Attempt to close the tab after a short delay
      setTimeout(() => {
        window.close()
      }, 3000)

    } catch (err) {
      console.error("Download error:", err)
    } finally {
      setIsDownloading(false)
    }
  }

  if (loading || (isDownloading && !downloadFinished)) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="relative mb-8 inline-block">
            <div className="w-24 h-24 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <FileDown className="w-8 h-8 text-blue-600 animate-bounce" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Downloading Report</h1>
          <p className="text-slate-500 max-w-xs mx-auto">Your secure PDF is being downloaded. This tab will attempt to close automatically.</p>
        </div>
      </div>
    )
  }

  if (downloadFinished) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-white">
          <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Download Successful!</h1>
          <p className="text-slate-600 mb-8">Your medical report has been saved to your device.</p>
          
          <div className="bg-slate-50 rounded-2xl p-4 mb-8">
            <p className="text-sm text-slate-400 font-medium">You can now safely</p>
            <p className="text-lg font-bold text-slate-900">Close this Browser Tab</p>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="text-blue-600 font-semibold hover:underline"
          >
            Download again?
          </button>
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
