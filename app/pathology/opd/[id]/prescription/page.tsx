"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase";
import {
    ArrowLeft, Monitor, FileText, History, StickyNote,
    CheckCircle, Search, Check, List, Activity,
    FileOutput, Heart, Printer, Power, User, Stethoscope, FlaskConical, Code,
    Camera, Upload, Loader2, Sparkles, AlertCircle, Trash2, Save,
    ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from "@/lib/utils";

// --- Imports ---

import InstructionsTab from './components/InstructionsTab';
import SymptomsTab from './components/SymptomsTab';
import TreatmentTab from './components/TreatmentTab';
import PreviewTab from './components/PreviewTab';
import PreviousVisitsTab from './components/PreviousVisitsTab';
import DiagnosisTab from './components/DiagnosisTab';
import BloodTestTab from './components/BloodTestTab';
import PatientVitalsTrend from './components/PatientVitalsTrend';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Patient, OPDRecord } from './types';
import { ModernTheme } from './theme';
import { PrescriptionProvider, usePrescription } from './context/PrescriptionContext';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function PrescriptionPage() {
    const params = useParams();
    const router = useRouter();
    const opdId = Number(params.id);

    const [record, setRecord] = useState<OPDRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentTabIndex, setCurrentTabIndex] = useState(3); // Default to Symptoms
    const [showVitalsDialog, setShowVitalsDialog] = useState(false);

    // --- Fetch Data ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch Patient/OPD Record
                const { data: opdData, error: opdError } = await supabase
                    .from('opd_registration')
                    .select(`
            id,
            patient_detail (name, age, age_unit, gender, uhid)
          `)
                    .eq('id', opdId)
                    .single();

                if (opdError) throw opdError;
                setRecord(opdData as any);

            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [opdId]);

    // --- Main Content Switch ---
    const renderContent = () => {
        if (!record) return null;

        switch (currentTabIndex) {

            case 2: return <InstructionsTab opdId={opdId} />;
            case 3: return <SymptomsTab opdId={opdId} />;
            case 4: return <TreatmentTab opdId={opdId} patientId={record!.patient_detail.uhid} />;
            case 5: return <PreviewTab opdId={opdId} patient={record!.patient_detail} />;
            case 6: return <PreviousVisitsTab currentOpdId={opdId} patientUhid={record!.patient_detail.uhid} />;
            case 7: return <DiagnosisTab opdId={opdId} />;
            case 8: return <BloodTestTab opdId={opdId} patientUhid={record!.patient_detail.uhid} />;
            case 9: return (
                <div className="flex-1 p-4 bg-slate-100 overflow-auto flex items-start justify-center">
                    <div className="w-full max-w-5xl">
                        <PatientVitalsTrend patientUhid={record!.patient_detail.uhid} />
                    </div>
                </div>
            );
            default: return <div className="flex items-center justify-center h-full text-slate-400">Select a tab</div>;
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Loading...</div>;
    if (!record) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Record not found</div>;

    return (
        <PrescriptionProvider opdId={opdId}>
            {/* App Container - Fixed Viewport, No Overscroll, No Text Selection by default on UI */}
            <div className={`fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none select-none touch-pan-x touch-pan-y ${ModernTheme.background}`}>

                {/* --- APP BAR --- */}
                <header className={cn(ModernTheme.surface, "border-b border-slate-200 px-2 sm:px-3 py-1.5 flex items-center justify-between sticky top-0 z-50 shrink-0 select-none no-print")}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <button onClick={() => router.back()} className="p-1.5 hover:bg-slate-100 rounded-full shrink-0">
                            <ArrowLeft className="w-4 h-4 text-slate-900" />
                        </button>
                        <div className="hidden sm:block bg-blue-50 px-2 py-1 rounded-md shrink-0">
                            <span className="text-blue-600 font-bold text-[11px]">Trivandrum OPD</span>
                        </div>
                        {/* Mobile Patient Header Details */}
                        <div className="flex flex-col min-w-0 md:hidden">
                            <span className="text-xs font-bold text-slate-900 truncate max-w-[120px] xs:max-w-[160px]">
                                {record.patient_detail.name}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate">
                                {record.patient_detail.age} {record.patient_detail.age_unit} • {record.patient_detail.gender === 'male' ? 'M' : 'F'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <PrescriptionControls onTabChange={setCurrentTabIndex} />
                    </div>
                </header>

                {/* --- BODY --- */}
                <main className="flex-1 flex flex-col overflow-hidden relative select-text">
                    {renderContent()}
                </main>

                {/* --- BOTTOM DOCK --- */}
                <div className="px-1.5 sm:px-3 py-1.5 sm:py-2 bg-slate-100 z-50 select-none no-print border-t border-slate-200">
                    <div className="bg-white rounded-xl shadow-md border border-slate-100 h-[52px] sm:h-[55px] flex items-center overflow-hidden">
                        {/* Exit Button */}
                        <button onClick={() => router.back()} className="w-[40px] sm:w-[50px] h-full bg-red-50 hover:bg-red-100 flex items-center justify-center border-r border-slate-100 shrink-0" title="Exit">
                            <Power className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                        </button>

                        {/* Patient Context (Desktop Only, shown in Header on Mobile) */}
                        <div className="hidden md:flex w-[140px] px-3 border-r border-slate-100 flex-col justify-center h-full shrink-0">
                            <p className="font-bold text-[11px] text-slate-900 truncate leading-tight">{record.patient_detail.name}</p>
                            <div className="flex items-center gap-1 text-slate-500 text-[9px] mt-0.5">
                                <User className="w-2.5 h-2.5" />
                                <span>{record.patient_detail.age} {record.patient_detail.age_unit} • {record.patient_detail.gender === 'male' ? 'M' : 'F'}</span>
                            </div>
                        </div>

                        {/* Navigation Items (Fluid and responsive on all devices) */}
                        <div className="flex-1 flex items-center justify-around px-0.5 sm:px-1">
                            <DockItem icon={Activity} label="Vitals" isActive={currentTabIndex === 9} onClick={() => setCurrentTabIndex(9)} />
                            <DockItem icon={Heart} label="Symptoms" isActive={currentTabIndex === 3} onClick={() => setCurrentTabIndex(3)} />
                            <DockItem icon={Stethoscope} label="Diagnosis" isActive={currentTabIndex === 7} onClick={() => setCurrentTabIndex(7)} isHighlighted />
                            <DockItem icon={FileOutput} label="Rx" isActive={currentTabIndex === 4} onClick={() => setCurrentTabIndex(4)} />
                            <DockItem icon={FileText} label="Reports" isActive={currentTabIndex === 2} onClick={() => setCurrentTabIndex(2)} />
                            <DockItem icon={Printer} label="Print" isActive={currentTabIndex === 5} onClick={() => setCurrentTabIndex(5)} isPrimary />
                        </div>
                    </div>
                </div>
            </div>
        </PrescriptionProvider>
    );
}

// --- Sub Components ---

function PrescriptionControls({ onTabChange }: { onTabChange: (i: number) => void }) {
    const { clearPrescription, saveAndFinalize, isSaving } = usePrescription();

    return (
        <div className="flex items-center gap-1.5 sm:gap-2">
            <button 
                onClick={clearPrescription}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all border border-red-100 shadow-sm font-bold text-[10px] uppercase shrink-0"
                title="Clear Prescription"
            >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
            </button>
            <button 
                onClick={() => saveAndFinalize({ finalize: false })}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-sm font-bold text-[10px] uppercase shrink-0"
            >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{isSaving ? "Saving..." : "Store Data"}</span>
            </button>
            <div className="h-4 w-px bg-slate-200 mx-0.5 sm:mx-1"></div>
            <PrescriptionScanner onScanComplete={() => onTabChange(5)} />
            
            {/* Desktop Actions - Hidden on mobile to prevent overflow */}
            <div className="hidden md:flex items-center gap-2">
                <div className="h-4 w-px bg-slate-200 mx-1"></div>
                <HeaderAction icon={FileText} label="Reports" onClick={() => onTabChange(2)} />
                <HeaderAction icon={History} label="Previous" onClick={() => onTabChange(6)} />
                <HeaderAction icon={FlaskConical} label="Blood Test" onClick={() => onTabChange(8)} />
                <div className="h-4 w-px bg-slate-200 mx-1"></div>
                <StatusPill label="Normal" color="text-green-600" bgColor="bg-green-50" borderColor="border-green-200" />
                <StatusPill label="Bill Pending" color="text-orange-600" bgColor="bg-orange-50" borderColor="border-orange-200" />
            </div>
        </div>
    );
}

function PrescriptionScanner({ onScanComplete }: { onScanComplete?: () => void }) {
    const { addMedicine } = usePrescription();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview'); // Default to Gemini 3.0 Flash

    // Models list with details & badges
    const currentModels = [
        {
            id: 'gemini-3.8-flash',
            name: 'Gemini 3.8 Flash',
            badge: 'New Stable',
            badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
            description: 'Our most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows.'
        },
        {
            id: 'gemini-3.7-flash',
            name: 'Gemini 3.7 Flash',
            badge: 'Stable',
            badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
            description: 'Our previous-generation Flash model for complex coding, agentic workflows, and reliable multi-step execution.'
        },
        {
            id: 'gemini-3.6-flash',
            name: 'Gemini 3.6 Flash',
            badge: 'Stable',
            badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
            description: 'Our previous-generation Flash model, balancing speed and multimodal capabilities across general agentic and everyday tasks.'
        },
        {
            id: 'gemini-3.5-flash',
            name: 'Gemini 3.5 Flash',
            badge: 'Stable',
            badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
            description: 'Our legacy Flash model, providing baseline speed and foundational performance for routine, high-throughput workloads.'
        },
        {
            id: 'gemini-3.5-flash-lite',
            name: 'Gemini 3.5 Flash-Lite',
            badge: 'Fast',
            badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
            description: 'Our fastest, most cost-effective 3.5 model for high-throughput execution.'
        },
        {
            id: 'gemini-3.1-flash-lite-preview',
            name: 'Gemini 3.1 Flash Lite',
            badge: 'Preview',
            badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
            description: 'Lightweight preview model for fast baseline parsing.'
        },
        {
            id: 'gemini-3-flash-preview',
            name: 'Gemini 3.0 Flash',
            badge: 'Preview',
            badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
            description: 'Multimodal preview model for general extraction tasks.'
        }
    ];

    const activeModelObj = currentModels.find(m => m.id === selectedModel) || currentModels[0];

    const importData = (data: any) => {
        // Only Rx (Medicines)
        if (Array.isArray(data.medicines)) {
            data.medicines.forEach((m: any) => {
                // Normalize Dosage (AI often returns 0.5 or 'half', UI wants '1/2')
                let normalizedDosage = String(m.dosage || '1').toLowerCase();
                if (normalizedDosage === '0.5' || normalizedDosage === 'half') normalizedDosage = '1/2';
                if (normalizedDosage === '0.25' || normalizedDosage === 'quarter') normalizedDosage = '1/4';
                if (normalizedDosage === '1.5') normalizedDosage = '1 1/2';

                addMedicine({
                    id: Math.random().toString(36).substr(2, 9),
                    name: m.name || '',
                    type: m.type || 'Tab',
                    unit: m.unit || (m.type?.toLowerCase() === 'syrup' || m.type?.toLowerCase() === 'susp' ? 'ml' : 'mg'),
                    dosage: normalizedDosage,
                    duration: (() => {
                        const d = (m.duration || '5d').toLowerCase();
                        if (d.includes('1 week') || d === '7 days' || d === '7 day') return '7d';
                        if (d.includes('2 week') || d === '14 days') return '14d';
                        if (d.includes('1 month') || d === '30 days') return '1m';
                        if (d.includes('3 month') || d === '90 days') return '3m';
                        // Normalize 5 days -> 5d etc
                        const num = d.match(/\d+/);
                        if (num) {
                            if (d.includes('day') || d.includes('d')) return num[0] + 'd';
                            if (d.includes('week') || d.includes('w')) return (Number(num[0]) * 7) + 'd';
                        }
                        return d;
                    })(),
                    note: '',
                    timing: m.timing || { bb: false, ab: true, bl: false, al: true, bd: false, ad: true }
                });
            });
        }
    };

    const toBase64 = (file: File) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            const base64 = await toBase64(file);
            const base64Data = (base64 as string).split(',')[1];

            const prompt = `You are a medical prescription data extractor. Extract ONLY the medicine items from the provided prescription image. Do NOT extract any instructions, doctor notes, advice, symptoms, diagnoses, or lab tests. Ignore everything else on the prescription.

Strictly extract each medicine into the following JSON format:
{
  "medicines": [
    { 
      "type": "Tab / Cap / Syrup / Susp / Inj / Drop / Cream / Oint",
      "name": "Medicine Name Only", 
      "unit": "mg / ml / etc (e.g. 500mg, 40mg, ml)",
      "dosage": "Dosage amount per single intake (e.g. '1', '1/2', '2', '5', '10')", 
      "duration": "Duration in days format (e.g. '3d', '5d', '7d', '14d', '1m')", 
      "timing": {
        "bb": boolean,
        "ab": boolean,
        "bl": boolean,
        "al": boolean,
        "bd": boolean,
        "ad": boolean
      }
    }
  ]
}

EXTRACTION RULES:
1. ONLY extract:
   - Medicine type (Tab, Cap, Syrup, Susp, Inj, Drop, Cream, Oint, etc.)
   - Medicine name (strictly the medicine brand/generic name only)
   - Strength / Unit (mg, ml, etc.)
   - Dosage per intake (e.g. '1', '1/2', '2', '5', '10')
   - Frequency / timing (morning, afternoon, night schedule mapped to timing booleans)
   - Duration (e.g. '3d', '5d', '7d', '10d', '14d', '1m')
2. DO NOT extract instructions, notes, precautions, dietary advice, or doctor comments. Leave all notes out.
3. Frequency & Timings mapping:
   - If frequency is '1-0-1', '1-1-1', '0-0-1', '1-0-0', '0-1-0', '1/2-0-1/2':
     - 'dosage' is the amount per intake (e.g. '1' or '0.5' / '1/2').
     - Map 1st position to breakfast (ab), 2nd position to lunch (al), 3rd position to dinner (ad).
     - Default to 'after meal' (ab, al, ad) unless explicitly written 'before meal' (bb, bl, bd).
4. For Syrups / Suspensions: Set 'type' to 'Syrup' or 'Susp', 'unit' to 'ml', and 'dosage' to volume per intake (e.g. '5' or '10').

Only return the JSON object and nothing else.`;

            const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
            const modelToUse = selectedModel;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: file.type || 'image/jpeg', data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || "Failed to call Gemini API");
            }

            const result = await response.json();
            const extractedText = result.candidates[0].content.parts[0].text;
            const data = JSON.parse(extractedText);

            importData(data);
            toast.success("Prescription scanned and filled!");
            setOpen(false);
            onScanComplete?.();
        } catch (err: any) {
            console.error("Scanning Error:", err);
            toast.error(err.message || "Failed to scan prescription. Check API Key or Image.");
        } finally {
            setLoading(false);
            // Reset input
            e.target.value = '';
        }
    };

    return (
        <>
            <button 
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 active:scale-95 transition-all shadow-sm font-bold text-[10px] uppercase shrink-0"
            >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Scan</span>
            </button>

            <Dialog open={open} onOpenChange={(val) => {
                setOpen(val);
                if (!val) setIsDropdownOpen(false);
            }}>
                <DialogContent className="w-[94vw] max-w-md max-h-[90vh] flex flex-col bg-white border-0 shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl p-0">
                    <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 px-5 py-5 sm:px-6 sm:py-6 text-white relative shrink-0">
                        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                            <Sparkles className="w-28 h-28 rotate-12" />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2.5">
                                <div className="p-1.5 sm:p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <Camera className="w-5 h-5 text-white" />
                                </div>
                                AI Prescription Scanner
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-purple-100 text-xs mt-1.5 opacity-90">
                            Upload a photo of the prescription and Gemini will automatically extract medicines for you.
                        </p>
                    </div>

                    <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                        {/* Model Dropdown Selector */}
                        <div className="space-y-1.5 relative">
                            <div className="flex justify-between items-center px-0.5">
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">AI Model Engine</label>
                                <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                                    Active: {activeModelObj.name}
                                </span>
                            </div>

                            {/* Dropdown Selector Trigger */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsDropdownOpen(prev => !prev)}
                                    className="w-full flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-purple-300 rounded-xl transition-all text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                        <div className="w-7 h-7 rounded-lg bg-purple-100/80 flex items-center justify-center shrink-0 border border-purple-200 text-purple-700">
                                            <Sparkles className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{activeModelObj.name}</span>
                                                <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border", activeModelObj.badgeColor)}>
                                                    {activeModelObj.badge}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                                {activeModelObj.description}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-slate-400 pl-1">
                                        {isDropdownOpen ? <ChevronUp className="w-4 h-4 text-purple-600" /> : <ChevronDown className="w-4 h-4" />}
                                    </div>
                                </button>

                                {/* Dropdown Menu Options */}
                                {isDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                                        {currentModels.map((m) => {
                                            const isSelected = selectedModel === m.id;
                                            return (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedModel(m.id);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full flex items-start justify-between p-2.5 sm:p-3 transition-colors text-left",
                                                        isSelected ? "bg-purple-50/80" : "hover:bg-slate-50"
                                                    )}
                                                >
                                                    <div className="min-w-0 pr-2 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn(
                                                                "w-2 h-2 rounded-full shrink-0",
                                                                isSelected ? "bg-purple-600 ring-2 ring-purple-200 animate-pulse" : "bg-slate-300"
                                                            )} />
                                                            <span className={cn(
                                                                "text-xs sm:text-sm font-bold",
                                                                isSelected ? "text-purple-900" : "text-slate-800"
                                                            )}>
                                                                {m.name}
                                                            </span>
                                                            <span className={cn("text-[9px] font-semibold px-1.5 py-0.2 rounded border shrink-0", m.badgeColor)}>
                                                                {m.badge}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-1 leading-snug pl-4">
                                                            {m.description}
                                                        </p>
                                                    </div>
                                                    {isSelected && (
                                                        <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Upload/Camera Area */}
                        <div className="relative">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-purple-400 blur-xl opacity-20 animate-pulse" />
                                        <Loader2 className="w-10 h-10 text-purple-600 animate-spin relative" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-900 mt-3">Parsing Prescription...</p>
                                    <p className="text-xs text-slate-500 text-center max-w-[240px] mt-1">Extracting medicines and dosages via {activeModelObj.name}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                    <input 
                                        type="file" 
                                        id="prescription-camera" 
                                        className="hidden" 
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleFileUpload}
                                    />
                                    <label 
                                        htmlFor="prescription-camera"
                                        className="flex flex-col items-center justify-center p-5 sm:p-6 border-2 border-dashed border-slate-200 rounded-2xl transition-all cursor-pointer hover:border-purple-500 hover:bg-purple-50/30 group"
                                    >
                                        <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-purple-100 transition-colors mb-2">
                                            <Camera className="w-6 h-6 text-slate-500 group-hover:text-purple-600" />
                                        </div>
                                        <p className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-purple-700">Take Photo</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Device Camera</p>
                                    </label>

                                    <input 
                                        type="file" 
                                        id="prescription-upload" 
                                        className="hidden" 
                                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                                        onChange={handleFileUpload}
                                    />
                                    <label 
                                        htmlFor="prescription-upload"
                                        className="flex flex-col items-center justify-center p-5 sm:p-6 border-2 border-dashed border-slate-200 rounded-2xl transition-all cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 group"
                                    >
                                        <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-indigo-100 transition-colors mb-2">
                                            <Upload className="w-6 h-6 text-slate-500 group-hover:text-indigo-600" />
                                        </div>
                                        <p className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-700">Upload File</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Gallery or Files</p>
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5 p-3 bg-amber-50/80 rounded-xl border border-amber-200/60">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <p className="text-[10px] text-amber-800 font-medium leading-normal">
                                AI extraction may occasionally miss details. Please review all extracted medicines after scanning for clinical accuracy.
                            </p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function HeaderAction({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
    return (
        <button onClick={onClick} className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors">
            <Icon className="w-3.5 h-3.5 text-slate-700" />
            <span className="text-[10px] font-medium text-slate-700">{label}</span>
        </button>
    );
}

function StatusPill({ label, color, bgColor, borderColor }: { label: string, color: string, bgColor: string, borderColor: string }) {
    return (
        <div className={`px-2 py-0.5 rounded-full border ${bgColor} ${borderColor} ${color}`}>
            <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
        </div>
    );
}

function SegmentTab({ title, index, selectedIndex, onSelect }: { title: string, index: number, selectedIndex: number, onSelect: (i: number) => void }) {
    const isSelected = index === selectedIndex;
    return (
        <button
            onClick={() => onSelect(index)}
            className={cn(
                "flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all",
                isSelected ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-slate-200/50"
            )}
        >
            {title}
        </button>
    );
}

function DockItem({ icon: Icon, label, isActive, onClick, isHighlighted, isPrimary }: { icon: any, label: string, isActive: boolean, onClick: () => void, isHighlighted?: boolean, isPrimary?: boolean }) {
    const activeColor = isHighlighted ? "text-orange-600" : isPrimary ? "text-indigo-600" : "text-blue-700";
    const inactiveColor = "text-slate-500";

    return (
        <button onClick={onClick} className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 p-1 transition-all">
            <div className={cn(
                "p-1 sm:p-1.5 rounded-lg transition-all",
                isActive ? (isHighlighted ? "bg-orange-100" : isPrimary ? "bg-indigo-100" : "bg-blue-100") : "bg-transparent"
            )}>
                <Icon className={cn("w-4 h-4 sm:w-5 sm:h-5", isActive ? activeColor : inactiveColor)} />
            </div>
            {/* Show label always, responsive and truncated if necessary */}
            <span className={cn(
                "text-[9px] sm:text-[10px] md:text-[11px] font-bold tracking-tight truncate max-w-full",
                isActive ? activeColor : inactiveColor
            )}>
                {label}
            </span>
        </button>
    );
}
