"use client"

import React, { useState, useEffect } from 'react';
import { supabase } from "@/lib/supabase";
import { ChevronLeft, ChevronRight, FileText, Calendar, User, Clock, Search, AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

interface PreviousVisitsTabProps {
    patientUhid: string;
    currentOpdId: number;
}

// --- Modern Visits Tab ---
export default function PreviousVisitsTab({ patientUhid, currentOpdId }: PreviousVisitsTabProps) {
    const [visits, setVisits] = useState<any[]>([]);
    const [selectedVisitIndex, setSelectedVisitIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // --- Fetch Data ---
    useEffect(() => {
        const fetchVisits = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('opd_registration')
                    .select('*')
                    .eq('uhid', patientUhid)
                    .neq('id', currentOpdId)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                if (data) setVisits(data);
            } catch (e) {
                console.error("Error fetching visits:", e);
            } finally {
                setLoading(false);
            }
        };
        if (patientUhid) fetchVisits();
    }, [patientUhid, currentOpdId]);

    const filteredVisits = visits.filter(v =>
        format(new Date(v.created_at), 'dd MMM yyyy').toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.id.toString().includes(searchTerm)
    );

    const currentVisit = filteredVisits[selectedVisitIndex];

    // --- Render Loading / Empty ---
    if (loading) return (
        <div className="flex items-center justify-center h-full bg-slate-50">
            <div className="flex flex-col items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading History...</span>
            </div>
        </div>
    );

    if (visits.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-400">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-3">
                <Calendar className="w-6 h-6 opacity-20" />
            </div>
            <p className="text-xs font-bold text-slate-600">No Previous Records</p>
            <p className="text-[10px] opacity-60">Patient has no prior visits.</p>
        </div>
    );

    return (
        <div className="flex h-full bg-slate-100/50 overflow-hidden font-sans">
            {/* --- LEFT SIDEBAR (List) --- */}
            <div className="w-[220px] bg-white border-r border-slate-200 flex flex-col z-10 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
                {/* Header */}
                <div className="p-4 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide">Timeline</h2>
                        <span className="bg-blue-50 text-blue-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                            {visits.length}
                        </span>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Filter visits..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setSelectedVisitIndex(0); }}
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-medium focus:outline-none focus:bg-white focus:border-blue-200 focus:ring-2 focus:ring-blue-50 transition-all"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredVisits.length > 0 ? filteredVisits.map((visit, idx) => (
                        <button
                            key={visit.id}
                            onClick={() => setSelectedVisitIndex(idx)}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 border text-left group relative overflow-hidden",
                                selectedVisitIndex === idx
                                    ? "bg-blue-600 border-blue-600 shadow-md shadow-blue-200"
                                    : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm"
                            )}
                        >
                            {/* Date Box */}
                            <div className={cn(
                                "flex flex-col items-center justify-center w-10 h-10 rounded-lg border shrink-0 transition-colors",
                                selectedVisitIndex === idx
                                    ? "bg-white/10 border-white/20 text-white"
                                    : "bg-slate-50 border-slate-200 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100"
                            )}>
                                <span className="text-[10px] font-black leading-none">{format(new Date(visit.created_at), 'dd')}</span>
                                <span className="text-[8px] font-bold uppercase leading-none mt-0.5">{format(new Date(visit.created_at), 'MMM')}</span>
                            </div>

                            <div className="min-w-0">
                                <p className={cn(
                                    "text-[10px] font-bold truncate",
                                    selectedVisitIndex === idx ? "text-white" : "text-slate-800"
                                )}>
                                    Visit #{visit.id}
                                </p>
                                <p className={cn(
                                    "text-[9px] truncate mt-0.5",
                                    selectedVisitIndex === idx ? "text-blue-100" : "text-slate-400"
                                )}>
                                    {format(new Date(visit.created_at), 'h:mm a')} • {format(new Date(visit.created_at), 'yyyy')}
                                </p>
                            </div>
                        </button>
                    )) : (
                        <div className="text-center py-8">
                            <p className="text-[10px] text-slate-400">No visits found.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- RIGHT CONTENT (Preview) --- */}
            <div className="flex-1 bg-slate-100 relative overflow-hidden flex flex-col items-center">
                {!currentVisit ? (
                    <div className="m-auto flex flex-col items-center text-slate-300">
                        <FileText className="w-12 h-12 mb-3 opacity-20" />
                        <p className="font-bold text-sm">Select a visit</p>
                    </div>
                ) : (
                    <>
                        {/* Top Bar Floating */}
                        <div className="absolute top-4 z-20 flex items-center gap-2 bg-white/80 backdrop-blur-md border border-white/50 shadow-sm px-1.5 py-1.5 rounded-full">
                            <button
                                disabled={selectedVisitIndex === filteredVisits.length - 1}
                                onClick={() => setSelectedVisitIndex(prev => prev + 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:shadow-sm text-slate-500 hover:text-slate-900 transition-all disabled:opacity-30"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="px-3 text-center">
                                <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                                    {format(new Date(currentVisit.created_at), 'dd MMMM yyyy')}
                                </p>
                            </div>
                            <button
                                disabled={selectedVisitIndex === 0}
                                onClick={() => setSelectedVisitIndex(prev => prev - 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:shadow-sm text-slate-500 hover:text-slate-900 transition-all disabled:opacity-30"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Scaled A4 Preview Container */}
                        <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex justify-center py-16 px-4">
                            <div className="origin-top transform scale-[0.65] md:scale-[0.75] lg:scale-[0.8] transition-transform duration-300">
                                {/* The "Paper" */}
                                <div className="w-[794px] min-h-[1123px] bg-white shadow-2xl relative flex flex-col">
                                    {/* Paper Header (Standardized) */}
                                    <div className="h-2 bg-blue-600 w-full mb-8"></div>
                                    <div className="px-12 flex justify-between items-start mb-8">
                                        <div>
                                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{patientUhid}</h1>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Patient History Record</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="bg-slate-100 px-3 py-1 rounded inline-block text-xs font-bold text-slate-600 mb-1">
                                                OPD ID: {currentVisit.id}
                                            </div>
                                            <p className="text-slate-400 text-xs">{format(new Date(currentVisit.created_at), 'PPP p')}</p>
                                        </div>
                                    </div>

                                    {/* Content Body */}
                                    <div className="px-12 flex-1">

                                        {/* Vitals Grid */}
                                        <div className="grid grid-cols-4 gap-4 mb-8">
                                            {[
                                                { k: 'BP', v: currentVisit.bp || currentVisit.checkup_data_json?.bp, u: 'mm/Hg', c: 'blue' },
                                                { k: 'PR', v: currentVisit.pulse || currentVisit.checkup_data_json?.pulse, u: 'bpm', c: 'emerald' },
                                                { k: 'WT', v: currentVisit.weight || currentVisit.checkup_data_json?.weight, u: 'kg', c: 'orange' },
                                                { k: 'TP', v: currentVisit.temperature || currentVisit.checkup_data_json?.temperature, u: '°F', c: 'rose' },
                                            ].map((vital, i) => (
                                                <div key={i} className={`bg-${vital.c}-50/50 border border-${vital.c}-100 p-3 rounded-lg text-center`}>
                                                    <p className={`text-[10px] font-black text-${vital.c}-400 uppercase tracking-widest mb-1`}>{vital.k}</p>
                                                    <p className={`text-xl font-black text-${vital.c}-900 leading-none`}>{vital.v || '--'}</p>
                                                    <p className={`text-[9px] text-${vital.c}-400 font-bold mt-1`}>{vital.u}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Diagnosis */}
                                        <div className="mb-8">
                                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Diagnosis</h3>
                                            <div className="space-y-2">
                                                {currentVisit.diagnosis_list_json?.length > 0 ? currentVisit.diagnosis_list_json.map((d: any, i: number) => (
                                                    <div key={i} className="flex items-baseline gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                                        <span className="font-bold text-slate-800 text-sm">{d.name}</span>
                                                        <span className="text-xs text-slate-500 uppercase tracking-wide">[{d.status || 'Active'}]</span>
                                                    </div>
                                                )) : <span className="text-slate-400 italic text-sm">No recorded diagnosis.</span>}
                                            </div>
                                        </div>

                                        {/* Rx */}
                                        <div className="mb-8">
                                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Medications</h3>
                                            {currentVisit.rx_list_json?.length > 0 ? (
                                                <table className="w-full text-sm text-left">
                                                    <thead className="text-xs text-slate-400 uppercase font-black">
                                                        <tr>
                                                            <th className="pb-2">Details</th>
                                                            <th className="pb-2 text-center w-24">Timing</th>
                                                            <th className="pb-2 text-center w-16">Dur</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="text-slate-700 divide-y divide-slate-100">
                                                        {currentVisit.rx_list_json.map((rx: any, i: number) => {
                                                            const t = rx.timing || {};
                                                            return (
                                                                <tr key={i}>
                                                                    <td className="py-2.5">
                                                                        <div className="font-bold text-slate-900">{rx.name}</div>
                                                                        <div className="text-xs text-slate-500">{rx.dosage} • {rx.type}</div>
                                                                    </td>
                                                                    <td className="py-2.5 text-center font-mono text-xs font-bold bg-slate-50/50 rounded">
                                                                        {`${(t.bb || t.ab) ? 1 : 0}-${(t.bl || t.al) ? 1 : 0}-${(t.bd || t.ad) ? 1 : 0}`}
                                                                    </td>
                                                                    <td className="py-2.5 text-center font-bold text-slate-500">{rx.duration}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            ) : <span className="text-slate-400 italic text-sm">No medications prescribed.</span>}
                                        </div>

                                        {/* Symptoms & Notes Split */}
                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Complaints</h3>
                                                <ul className="space-y-1.5">
                                                    {currentVisit.symptoms_list_json?.map((s: any, i: number) => (
                                                        <li key={i} className="text-xs text-slate-700 font-medium">• {s.name}</li>
                                                    )) || <li className="text-slate-400 italic text-xs">None</li>}
                                                </ul>
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Clinical Note</h3>
                                                <p className="text-xs text-slate-600 leading-relaxed italic">
                                                    {currentVisit.clinical_notes || "No additional notes."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Paper Footer */}
                                    <div className="h-12 border-t border-slate-100 mt-auto flex items-center justify-between px-12 text-[10px] text-slate-300 font-black uppercase tracking-widest">
                                        <span>Generated by System</span>
                                        <span>Finalized on {format(new Date(currentVisit.updated_at || currentVisit.created_at), 'dd MMM yyyy')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Unused sub-components removed for cleaner file

