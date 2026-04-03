"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase";
import {
    ArrowLeft, Monitor, FileText, History, StickyNote,
    CheckCircle, Search, Check, List, Activity,
    FileOutput, Heart, Printer, Power, User, Stethoscope, FlaskConical, Code
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
                        {/* <HeaderAction icon={Activity} label="Vitals" onClick={() => setCurrentTabIndex(9)} /> */}
                        {/* Moved Vitals to Bottom Dock for better visibility as requested */}
                        <DevJsonImporter />
                        <div className="h-5 w-px bg-slate-200 mx-1"></div>
                        <HeaderAction icon={FileText} label="Reports" onClick={() => setCurrentTabIndex(2)} />
                        <HeaderAction icon={History} label="Previous" onClick={() => setCurrentTabIndex(6)} />
                        <HeaderAction icon={FlaskConical} label="Blood Test" onClick={() => setCurrentTabIndex(8)} />
                        <div className="h-5 w-px bg-slate-200 mx-1"></div>
                        <StatusPill label="Normal" color="text-green-600" bgColor="bg-green-50" borderColor="border-green-200" />
                        <StatusPill label="Bill Pending" color="text-orange-600" bgColor="bg-orange-50" borderColor="border-orange-200" />
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

function DevJsonImporter() {
    const { addSymptom, addDiagnosis, addMedicine, setInvestigations, setClinicalNote, setFollowUp } = usePrescription();
    const [open, setOpen] = useState(false);
    const [jsonInput, setJsonInput] = useState('');

    const handleImport = () => {
        try {
            const data = JSON.parse(jsonInput);

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
                    addMedicine({
                        id: Math.random().toString(36).substr(2, 9),
                        name: m.name || '',
                        type: m.type || 'Tablet',
                        dosage: m.dosage || '',
                        duration: m.duration || '',
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

            toast.success("Prescription data imported successfully!");
            setOpen(false);
            setJsonInput('');
        } catch (err) {
            console.error(err);
            toast.error("Invalid JSON structure. Please check the format.");
        }
    };

    const exampleJson = `{
  "symptoms": [
    { "name": "Toothache", "duration": "3 days", "severity": "Severe", "note": "On left lower side" }
  ],
  "diagnoses": [
    { "name": "Dental Caries", "status": "Confirmed", "note": "Caries in 36, 37" }
  ],
  "medicines": [
    { 
      "name": "Amoxicillin 500mg", 
      "dosage": "1 Tab", 
      "duration": "5 Days", 
      "timing": { "bb": false, "ab": true, "bl": false, "al": true, "bd": false, "ad": true },
      "note": "Take with warm water"
    }
  ],
  "reports": ["X-Ray OPG", "CBC"],
  "clinical_note": "Patient advised rest for 3 days.",
  "follow_up_duration": "1w",
  "follow_up_note": "Review with reports"
}`;

    return (
        <>
            <HeaderAction icon={Code} label="Developer" onClick={() => setOpen(true)} />

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Code className="w-5 h-5 text-blue-600" />
                            Developer JSON Import
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="bg-slate-900 rounded-lg p-3 relative group">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Example JSON Structure</span>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(exampleJson);
                                        toast.success("Example JSON copied!");
                                    }}
                                    className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    Copy Format
                                </button>
                            </div>
                            <pre className="text-[11px] font-mono text-blue-300 overflow-x-auto">
                                {exampleJson}
                            </pre>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Paste your JSON here</label>
                            <Textarea 
                                placeholder='{ "symptoms": [...], "diagnoses": [...], "medicines": [...], "reports": [...] }'
                                value={jsonInput}
                                onChange={(e) => setJsonInput(e.target.value)}
                                className="min-h-[200px] font-mono text-xs border-slate-200 focus:ring-blue-500"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-500">Cancel</Button>
                            <Button onClick={handleImport} className="bg-blue-600 hover:bg-blue-700 text-white px-8">Import Data</Button>
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
