"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase";
import {
    ArrowLeft, Monitor, FileText, History, StickyNote,
    CheckCircle, Search, Check, List, Activity,
    FileOutput, Heart, Printer, Power, User, Stethoscope, FlaskConical, Code,
    Camera, Upload, Loader2, Sparkles, AlertCircle, Trash2
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

        // We use display: none for inactive tabs to preserve state if needed, 
        // BUT since we implemented localStorage persistence in tabs, we can conditionally render safely.
        // However, for smoother switching, let's stick to conditional rendering as per React best practices 
        // unless performance is an issue. The tabs load from LS on mount so state is preserved.

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
                <header className={cn(ModernTheme.surface, "border-b border-slate-200 px-3 py-1.5 flex items-center justify-between sticky top-0 z-50 shrink-0 select-none no-print")}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.back()} className="p-1.5 hover:bg-slate-100 rounded-full">
                            <ArrowLeft className="w-4 h-4 text-slate-900" />
                        </button>
                        <div className="bg-blue-50 px-2 py-1 rounded-md">
                            <span className="text-blue-600 font-bold text-[11px]">Trivandrum OPD</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <PrescriptionControls onTabChange={setCurrentTabIndex} />
                    </div>
                </header>

                {/* --- BODY --- */}
                <main className="flex-1 flex flex-col overflow-hidden relative select-text">
                    {renderContent()}
                </main>

                {/* --- BOTTOM DOCK --- */}
                <div className="px-3 py-2 bg-slate-100 z-50 select-none no-print">
                    <div className="bg-white rounded-xl shadow-md border border-slate-100 h-[55px] flex items-center overflow-hidden">
                        {/* Exit Button */}
                        <button onClick={() => router.back()} className="w-[50px] h-full bg-red-50 hover:bg-red-100 flex items-center justify-center border-r border-slate-100">
                            <Power className="w-5 h-5 text-red-500" />
                        </button>

                        {/* Patient Context */}
                        <div className="w-[140px] px-3 border-r border-slate-100 flex flex-col justify-center h-full">
                            <p className="font-bold text-[11px] text-slate-900 truncate leading-tight">{record.patient_detail.name}</p>
                            <div className="flex items-center gap-1 text-slate-500 text-[9px] mt-0.5">
                                <User className="w-2.5 h-2.5" />
                                <span>{record.patient_detail.age} {record.patient_detail.age_unit} • {record.patient_detail.gender === 'male' ? 'M' : 'F'}</span>
                            </div>
                        </div>

                        {/* Navigation Items */}
                        <div className="flex-1 flex items-center justify-around px-1">
                            <DockItem icon={Activity} label="Vitals" isActive={currentTabIndex === 9} onClick={() => setCurrentTabIndex(9)} />
                            <DockItem icon={Heart} label="Symptoms" isActive={currentTabIndex === 3} onClick={() => setCurrentTabIndex(3)} />
                            <DockItem icon={Stethoscope} label="Diagnosis" isActive={currentTabIndex === 7} onClick={() => setCurrentTabIndex(7)} isHighlighted />
                            <DockItem icon={FileOutput} label="Rx" isActive={currentTabIndex === 4} onClick={() => setCurrentTabIndex(4)} />
                            <DockItem icon={FileText} label="Reports" isActive={currentTabIndex === 2} onClick={() => setCurrentTabIndex(2)} />
                            <DockItem icon={Printer} label="Print" isActive={currentTabIndex === 5} onClick={() => setCurrentTabIndex(5)} />
                        </div>
                    </div>
                </div>
            </div>
        </PrescriptionProvider>
    );
}

// --- Sub Components ---

