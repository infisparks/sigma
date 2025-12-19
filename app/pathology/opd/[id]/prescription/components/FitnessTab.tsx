"use client"

import React, { useState, useEffect } from 'react';
import {
    Library, Search, CheckCircle, Edit3, Plus, Trash2,
    Utensils, Activity, Check, X, Clock, List
} from 'lucide-react';
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// --- Theme ---
const FitTheme = {
    primary: "text-blue-600",
    primaryBg: "bg-blue-600",
    background: "bg-slate-100",
    surface: "bg-white",
    textMain: "text-slate-900",
    textSub: "text-slate-500",
    border: "border-slate-200",
    success: "text-emerald-500",
    successBg: "bg-emerald-500",
    dietColor: "text-orange-600",
    dietBg: "bg-orange-600",
    exerciseColor: "text-cyan-600",
    exerciseBg: "bg-cyan-600",
};

// --- Models ---
type PlanType = 'diet' | 'exercise';

interface DietEntry {
    timeSlot: string;
    description: string;
}

interface ExerciseEntry {
    activity: string;
    durationMinutes: number;
    note?: string;
}

interface FitnessPlan {
    id: string;
    title: string;
    type: PlanType;
    isAssigned: boolean;
    dietEntries?: DietEntry[];
    exerciseEntries?: ExerciseEntry[];
}

interface FitnessTabProps {
    opdId: number;
}

