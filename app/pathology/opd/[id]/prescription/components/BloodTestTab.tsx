"use client"

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from "@/lib/supabase"
import { Loader2, AlertCircle, Plus, Save, Clock, Trash2, Search, Edit3 } from 'lucide-react'
import { cn } from "@/lib/utils"
import { format } from 'date-fns'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

interface BloodTestTabProps {
    opdId: number
    patientUhid: string
}

interface InvestigationParam {
    name: string
    unit: string
    isHidden?: boolean
}

interface RecordData {
    id: number
    created_at: string
    checkup_data_json: Record<string, string>
}

export default function BloodTestTab({ opdId, patientUhid }: BloodTestTabProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [params, setParams] = useState<InvestigationParam[]>([])
    const [records, setRecords] = useState<RecordData[]>([])
    const [dirtyRecordIds, setDirtyRecordIds] = useState<Set<number>>(new Set())
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")

    // Dialog state for adding new parameter
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [isHiddenParamsDialogOpen, setIsHiddenParamsDialogOpen] = useState(false)
    const [isHideConfirmDialogOpen, setIsHideConfirmDialogOpen] = useState(false)
    const [paramToHide, setParamToHide] = useState<string | null>(null)
    const [newParamName, setNewParamName] = useState("")
    const [newParamUnit, setNewParamUnit] = useState("")
    const [hideSearchQuery, setHideSearchQuery] = useState("")

    const PARAMS_CACHE_KEY = 'OPD_INVESTIGATION_PARAMS_CACHE'
    // 1. Fetch Master Parameters (with Cache)
    const fetchParams = useCallback(async () => {
        try {
            const cached = localStorage.getItem(PARAMS_CACHE_KEY)
            if (cached) {
                setParams(JSON.parse(cached))
            }

            const { data, error } = await supabase
                .from('opd_datasets')
                .select('datajson')
                .eq('dataname', 'investigations')
                .single()

            if (error && error.code !== 'PGRST116') throw error

            if (data?.datajson && Array.isArray(data.datajson)) {
                const fetchedParams = data.datajson as InvestigationParam[]
                setParams(fetchedParams)
                localStorage.setItem(PARAMS_CACHE_KEY, JSON.stringify(fetchedParams))
            }
        } catch (err: any) {
            console.error("Error fetching parameters:", err)
        }
    }, [])

    // 2. Fetch Records
    const fetchRecords = useCallback(async () => {
        if (!patientUhid) return
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('opd_registration')
                .select('id, created_at, checkup_data_json')
                .eq('uhid', patientUhid)
                .order('created_at', { ascending: false })
                .limit(10)

            if (error) throw error

            // Ensure checkup_data_json is always an object
            const normalizedData = (data || []).map(r => ({
                ...r,
                checkup_data_json: r.checkup_data_json || {}
            }))

            setRecords(normalizedData as RecordData[])
            setDirtyRecordIds(new Set())
        } catch (err: any) {
            console.error("Error fetching data:", err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [patientUhid])

    useEffect(() => {
        fetchParams()
        fetchRecords()
    }, [fetchParams, fetchRecords])

    // Derived: Filtered & Sorted Params
    const activeParams = useMemo(() => {
        const hasValue = (paramName: string) => {
            return records.some(r => r.checkup_data_json?.[paramName])
        }

        let list = params.filter(p => !p.isHidden)

        if (searchQuery) {
            list = list.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        }

        return list.sort((a, b) => {
            const aHas = hasValue(a.name) ? 1 : 0
            const bHas = hasValue(b.name) ? 1 : 0
            return bHas - aHas
        })
    }, [params, records, searchQuery])

    const hiddenParams = useMemo(() => {
        return params.filter(p => p.isHidden)
    }, [params])

    // Actions
    const handleValueChange = (recordId: number, paramName: string, value: string) => {
        setRecords(prev => prev.map(r => {
            if (r.id === recordId) {
                return {
                    ...r,
                    checkup_data_json: { ...r.checkup_data_json, [paramName]: value }
                }
            }
            return r
        }))
        setDirtyRecordIds(prev => new Set(prev).add(recordId))
    }

    // 3. Auto-save implementation
    useEffect(() => {
        if (dirtyRecordIds.size === 0 || saving) return

        const timer = setTimeout(async () => {
            try {
                setSaving(true)
                const recordsToSave = records.filter(r => dirtyRecordIds.has(r.id))

                const updatePromises = recordsToSave.map(r =>
                    supabase
                        .from('opd_registration')
                        .update({ checkup_data_json: r.checkup_data_json })
                        .eq('id', r.id)
                )

                const results = await Promise.all(updatePromises)
                const firstError = results.find(res => res.error)?.error
                if (firstError) throw firstError

                setDirtyRecordIds(new Set())
            } catch (err: any) {
                console.error("Auto-save error:", err)
                setError("Auto-save failed: " + err.message)
            } finally {
                setSaving(false)
            }
        }, 1000) // 1 second debounce

        return () => clearTimeout(timer)
    }, [records, dirtyRecordIds, saving])

    const toggleParamVisibility = async (paramName: string, isHidden: boolean) => {
        const updatedParams = params.map(p =>
            p.name === paramName ? { ...p, isHidden } : p
        )
        setParams(updatedParams)

        try {
            await supabase
                .from('opd_datasets')
                .update({ datajson: updatedParams })
                .eq('dataname', 'investigations')

            localStorage.setItem(PARAMS_CACHE_KEY, JSON.stringify(updatedParams))
        } catch (err) {
            console.error("Failed to update visibility:", err)
        }
    }

    const addNewParam = async () => {
        if (!newParamName.trim()) return

        const newParam: InvestigationParam = {
            name: newParamName.trim(),
            unit: newParamUnit.trim(),
            isHidden: false
        }

        const updatedParams = [...params, newParam]
        setParams(updatedParams)
        setIsAddDialogOpen(false)
        setNewParamName("")
        setNewParamUnit("")

        try {
            await supabase
                .from('opd_datasets')
                .upsert({
                    dataname: 'investigations',
                    datajson: updatedParams
                }, { onConflict: 'dataname' })

            localStorage.setItem(PARAMS_CACHE_KEY, JSON.stringify(updatedParams))
        } catch (err) {
            console.error("Failed to persist new parameter:", err)
        }
    }

    if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>
    if (error) return <div className="flex items-center justify-center p-10 text-red-500"><AlertCircle className="w-5 h-5 mr-2" /> {error}</div>

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden select-none">
            {/* --- TOP BAR --- */}
            <div className="bg-white border-b px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-30">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 text-white p-2 rounded-xl shadow-blue-100 shadow-lg">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div className="hidden sm:block">
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Timeline</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Medical History</p>
                        </div>
                    </div>

                    <div className="relative w-48 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Quick search parameter..."
                            className="h-9 pl-9 text-xs bg-slate-50 border-transparent focus:bg-white focus:border-blue-200 transition-all rounded-lg"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {saving ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100 animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Saving...</span>
                        </div>
                    ) : dirtyRecordIds.size > 0 ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                            <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Drafting...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Saved</span>
                        </div>
                    )}
                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    {hiddenParams.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 text-[11px] font-black border-slate-200 text-blue-600 hover:bg-blue-50 uppercase tracking-tight gap-1.5 shadow-sm"
                            onClick={() => setIsHiddenParamsDialogOpen(true)}
                        >
                            <Search className="w-4 h-4" /> Hidden ({hiddenParams.length})
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-[11px] font-black border-slate-200 text-slate-600 hover:bg-slate-50 uppercase tracking-tight gap-1.5 shadow-sm"
                        onClick={() => setIsAddDialogOpen(true)}
                    >
                        <Plus className="w-4 h-4" /> Add Parameter
                    </Button>
                </div>
            </div>

            {/* --- TABLE AREA (Scroll-friendly) --- */}
            <div className="flex-1 relative overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                <table className="w-full border-separate border-spacing-0 min-w-max">
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-white/95 backdrop-blur-md shadow-sm">
                            <th className="sticky left-0 z-30 bg-white p-4 text-left w-[250px] border-b border-r border-slate-100">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Parameter Name</span>
                                    <span className="text-[8px] text-blue-500 font-bold mt-1 uppercase tracking-tighter">(Hold to hide)</span>
                                </div>
                            </th>
                            <th className="p-4 text-left w-[80px] border-b border-r border-slate-100 bg-white">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Unit</span>
                            </th>
                            {records.map(record => (
                                <th
                                    key={record.id}
                                    className={cn(
                                        "p-4 text-center min-w-[140px] border-b border-r border-slate-100 transition-colors bg-white",
                                        record.id === opdId ? "bg-blue-50/50" : ""
                                    )}
                                >
                                    <div className="flex flex-col items-center">
                                        <span className={cn(
                                            "text-[10px] font-black tracking-widest uppercase",
                                            record.id === opdId ? "text-blue-600" : "text-slate-500"
                                        )}>
                                            {format(new Date(record.created_at), 'dd MMM yyyy')}
                                        </span>
                                        {record.id === opdId && (
                                            <div className="mt-1 flex items-center gap-1">
                                                <span className="text-[8px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">Current visit</span>
                                            </div>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {activeParams.length === 0 ? (
                            <tr>
                                <td colSpan={records.length + 2} className="p-20 text-center text-slate-300 font-bold text-sm uppercase tracking-widest">
                                    No parameters found
                                </td>
                            </tr>
                        ) : (
                            activeParams.map((param, idx) => (
                                <tr key={param.name} className="hover:bg-blue-50/20 group transition-colors">
                                    <ParameterNameCell
                                        name={param.name}
                                        onHide={() => {
                                            setParamToHide(param.name)
                                            setIsHideConfirmDialogOpen(true)
                                        }}
                                    />
                                    <td className="p-4 text-slate-400 text-[10px] font-black border-b border-r border-slate-100 italic tracking-tighter">
                                        {param.unit}
                                    </td>
                                    {records.map(record => {
                                        const value = record.checkup_data_json?.[param.name] || ""
                                        const isCurrent = record.id === opdId

                                        return (
                                            <td
                                                key={`${param.name}-${record.id}`}
                                                className={cn(
                                                    "p-2 border-b border-r border-slate-100 transition-all",
                                                    isCurrent ? "bg-blue-50/10" : "bg-white group-hover:bg-blue-50/5"
                                                )}
                                            >
                                                <div className="relative group/cell">
                                                    <Input
                                                        value={value}
                                                        onChange={(e) => handleValueChange(record.id, param.name, e.target.value)}
                                                        className={cn(
                                                            "h-10 text-[11px] font-black text-center border-transparent shadow-none focus:ring-1 transition-all rounded-lg",
                                                            value ? "text-slate-900" : "text-slate-300",
                                                            isCurrent
                                                                ? "bg-blue-100/50 text-blue-700 focus:bg-white focus:border-blue-200"
                                                                : "bg-transparent hover:bg-slate-100/50 focus:bg-white focus:border-slate-200"
                                                        )}
                                                        placeholder="—"
                                                    />
                                                    {dirtyRecordIds.has(record.id) && (
                                                        <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-orange-500 rounded-full shadow-sm animate-pulse" />
                                                    )}
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* --- ADD DIALOG --- */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent className="sm:max-w-[400px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black flex items-center gap-3 uppercase tracking-tight">
                            <div className="bg-blue-100 p-2 rounded-xl"><Plus className="w-5 h-5 text-blue-600" /></div>
                            New Parameter
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Name</label>
                            <Input
                                value={newParamName}
                                onChange={e => setNewParamName(e.target.value)}
                                placeholder="E.g. VITAMIN B12"
                                className="h-12 text-xs font-black uppercase bg-slate-50 border-transparent focus:bg-white rounded-xl"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Unit</label>
                            <Input
                                value={newParamUnit}
                                onChange={e => setNewParamUnit(e.target.value)}
                                placeholder="E.g. PG/ML"
                                className="h-12 text-xs font-black uppercase bg-slate-50 border-transparent focus:bg-white rounded-xl"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)} className="text-[11px] font-black uppercase tracking-tight h-10">Cancel</Button>
                        <Button onClick={addNewParam} disabled={!newParamName.trim()} className="text-[11px] font-black uppercase tracking-tight h-10 px-6 bg-blue-600 hover:bg-blue-700 rounded-xl">Create Parameter</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- HIDE CONFIRM DIALOG --- */}
            <Dialog open={isHideConfirmDialogOpen} onOpenChange={setIsHideConfirmDialogOpen}>
                <DialogContent className="sm:max-w-[400px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black flex items-center gap-3 uppercase tracking-tight text-red-600">
                            <div className="bg-red-100 p-2 rounded-xl"><AlertCircle className="w-5 h-5 text-red-600" /></div>
                            Hide Parameter?
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-xs font-bold text-slate-600 uppercase leading-relaxed">
                            Are you sure you want to hide <span className="text-red-600 font-black">"{paramToHide}"</span>?
                            It will be hidden from <span className="underline decoration-red-200">all patient appointments</span>.
                        </p>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setIsHideConfirmDialogOpen(false)} className="text-[11px] font-black uppercase tracking-tight h-10">No, Cancel</Button>
                        <Button
                            onClick={() => {
                                if (paramToHide) toggleParamVisibility(paramToHide, true)
                                setIsHideConfirmDialogOpen(false)
                            }}
                            className="text-[11px] font-black uppercase tracking-tight h-10 px-6 bg-red-600 hover:bg-red-700 rounded-xl"
                        >
                            Yes, Hide Globally
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- MANAGE HIDDEN DIALOG --- */}
            <Dialog open={isHiddenParamsDialogOpen} onOpenChange={setIsHiddenParamsDialogOpen}>
                <DialogContent className="sm:max-w-[450px] rounded-2xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black flex items-center gap-3 uppercase tracking-tight">
                            <div className="bg-blue-100 p-2 rounded-xl"><Search className="w-5 h-5 text-blue-600" /></div>
                            Restore Hidden Parameters
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                value={hideSearchQuery}
                                onChange={(e) => setHideSearchQuery(e.target.value)}
                                placeholder="Search hidden items..."
                                className="h-10 pl-10 text-xs font-black uppercase bg-slate-50 border-transparent focus:bg-white rounded-xl"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-2">
                            {hiddenParams
                                .filter(p => !hideSearchQuery || p.name.toLowerCase().includes(hideSearchQuery.toLowerCase()))
                                .map(p => (
                                    <div key={p.name} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-blue-200 transition-colors group">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{p.name}</span>
                                            <span className="text-[9px] font-bold text-slate-400 italic">Unit: {p.unit || 'N/A'}</span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => toggleParamVisibility(p.name, false)}
                                            className="h-8 text-[10px] font-black text-blue-600 hover:bg-blue-50 uppercase tracking-tighter"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1" /> Unhide
                                        </Button>
                                    </div>
                                ))}
                            {hiddenParams.length === 0 && (
                                <div className="text-center py-10">
                                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No hidden parameters</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button className="w-full text-[11px] font-black uppercase tracking-tight h-10 rounded-xl bg-slate-900" onClick={() => setIsHiddenParamsDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- STATUS FOOTER --- */}
            <div className="bg-white border-t px-6 py-2.5 flex items-center justify-between shrink-0 shadow-inner">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-50"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Data Point</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 ring-4 ring-orange-50 animate-pulse"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Unsaved Edit</span>
                    </div>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                    {records.length} Points • Scroll Right/Down for more
                </div>
            </div>
        </div>
    )
}

function ParameterNameCell({ name, onHide }: { name: string, onHide: () => void }) {
    const [isHolding, setIsHolding] = useState(false)
    const timerRef = React.useRef<any>(null)

    const startHold = () => {
        setIsHolding(true)
        timerRef.current = setTimeout(() => {
            onHide()
            setIsHolding(false)
        }, 800)
    }

    const cancelHold = () => {
        setIsHolding(false)
        if (timerRef.current) clearTimeout(timerRef.current)
    }

    return (
        <td
            className={cn(
                "sticky left-0 z-10 bg-white group-hover:bg-slate-50/50 p-4 font-black text-slate-800 text-[11px] border-b border-r border-slate-100 uppercase tracking-tight cursor-help transition-all",
                isHolding ? "bg-red-50 text-red-600 scale-[0.98]" : ""
            )}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
        >
            <div className="flex items-center justify-between">
                <span>{name}</span>
                {isHolding && <div className="w-1 h-full absolute right-0 top-0 bg-red-500 animate-pulse" />}
            </div>
        </td>
    )
}
