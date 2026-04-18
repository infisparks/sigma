"use client"

import React, { useState, useEffect } from "react"
import Layout from "@/components/global/Layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import {
  Users,
  Search,
  GitMerge,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  User,
  Phone,
  Calendar,
  ArrowRight,
  Loader2,
  UserCheck
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PatientDetail {
  patient_id: number
  name: string
  number: string
  age?: number
  age_unit?: string
  dob?: string
  gender?: string
  address?: string
  uhid: string
}

interface MergeCandidate extends PatientDetail {
  recordCount: number
}

const MergePatientsPage = () => {
  const [search, setSearch] = useState("")
  const [candidates, setCandidates] = useState<MergeCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [primaryId, setPrimaryId] = useState<string | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  const [password, setPassword] = useState("")

  // Search for potential duplicates
  const searchPatients = async () => {
    if (search.trim().length < 2) {
      toast.error("Please enter at least 2 characters")
      return
    }

    setLoading(true)
    try {
      const sanitized = search.replace(/[%,()]/g, '')
      const pattern = `%${sanitized}%`

      const conditions = [
        `name.ilike.${pattern}`,
        `uhid.ilike.${pattern}`
      ]
      
      // Handle numeric search for phone numbers
      if (/^\d+$/.test(sanitized)) {
        conditions.push(`number.eq.${sanitized}`)
      }

      const { data, error } = await supabase
        .from("patient_detail")
        .select("*")
        .or(conditions.join(','))
        .limit(30)

      if (error) throw error

      // For each candidate, fetch summary of their records
      const enrichedCandidates = await Promise.all((data || []).map(async (p) => {
        const [opd, ipd, pathology, pharmacy, xray, deleted, dopd] = await Promise.all([
          supabase.from("opd_registration").select("id", { count: 'exact', head: true }).eq("uhid", p.uhid),
          supabase.from("ipd_registration").select("id", { count: 'exact', head: true }).eq("uhid", p.uhid),
          supabase.from("zregistration").select("id", { count: 'exact', head: true }).eq("UHID", p.uhid),
          supabase.from("pharmacy_sales").select("id", { count: 'exact', head: true }).eq("p_patient_id", p.uhid),
          supabase.from("x-raydetail").select("id", { count: 'exact', head: true }).eq("patient_uhid", p.uhid),
          supabase.from("zdeleted_data").select("id", { count: 'exact', head: true }).eq("UHID", p.uhid),
          supabase.from("dopd_registration").select("id", { count: 'exact', head: true }).eq("uhid", p.uhid),
        ])

        return {
          ...p,
          number: String(p.number),
          recordCount: (opd.count || 0) + (ipd.count || 0) + (pathology.count || 0) + (pharmacy.count || 0) + (xray.count || 0) + (deleted.count || 0) + (dopd.count || 0)
        }
      }))

      setCandidates(enrichedCandidates)
    } catch (err: any) {
      console.error(err)
      toast.error("Search failed: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelection = (uhid: string) => {
    setSelectedIds(prev =>
      prev.includes(uhid)
        ? prev.filter(id => id !== uhid)
        : [...prev, uhid]
    )
  }

  const handleMerge = async () => {
    if (password !== "Sigma") {
      toast.error("Incorrect administrative password")
      return
    }

    if (!primaryId) {
      toast.error("Please select a PRIMARY record to keep")
      return
    }

    const duplicates = selectedIds.filter(id => id !== primaryId)
    if (duplicates.length === 0) {
      toast.error("Select at least one duplicate record to merge")
      return
    }

    if (!confirm(`Are you sure you want to merge these accounts into ${primaryId}? Duplicate patient profiles will be DELETED permanently.`)) {
      return
    }

    setIsMerging(true)
    try {
      for (const duplicateId of duplicates) {
        // Shift records to primary UHID
        await supabase.from("opd_registration").update({ uhid: primaryId }).eq("uhid", duplicateId)
        await supabase.from("ipd_registration").update({ uhid: primaryId }).eq("uhid", duplicateId)
        await supabase.from("ot_details").update({ uhid: primaryId }).eq("uhid", duplicateId)
        await supabase.from("zregistration").update({ UHID: primaryId }).eq("UHID", duplicateId)
        await supabase.from("pharmacy_sales").update({ p_patient_id: primaryId }).eq("p_patient_id", duplicateId)
        await supabase.from("x-raydetail").update({ patient_uhid: primaryId }).eq("patient_uhid", duplicateId)
        await supabase.from("zdeleted_data").update({ UHID: primaryId }).eq("UHID", duplicateId)
        await supabase.from("dopd_registration").update({ uhid: primaryId }).eq("uhid", duplicateId)

        // DELETE the duplicate profile
        const { error: delError } = await supabase
          .from("patient_detail")
          .delete()
          .eq("uhid", duplicateId)
        
        if (delError) {
          console.error(`Error deleting dupe ${duplicateId}:`, delError)
          toast.error(`Modified records but failed to delete profile ${duplicateId}`)
        }
      }

      toast.success("Merge completed successfully!")
      setSelectedIds([])
      setPrimaryId(null)
      setPassword("")
      searchPatients() // Refresh
    } catch (err: any) {
      console.error(err)
      toast.error("Merge error: " + err.message)
    } finally {
      setIsMerging(false)
    }
  }

  const handleDelete = async (uhid: string) => {
    const candidate = candidates.find(p => p.uhid === uhid)
    if (!candidate) return

    if (candidate.recordCount > 0) {
      toast.error("Cannot delete patient with records. Merge them instead.")
      return
    }

    if (!confirm(`Delete profile for ${candidate.name}?`)) return

    try {
      const { error } = await supabase.from("patient_detail").delete().eq("uhid", uhid)
      if (error) throw error
      toast.success("Profile deleted")
      setCandidates(prev => prev.filter(p => p.uhid !== uhid))
      setSelectedIds(prev => prev.filter(id => id !== uhid))
    } catch (err: any) {
      toast.error("Delete failed: " + err.message)
    }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
              <GitMerge className="h-8 w-8 text-indigo-600" />
              UHID Data Merge Center
            </h1>
            <p className="text-gray-500 mt-2 text-lg">Consolidate multiple patient records into one master UHID.</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-4">
            <div className="bg-indigo-600 p-2 rounded-xl text-white">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Merging</div>
              <div className="text-2xl font-black text-indigo-900">{selectedIds.length} <span className="text-sm font-medium">Selected</span></div>
            </div>
          </div>
        </div>

        {/* Search */}
        <Card className="border-0 shadow-2xl bg-white overflow-hidden rounded-3xl">
          <CardContent className="p-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
              <Input
                placeholder="Search Name, Phone or UHID..."
                className="w-full pl-16 pr-6 h-16 text-xl border-0 focus:ring-0 bg-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPatients()}
              />
            </div>
            <Button onClick={searchPatients} disabled={loading} className="h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Search"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {candidates.length === 0 ? (
              <div className="py-24 bg-gray-50 border-2 border-dashed rounded-3xl text-center text-gray-400">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Search for patients to merge</p>
              </div>
            ) : (
              candidates.map((p) => (
                <Card 
                  key={p.uhid} 
                  className={cn(
                    "transition-all border-2 cursor-pointer",
                    selectedIds.includes(p.uhid) ? "border-indigo-600 bg-indigo-50/10 shadow-lg" : "border-transparent hover:border-gray-200"
                  )}
                  onClick={() => toggleSelection(p.uhid)}
                >
                  <CardContent className="p-6 flex justify-between items-center">
                    <div className="flex gap-4">
                      <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center font-bold",
                        selectedIds.includes(p.uhid) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
                      )}>
                        {p.name[0]}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 uppercase">{p.name}</h3>
                        <div className="text-sm text-gray-500 flex gap-4 mt-1">
                          <span className="bg-gray-50 px-2 rounded font-mono">UHID: {p.uhid}</span>
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {p.number}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase",
                        p.recordCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {p.recordCount} records
                      </div>
                      {p.recordCount === 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-400" 
                          onClick={(e) => { e.stopPropagation(); handleDelete(p.uhid); }}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      )}
                      <div className={cn(
                        "h-6 w-6 rounded-full border-2 flex items-center justify-center",
                        selectedIds.includes(p.uhid) ? "bg-indigo-600 border-indigo-600" : "border-gray-200"
                      )}>
                        {selectedIds.includes(p.uhid) && <div className="h-2 w-2 bg-white rounded-full" />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="bg-indigo-900 text-white rounded-[2.5rem] shadow-2xl p-8 sticky top-6">
              <h2 className="text-2xl font-black mb-2">Merge Records</h2>
              <p className="text-indigo-200 mb-6 text-sm">Select Primary ID (the one to KEEP)</p>

              {selectedIds.length < 2 ? (
                <div className="bg-white/10 p-6 rounded-3xl text-center border border-white/5">
                  <AlertTriangle className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
                  <p className="text-sm text-indigo-100">Select at least 2 patients to merge.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedIds.map(id => {
                    const candidate = candidates.find(c => c.uhid === id)
                    return (
                      <button
                        key={id}
                        onClick={() => setPrimaryId(id)}
                        className={cn(
                          "w-full p-4 rounded-2xl flex items-center justify-between text-left transition-all",
                          primaryId === id ? "bg-white text-indigo-900" : "bg-white/5 hover:bg-white/10"
                        )}
                      >
                        <div className="truncate flex-1">
                          <div className="font-bold uppercase text-sm truncate">{candidate?.name}</div>
                          <div className="text-[10px] opacity-60 font-mono tracking-tighter">{id}</div>
                        </div>
                        {primaryId === id && <CheckCircle2 className="h-5 w-5" />}
                      </button>
                    )
                  })}

                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-widest text-indigo-300">Admin Password</label>
                      <Input 
                        type="password"
                        placeholder="Enter password..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-14 rounded-2xl focus:ring-white/30"
                      />
                    </div>

                    <div className="bg-indigo-800/50 p-6 rounded-3xl border border-indigo-700/50 text-xs text-indigo-100/70 space-y-2">
                    <p className="flex gap-2">
                      <ArrowRight className="h-3 w-3 mt-0.5 text-indigo-400" />
                      <span>All Clinical & Billing data moves to <strong>{primaryId || "Master ID"}</strong></span>
                    </p>
                    <p className="flex gap-2 text-orange-300">
                      <ArrowRight className="h-3 w-3 mt-0.5" />
                      <span>Other <strong>{selectedIds.length - (primaryId ? 1 : 0)}</strong> profile(s) will be deleted.</span>
                    </p>
                  </div>

                  <Button 
                    onClick={handleMerge}
                    disabled={!primaryId || isMerging}
                    className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl"
                  >
                    {isMerging ? <Loader2 className="h-6 w-6 animate-spin" /> : "START MERGE"}
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default MergePatientsPage
