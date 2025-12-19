"use client"

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Heart, Activity, Monitor } from 'lucide-react';
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

interface PatientVitalsTrendProps {
    patientUhid: string;
}

export default function PatientVitalsTrend({ patientUhid }: PatientVitalsTrendProps) {
    const [vitalsData, setVitalsData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchVitals = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('opd_registration')
                .select('created_at, bp, pulse, weight')
                .eq('uhid', patientUhid)
                .order('created_at', { ascending: false })
                .limit(10);

            if (data) {
                setVitalsData(data);
            }
        } catch (e) {
            console.error("Error fetching vitals:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (patientUhid) fetchVitals();
    }, [patientUhid]);

    // --- Render Helpers ---
    const formatDateLine1 = (dateStr: string) => {
        try { return format(new Date(dateStr), 'dd MMM'); } catch { return "-"; }
    };
    const formatDateLine2 = (dateStr: string) => {
        try { return format(new Date(dateStr), 'yyyy'); } catch { return ""; }
    };

    const rowHeight = "h-14";
    const labelWidth = "w-[140px]";
    const dataWidth = "w-[90px]";

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-100">
                <div>
                    <h3 className="text-base font-bold text-slate-800">Vitals History</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Trend over last {vitalsData.length} visits</p>
                </div>
                <button
                    onClick={fetchVitals}
                    className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                >
                    <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                </button>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="h-56 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
            ) : vitalsData.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                    <Activity className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm">No vitals recorded yet</p>
                </div>
            ) : (
                <div className="flex">
                    {/* Fixed Labels */}
                    <div className={cn(labelWidth, "shrink-0 border-r border-slate-200 bg-white z-10")}>
                        <div className={cn(rowHeight, "pl-5 pt-5 text-[11px] font-bold text-slate-400 tracking-wider")}>VISIT DATE</div>
                        <LabelRow icon={Heart} color="text-red-400" label="Blood Pressure" height={rowHeight} />
                        <LabelRow icon={Activity} color="text-blue-400" label="Pulse Rate" height={rowHeight} />
                        <LabelRow icon={Monitor} color="text-orange-400" label="Body Weight" height={rowHeight} />
                    </div>

                    {/* Scrollable Data */}
                    <div className="flex-1 overflow-x-auto" ref={scrollRef}>
                        <div className="flex">
                            {vitalsData.map((data, idx) => {
                                const isLatest = idx === 0;
                                return (
                                    <div key={idx} className={cn(dataWidth, "shrink-0 flex flex-col", isLatest && "bg-blue-50/30")}>
                                        {/* Date Header */}
                                        <div className={cn(rowHeight, "flex flex-col items-center justify-center border-b-2", isLatest ? "border-blue-500" : "border-transparent")}>
                                            <span className={cn("text-sm font-bold", isLatest ? "text-blue-700" : "text-slate-800")}>
                                                {formatDateLine1(data.created_at)}
                                            </span>
                                            <span className="text-[10px] text-slate-400">{formatDateLine2(data.created_at)}</span>
                                        </div>

                                        {/* Data Cells */}
                                        <DataCell value={data.bp} unit="" isBold height={rowHeight} />
                                        <DataCell value={data.pulse} unit="bpm" height={rowHeight} />
                                        <DataCell value={data.weight} unit="kg" height={rowHeight} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function LabelRow({ icon: Icon, color, label, height }: any) {
    return (
        <div className={cn(height, "px-5 flex items-center gap-2 border-t border-slate-50")}>
            <Icon className={cn("w-4 h-4", color)} />
            <span className="text-[13px] font-semibold text-slate-700">{label}</span>
        </div>
    );
}

function DataCell({ value, unit, isBold, height }: any) {
    const isEmpty = !value || value === "--";
    return (
        <div className={cn(height, "flex items-center justify-center border-t border-slate-100")}>
            <span className={cn("text-sm", isBold && !isEmpty ? "font-bold text-slate-800" : "text-slate-600", isEmpty && "text-slate-300")}>
                {value || "--"}
            </span>
            {!isEmpty && unit && <span className="text-[10px] text-slate-400 ml-1">{unit}</span>}
        </div>
    );
}
