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

export default function PreviousVisitsTab({ patientUhid, currentOpdId }: PreviousVisitsTabProps) {
    const [visits, setVisits] = useState<any[]>([]);
    const [selectedVisitIndex, setSelectedVisitIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const fetchVisits = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('opd_registration')
                    .select('*')
                    .eq('uhid', patientUhid)
                    .neq('id', currentOpdId) // Exclude current visit
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

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-3">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 text-sm font-medium animate-pulse">Fetching history...</p>
        </div>
    );

    if (visits.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-400 gap-3">
            <div className="p-4 bg-white rounded-full shadow-sm border border-slate-100">
                <Clock className="w-8 h-8 opacity-20" />
            </div>
            <div className="text-center">
                <p className="text-base font-bold text-slate-600">No Previous Visits</p>
                <p className="text-xs">First visit for this patient.</p>
            </div>
        </div>
    );

    const currentVisit = filteredVisits[selectedVisitIndex];

    return (
        <div className="flex h-full bg-slate-100 overflow-hidden">
            {/* Sidebar / List of Visits - Ultra Compact */}
            <div className="w-56 bg-white border-r border-slate-200 flex flex-col shadow-md z-10">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-blue-600" />
                            Visit History
                        </h3>
                        <span className="text-[8px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full font-bold">
                            {visits.length}
                        </span>
                    </div>

                    <div className="relative">
                        <Search className="w-2.5 h-2.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setSelectedVisitIndex(0);
                            }}
                            className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                    {filteredVisits.length > 0 ? filteredVisits.map((visit, idx) => (
                        <button
                            key={visit.id}
                            onClick={() => setSelectedVisitIndex(idx)}
                            className={cn(
                                "w-full text-left p-2 rounded transition-all border group",
                                selectedVisitIndex === idx
                                    ? "bg-blue-600 border-blue-600 shadow-sm"
                                    : "bg-white border-slate-100 hover:border-blue-200 hover:bg-blue-50/20"
                            )}
                        >
                            <div className="flex justify-between items-start">
                                <span className={cn(
                                    "text-[10px] font-bold",
                                    selectedVisitIndex === idx ? "text-white" : "text-slate-700"
                                )}>
                                    {format(new Date(visit.created_at), 'dd MMM yy')}
                                </span>
                                <span className={cn(
                                    "text-[7px] px-1 py-0.5 rounded font-mono font-bold",
                                    selectedVisitIndex === idx ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                                )}>
                                    #{visit.id}
                                </span>
                            </div>
                        </button>
                    )) : (
                        <div className="py-4 text-center">
                            <p className="text-[9px] text-slate-400">No matches.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content - Ultra Compact PDF View */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center bg-slate-200/30 custom-scrollbar">
                {!currentVisit ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Search className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs font-bold">No visit selected</p>
                    </div>
                ) : (
                    <>
                        {/* Navigation Controls - Mini */}
                        <div className="mb-3 flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg shadow border border-slate-200 sticky top-0 z-20">
                            <button
                                disabled={selectedVisitIndex === filteredVisits.length - 1}
                                onClick={() => setSelectedVisitIndex(prev => prev + 1)}
                                className="p-1 hover:bg-slate-100 rounded disabled:opacity-20"
                            >
                                <ChevronLeft className="w-4 h-4 text-slate-600" />
                            </button>

                            <div className="flex flex-col items-center min-w-[80px]">
                                <span className="text-[8px] font-black text-blue-600 uppercase">Record</span>
                                <span className="text-[10px] font-bold text-slate-800">
                                    {selectedVisitIndex + 1} / {filteredVisits.length}
                                </span>
                            </div>

                            <button
                                disabled={selectedVisitIndex === 0}
                                onClick={() => setSelectedVisitIndex(prev => prev - 1)}
                                className="p-1 hover:bg-slate-100 rounded disabled:opacity-20"
                            >
                                <ChevronRight className="w-4 h-4 text-slate-600" />
                            </button>
                        </div>

                        {/* The "PDF" Page - Ultra Compact */}
                        <div className="bg-white shadow-lg w-full max-w-[600px] min-h-[800px] p-6 relative mb-6 transition-all duration-500">
                            {/* Watermark - Mini */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[60px] font-black text-slate-50/30 uppercase tracking-[0.2em] -rotate-45 pointer-events-none select-none">
                                PREVIOUS
                            </div>

                            {/* Header - Mini */}
                            <div className="flex justify-between items-start mb-6 pb-3 border-b border-slate-900">
                                <div className="space-y-0.5">
                                    <div className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest inline-block mb-1">
                                        OPD Record
                                    </div>
                                    <h1 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">
                                        Medical Summary
                                    </h1>
                                    <div className="flex items-center gap-2 text-[9px] text-slate-500 font-medium">
                                        <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> {format(new Date(currentVisit.created_at), 'dd/MM/yy')}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {format(new Date(currentVisit.created_at), 'hh:mm a')}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-900">ID: #{currentVisit.id}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">UHID: {currentVisit.uhid}</p>
                                </div>
                            </div>

                            {/* Vitals - Mini */}
                            <div className="mb-6">
                                <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                                    <div className="h-px flex-1 bg-slate-100"></div>
                                    Vitals
                                    <div className="h-px flex-1 bg-slate-100"></div>
                                </h3>
                                <div className="grid grid-cols-4 gap-2">
                                    <VitalBox label="BP" value={currentVisit.bp || currentVisit.checkup_data_json?.bp} unit="" icon="BP" />
                                    <VitalBox label="Pulse" value={currentVisit.pulse || currentVisit.checkup_data_json?.pulse} unit="" icon="PR" />
                                    <VitalBox label="Wt" value={currentVisit.weight || currentVisit.checkup_data_json?.weight} unit="" icon="WT" />
                                    <VitalBox label="Temp" value={currentVisit.temperature || currentVisit.checkup_data_json?.temperature} unit="" icon="TP" />
                                </div>
                            </div>

                            {/* Main Sections - Mini */}
                            <div className="grid grid-cols-1 gap-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <Section title="Complaints" icon={<AlertCircle className="w-3 h-3" />}>
                                        {currentVisit.symptoms_list_json?.length > 0 ? (
                                            <ul className="space-y-1">
                                                {currentVisit.symptoms_list_json.map((s: any, i: number) => (
                                                    <li key={i} className="text-[10px] font-bold text-slate-800 leading-tight">
                                                        • {s.name} {s.duration && <span className="text-[8px] text-slate-400 font-normal">({s.duration})</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="text-[9px] text-slate-300">None</p>}
                                    </Section>

                                    <Section title="Diagnosis" icon={<FileText className="w-3 h-3" />}>
                                        {currentVisit.diagnosis_list_json?.length > 0 ? (
                                            <ul className="space-y-1">
                                                {currentVisit.diagnosis_list_json.map((d: any, i: number) => (
                                                    <li key={i} className="text-[10px] font-black text-slate-900 leading-tight">
                                                        • {d.name} <span className="text-[7px] text-blue-500 uppercase">[{d.status || 'S'}]</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="text-[9px] text-slate-300">None</p>}
                                    </Section>
                                </div>

                                <Section title="Medications (Rx)" icon={<FileText className="w-3 h-3" />}>
                                    {currentVisit.rx_list_json?.length > 0 ? (
                                        <div className="border border-slate-100 rounded overflow-hidden">
                                            <table className="w-full border-collapse text-[9px]">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-left">
                                                        <th className="p-1.5 font-black uppercase">Medicine</th>
                                                        <th className="p-1.5 font-black uppercase text-center">Freq</th>
                                                        <th className="p-1.5 font-black uppercase text-center">Dur</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {currentVisit.rx_list_json.map((rx: any, i: number) => {
                                                        const t = rx.timing || {};
                                                        const freq = `${(t.bb || t.ab) ? 1 : 0}-${(t.bl || t.al) ? 1 : 0}-${(t.bd || t.ad) ? 1 : 0}`;
                                                        return (
                                                            <tr key={i}>
                                                                <td className="p-1.5">
                                                                    <div className="font-bold text-slate-800">{rx.name}</div>
                                                                    <div className="text-[8px] text-slate-400">{rx.dosage}</div>
                                                                </td>
                                                                <td className="p-1.5 text-center font-bold text-blue-600">{freq}</td>
                                                                <td className="p-1.5 text-center text-slate-500">{rx.duration}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <p className="text-[9px] text-slate-300">None</p>}
                                </Section>

                                <div className="grid grid-cols-2 gap-6">
                                    <Section title="Advice" icon={<FileText className="w-3 h-3" />}>
                                        {currentVisit.instructions_list_json?.length > 0 ? (
                                            <ul className="space-y-1">
                                                {currentVisit.instructions_list_json.map((ins: string, i: number) => (
                                                    <li key={i} className="text-[10px] text-slate-600 leading-tight">
                                                        • {ins}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="text-[9px] text-slate-300">None</p>}
                                    </Section>

                                    {currentVisit.clinical_notes && (
                                        <Section title="Notes" icon={<FileText className="w-3 h-3" />}>
                                            <p className="text-[10px] text-slate-500 italic leading-snug">
                                                {currentVisit.clinical_notes}
                                            </p>
                                        </Section>
                                    )}
                                </div>
                            </div>

                            {/* Footer - Mini */}
                            <div className="absolute bottom-6 left-6 right-6 border-t border-slate-50 pt-3 flex justify-between items-center text-[7px] text-slate-300 font-black uppercase tracking-widest">
                                <span>Visit ID: #{currentVisit.id}</span>
                                <span>Page 1/1</span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function VitalBox({ label, value, unit, icon }: { label: string, value: any, unit: string, icon: string }) {
    const isEmpty = !value || value === "--";
    return (
        <div className={cn(
            "relative overflow-hidden p-2 rounded-lg border transition-all",
            isEmpty ? "bg-slate-50 border-slate-100 opacity-50" : "bg-white border-slate-100"
        )}>
            <div className="absolute -right-1 -top-1 text-xl font-black text-slate-50/50 select-none">
                {icon}
            </div>
            <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5 relative z-10">{label}</p>
            <div className="flex items-baseline gap-0.5 relative z-10">
                <span className={cn(
                    "text-[11px] font-black",
                    isEmpty ? "text-slate-200" : "text-slate-800"
                )}>
                    {value || '--'}
                </span>
                {!isEmpty && unit && <span className="text-[7px] font-bold text-slate-400">{unit}</span>}
            </div>
        </div>
    );
}

function Section({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
    return (
        <div className="relative">
            <div className="flex items-center gap-1.5 mb-2">
                <div className="p-1 bg-slate-900 text-white rounded-sm">
                    {icon}
                </div>
                <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-wider">{title}</h3>
                <div className="h-px flex-1 bg-slate-50"></div>
            </div>
            <div className="pl-0.5">{children}</div>
        </div>
    );
}
