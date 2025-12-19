"use client"

import React, { useState, useEffect, useRef } from 'react';
import {
    Search, Plus, Save, Check, X, ChevronRight,
    AlertCircle, Users, Coffee, Activity, Stethoscope
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// --- Theme ---
const HistTheme = {
    primary: "text-blue-600",
    primaryBg: "bg-blue-600",
    background: "bg-slate-50",
    surface: "bg-white",
    textMain: "text-slate-900",
    textSub: "text-slate-500",
    border: "border-slate-200",
};

// --- Models ---
interface HistoryItem {
    name: string;
    isSelected: boolean;
    detail?: string;
    subDetail?: string;
    tags: string[];
}

interface MedicalHistoryTabProps {
    opdId: number;
}

export default function MedicalHistoryTab({ opdId }: MedicalHistoryTabProps) {
    // --- State ---
    const [problems, setProblems] = useState<HistoryItem[]>([
        { name: "T2DM", isSelected: false, tags: [] },
        { name: "Hypertension", isSelected: false, tags: [] },
        { name: "Hypothyroidism", isSelected: false, tags: [] },
        { name: "Hyperthyroidism", isSelected: false, tags: [] },
        { name: "Hyperlipidemia", isSelected: false, tags: [] },
        { name: "CKD", isSelected: false, tags: [] },
        { name: "Obesity", isSelected: false, tags: [] },
        { name: "Weight loss", isSelected: false, tags: [] },
    ]);

    const [allergies, setAllergies] = useState<HistoryItem[]>([
        { name: "Peanuts", isSelected: false, tags: [] },
        { name: "Pollen", isSelected: false, tags: [] },
        { name: "Shellfish", isSelected: false, tags: [] },
        { name: "Sulfa drugs", isSelected: false, tags: [] },
        { name: "Amoxicillin", isSelected: false, tags: [] },
    ]);

    const [familyHistory, setFamilyHistory] = useState<HistoryItem[]>([
        { name: "Hypertension", isSelected: false, tags: [] },
        { name: "Hypothyroidism", isSelected: false, tags: [] },
        { name: "Obesity", isSelected: false, tags: [] },
        { name: "CKD", isSelected: false, tags: [] },
    ]);

    const [lifestyle, setLifestyle] = useState<HistoryItem[]>([
        { name: "Smoking", isSelected: false, tags: [] },
        { name: "Drinking", isSelected: false, tags: [] },
        { name: "Food Habits", isSelected: false, tags: [] },
        { name: "Exercise", isSelected: false, tags: [] },
    ]);

    // Dialog States
    const [activeItem, setActiveItem] = useState<{ item: HistoryItem, section: string, index: number } | null>(null);
    const [showProblemDialog, setShowProblemDialog] = useState(false);
    const [showFamilyDialog, setShowFamilyDialog] = useState(false);
    const [showHabitDialog, setShowHabitDialog] = useState(false);

    // Scroll Refs
    const sectionRefs = {
        problems: useRef<HTMLDivElement>(null),
        allergies: useRef<HTMLDivElement>(null),
        family: useRef<HTMLDivElement>(null),
        lifestyle: useRef<HTMLDivElement>(null),
        procedure: useRef<HTMLDivElement>(null),
    };

    const [isFinalized, setIsFinalized] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // --- Persistence (Industry Expert Logic) ---
    useEffect(() => {
        const loadData = async () => {
            try {
                // 1. Fetch Status & Server Data
                const { data: serverData, error } = await supabase
                    .from('opd_registration')
                    .select('is_finalized, medical_history_json')
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                const finalized = serverData?.is_finalized || false;
                const serverHistory = serverData?.medical_history_json || {};
                setIsFinalized(finalized);

                // Helper to apply data to state
                const applyData = (data: any) => {
                    if (data.problems) setProblems(data.problems);
                    if (data.allergies) setAllergies(data.allergies);
                    if (data.familyHistory) setFamilyHistory(data.familyHistory);
                    if (data.lifestyle) setLifestyle(data.lifestyle);
                };

                // 2. Decide Source
                if (finalized) {
                    // Finalized: Strictly load from server
                    applyData(serverHistory);
                } else {
                    // Draft: Prioritize Local Storage
                    const saved = localStorage.getItem(`draft_medical_history_${opdId}`);

                    if (saved) {
                        try {
                            applyData(JSON.parse(saved));
                        } catch (e) {
                            console.error("Local draft corrupt", e);
                            applyData(serverHistory);
                        }
                    } else {
                        // No local draft? Initialize from server (sync)
                        // Only apply if server has data (otherwise keep defaults)
                        if (Object.keys(serverHistory).length > 0) {
                            applyData(serverHistory);
                            // Sync to local
                            localStorage.setItem(`draft_medical_history_${opdId}`, JSON.stringify(serverHistory));
                        } else {
                            // New record, keep defaults but save to local to start draft
                            const defaults = { problems, allergies, familyHistory, lifestyle };
                            localStorage.setItem(`draft_medical_history_${opdId}`, JSON.stringify(defaults));
                        }
                    }
                }
            } catch (e) {
                console.error("Error loading medical history", e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadData();
    }, [opdId]);

    useEffect(() => {
        if (isLoaded) {
            const data = { problems, allergies, familyHistory, lifestyle };
            localStorage.setItem(`draft_medical_history_${opdId}`, JSON.stringify(data));
        }
    }, [problems, allergies, familyHistory, lifestyle, opdId, isLoaded]);

    // --- Actions ---
    const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const toggleSelection = (section: string, index: number) => {
        let list: HistoryItem[] = [];
        let setList: React.Dispatch<React.SetStateAction<HistoryItem[]>>;

        if (section === 'problems') { list = problems; setList = setProblems; }
        else if (section === 'allergies') { list = allergies; setList = setAllergies; }
        else if (section === 'family') { list = familyHistory; setList = setFamilyHistory; }
        else { list = lifestyle; setList = setLifestyle; }

        const newList = [...list];
        const item = newList[index];
        item.isSelected = !item.isSelected;

        if (!item.isSelected) {
            item.detail = undefined;
            item.subDetail = undefined;
            item.tags = [];
        } else {
            // Trigger Dialogs
            if (section === 'problems' && (item.name === "T2DM" || item.name === "Hypertension")) {
                setActiveItem({ item, section, index });
                setShowProblemDialog(true);
            } else if (section === 'family' && (item.name === "Obesity" || item.name === "Hypertension")) {
                setActiveItem({ item, section, index });
                setShowFamilyDialog(true);
            } else if (item.name === "Food Habits") {
                setActiveItem({ item, section, index });
                setShowHabitDialog(true);
            }
        }
        setList(newList);
    };

    const updateActiveItem = (updates: Partial<HistoryItem>) => {
        if (!activeItem) return;
        const { section, index } = activeItem;
        let setList: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
        let list: HistoryItem[] = [];

        if (section === 'problems') { list = problems; setList = setProblems; }
        else if (section === 'family') { list = familyHistory; setList = setFamilyHistory; }
        else { list = lifestyle; setList = setLifestyle; }

        setList(prev => {
            const newList = [...prev];
            newList[index] = { ...newList[index], ...updates };
            return newList;
        });
    };

    return (
        <div className="flex h-full bg-slate-50">
            {/* --- LEFT CONTENT --- */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-3xl mx-auto space-y-10 pb-20">

                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">General Medical History</h2>
                            <p className="text-xs text-slate-500">Patient's past and present health status</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm">Add Question</Button>
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Save History</Button>
                        </div>
                    </div>

                    {/* 1. Problems */}
                    <div ref={sectionRefs.problems}>
                        <SectionTitle title="1. Medical Problems" icon={Stethoscope} />
                        <p className="text-xs font-bold text-slate-400 mb-3">SELECT MEDICAL PROBLEM</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {problems.map((item, i) => (
                                <HistoryChip key={i} item={item} onClick={() => toggleSelection('problems', i)} />
                            ))}
                        </div>
                        <div className="space-y-3">
                            <TextField label="Chief Complains" />
                            <TextField label="K/c/o" />
                            <TextField label="Past History" />
                        </div>
                    </div>

                    <div className="h-px bg-slate-200" />

                    {/* 2. Allergies */}
                    <div ref={sectionRefs.allergies}>
                        <SectionTitle title="2. Allergies" icon={AlertCircle} />
                        <p className="text-xs font-bold text-slate-400 mb-3">GENERAL & DRUG ALLERGIES</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {allergies.map((item, i) => (
                                <HistoryChip key={i} item={item} onClick={() => toggleSelection('allergies', i)} />
                            ))}
                        </div>
                        <TextField label="Other Allergies" />
                    </div>

                    <div className="h-px bg-slate-200" />

                    {/* 3. Family */}
                    <div ref={sectionRefs.family}>
                        <SectionTitle title="3. Family History" icon={Users} />
                        <p className="text-xs font-bold text-slate-400 mb-3">WHAT ILLNESSES RUN IN YOUR FAMILY?</p>
                        <div className="flex flex-wrap gap-2">
                            {familyHistory.map((item, i) => (
                                <HistoryChip key={i} item={item} onClick={() => toggleSelection('family', i)} />
                            ))}
                        </div>
                    </div>

                    <div className="h-px bg-slate-200" />

                    {/* 4. Lifestyle */}
                    <div ref={sectionRefs.lifestyle}>
                        <SectionTitle title="4. Lifestyle" icon={Coffee} />
                        <p className="text-xs font-bold text-slate-400 mb-3">LIFESTYLE DETAILS</p>
                        <div className="flex flex-wrap gap-2">
                            {lifestyle.map((item, i) => (
                                <HistoryChip key={i} item={item} onClick={() => toggleSelection('lifestyle', i)} />
                            ))}
                        </div>
                    </div>

                    <div className="h-px bg-slate-200" />

                    {/* 5. Procedure */}
                    <div ref={sectionRefs.procedure}>
                        <SectionTitle title="5. Procedure" icon={Activity} />
                        <p className="text-xs font-bold text-slate-400 mb-3">HAVE YOU UNDERGONE ANY PROCEDURES?</p>
                        <div className="flex gap-4">
                            {["Yes", "No", "Don't Know"].map(opt => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="procedure" className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-medium text-slate-700">{opt}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            {/* --- RIGHT SIDEBAR --- */}
            <div className="w-[220px] bg-white border-l border-slate-200 flex flex-col">
                <div className="p-4 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Navigation</span>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                    <SidebarItem label="1. Medical Problems" onClick={() => scrollToSection(sectionRefs.problems)} />
                    <SidebarItem label="2. Allergies" onClick={() => scrollToSection(sectionRefs.allergies)} />
                    <SidebarItem label="3. Family History" onClick={() => scrollToSection(sectionRefs.family)} />
                    <SidebarItem label="4. Lifestyle" onClick={() => scrollToSection(sectionRefs.lifestyle)} />
                    <SidebarItem label="5. Procedure" onClick={() => scrollToSection(sectionRefs.procedure)} />
                </div>
            </div>

            {/* --- DIALOGS --- */}
            <ProblemDialog
                open={showProblemDialog}
                onOpenChange={setShowProblemDialog}
                item={activeItem?.item}
                onSave={(d: string | null, sd: string) => updateActiveItem({ detail: d || undefined, subDetail: sd })}
            />
            <FamilyDialog
                open={showFamilyDialog}
                onOpenChange={setShowFamilyDialog}
                item={activeItem?.item}
                onSave={(tags: string[]) => updateActiveItem({ tags })}
            />
            <HabitDialog
                open={showHabitDialog}
                onOpenChange={setShowHabitDialog}
                item={activeItem?.item}
                onSave={(d: string | null) => updateActiveItem({ detail: d || undefined })}
            />
        </div>
    );
}

// --- Sub Components ---

function SectionTitle({ title, icon: Icon }: any) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Icon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 underline decoration-blue-200 decoration-2 underline-offset-4">{title}</h3>
        </div>
    );
}

function HistoryChip({ item, onClick }: { item: HistoryItem, onClick: () => void }) {
    let label = item.name;
    if (item.detail) label += ` (${item.detail})`;
    if (item.tags.length > 0) label += ` (${item.tags.join(', ')})`;

    return (
        <button
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-2",
                item.isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
            )}
        >
            <span>{label}</span>
            {item.isSelected && <X className="w-3 h-3 text-blue-200 hover:text-white" />}
        </button>
    );
}

function TextField({ label }: { label: string }) {
    return (
        <div className="relative">
            <label className="absolute -top-2 left-2 px-1 bg-slate-50 text-[10px] font-bold text-slate-500">{label}</label>
            <input
                type="text"
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600 hover:underline">
                Add Notes
            </button>
        </div>
    );
}

function SidebarItem({ label, onClick }: { label: string, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full text-left px-4 py-3 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors border-l-2 border-transparent hover:border-blue-600"
        >
            {label}
        </button>
    );
}

// --- Dialog Implementations ---

function ProblemDialog({ open, onOpenChange, item, onSave }: any) {
    const [duration, setDuration] = useState<string | null>(null);
    const [meds, setMeds] = useState("No");

    const handleSave = () => {
        onSave(duration, meds === "Yes" ? "Meds: Yes" : "Meds: No");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>{item?.name} Details</DialogTitle></DialogHeader>
                <div className="py-4 space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-2 block">DURATION</label>
                        <div className="flex flex-wrap gap-2">
                            {["0-3 Months", "3-6 Months", "6-12 Months", "1-2 Years", "5+ Years"].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDuration(d)}
                                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border", duration === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-2 block">MEDICATION?</label>
                        <div className="flex gap-2">
                            {["Yes", "No"].map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => setMeds(opt)}
                                    className={cn("px-4 py-1.5 rounded-lg text-xs font-medium border", meds === opt ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter><Button onClick={handleSave}>Done</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function FamilyDialog({ open, onOpenChange, item, onSave }: any) {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const toggle = (m: string) => {
        const newSet = new Set(selected);
        if (newSet.has(m)) newSet.delete(m); else newSet.add(m);
        setSelected(newSet);
    };

    const handleSave = () => {
        onSave(Array.from(selected));
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Who has {item?.name}?</DialogTitle></DialogHeader>
                <div className="py-4 flex flex-wrap gap-2">
                    {["Father", "Mother", "Spouse", "Sister", "Brother", "Aunt", "Uncle", "Grandparent"].map(m => (
                        <button
                            key={m}
                            onClick={() => toggle(m)}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border", selected.has(m) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}
                        >
                            {m}
                        </button>
                    ))}
                </div>
                <DialogFooter><Button onClick={handleSave}>Done</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function HabitDialog({ open, onOpenChange, item, onSave }: any) {
    const [habit, setHabit] = useState<string | null>(null);

    const handleSave = () => {
        onSave(habit);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Food Habits</DialogTitle></DialogHeader>
                <div className="py-4 flex flex-wrap gap-2">
                    {["Veg", "Non-veg", "Eggetarian", "Keto", "Vegan"].map(h => (
                        <button
                            key={h}
                            onClick={() => setHabit(h)}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border", habit === h ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}
                        >
                            {h}
                        </button>
                    ))}
                </div>
                <DialogFooter><Button onClick={handleSave}>Done</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
