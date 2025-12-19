"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase";
import {
    ArrowLeft, Monitor, FileText, History, StickyNote,
    CheckCircle, Search, Check, List, Activity,
    FileOutput, Heart, Printer, Power, User, Stethoscope
} from 'lucide-react';
import { cn } from "@/lib/utils";

// --- Imports ---
import CheckupTab from './components/CheckupTab';
import FitnessTab from './components/FitnessTab';
import InstructionsTab from './components/InstructionsTab';
import SymptomsTab from './components/SymptomsTab';
import TreatmentTab from './components/TreatmentTab';
import PreviewTab from './components/PreviewTab';
import MedicalHistoryTab from './components/MedicalHistoryTab';
import DiagnosisTab from './components/DiagnosisTab';
import PatientVitalsTrend from './components/PatientVitalsTrend';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Patient, OPDRecord } from './types';
import { ModernTheme } from './theme';

export default function PrescriptionPage() {
    const params = useParams();
    const router = useRouter();
    const opdId = Number(params.id);

    const [record, setRecord] = useState<OPDRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentTabIndex, setCurrentTabIndex] = useState(0); // Default to Check Up
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
            case 0: return <CheckupTab opdId={opdId} />;
            case 1: return <FitnessTab opdId={opdId} />;
            case 2: return <InstructionsTab opdId={opdId} />;
            case 3: return <SymptomsTab opdId={opdId} />;
            case 4: return <TreatmentTab opdId={opdId} patientId={record!.patient_detail.uhid} />;
            case 5: return <PreviewTab opdId={opdId} patient={record!.patient_detail} />;
            case 6: return <MedicalHistoryTab opdId={opdId} />;
            case 7: return <DiagnosisTab opdId={opdId} />;
            default: return <div className="flex items-center justify-center h-full text-slate-400">Select a tab</div>;
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Loading...</div>;
    if (!record) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Record not found</div>;

    return (
        <div className={`fixed inset-0 z-[100] flex flex-col overflow-hidden ${ModernTheme.background}`}>

            {/* --- APP BAR --- */}
            <header className={`${ModernTheme.surface} border-b border-slate-200 px-4 py-2 flex items-center justify-between sticky top-0 z-50`}>
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-full">
                        <ArrowLeft className="w-5 h-5 text-slate-900" />
                    </button>
                    <div className="bg-blue-50 px-3 py-1.5 rounded-lg">
                        <span className="text-blue-600 font-bold text-sm">Trivandrum OPD</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <HeaderAction icon={Activity} label="Vitals" onClick={() => setShowVitalsDialog(true)} />
                    <HeaderAction icon={FileText} label="Reports" onClick={() => setCurrentTabIndex(2)} />
                    <HeaderAction icon={History} label="History" onClick={() => setCurrentTabIndex(6)} />
                    <HeaderAction icon={StickyNote} label="Notes" onClick={() => { }} />

                    <div className="h-6 w-px bg-slate-200 mx-2"></div>

                    <StatusPill label="Normal" color="text-green-600" bgColor="bg-green-50" borderColor="border-green-200" />
                    <StatusPill label="Bill Pending" color="text-orange-600" bgColor="bg-orange-50" borderColor="border-orange-200" />
                </div>
            </header>

            {/* --- BODY --- */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {renderContent()}
            </main>

            {/* --- BOTTOM DOCK --- */}
            <div className="p-4 bg-slate-100 z-50">
                <div className="bg-white rounded-2xl shadow-lg border border-slate-100 h-[70px] flex items-center overflow-hidden">
                    {/* Exit Button */}
                    <button onClick={() => router.back()} className="w-[60px] h-full bg-red-50 hover:bg-red-100 flex items-center justify-center border-r border-slate-100">
                        <Power className="w-6 h-6 text-red-500" />
                    </button>

                    {/* Patient Context */}
                    <div className="w-[160px] px-4 border-r border-slate-100 flex flex-col justify-center h-full">
                        <p className="font-bold text-sm text-slate-900 truncate">{record.patient_detail.name}</p>
                        <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
                            <User className="w-3 h-3" />
                            <span>{record.patient_detail.age} {record.patient_detail.age_unit} • {record.patient_detail.gender === 'male' ? 'M' : 'F'}</span>
                        </div>
                    </div>

                    {/* Navigation Items */}
                    <div className="flex-1 flex items-center justify-around px-2">
                        <DockItem icon={User} label="Check Up" isActive={currentTabIndex === 0} onClick={() => setCurrentTabIndex(0)} />
                        <DockItem icon={Activity} label="Fitness" isActive={currentTabIndex === 1} onClick={() => setCurrentTabIndex(1)} />
                        <DockItem icon={FileText} label="Reports" isActive={currentTabIndex === 2} onClick={() => setCurrentTabIndex(2)} />
                        <DockItem icon={Heart} label="Symptoms" isActive={currentTabIndex === 3} onClick={() => setCurrentTabIndex(3)} />
                        <DockItem icon={Stethoscope} label="Diagnosis" isActive={currentTabIndex === 7} onClick={() => setCurrentTabIndex(7)} isHighlighted />
                        <DockItem icon={FileOutput} label="Rx" isActive={currentTabIndex === 4} onClick={() => setCurrentTabIndex(4)} />
                        <DockItem icon={Printer} label="Print" isActive={currentTabIndex === 5} onClick={() => setCurrentTabIndex(5)} />
                    </div>
                </div>
            </div>

            {/* --- VITALS DIALOG --- */}
            <Dialog open={showVitalsDialog} onOpenChange={setShowVitalsDialog}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Patient Vitals Trend</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <PatientVitalsTrend patientUhid={record.patient_detail.uhid} />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// --- Sub Components ---

function HeaderAction({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
    return (
        <button onClick={onClick} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
            <Icon className="w-4 h-4 text-slate-700" />
            <span className="text-xs font-medium text-slate-700">{label}</span>
        </button>
    );
}

function StatusPill({ label, color, bgColor, borderColor }: { label: string, color: string, bgColor: string, borderColor: string }) {
    return (
        <div className={`px-2.5 py-1 rounded-full border ${bgColor} ${borderColor} ${color}`}>
            <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
        </div>
    );
}

function SegmentTab({ title, index, selectedIndex, onSelect }: { title: string, index: number, selectedIndex: number, onSelect: (i: number) => void }) {
    const isSelected = index === selectedIndex;
    return (
        <button
            onClick={() => onSelect(index)}
            className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                isSelected ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-slate-200/50"
            )}
        >
            {title}
        </button>
    );
}

function DockItem({ icon: Icon, label, isActive, onClick, isHighlighted }: { icon: any, label: string, isActive: boolean, onClick: () => void, isHighlighted?: boolean }) {
    const activeColor = isHighlighted ? "text-orange-500" : "text-blue-600";

    return (
        <button onClick={onClick} className="flex flex-col items-center gap-1 p-2 transition-all">
            <div className={cn(
                "p-2 rounded-full transition-all",
                isActive ? (isHighlighted ? "bg-orange-50" : "bg-blue-50") : "bg-transparent"
            )}>
                <Icon className={cn("w-5 h-5", isActive ? activeColor : "text-slate-400")} />
            </div>
            {isActive && <span className={cn("text-[10px] font-bold", activeColor)}>{label}</span>}
        </button>
    );
}
