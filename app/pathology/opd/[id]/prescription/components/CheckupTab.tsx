"use client"

import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

// --- Theme ---
const CheckupTheme = {
    primary: "text-blue-600",
    primaryBg: "bg-blue-600",
    background: "bg-slate-100",
    surface: "bg-white",
    textMain: "text-slate-900",
    textSub: "text-slate-500",
    border: "border-slate-200",
    success: "bg-emerald-500",
    danger: "bg-red-500",
};

// --- Models ---
interface CheckupItemConfig {
    section: string;
    title: string;
    options: string[];
    type: string; // 'toggle' or 'text'
}

interface VisitType {
    id: string;
    name: string;
}

interface CheckupTabProps {
    opdId: number;
}

export default function CheckupTab({ opdId }: CheckupTabProps) {
    // --- State ---
    const [selectedVisitId, setSelectedVisitId] = useState("1m");
    const [masterTemplates, setMasterTemplates] = useState<Record<string, CheckupItemConfig[]>>({});
    const [patientResponses, setPatientResponses] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isLoaded, setIsLoaded] = useState(false);

    const visits: VisitType[] = [
        { id: "nb", name: "Newborn Visit" },
        { id: "1m", name: "1 Months" },
        { id: "3m", name: "3 Months" },
        { id: "6m", name: "6 Months" },
        { id: "9m", name: "9 Months" },
        { id: "12m", name: "12 Months" },
        { id: "18m", name: "18 Months" },
        { id: "24m", name: "24 Months" },
        { id: "36m", name: "36 Months" },
        { id: "48m", name: "48 Months" },
        { id: "60m", name: "60 Months" },
        { id: "mchat", name: "M-CHAT" },
    ];

    const [isFinalized, setIsFinalized] = useState(false);

    // --- Fetch Data ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch Master Templates
                const { data: templateData } = await supabase
                    .from('opd_datasets')
                    .select('datajson')
                    .eq('dataname', 'CheckupTemplates')
                    .single();

                if (templateData?.datajson) {
                    const templates: Record<string, CheckupItemConfig[]> = {};
                    Object.entries(templateData.datajson).forEach(([key, val]) => {
                        if (Array.isArray(val)) {
                            templates[key] = val.map((v: any) => ({
                                section: v.section || 'General',
                                title: v.title || '',
                                options: Array.isArray(v.options) ? v.options : [],
                                type: v.type || 'toggle'
                            }));
                        }
                    });
                    setMasterTemplates(templates);
                }

                // 2. Fetch Status & Server Data (Industry Expert Logic)
                const { data: serverData, error } = await supabase
                    .from('opd_registration')
                    .select('is_finalized, checkup_data_json')
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                const finalized = serverData?.is_finalized || false;
                const serverResponses = serverData?.checkup_data_json || {};
                setIsFinalized(finalized);

                // 3. Decide Source
                if (finalized) {
                    // Finalized: Strictly load from server
                    setPatientResponses(serverResponses);
                } else {
                    // Draft: Prioritize Local Storage
                    const saved = localStorage.getItem(`draft_checkup_${opdId}`);

                    if (saved) {
                        try {
                            setPatientResponses(JSON.parse(saved));
                        } catch (e) {
                            console.error("Local draft corrupt", e);
                            setPatientResponses(serverResponses);
                        }
                    } else {
                        // No local draft? Initialize from server (sync)
                        setPatientResponses(serverResponses);
                        // Sync to local
                        localStorage.setItem(`draft_checkup_${opdId}`, JSON.stringify(serverResponses));
                    }
                }

                setIsLoaded(true);
            } catch (e) {
                console.error("Error fetching checkup data", e);
                setIsLoaded(true);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [opdId]);

    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(`draft_checkup_${opdId}`, JSON.stringify(patientResponses));
        }
    }, [patientResponses, opdId, isLoaded]);

    const saveResponse = (title: string, value: string) => {
        setPatientResponses(prev => ({ ...prev, [title]: value }));
        // Auto-save logic would go here
    };

    const currentQuestions = masterTemplates[selectedVisitId] || [];
    const sections: Record<string, CheckupItemConfig[]> = {};
    currentQuestions.forEach(q => {
        if (!sections[q.section]) sections[q.section] = [];
        sections[q.section].push(q);
    });

    if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

    return (
        <div className={`flex h-full ${CheckupTheme.background}`}>
            {/* --- LEFT SIDEBAR (Timeline) --- */}
            <div className={`w-[100px] flex flex-col border-r ${CheckupTheme.border} ${CheckupTheme.surface}`}>
                <div className="p-2 border-b border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 tracking-widest">STAGES</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {visits.map(visit => {
                        const isSelected = visit.id === selectedVisitId;
                        return (
                            <button
                                key={visit.id}
                                onClick={() => setSelectedVisitId(visit.id)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-3 border-l-[2px] transition-all text-left",
                                    isSelected
                                        ? `border-blue-600 bg-blue-50/50`
                                        : "border-transparent hover:bg-slate-50"
                                )}
                            >
                                <Calendar className={cn("w-3 h-3", isSelected ? "text-blue-600" : "text-slate-400")} />
                                <span className={cn("text-[10px] font-bold", isSelected ? "text-blue-600" : "text-slate-700")}>
                                    {visit.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* --- RIGHT CONTENT --- */}
            <div className="flex-1 overflow-y-auto p-4">
                {currentQuestions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <AlertCircle className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-xs font-medium">No template configured.</p>
                    </div>
                ) : (
                    Object.entries(sections).map(([sectionName, questions]) => (
                        <div key={sectionName} className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-1 h-3 bg-slate-300 rounded-full"></div>
                                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wider">{sectionName}</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {questions.map((q, idx) => (
                                    <QuestionCard
                                        key={idx}
                                        config={q}
                                        value={patientResponses[q.title]}
                                        onChange={(val) => saveResponse(q.title, val)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function QuestionCard({ config, value, onChange }: { config: CheckupItemConfig, value?: string, onChange: (v: string) => void }) {
    const hasValue = !!value;

    return (
        <div className={cn(
            "p-3 rounded-xl border bg-white shadow-sm transition-all",
            hasValue ? "border-blue-200 shadow-blue-50" : "border-slate-200"
        )}>
            <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-700 leading-tight pr-1">{config.title}</p>
                {hasValue && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />}
            </div>

            {config.type === 'text' ? (
                <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[10px] focus:outline-none focus:border-blue-500 transition-colors"
                />
            ) : (
                <div className="flex bg-slate-100 p-0.5 rounded-md">
                    {config.options.map(opt => {
                        const isSelected = value === opt;
                        let activeClass = "bg-blue-600 text-white shadow-sm";

                        if (isSelected) {
                            if (['No', 'Normal', 'Absent', 'Done'].includes(opt)) activeClass = "bg-emerald-500 text-white shadow-sm";
                            else if (['Yes', 'Abnormal', 'Present'].includes(opt)) activeClass = "bg-red-500 text-white shadow-sm";
                        }

                        return (
                            <button
                                key={opt}
                                onClick={() => onChange(opt)}
                                className={cn(
                                    "flex-1 py-1 text-[9px] font-bold rounded transition-all",
                                    isSelected ? activeClass : "text-slate-500 hover:bg-slate-200/50"
                                )}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
