"use client"

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Heart, Activity, Monitor, Droplet } from 'lucide-react';
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

interface PatientVitalsTrendProps {
    patientUhid: string;
}

export default function PatientVitalsTrend({ patientUhid }: PatientVitalsTrendProps) {
    const [vitalsData, setVitalsData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState<Record<string, boolean>>({}); // key: "id-field"
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchVitals = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('opd_registration')
                .select('id, created_at, bp, pulse, weight, spo2, sugar')
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

    const handleUpdateVital = async (id: number, field: string, value: any) => {
        const key = `${id}-${field}`;
        setUpdatingStatus(prev => ({ ...prev, [key]: true }));

        try {
            const { error } = await supabase
                .from('opd_registration')
                .update({ [field]: value })
                .eq('id', id);

            if (error) throw error;

            // Update local state
            setVitalsData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
        } catch (e) {
            console.error("Error updating vital:", e);
            alert("Failed to update vital.");
        } finally {
            setUpdatingStatus(prev => ({ ...prev, [key]: false }));
        }
    };

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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full max-w-full">
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
                <div className="flex w-full max-w-full">
                    {/* Fixed Labels */}
                    <div className={cn(labelWidth, "shrink-0 border-r border-slate-200 bg-white z-10")}>
                        <div className={cn(rowHeight, "pl-5 pt-5 text-[11px] font-bold text-slate-400 tracking-wider")}>VISIT DATE</div>
                        <LabelRow icon={Heart} color="text-red-400" label="Blood Pressure" height={rowHeight} />
                        <LabelRow icon={Activity} color="text-blue-400" label="Pulse Rate" height={rowHeight} />
                        <LabelRow icon={Droplet} color="text-cyan-500" label="SpO2" height={rowHeight} />
                        <LabelRow icon={Activity} color="text-emerald-500" label="Sugar (mg/dL)" height={rowHeight} />
                        <LabelRow icon={Monitor} color="text-orange-400" label="Body Weight" height={rowHeight} />
                    </div>

                    {/* Scrollable Data */}
                    <div className="flex-1 overflow-x-auto min-w-0" ref={scrollRef}>
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
                                        <DataCell
                                            value={data.bp}
                                            isBold
                                            height={rowHeight}
                                            isLoading={updatingStatus[`${data.id}-bp`]}
                                            onSave={(val: any) => handleUpdateVital(data.id, 'bp', val)}
                                        />
                                        <DataCell
                                            value={data.pulse}
                                            unit="bpm"
                                            height={rowHeight}
                                            inputMode="numeric"
                                            isLoading={updatingStatus[`${data.id}-pulse`]}
                                            onSave={(val: any) => handleUpdateVital(data.id, 'pulse', val)}
                                        />
                                        <DataCell
                                            value={data.spo2}
                                            unit="%"
                                            height={rowHeight}
                                            inputMode="numeric"
                                            isLoading={updatingStatus[`${data.id}-spo2`]}
                                            onSave={(val: any) => handleUpdateVital(data.id, 'spo2', val)}
                                        />
                                        <DataCell
                                            value={data.sugar}
                                            height={rowHeight}
                                            inputMode="numeric"
                                            isLoading={updatingStatus[`${data.id}-sugar`]}
                                            onSave={(val: any) => handleUpdateVital(data.id, 'sugar', val)}
                                        />
                                        <DataCell
                                            value={data.weight}
                                            unit="kg"
                                            height={rowHeight}
                                            inputMode="decimal"
                                            isLoading={updatingStatus[`${data.id}-weight`]}
                                            onSave={(val: any) => handleUpdateVital(data.id, 'weight', val)}
                                        />
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

function DataCell({ value, unit, isBold, height, onSave, isLoading, type = "text", inputMode = "text" }: any) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value || "");

    useEffect(() => {
        setTempValue(value || "");
    }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        if (String(tempValue) !== String(value || "")) {
            onSave(tempValue);
        }
    };

    if (isEditing) {
        return (
            <div className={cn(height, "flex items-center justify-center border-t border-slate-100 px-1")}>
                <input
                    autoFocus
                    type={type}
                    inputMode={inputMode}
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                    className="w-full h-8 text-center text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>
        );
    }

    const isEmpty = !value || value === "--";
    return (
        <div
            className={cn(height, "flex items-center justify-center border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors group relative")}
            onClick={() => setIsEditing(true)}
        >
            {isLoading ? (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent animate-spin rounded-full"></div>
            ) : (
                <>
                    <span className={cn("text-sm", isBold && !isEmpty ? "font-bold text-slate-800" : "text-slate-600", isEmpty && "text-slate-300")}>
                        {value || "--"}
                    </span>
                    {!isEmpty && unit && <span className="text-[10px] text-slate-400 ml-1">{unit}</span>}
                </>
            )}
        </div>
    );
}
