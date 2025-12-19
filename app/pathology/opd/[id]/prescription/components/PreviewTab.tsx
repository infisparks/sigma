"use client"

import React, { useState, useEffect, useRef } from 'react';
import {
    Printer, Save, Settings, ChevronDown, ChevronUp,
    CheckCircle, UserPlus, FileText, X
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

// --- Theme ---
const PreviewTheme = {
    primary: "text-blue-600",
    primaryBg: "bg-blue-600",
    background: "bg-slate-200",
    panel: "bg-white",
    textMain: "text-slate-900",
    textSub: "text-slate-500",
    border: "border-slate-200",
};

import { Patient } from '../types';

// --- Models ---
interface PreviewTabProps {
    opdId: number;
    patient: Patient;
}

export default function PreviewTab({ opdId, patient }: PreviewTabProps) {
    // --- State ---
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Data
    const [reportData, setReportData] = useState<any>({});
    const [clinicalNote, setClinicalNote] = useState("");
    const [followUp, setFollowUp] = useState("");
    const [followUpNote, setFollowUpNote] = useState("");
    const [referDoctor, setReferDoctor] = useState<any>(null);

    // Settings
    const [margins, setMargins] = useState({ top: 50, bottom: 50 });
    const [showMargins, setShowMargins] = useState(false);
    const [toggles, setToggles] = useState<Record<string, boolean>>({
        "Symptoms": true,
        "Medical History": true,
        "Check-Ups": true,
        "Diagnosis": true,
        "Investigation Results": true,
        "Procedures": true,
        "Fitness Plan": true,
        "Clinical Notes": true,
        "Instructions": true,
        "Signature": true,
    });

    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    const [isDoctorDialogOpen, setIsDoctorDialogOpen] = useState(false);

    // --- Load Data ---
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Cloud Data
                const { data: cloudData } = await supabase
                    .from('opd_registration')
                    .select('*')
                    .eq('id', opdId)
                    .single();

                // 2. Load Local Drafts (The "OfflineService" equivalent)
                const drafts = {
                    rx: safeJsonParse(localStorage.getItem(`draft_rx_${opdId}`)),
                    fitness: safeJsonParse(localStorage.getItem(`draft_fitness_${opdId}`)),
                    checkup: safeJsonParse(localStorage.getItem(`draft_checkup_${opdId}`)),
                    symptoms: safeJsonParse(localStorage.getItem(`draft_symptoms_${opdId}`)), // List
                    symptomDetails: safeJsonParse(localStorage.getItem(`draft_symptom_details_${opdId}`)), // Details
                    instructions: safeJsonParse(localStorage.getItem(`draft_instructions_${opdId}`)),
                    medicalHistory: safeJsonParse(localStorage.getItem(`draft_medical_history_${opdId}`)),
                    diagnosisDetails: safeJsonParse(localStorage.getItem(`draft_diagnosis_details_${opdId}`)),
                };

                // Helper to normalize checkup keys (case-insensitive & fuzzy match)
                const normalizeCheckup = (data: any) => {
                    if (!data) return {};
                    const normalized: any = { ...data };
                    const keys = Object.keys(data);

                    keys.forEach(k => {
                        const lower = k.toLowerCase();
                        if (lower.includes('bp') || lower.includes('blood pressure')) normalized.bp = data[k];
                        if (lower.includes('pulse') || lower.includes('heart rate')) normalized.pulse = data[k];
                        if (lower.includes('weight') || lower.includes('wt')) normalized.weight = data[k];
                        if (lower.includes('temp')) normalized.temperature = data[k];
                    });
                    return normalized;
                };

                // 3. Merge Data
                const isFinalized = cloudData?.is_finalized;

                // Helper: Always prioritize draft if available (allows editing finalized records)
                const getData = (draft: any, cloud: any, fallback: any = []) => {
                    return draft || cloud || fallback;
                };

                const cloudCheckup = {
                    bp: cloudData?.bp || cloudData?.checkup_data_json?.bp,
                    pulse: cloudData?.pulse || cloudData?.checkup_data_json?.pulse,
                    weight: cloudData?.weight || cloudData?.checkup_data_json?.weight,
                    temperature: cloudData?.temperature || cloudData?.checkup_data_json?.temperature
                };

                const merged = {
                    ...cloudData,
                    rx_list: getData(drafts.rx, cloudData?.rx_list_json),
                    fitness_list: getData(drafts.fitness, cloudData?.fitness_plan_json),

                    // Checkup: Merge draft with cloud, but ensure cloud values (database) are respected if draft is empty/partial
                    checkup_data: normalizeCheckup({
                        ...cloudCheckup, // Start with cloud data (DB)
                        ...drafts.checkup // Overlay draft changes
                    }),

                    medical_history: getData(drafts.medicalHistory, cloudData?.medical_history_json, {}),

                    // Symptoms
                    symptoms_list: getData(
                        drafts.symptomDetails ? Object.values(drafts.symptomDetails) : null,
                        cloudData?.symptoms_list_json
                    ),

                    // Diagnosis
                    diagnosis_list: getData(
                        drafts.diagnosisDetails ? Object.values(drafts.diagnosisDetails) : null,
                        cloudData?.diagnosis_list_json
                    ),

                    // Instructions & Others
                    instructions_list: getData(drafts.instructions?.instructions, cloudData?.instructions_list_json),
                    investigations_list: getData(drafts.instructions?.investigations, cloudData?.investigations_list_json),
                    procedures_list: getData(drafts.instructions?.procedures, cloudData?.procedures_list_json),
                };

                setReportData(merged);
                setClinicalNote(getData(null, cloudData?.clinical_notes, "")); // Notes usually don't have a separate draft object, they are part of state. 
                // Actually, clinicalNote state is local to PreviewTab, so we initialize it from cloud. 
                // If we wanted to persist unsaved clinical notes across tabs, we'd need a draft for it too. 
                // For now, we'll assume clinical notes are loaded from cloud.

                setFollowUp(cloudData?.follow_up_duration || "");
                setFollowUpNote(cloudData?.follow_up_note || "");
                if (cloudData?.referring_doctor_name) setReferDoctor({ name: cloudData.referring_doctor_name });

                // Load Settings
                const savedSettings = localStorage.getItem('report_settings');
                if (savedSettings) {
                    const s = JSON.parse(savedSettings);
                    if (s.margins) setMargins(s.margins);
                    if (s.toggles) setToggles(s.toggles);
                }

            } catch (e) {
                console.error("Error loading preview data", e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [opdId]);

    const safeJsonParse = (str: string | null) => {
        if (!str) return null;
        try { return JSON.parse(str); } catch { return null; }
    };

    // --- Actions ---
    const saveAndFinalize = async () => {
        setSaving(true);
        try {
            // Prepare Update Payload
            const updatePayload = {
                clinical_notes: clinicalNote,
                follow_up_duration: followUp,
                follow_up_note: followUpNote,
                referring_doctor_name: referDoctor?.name,
                rx_list_json: reportData.rx_list,
                symptoms_list_json: reportData.symptoms_list,
                instructions_list_json: reportData.instructions_list,
                investigations_list_json: reportData.investigations_list,
                procedures_list_json: reportData.procedures_list,
                diagnosis_list_json: reportData.diagnosis_list,

                // New Columns
                fitness_plan_json: reportData.fitness_list,
                checkup_data_json: reportData.checkup_data,
                medical_history_json: reportData.medical_history,

                clinical_data: {
                    ...reportData.clinical_data,
                    print_settings: toggles,
                    margins: margins
                },
                is_finalized: true,
                finalized_at: new Date().toISOString(),
            };

            await supabase.from('opd_registration').update(updatePayload).eq('id', opdId);

            // Save Settings Globally
            localStorage.setItem('report_settings', JSON.stringify({ margins, toggles }));

            // Clear Local Drafts
            localStorage.removeItem(`draft_rx_${opdId}`);
            localStorage.removeItem(`draft_symptoms_${opdId}`);
            localStorage.removeItem(`draft_symptom_details_${opdId}`);
            localStorage.removeItem(`draft_medical_history_${opdId}`);
            localStorage.removeItem(`draft_checkup_${opdId}`);
            localStorage.removeItem(`draft_fitness_${opdId}`);
            localStorage.removeItem(`draft_instructions_${opdId}`);
            localStorage.removeItem(`draft_diagnosis_details_${opdId}`);
            localStorage.removeItem(`draft_diagnosis_${opdId}`);

            alert("Saved & Finalized Successfully!");
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("Error saving data.");
        } finally {
            setSaving(false);
        }
    };

    // --- Render Helpers ---
    const renderSection = (title: string, content: React.ReactNode) => (
        <div className="mb-1.5 flex items-start text-[11px]">
            <div className="w-[100px] shrink-0 font-black text-slate-900 uppercase tracking-wide pt-0.5">{title}</div>
            <div className="flex-1 text-slate-800 leading-tight">{content}</div>
        </div>
    );

    if (loading) return <div className="flex items-center justify-center h-full">Generating Preview...</div>;

    return (
        <div className="flex h-full bg-slate-200">
            {/* --- LEFT SIDEBAR (Controls) --- */}
            <div className="w-[260px] flex flex-col bg-white border-r border-slate-200">
                <div className="p-3 border-b border-slate-100 flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><Settings className="w-3.5 h-3.5" /></div>
                    <span className="font-black text-[11px] uppercase tracking-wider text-slate-900">Report Settings</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {/* Main Action */}
                    <Button
                        onClick={saveAndFinalize}
                        disabled={saving}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] uppercase tracking-widest py-5"
                    >
                        {saving ? "Saving..." : "Save & Finalize"}
                    </Button>

                    <div className="h-px bg-slate-100" />

                    {/* Margins */}
                    <div>
                        <div
                            className="flex items-center justify-between cursor-pointer mb-1.5"
                            onClick={() => setShowMargins(!showMargins)}
                        >
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Page Margins</span>
                            {showMargins ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                        </div>

                        {showMargins && (
                            <div className="space-y-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold mb-1"><span>Top</span><span>{margins.top}px</span></div>
                                    <Slider value={[margins.top]} max={200} step={5} onValueChange={(v) => setMargins(prev => ({ ...prev, top: v[0] }))} />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold mb-1"><span>Bottom</span><span>{margins.bottom}px</span></div>
                                    <Slider value={[margins.bottom]} max={200} step={5} onValueChange={(v) => setMargins(prev => ({ ...prev, bottom: v[0] }))} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-slate-100" />

                    {/* Follow Up */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Follow Up</span>
                            {followUp && <button onClick={() => setFollowUp("")} className="text-[9px] text-red-500 font-black uppercase">Reset</button>}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {["3d", "5d", "1w", "2w", "1m", "3m"].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setFollowUp(d)}
                                    className={cn(
                                        "w-9 h-7 rounded text-[10px] font-black border transition-all",
                                        followUp === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200"
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                        {followUp && (
                            <input
                                type="text"
                                value={followUpNote}
                                onChange={(e) => setFollowUpNote(e.target.value)}
                                placeholder="Note..."
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] font-medium"
                            />
                        )}
                    </div>

                    <div className="h-px bg-slate-100" />

                    {/* Clinical Note */}
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Clinical Note</span>
                        <textarea
                            value={clinicalNote}
                            onChange={(e) => setClinicalNote(e.target.value)}
                            placeholder="Internal remarks..."
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-medium h-20 resize-none focus:outline-none focus:border-blue-300"
                        />
                    </div>

                    <div className="h-px bg-slate-100" />

                    {/* Actions */}
                    <div className="space-y-1.5">
                        <button
                            onClick={() => setIsDoctorDialogOpen(true)}
                            className="w-full flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                            <div className="flex items-center gap-2.5">
                                <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                                <div className="text-left">
                                    <div className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Refer Patient</div>
                                    {referDoctor && <div className="text-[9px] text-blue-600 font-bold">Dr. {referDoctor.name}</div>}
                                </div>
                            </div>
                            {referDoctor ? <X className="w-3.5 h-3.5 text-red-400" onClick={(e) => { e.stopPropagation(); setReferDoctor(null); }} /> : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />}
                        </button>

                        <button
                            onClick={() => setIsPrintDialogOpen(true)}
                            className="w-full flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                            <div className="flex items-center gap-2.5">
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Print Sections</span>
                            </div>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                        </button>
                    </div>
                </div>
            </div>

            {/* --- RIGHT PANEL (Preview) --- */}
            <div className="flex-1 overflow-auto p-4 flex justify-center">
                <div
                    className="bg-white shadow-2xl transition-all origin-top"
                    style={{
                        width: '794px', // A4 Width
                        minHeight: '1123px', // A4 Height
                        paddingTop: `${margins.top}px`,
                        paddingBottom: `${margins.bottom}px`,
                        paddingLeft: '45px',
                        paddingRight: '45px',
                        transform: 'scale(0.7)',
                    }}
                >
                    {/* Header */}
                    <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-200">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">{patient.name}</h1>
                            <p className="text-xs text-slate-600 mt-1">{patient.age} {patient.age_unit} / {patient.gender} | PID: {patient.uhid}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-black text-slate-900">OPD ID: #{opdId}</p>
                            <p className="text-xs text-slate-600 mt-1">{new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    {/* 0. Vitals (Checkups) - ALWAYS ON TOP */}
                    <div className="mb-6 border-b border-slate-200 pb-4">
                        <div className="text-[11px] font-black text-slate-900 mb-2">VITALS</div>
                        <div className="flex flex-wrap gap-4 text-[11px] font-bold text-slate-800">
                            {[
                                reportData.checkup_data?.bp && `BP: ${reportData.checkup_data.bp}`,
                                reportData.checkup_data?.pulse && `Pulse: ${reportData.checkup_data.pulse} bpm`,
                                reportData.checkup_data?.weight && `Weight: ${reportData.checkup_data.weight} kg`,
                                reportData.checkup_data?.temperature && `Temp: ${reportData.checkup_data.temperature}°F`,
                            ].filter(Boolean).map((v, i) => (
                                <div key={i} className="bg-slate-100 px-2 py-1 rounded">{v}</div>
                            ))}
                            {/* Fallback if checkup_data is empty but cloudData has values (legacy support) */}
                            {(!reportData.checkup_data || Object.keys(reportData.checkup_data).length === 0) && (
                                <>
                                    {reportData.bp && <div className="bg-slate-100 px-2 py-1 rounded">BP: {reportData.bp}</div>}
                                    {reportData.pulse && <div className="bg-slate-100 px-2 py-1 rounded">Pulse: {reportData.pulse} bpm</div>}
                                    {reportData.weight && <div className="bg-slate-100 px-2 py-1 rounded">Weight: {reportData.weight} kg</div>}
                                </>
                            )}

                            {/* Show "No vitals" only if absolutely nothing is found */}
                            {![
                                reportData.checkup_data?.bp, reportData.checkup_data?.pulse, reportData.checkup_data?.weight, reportData.checkup_data?.temperature,
                                reportData.bp, reportData.pulse, reportData.weight
                            ].some(Boolean) && (
                                    <span className="text-slate-400 italic font-normal">No vitals recorded.</span>
                                )}
                        </div>
                    </div>

                    {/* 1. Medical History */}
                    {toggles["Medical History"] && reportData.medical_history && (
                        <div className="mb-6">
                            <div className="text-[11px] font-black text-slate-900 mb-1">MEDICAL HISTORY</div>
                            <div className="text-[10px] text-slate-700 space-y-1">
                                {reportData.medical_history.problems?.filter((p: any) => p.isSelected).length > 0 && (
                                    <div><span className="font-bold">Problems:</span> {reportData.medical_history.problems.filter((p: any) => p.isSelected).map((p: any) => p.name).join(", ")}</div>
                                )}
                                {reportData.medical_history.allergies?.filter((p: any) => p.isSelected).length > 0 && (
                                    <div><span className="font-bold">Allergies:</span> {reportData.medical_history.allergies.filter((p: any) => p.isSelected).map((p: any) => p.name).join(", ")}</div>
                                )}
                                {reportData.medical_history.familyHistory?.filter((p: any) => p.isSelected).length > 0 && (
                                    <div><span className="font-bold">Family:</span> {reportData.medical_history.familyHistory.filter((p: any) => p.isSelected).map((p: any) => p.name).join(", ")}</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 2. Diagnosis - Detailed */}
                    {toggles["Diagnosis"] && reportData.diagnosis_list?.length > 0 &&
                        renderSection("Diagnosis", (
                            <div className="space-y-0">
                                {reportData.diagnosis_list.map((d: any, idx: number) => {
                                    const details = [];
                                    if (d.status && d.status !== 'Suspected') details.push(d.status);
                                    if (d.location) details.push(`Loc: ${d.location}`);
                                    if (d.note) details.push(`Note: ${d.note}`);

                                    // Custom Options / History
                                    if (d.selectedCustomOptions && d.selectedCustomOptions.length > 0) {
                                        details.push(`History: ${d.selectedCustomOptions.join(', ')}`);
                                    }

                                    return (
                                        <div key={idx}>
                                            <span className="font-bold text-slate-900">{d.name}</span>
                                            {details.length > 0 && (
                                                <span className="text-slate-600 ml-1">
                                                    — {details.join(' | ')}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    }

                    {/* 3. Medicine Table */}
                    {reportData.rx_list?.length > 0 && (
                        <div className="mb-6">
                            <table className="w-full border-collapse border border-slate-300 text-[11px]">
                                <thead>
                                    <tr className="bg-slate-100">
                                        <th className="border border-slate-300 p-1.5 text-left w-8">#</th>
                                        <th className="border border-slate-300 p-1.5 text-left">Medicine</th>
                                        <th className="border border-slate-300 p-1.5 text-left w-20">Freq</th>
                                        <th className="border border-slate-300 p-1.5 text-left w-16">Dur</th>
                                        <th className="border border-slate-300 p-1.5 text-left w-1/3">Instr</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.rx_list.map((rx: any, i: number) => {
                                        const t = rx.timing || {};
                                        const freq = `${(t.bb || t.ab) ? 1 : 0}-${(t.bl || t.al) ? 1 : 0}-${(t.bd || t.ad) ? 1 : 0}`;
                                        return (
                                            <tr key={i}>
                                                <td className="border border-slate-300 p-1.5 text-center">{i + 1}</td>
                                                <td className="border border-slate-300 p-1.5 font-bold">{rx.name} <span className="font-normal text-slate-500">{rx.dosage}</span></td>
                                                <td className="border border-slate-300 p-1.5 font-bold">{freq}</td>
                                                <td className="border border-slate-300 p-1.5">{rx.duration}</td>
                                                <td className="border border-slate-300 p-1.5 text-slate-600">{rx.note}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* 4. Symptoms */}
                    {toggles["Symptoms"] && reportData.symptoms_list?.length > 0 &&
                        renderSection("Complaints", reportData.symptoms_list.map((s: any) => {
                            const d = [s.severity, s.duration].filter(Boolean).join(", ");
                            return `${s.name}${d ? ` (${d})` : ''}`;
                        }).join(", "))
                    }
                    {toggles["Instructions"] && reportData.instructions_list?.length > 0 &&
                        renderSection("Advice", reportData.instructions_list.join("\n"))
                    }

                    {toggles["Investigation Results"] && reportData.investigations_list?.length > 0 &&
                        renderSection("Investigation", reportData.investigations_list.join(", "))
                    }

                    {toggles["Procedures"] && reportData.procedures_list?.length > 0 &&
                        renderSection("Procedures", reportData.procedures_list.join(", "))
                    }

                    {/* Fitness Plans */}
                    {toggles["Fitness Plan"] && reportData.fitness_list?.map((plan: any, i: number) => {
                        if (!plan.isAssigned) return null;
                        const isDiet = plan.type === 'diet';
                        return (
                            <div key={i} className="mb-6">
                                <div className="flex items-center gap-2 border-b border-slate-300 pb-1 mb-2">
                                    <span className="text-[11px] font-black text-slate-900 uppercase">{plan.title}</span>
                                </div>
                                <table className="w-full border-collapse border border-slate-300 text-[10px]">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            {isDiet ? (
                                                <>
                                                    <th className="border border-slate-300 p-1.5 text-left w-1/4">TIME SLOT</th>
                                                    <th className="border border-slate-300 p-1.5 text-left">RECOMMENDED MENU</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="border border-slate-300 p-1.5 text-left w-1/3">ACTIVITY</th>
                                                    <th className="border border-slate-300 p-1.5 text-left w-20">DURATION</th>
                                                    <th className="border border-slate-300 p-1.5 text-left">NOTES</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(isDiet ? plan.dietEntries : plan.exerciseEntries)?.map((e: any, idx: number) => (
                                            <tr key={idx}>
                                                {isDiet ? (
                                                    <>
                                                        <td className="border border-slate-300 p-1.5 font-bold">{e.timeSlot}</td>
                                                        <td className="border border-slate-300 p-1.5">{e.description}</td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="border border-slate-300 p-1.5 font-bold">{e.activity}</td>
                                                        <td className="border border-slate-300 p-1.5">{e.durationMinutes} mins</td>
                                                        <td className="border border-slate-300 p-1.5">{e.note || '-'}</td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}

                    {toggles["Clinical Notes"] && clinicalNote &&
                        renderSection("Remarks", clinicalNote)
                    }

                    {/* Footer */}
                    {(followUp || referDoctor) && (
                        <div className="mt-8 border border-slate-200 rounded p-3 flex justify-between items-center">
                            {followUp && <div className="text-xs font-bold text-blue-600">Next Review: After {followUp}</div>}
                            {referDoctor && <div className="text-xs italic text-slate-600">Ref: Dr. {referDoctor.name}</div>}
                        </div>
                    )}

                    {toggles["Signature"] && (
                        <div className="mt-12 text-right">
                            <div className="inline-block text-center">
                                <div className="h-10 w-32 border-b border-slate-400 mb-1"></div>
                                <div className="text-[10px] text-slate-500">Authorized Signature</div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* --- Dialogs --- */}
            <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Print Sections</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        {Object.keys(toggles).map(key => (
                            <div key={key} className="flex items-center space-x-2">
                                <Checkbox
                                    id={key}
                                    checked={toggles[key]}
                                    onCheckedChange={(c) => setToggles(prev => ({ ...prev, [key]: !!c }))}
                                />
                                <label htmlFor={key} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {key}
                                </label>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isDoctorDialogOpen} onOpenChange={setIsDoctorDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Refer Doctor</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <input
                            className="w-full border p-2 rounded"
                            placeholder="Doctor Name"
                            onChange={(e) => setReferDoctor({ name: e.target.value })}
                        />
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setIsDoctorDialogOpen(false)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