function PrescriptionControls({ onTabChange }: { onTabChange: (i: number) => void }) {
    const { clearPrescription } = usePrescription();

    return (
        <div className="flex items-center gap-2">
            <button 
                onClick={clearPrescription}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all border border-red-100 shadow-sm font-bold text-[10px] uppercase"
            >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
            </button>
            <div className="h-4 w-px bg-slate-200 mx-1"></div>
            <PrescriptionScanner />
            <div className="h-4 w-px bg-slate-200 mx-1"></div>
            <HeaderAction icon={FileText} label="Reports" onClick={() => onTabChange(2)} />
            <HeaderAction icon={History} label="Previous" onClick={() => onTabChange(6)} />
            <HeaderAction icon={FlaskConical} label="Blood Test" onClick={() => onTabChange(8)} />
            <div className="h-4 w-px bg-slate-200 mx-1"></div>
            <StatusPill label="Normal" color="text-green-600" bgColor="bg-green-50" borderColor="border-green-200" />
            <StatusPill label="Bill Pending" color="text-orange-600" bgColor="bg-orange-50" borderColor="border-orange-200" />
        </div>
    );
}

function PrescriptionScanner() {
    const { addSymptom, addDiagnosis, addMedicine, setInvestigations, setClinicalNote, setFollowUp } = usePrescription();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview'); // Default model as requested

    // Custom models as requested by user
    const currentModels = [
        { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (Fast)' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash (Heavy)' }
    ];

    const importData = (data: any) => {
        // 1. Symptoms
        if (Array.isArray(data.symptoms)) {
            data.symptoms.forEach((s: any) => {
                addSymptom({
                    name: s.name || '',
                    note: s.note || '',
                    duration: s.duration || '',
                    severity: s.severity || '',
                    customGroups: [],
                    selectedCustomOptions: []
                });
            });
        }

        // 2. Diagnoses
        if (Array.isArray(data.diagnoses)) {
            data.diagnoses.forEach((d: any) => {
                addDiagnosis({
                    name: d.name || '',
                    note: d.note || '',
                    status: d.status || 'Suspected',
                    customGroups: [],
                    selectedCustomOptions: []
                });
            });
        }

        // 3. Rx (Medicines)
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
                    unit: m.unit || (m.type?.toLowerCase() === 'syrup' ? 'ml' : 'mg'),
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
                    note: m.note || '',
                    timing: m.timing || { bb: false, ab: true, bl: false, al: true, bd: false, ad: true }
                });
            });
        }

        // 4. Reports (Investigations)
        if (Array.isArray(data.reports)) {
            setInvestigations(data.reports);
        }

        // 5. Global Notes & Follow Up
        if (data.clinical_note) setClinicalNote(data.clinical_note);
        if (data.follow_up_duration || data.follow_up_note) {
            setFollowUp(data.follow_up_duration || '', data.follow_up_note || '');
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

            const prompt = `You are a professional medical prescription analyst. Extract information from the provided prescription image into the following strict JSON format:
{
  "symptoms": [
    { "name": "...", "duration": "...", "severity": "...", "note": "..." }
  ],
  "diagnoses": [
    { "name": "...", "status": "Confirmed/Suspected", "note": "..." }
  ],
  "medicines": [
    { 
      "name": "...", 
      "type": "Tab/Syrup/Cap/Inj/...",
      "unit": "mg/ml/...",
      "dosage": "Clinical fraction (if '0-0-0.5', dosage is '1/2'; if '1-0-1', dosage is '1')", 
      "duration": "Days like '3d', '7d', '8d', '15d', etc.", 
      "timing": { "bb": boolean, "ab": boolean, "bl": boolean, "al": boolean, "bd": boolean, "ad": boolean },
      "note": "..."
    }
  ],
  "reports": ["Investigation 1", "Investigation 2"],
  "clinical_note": "...",
  "follow_up_duration": "...",
  "follow_up_note": "..."
}
RULES for Medicine Timings:
- For Tablets/Capsules: The 'dosage' is the numeric multiplier per dose (e.g., if frequency is '1-0-1', 'dosage' is '1'). The strength (like '40 mg') should be extracted into the 'unit' field.
- For Syrups: Extract the volume (e.g., '10') into 'dosage' and 'ml' into 'unit'.
- If the frequency is '1/2 - 0 - 1/2', set 'dosage': '0.5' and mapping timings accordingly.
- If notes say 'After Breakfast', 'After Lunch', 'After Dinner', map to 'ab', 'al', 'ad' respectively.
- If notes say 'Before...', map to 'bb', 'bl', 'bd'.

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
            <HeaderAction 
                icon={Sparkles} 
                label="AI Scan" 
                onClick={() => setOpen(true)} 
            />

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md bg-white border-0 shadow-2xl overflow-hidden rounded-3xl p-0">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-8 text-white relative">
                        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                            <Sparkles className="w-32 h-32 rotate-12" />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <Camera className="w-6 h-6 text-white" />
                                </div>
                                AI Prescription Scanner
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-blue-100 text-sm mt-2 opacity-90">
                            Upload a photo of the prescription and Gemini will automatically fill the form for you.
                        </p>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Model Selector */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Engine Efficiency</label>
                                <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">Automated Selection</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {currentModels.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => setSelectedModel(m.id)}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-2xl border-2 transition-all text-left",
                                            selectedModel === m.id 
                                                ? "border-blue-600 bg-blue-50/50 shadow-sm" 
                                                : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full",
                                                selectedModel === m.id ? "bg-blue-600 animate-pulse" : "bg-slate-300"
                                            )} />
                                            <span className={cn(
                                                "text-sm font-medium",
                                                selectedModel === m.id ? "text-blue-900" : "text-slate-600"
                                            )}>{m.name}</span>
                                        </div>
                                        {selectedModel === m.id && <Check className="w-4 h-4 text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Upload Area */}
                        <div className="relative">
                            <input 
                                type="file" 
                                id="prescription-upload" 
                                className="hidden" 
                                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                                onChange={handleFileUpload}
                                disabled={loading}
                            />
                            <label 
                                htmlFor="prescription-upload"
                                className={cn(
                                    "flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-3xl transition-all cursor-pointer group",
                                    loading 
                                        ? "bg-slate-50 border-slate-200 cursor-not-allowed opacity-70" 
                                        : "border-slate-200 hover:border-blue-500 hover:bg-blue-50/30"
                                )}
                            >
                                {loading ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-blue-400 blur-xl opacity-20 animate-pulse" />
                                            <Loader2 className="w-12 h-12 text-blue-600 animate-spin relative" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-900">Parsing Prescription...</p>
                                        <p className="text-xs text-slate-500 text-center max-w-[200px]">Extracting text and organizing medical data via {selectedModel}</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-4 bg-slate-100 rounded-full group-hover:bg-blue-100 transition-colors mb-4">
                                            <Upload className="w-8 h-8 text-slate-500 group-hover:text-blue-600" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700">Drop image or click to upload</p>
                                        <p className="text-xs text-slate-500 mt-1">Supports JPG, PNG up to 10MB</p>
                                    </>
                                )}
                            </label>
                        </div>

                        <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                            <AlertCircle className="w-5 h-5 text-orange-500 shrink-0" />
                            <p className="text-[10px] text-orange-800 font-medium">
                                AI extraction may occasionally miss details. Please review all fields after scanning for accuracy and manual correction.
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

function DockItem({ icon: Icon, label, isActive, onClick, isHighlighted }: { icon: any, label: string, isActive: boolean, onClick: () => void, isHighlighted?: boolean }) {
    const activeColor = isHighlighted ? "text-orange-600" : "text-blue-700";
    const inactiveColor = "text-slate-500";

    return (
        <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 p-1 transition-all w-16">
            <div className={cn(
                "p-1.5 rounded-lg transition-all",
                isActive ? (isHighlighted ? "bg-orange-100" : "bg-blue-100") : "bg-transparent"
            )}>
                <Icon className={cn("w-5 h-5", isActive ? activeColor : inactiveColor)} />
            </div>
            {/* Show label always, but bigger and clearer */}
            <span className={cn(
                "text-[10px] sm:text-[11px] font-bold tracking-tight", // Slightly bigger text
                isActive ? activeColor : inactiveColor
            )}>
                {label}
            </span>
        </button>
    );
}
