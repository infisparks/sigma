"use client"

import React, { useState, useEffect, useRef } from 'react';
import {
    Printer, Save, Settings, ChevronDown, ChevronUp,
    CheckCircle, UserPlus, FileText, X, Search
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { usePrescription } from "../context/PrescriptionContext";
import { toast } from "sonner";

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
    // --- Context ---
    const {
        medicines, symptoms, diagnoses,
        instructions, investigations, procedures,
        clinicalNote, setClinicalNote,
        followUpDuration, setFollowUp,
        followUpNote, vitals,
        referringDoctor, setReferringDoctor,
        saveAndFinalize: contextSaveAndFinalize,
        isLoading, isSaving
    } = usePrescription();

    // --- State ---
    const [doctorList, setDoctorList] = useState<any[]>([]);

    // Settings
    const [margins, setMargins] = useState({ top: 50, bottom: 50 });
    const [showMargins, setShowMargins] = useState(false);
    const [toggles, setToggles] = useState<Record<string, boolean>>({
        "Symptoms": true,
        "Medical History": true,
        "Diagnosis": true,
        "Investigation Results": true,
        "Procedures": true,
        "Clinical Notes": true,
        "Instructions": true,
        "Signature": true,
    });

    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    const [referSearch, setReferSearch] = useState("");
    const [isDoctorDialogOpen, setIsDoctorDialogOpen] = useState(false);

    // --- Load Supplementary Data (Settings & Doctors) ---
    useEffect(() => {
        const loadSupplementary = async () => {
            try {
                const { data } = await supabase
                    .from('opd_datasets')
                    .select('dataname, datajson')
                    .in('dataname', ['report_settings', 'refer_doctors']);

                if (data) {
                    data.forEach((d: any) => {
                        let json = d.datajson;
                        // if (typeof json === 'string') try { json = JSON.parse(json); } catch {} // supabase usually returns json implicitly

                        if (d.dataname === 'report_settings' && json) {
                            if (json.margin_top !== undefined) setMargins(prev => ({ ...prev, top: json.margin_top }));
                            if (json.margin_bottom !== undefined) setMargins(prev => ({ ...prev, bottom: json.margin_bottom }));
                            if (json.toggles) setToggles(json.toggles);
                        } else if (d.dataname === 'refer_doctors') {
                            if (Array.isArray(json)) setDoctorList(json);
                        }
                    });
                }
            } catch (e) {
                console.error("Error loading settings", e);
            }
        };
        loadSupplementary();
    }, []);

    // --- Actions ---
    const handleSaveAndFinalize = async () => {
        try {
            // 1. Save Global Settings
            const settingsPayload = {
                toggles,
                margin_top: margins.top,
                margin_bottom: margins.bottom
            };

            // Background settings save - don't let it block principal save
            supabase
                .from('opd_datasets')
                .update({ datajson: settingsPayload, updated_at: new Date().toISOString() })
                .eq('dataname', 'report_settings')
                .then(({ error }) => { if (error) console.error("Settings save error", error) });

            // 2. Finalize Context
            await contextSaveAndFinalize();

            toast.success("Prescription Finalized & Saved!");
        } catch (e) {
            console.error("Save failed", e);
            toast.error("Failed to finalize. Please check your connection.");
        }
    };

    // --- Computed Data Lists ---
    const symptomsList = Object.values(symptoms);
    const diagnosisList = Object.values(diagnoses);

    // --- Render Helpers ---
    const renderSection = (title: string, content: React.ReactNode) => (
        <div className="mb-3 flex items-start text-[11.5px]">
            <div className="shrink-0 font-semibold text-slate-900 pr-2">{title}:</div>
            <div className="flex-1 text-slate-800 leading-tight font-medium">{content}</div>
        </div>
    );

    const formatDuration = (val: string) => {
        if (!val) return "";
        let formatted = val.toLowerCase().trim();

        // Shorthand handling (e.g. 5d, 1w)
        const count = (formatted.match(/\d+/) || ["1"])[0];
        const n = parseInt(count);
        if (formatted.endsWith('d') || /^\d+$/.test(formatted)) return `${count} Day${n > 1 ? 's' : ''}`;
        if (formatted.endsWith('w')) return `${count} Week${n > 1 ? 's' : ''}`;
        if (formatted.endsWith('m')) return `${count} Month${n > 1 ? 's' : ''}`;
        if (formatted.endsWith('y')) return `${count} Year${n > 1 ? 's' : ''}`;
        if (formatted.endsWith('h')) return `${count} Hour${n > 1 ? 's' : ''}`;

        return val;
    };

    const getTimingNote = (t: any) => {
        if (!t) return "";
        const parts = [];
        if (t.bb) parts.push("Before Breakfast");
        if (t.ab) parts.push("After Breakfast");
        if (t.bl) parts.push("Before Lunch");
        if (t.al) parts.push("After Lunch");
        if (t.bd) parts.push("Before Dinner");
        if (t.ad) parts.push("After Dinner");
        return parts.join(", ");
    };

    const getDoseValue = (dosage: string) => {
        if (!dosage) return "1";
        const clean = dosage.toLowerCase();

        // Map common keywords and symbols to fractions
        if (clean.includes('half') || clean.includes('½')) return "1/2";
        if (clean.includes('quarter') || clean.includes('¼')) return "1/4";

        // Extract numeric part or short fraction (e.g., "1/2", "1.5", "2")
        const match = dosage.match(/(\d+\/\d+|\d+\.\d+|\d+)/);
        return match ? match[0] : dosage;
    };

    if (isLoading) return <div className="flex items-center justify-center h-full">Generating Preview...</div>;

    return (
        <div className="flex h-full bg-slate-200">
            {/* --- LEFT SIDEBAR (Controls) --- */}
            <div className="w-[260px] flex flex-col bg-white border-r border-slate-200 no-print">
                <div className="p-3 border-b border-slate-100 flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600"><Settings className="w-3.5 h-3.5" /></div>
                    <span className="font-black text-[11px] uppercase tracking-wider text-slate-900">Report Settings</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {/* Main Action */}
                    <div className="space-y-2">
                        <Button
                            onClick={handleSaveAndFinalize}
                            disabled={isSaving}
                            className="w-full font-black text-[11px] uppercase tracking-widest py-6 shadow-lg transition-all bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isSaving ? "Finalizing..." : "Save & Finalize"}
                        </Button>
                    </div>

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
                            {followUpDuration && <button onClick={() => setFollowUp("", "")} className="text-[9px] text-red-500 font-black uppercase">Reset</button>}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {["3d", "5d", "1w", "2w", "1m", "3m"].map(d => {
                                const label = d.replace('d', ' Days').replace('w', ' Weeks').replace('m', ' Months');
                                return (
                                    <button
                                        key={d}
                                        onClick={() => setFollowUp(d, followUpNote)}
                                        className={cn(
                                            "px-2 h-7 rounded text-[9px] font-black border transition-all whitespace-nowrap",
                                            followUpDuration === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200"
                                        )}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        {followUpDuration && (
                            <input
                                type="text"
                                value={followUpNote}
                                onChange={(e) => setFollowUp(followUpDuration, e.target.value)}
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
                                    {referringDoctor && <div className="text-[9px] text-blue-600 font-bold">Dr. {referringDoctor}</div>}
                                </div>
                            </div>
                            {referringDoctor ? <X className="w-3.5 h-3.5 text-red-400" onClick={(e) => { e.stopPropagation(); setReferringDoctor(""); }} /> : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />}
                        </button>

                        <button
                            onClick={() => window.print()}
                            className="w-full flex items-center justify-between p-2.5 bg-blue-600 border border-blue-700 rounded-lg hover:bg-blue-700 text-white shadow-sm mb-1.5"
                        >
                            <div className="flex items-center gap-2.5">
                                <Printer className="w-3.5 h-3.5 text-white" />
                                <span className="text-[10px] font-black uppercase tracking-wider">Print PDF</span>
                            </div>
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
                    id="print-area"
                    className="bg-white shadow-2xl transition-all origin-top"
                    style={{
                        width: '794px', // A4 Width
                        height: '1122px', // A4 Height (safely within limit)
                        paddingTop: `${margins.top}px`,
                        paddingBottom: `${margins.bottom}px`,
                        paddingLeft: '45px',
                        paddingRight: '45px',
                        transform: 'scale(0.7)',
                        fontFamily: 'var(--font-poppins), sans-serif',
                    }}
                >
                    {/* Header */}
                    <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-200">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{patient.name}</h1>
                            <p className="text-xs text-slate-600 mt-1 font-medium">{patient.age} {patient.age_unit} / {patient.gender} | PID: {patient.uhid}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">OPD ID: #{opdId}</p>
                            <p className="text-xs text-slate-600 mt-1 font-medium">{new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    {/* Clinical Sections */}
                    {/* 1. Vitals */}
                    {(vitals.bp || vitals.pulse || vitals.temp || vitals.weight || vitals.spo2 || vitals.sugar) && (
                        renderSection("Vitals", (
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {vitals.weight && <span className="font-medium">Weight: {vitals.weight} kg</span>}
                                {vitals.bp && <span className="font-medium">BP: {vitals.bp} mmHg</span>}
                                {vitals.pulse && <span className="font-medium">Pulse: {vitals.pulse} bpm</span>}
                                {vitals.temp && <span className="font-medium">Temp: {vitals.temp} °F</span>}
                                {vitals.spo2 && <span className="font-medium">SpO2: {vitals.spo2} %</span>}
                                {vitals.sugar && <span className="font-medium">Sugar (R): {vitals.sugar} mg/dL</span>}
                            </div>
                        ))
                    )}

                    {/* 2. Symptoms */}
                    {toggles["Symptoms"] && symptomsList.length > 0 &&
                        renderSection("Symptoms", symptomsList.map(s => {
                            const details = [s.severity, s.duration].filter(Boolean);
                            if (s.note) details.push(`Note: ${s.note}`);
                            const ds = details.join(", ");
                            return `${s.name}${ds ? ` (${ds})` : ''}`;
                        }).join(", "))
                    }

                    {/* 3. Diagnosis */}
                    {toggles["Diagnosis"] && diagnosisList.length > 0 &&
                        renderSection("Diagnosis", (
                            <div className="space-y-0.5">
                                {diagnosisList.map((d, idx) => {
                                    const details = [];
                                    if (d.status && d.status !== 'Suspected') details.push(d.status);
                                    if (d.location) details.push(`Loc: ${d.location}`);
                                    if (d.note) details.push(`Note: ${d.note}`);
                                    if (d.selectedCustomOptions && d.selectedCustomOptions.length > 0) {
                                        details.push(`History: ${d.selectedCustomOptions.join(', ')}`);
                                    }

                                    return (
                                        <div key={idx}>
                                            <span className="font-semibold text-slate-900">{d.name}</span>
                                            {details.length > 0 && (
                                                <span className="text-slate-600 ml-1">
                                                    ({details.join(' | ')})
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    }

                    {/* 4. Medicine Table */}
                    {medicines.length > 0 && (
                        <div className="mb-6 mt-4">
                            <table className="w-full border-collapse border border-slate-300 text-[11.5px]">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="border border-slate-300 p-2 text-left w-10 font-bold uppercase text-[9px] text-slate-500">Rx</th>
                                        <th className="border border-slate-300 p-2 text-left font-bold uppercase text-[9px] text-slate-500">Name</th>
                                        <th className="border border-slate-300 p-2 text-center w-24 font-bold uppercase text-[9px] text-slate-500">Frequency</th>
                                        <th className="border border-slate-300 p-2 text-left w-24 font-bold uppercase text-[9px] text-slate-500">Duration</th>
                                        <th className="border border-slate-300 p-2 text-left font-bold uppercase text-[9px] text-slate-500">Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {medicines.map((rx, i) => {
                                        const t = rx.timing || {};
                                        const dv = getDoseValue(rx.dosage);
                                        const timingNote = getTimingNote(rx.timing);
                                        return (
                                            <tr key={i}>
                                                <td className="border border-slate-300 p-2 text-center">{i + 1}</td>
                                                <td className="border border-slate-300 p-2">
                                                    <span className="text-slate-500 text-[9px] font-bold uppercase mr-1">{rx.type}</span> 
                                                    <span className="font-bold text-slate-900 text-[13px]">{rx.name}</span>
                                                    {rx.unit && <span className="ml-1 text-[11px] font-medium text-slate-500">({rx.unit})</span>}
                                                </td>
                                                <td className="border border-slate-300 p-2 text-center font-bold text-slate-800">
                                                    {`${(t.bb || t.ab) ? dv : 0} - ${(t.bl || t.al) ? dv : 0} - ${(t.bd || t.ad) ? dv : 0}`}
                                                </td>
                                                <td className="border border-slate-300 p-2 font-bold">{formatDuration(rx.duration)}</td>
                                                <td className="border border-slate-300 p-2 text-slate-700">
                                                    {timingNote && <div className="font-semibold mb-0.5 text-slate-900 text-[10px]">{timingNote}</div>}
                                                    {rx.note && <div className="text-[9px] font-medium text-slate-500 italic">{rx.note}</div>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* 5. Instructions & Other sections */}
                    {toggles["Instructions"] && instructions.length > 0 &&
                        renderSection("Instructions", instructions.join("\n"))
                    }

                    {toggles["Investigation Results"] && investigations.length > 0 &&
                        renderSection("Investigation", investigations.join(", "))
                    }

                    {toggles["Procedures"] && procedures.length > 0 &&
                        renderSection("Procedures", procedures.join(", "))
                    }

                    {toggles["Clinical Notes"] && clinicalNote &&
                        renderSection("Remarks", clinicalNote)
                    }

                    {/* Footer */}
                    {(followUpDuration || referringDoctor) && (
                        <div className="mt-8 border-t border-slate-200 pt-3 flex justify-between items-center">
                            {followUpDuration && <div className="text-xs font-bold text-slate-900 uppercase">Next Review: After {formatDuration(followUpDuration)} {followUpNote && `(${followUpNote})`}</div>}
                            {referringDoctor && <div className="text-xs italic text-slate-600">Ref: Dr. {referringDoctor}</div>}
                        </div>
                    )}

                    {/* Signature */}
                    {toggles["Signature"] && (
                        <div className="mt-12 text-right">
                            <div className="inline-block text-center mr-8">
                                <div className="h-10 w-32 border-b border-slate-400 mb-1"></div>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Authorized Signature</div>
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
                    <div className="py-4 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                className="w-full border border-slate-200 pl-8 pr-2 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                placeholder="Search doctor..."
                                value={referSearch}
                                onChange={(e) => setReferSearch(e.target.value)}
                            />
                        </div>

                        <div className="max-h-[200px] overflow-y-auto space-y-1">
                            {doctorList
                                .filter(d => d.name.toLowerCase().includes(referSearch.toLowerCase()))
                                .map((d: any) => (
                                    <button
                                        key={d.id}
                                        onClick={() => {
                                            setReferringDoctor(d.name);
                                            setIsDoctorDialogOpen(false);
                                            setReferSearch("");
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
                                    >
                                        <div className="font-bold">Dr. {d.name}</div>
                                        {d.phone && <div className="text-xs text-slate-500">{d.phone}</div>}
                                    </button>
                                ))
                            }
                            {doctorList.length === 0 && (
                                <div className="text-center py-4 text-xs text-slate-400">No doctors found.</div>
                            )}
                        </div>

                        {referSearch && (
                            <div className="pt-2 border-t border-slate-100">
                                <button
                                    onClick={() => {
                                        setReferringDoctor(referSearch);
                                        setIsDoctorDialogOpen(false);
                                        setReferSearch("");
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-blue-600 font-bold hover:bg-blue-50 rounded-md"
                                >
                                    Use "{referSearch}"
                                </button>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDoctorDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* --- Print Styles --- */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 0mm;
                    }
                    
                    html, body {
                        height: 297mm !important;
                        overflow: hidden !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    body * {
                        visibility: hidden !important;
                    }

                    .no-print {
                        display: none !important;
                    }

                    #print-area {
                        visibility: visible !important;
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        margin: 0 !important;
                        padding-top: ${margins.top}px !important;
                        padding-bottom: ${margins.bottom}px !important;
                        padding-left: 45px !important;
                        padding-right: 45px !important;
                        transform: none !important;
                        box-shadow: none !important;
                        border: none !important;
                        background: white !important;
                        overflow: hidden !important;
                        display: block !important;
                        z-index: 99999 !important;
                        font-family: var(--font-poppins), sans-serif !important;
                    }

                    #print-area * {
                        visibility: visible !important;
                    }

                    /* Ensure background colors print */
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
            `}</style>
        </div>
    );
}