export default function FitnessTab({ opdId }: FitnessTabProps) {
    // --- State ---
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>("d1");
    const [isEditing, setIsEditing] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isFinalized, setIsFinalized] = useState(false);

    // Default Templates (Mock Data)
    const defaultPlans: FitnessPlan[] = [
        {
            id: "d1", title: "Standard 1500 kcal", type: 'diet', isAssigned: false,
            dietEntries: [
                { timeSlot: "Pre-Breakfast", description: "Warm water + Lemon, 5 Soaked Almonds" },
                { timeSlot: "Breakfast", description: "2 Idli / 1 Dosa with Sambhar (No chutney)" },
                { timeSlot: "Lunch", description: "1 Cup Brown Rice, 1 Cup Dal, Green Salad" },
                { timeSlot: "Dinner", description: "2 Roti, Grilled Veggies/Paneer" },
            ]
        },
        {
            id: "d2", title: "Gestational Diabetes", type: 'diet', isAssigned: false,
            dietEntries: [
                { timeSlot: "Breakfast", description: "Oats Porridge (Unsweetened)" },
                { timeSlot: "Mid-Morning", description: "1 Apple / Guava" },
                { timeSlot: "Lunch", description: "Low GI Rice (1/2 cup), Veggies (2 cups)" },
            ]
        },
        { id: "d3", title: "High Protein", type: 'diet', isAssigned: false, dietEntries: [] },
        {
            id: "e1", title: "Basic Cardio", type: 'exercise', isAssigned: false,
            exerciseEntries: [
                { activity: "Walking", durationMinutes: 30, note: "Brisk pace" },
                { activity: "Yoga", durationMinutes: 20 },
            ]
        },
        { id: "e2", title: "Weight Loss", type: 'exercise', isAssigned: false, exerciseEntries: [] },
    ];

    const [plans, setPlans] = useState<FitnessPlan[]>(defaultPlans);

    // --- Persistence (Industry Expert Logic) ---
    useEffect(() => {
        const loadData = async () => {
            try {
                // 1. Fetch Status & Server Data
                const { data: serverData, error } = await supabase
                    .from('opd_registration')
                    .select('is_finalized, fitness_plan_json')
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                const finalized = serverData?.is_finalized || false;
                const serverPlans = serverData?.fitness_plan_json || [];
                setIsFinalized(finalized);

                // 2. Decide Source
                if (finalized) {
                    // Finalized: Strictly load from server
                    if (serverPlans.length > 0) setPlans(serverPlans);
                } else {
                    // Draft: Prioritize Local Storage
                    const saved = localStorage.getItem(`draft_fitness_${opdId}`);

                    if (saved) {
                        try {
                            setPlans(JSON.parse(saved));
                        } catch (e) {
                            console.error("Local draft corrupt", e);
                            if (serverPlans.length > 0) setPlans(serverPlans);
                        }
                    } else {
                        // No local draft? Initialize from server (sync)
                        if (serverPlans.length > 0) {
                            setPlans(serverPlans);
                            localStorage.setItem(`draft_fitness_${opdId}`, JSON.stringify(serverPlans));
                        } else {
                            // New record, keep defaults but save to local
                            localStorage.setItem(`draft_fitness_${opdId}`, JSON.stringify(defaultPlans));
                        }
                    }
                }
            } catch (e) {
                console.error("Error loading fitness plans", e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadData();
    }, [opdId]);

    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(`draft_fitness_${opdId}`, JSON.stringify(plans));
        }
    }, [plans, opdId, isLoaded]);

    const selectedPlan = plans.find(p => p.id === selectedPlanId) || plans[0];

    // --- Actions ---
    const toggleAssign = () => {
        setPlans(prev => prev.map(p =>
            p.id === selectedPlanId ? { ...p, isAssigned: !p.isAssigned } : p
        ));
    };

    const addItemToPlan = () => {
        setPlans(prev => prev.map(p => {
            if (p.id !== selectedPlanId) return p;

            if (p.type === 'diet') {
                return { ...p, dietEntries: [...(p.dietEntries || []), { timeSlot: "Snack", description: "" }] };
            } else {
                return { ...p, exerciseEntries: [...(p.exerciseEntries || []), { activity: "New Activity", durationMinutes: 15 }] };
            }
        }));
        setIsEditing(true);
    };

    const deleteItem = (index: number) => {
        setPlans(prev => prev.map(p => {
            if (p.id !== selectedPlanId) return p;

            if (p.type === 'diet') {
                const newEntries = [...(p.dietEntries || [])];
                newEntries.splice(index, 1);
                return { ...p, dietEntries: newEntries };
            } else {
                const newEntries = [...(p.exerciseEntries || [])];
                newEntries.splice(index, 1);
                return { ...p, exerciseEntries: newEntries };
            }
        }));
    };

    const updateItem = (index: number, field: string, value: any) => {
        setPlans(prev => prev.map(p => {
            if (p.id !== selectedPlanId) return p;

            if (p.type === 'diet') {
                const newEntries = [...(p.dietEntries || [])];
                newEntries[index] = { ...newEntries[index], [field]: value };
                return { ...p, dietEntries: newEntries };
            } else {
                const newEntries = [...(p.exerciseEntries || [])];
                newEntries[index] = { ...newEntries[index], [field]: value };
                return { ...p, exerciseEntries: newEntries };
            }
        }));
    };

    return (
        <div className={`flex h-full ${FitTheme.background}`}>
            {/* --- LEFT SIDEBAR (Library) --- */}
            <div className={`w-[300px] flex flex-col border-r ${FitTheme.border} ${FitTheme.surface}`}>
                {/* Header */}
                <div className={`p-4 border-b ${FitTheme.border} flex items-center gap-3`}>
                    <div className={`p-2 rounded-lg bg-blue-50 ${FitTheme.primary}`}>
                        <Library className="w-4 h-4" />
                    </div>
                    <span className={`font-bold text-sm ${FitTheme.textMain}`}>Wellness Plans</span>
                </div>

                {/* Search */}
                <div className="p-4">
                    <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${FitTheme.textSub}`} />
                        <input
                            type="text"
                            placeholder="Filter templates..."
                            className={`w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-200`}
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
                    {/* Diet Section */}
                    <div>
                        <SectionLabel text="DIET & NUTRITION" />
                        <div className="space-y-2 mt-2">
                            {plans.filter(p => p.type === 'diet').map(p => (
                                <PlanCard
                                    key={p.id}
                                    plan={p}
                                    isSelected={p.id === selectedPlanId}
                                    onClick={() => { setSelectedPlanId(p.id); setIsEditing(false); }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Exercise Section */}
                    <div>
                        <SectionLabel text="PHYSICAL ACTIVITY" />
                        <div className="space-y-2 mt-2">
                            {plans.filter(p => p.type === 'exercise').map(p => (
                                <PlanCard
                                    key={p.id}
                                    plan={p}
                                    isSelected={p.id === selectedPlanId}
                                    onClick={() => { setSelectedPlanId(p.id); setIsEditing(false); }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- RIGHT CONTENT (Editor) --- */}
            <div className="flex-1 flex flex-col bg-slate-50">
                {/* Toolbar */}
                <div className={`px-8 py-5 bg-white border-b ${FitTheme.border} flex items-center justify-between`}>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold tracking-wider uppercase ${selectedPlan.type === 'diet' ? FitTheme.dietColor : FitTheme.exerciseColor}`}>
                                {selectedPlan.type === 'diet' ? "NUTRITION PLAN" : "WORKOUT PLAN"}
                            </span>
                            {selectedPlan.isAssigned && (
                                <span className="bg-emerald-50 text-emerald-600 text-[9px] font-bold px-1.5 py-0.5 rounded">ASSIGNED</span>
                            )}
                        </div>
                        <h2 className={`text-xl font-extrabold ${FitTheme.textMain}`}>{selectedPlan.title}</h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${FitTheme.border} text-xs font-medium hover:bg-slate-50 transition-colors`}
                        >
                            {isEditing ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                            {isEditing ? "Done Editing" : "Customize"}
                        </button>

                        <button
                            onClick={toggleAssign}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm",
                                selectedPlan.isAssigned
                                    ? "bg-white border border-red-200 text-red-500 hover:bg-red-50"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                            )}
                        >
                            {selectedPlan.isAssigned ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            {selectedPlan.isAssigned ? "Unassign" : "Assign Plan"}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {selectedPlan.type === 'diet' ? (
                        <div className="space-y-4">
                            {selectedPlan.dietEntries?.length === 0 && <EmptyState msg="No meal details added." />}
                            {selectedPlan.dietEntries?.map((entry, idx) => (
                                isEditing ? (
                                    <DietRowEditor
                                        key={idx}
                                        entry={entry}
                                        onDelete={() => deleteItem(idx)}
                                        onUpdate={(field, val) => updateItem(idx, field, val)}
                                    />
                                ) : (
                                    <DietRowRead key={idx} entry={entry} />
                                )
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-4">
                            {selectedPlan.exerciseEntries?.length === 0 && <EmptyState msg="No exercises added." />}
                            {selectedPlan.exerciseEntries?.map((entry, idx) => (
                                isEditing ? (
                                    <ExerciseRowEditor
                                        key={idx}
                                        entry={entry}
                                        onDelete={() => deleteItem(idx)}
                                        onUpdate={(field, val) => updateItem(idx, field, val)}
                                    />
                                ) : (
                                    <ExerciseRowRead key={idx} entry={entry} />
                                )
                            ))}
                        </div>
                    )}

                    {isEditing && (
                        <div className="mt-8 flex justify-center">
                            <button
                                onClick={addItemToPlan}
                                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                                <Plus className="w-5 h-5" /> Add New Item
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Sub Components ---

function SectionLabel({ text }: { text: string }) {
    return <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 ml-1">{text}</p>;
}

function PlanCard({ plan, isSelected, onClick }: { plan: FitnessPlan, isSelected: boolean, onClick: () => void }) {
    const accentColor = plan.type === 'diet' ? FitTheme.dietColor : FitTheme.exerciseColor;

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                isSelected
                    ? `bg-slate-50 ${accentColor} border-slate-300`
                    : "bg-white border-slate-100 hover:border-slate-200"
            )}
        >
            <div className={cn(
                "p-2 rounded-full border bg-white",
                isSelected ? `border-current` : "border-slate-200 text-slate-400"
            )}>
                {plan.type === 'diet' ? <Utensils className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className={cn("text-xs font-bold truncate", isSelected ? "text-slate-900" : "text-slate-700")}>{plan.title}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                    {plan.type === 'diet' ? `${plan.dietEntries?.length || 0} meals` : `${plan.exerciseEntries?.length || 0} activities`}
                </p>
            </div>
            {plan.isAssigned && <CheckCircle className="w-4 h-4 text-emerald-500" />}
        </div>
    );
}

function EmptyState({ msg }: { msg: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <List className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">{msg}</p>
        </div>
    );
}

// --- Read Views ---

function DietRowRead({ entry }: { entry: DietEntry }) {
    return (
        <div className="flex items-stretch">
            <div className="w-24 text-right pt-1">
                <span className="text-xs font-bold text-slate-900">{entry.timeSlot}</span>
            </div>
            <div className="w-px bg-slate-200 mx-5 relative">
                <div className="absolute top-2 -left-[3px] w-[7px] h-[7px] rounded-full bg-slate-300 border border-white"></div>
            </div>
            <div className="flex-1 pb-8">
                <p className="text-sm text-slate-600 leading-relaxed">{entry.description}</p>
            </div>
        </div>
    );
}

function ExerciseRowRead({ entry }: { entry: ExerciseEntry }) {
    return (
        <div className="w-[300px] p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-cyan-50 rounded-full text-cyan-600">
                <Activity className="w-5 h-5" />
            </div>
            <div>
                <p className="font-bold text-sm text-slate-900">{entry.activity}</p>
                <p className="text-xs font-bold text-slate-500 mt-1">{entry.durationMinutes} mins</p>
                {entry.note && <p className="text-[10px] text-slate-400 mt-2 leading-tight">{entry.note}</p>}
            </div>
        </div>
    );
}

// --- Edit Views ---

function DietRowEditor({ entry, onDelete, onUpdate }: { entry: DietEntry, onDelete: () => void, onUpdate: (f: string, v: any) => void }) {
    return (
        <div className="flex gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="w-32">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Time Slot</label>
                <input
                    type="text"
                    value={entry.timeSlot}
                    onChange={(e) => onUpdate('timeSlot', e.target.value)}
                    className="w-full text-sm font-bold border-b border-slate-200 focus:border-blue-500 focus:outline-none py-1"
                />
            </div>
            <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Food Items</label>
                <input
                    type="text"
                    value={entry.description}
                    onChange={(e) => onUpdate('description', e.target.value)}
                    className="w-full text-sm border-b border-slate-200 focus:border-blue-500 focus:outline-none py-1"
                />
            </div>
            <button onClick={onDelete} className="text-red-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}

function ExerciseRowEditor({ entry, onDelete, onUpdate }: { entry: ExerciseEntry, onDelete: () => void, onUpdate: (f: string, v: any) => void }) {
    return (
        <div className="w-full p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-4 items-start">
            <div className="flex-1 space-y-3">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Activity</label>
                        <input
                            type="text"
                            value={entry.activity}
                            onChange={(e) => onUpdate('activity', e.target.value)}
                            className="w-full text-sm font-bold border-b border-slate-200 focus:border-blue-500 focus:outline-none py-1"
                        />
                    </div>
                    <div className="w-32">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Duration (Min)</label>
                        <div className="flex gap-1">
                            {[15, 30, 45, 60].map(m => (
                                <button
                                    key={m}
                                    onClick={() => onUpdate('durationMinutes', m)}
                                    className={cn(
                                        "px-2 py-1 rounded text-[10px] font-bold border",
                                        entry.durationMinutes === m ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-500 border-slate-200"
                                    )}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Notes</label>
                    <input
                        type="text"
                        value={entry.note || ""}
                        onChange={(e) => onUpdate('note', e.target.value)}
                        className="w-full text-xs text-slate-500 border-b border-slate-200 focus:border-blue-500 focus:outline-none py-1"
                        placeholder="Optional notes..."
                    />
                </div>
            </div>
            <button onClick={onDelete} className="text-red-400 hover:text-red-500 mt-2">
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}
