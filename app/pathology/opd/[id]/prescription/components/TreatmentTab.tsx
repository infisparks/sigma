"use client"

import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, Plus, Trash2, Edit3, Clock, Calendar,
    PieChart, Check, X, Copy, History
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

// --- Theme ---
const TxTheme = {
    primary: "text-blue-600",
    primaryBg: "bg-blue-600",
    background: "bg-slate-100",
    surface: "bg-white",
    textMain: "text-slate-900",
    textSub: "text-slate-500",
    border: "border-slate-200",
};

// --- Models ---
interface TimingSchedule {
    bb: boolean; ab: boolean;
    bl: boolean; al: boolean;
    bd: boolean; ad: boolean;
}

interface PrescriptionEntry {
    id: string;
    name: string;
    type: string;
    dosage: string;
    duration: string;
    note: string;
    timing: TimingSchedule;
}

interface TreatmentTabProps {
    opdId: number;
    patientId: string; // For history fetching
}

export default function TreatmentTab({ opdId, patientId }: TreatmentTabProps) {
    // --- State ---
    const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
    const [medicines, setMedicines] = useState<PrescriptionEntry[]>([]);
    const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [historyList, setHistoryList] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    const selectedMed = medicines.find(m => m.id === selectedMedId);

    // --- Search Logic (Debounced) ---
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.length >= 2) {
                try {
                    const { data, error } = await supabase
                        .from('medicine')
                        .select('id, name, type, manufacturer_name')
                        .ilike('name', `${searchQuery}%`)
                        .limit(30);

                    if (error) {
                        console.error("Supabase search error:", error);
                    }

                    if (data) {
                        console.log("Found medicines:", data.length);
                        setSearchResults(data);
                    }
                } catch (err) {
                    console.error("Search exception:", err);
                }
            } else if (searchQuery.length === 0) {
                // Load random default medicines
                try {
                    // Fetch a random chunk from the first 5000 records to show variety
                    const randomOffset = Math.floor(Math.random() * 5000);
                    const { data, error } = await supabase
                        .from('medicine')
                        .select('id, name, type, manufacturer_name')
                        .range(randomOffset, randomOffset + 29);

                    if (error) console.error("Default fetch error:", error);
                    if (data) setSearchResults(data);
                } catch (err) {
                    console.error("Default fetch exception:", err);
                }
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const [isFinalized, setIsFinalized] = useState(false);

    // --- Load Data (Industry Expert Logic) ---
    useEffect(() => {
        const loadData = async () => {
            try {
                // 1. Fetch Status & Server Data
                const { data: serverData, error } = await supabase
                    .from('opd_registration')
                    .select('is_finalized, rx_list_json')
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                const serverList = serverData?.rx_list_json || [];
                const finalized = serverData?.is_finalized || false;
                setIsFinalized(finalized);

                // 2. Decide Source
                if (finalized) {
                    // If finalized, STRICTLY load from server. Ignore local drafts.
                    setMedicines(serverList);
                } else {
                    // If draft, prioritize Local Storage (to prevent data loss on refresh)
                    const localDraft = localStorage.getItem(`draft_rx_${opdId}`);

                    if (localDraft) {
                        try {
                            setMedicines(JSON.parse(localDraft));
                        } catch (e) {
                            // Corrupt local data? Fallback to server
                            console.error("Local draft corrupt, falling back to server", e);
                            setMedicines(serverList);
                        }
                    } else {
                        // No local draft? Initialize with server data (e.g. continuing from another device)
                        setMedicines(serverList);
                        // And sync to local immediately to start the draft session
                        localStorage.setItem(`draft_rx_${opdId}`, JSON.stringify(serverList));
                    }
                }
            } catch (e) {
                console.error("Error loading medicines:", e);
            } finally {
                setIsLoaded(true);
            }
        };

        loadData();
    }, [opdId]);

    useEffect(() => {
        // Auto-save to Local Storage (Only if NOT    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(`draft_rx_${opdId}`, JSON.stringify(medicines));
        }
    }, [medicines, opdId, isLoaded]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab]);

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const { data } = await supabase
                .from('opd_registration')
                .select('id, created_at, rx_list_json')
                .eq('uhid', patientId)
                .neq('id', opdId)
                .not('rx_list_json', 'is', null)
                .order('created_at', { ascending: false })
                .limit(10);

            if (data) {
                setHistoryList(data.filter(d => Array.isArray(d.rx_list_json) && d.rx_list_json.length > 0));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingHistory(false);
        }
    };

    // --- Actions ---
    const addMedicine = (name: string, type: string = 'TAB') => {
        const newMed: PrescriptionEntry = {
            id: Date.now().toString() + Math.random().toString().slice(2),
            name,
            type: type || 'TAB',
            dosage: "1",
            duration: "5d",
            note: "",
            timing: { bb: false, ab: false, bl: false, al: false, bd: false, ad: false }
        };
        setMedicines(prev => [...prev, newMed]);
        setSelectedMedId(newMed.id);
        setSearchQuery("");
    };

    const updateMedicine = (id: string, updates: Partial<PrescriptionEntry>) => {
        setMedicines(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    const updateTiming = (id: string, key: keyof TimingSchedule, val: boolean) => {
        setMedicines(prev => prev.map(m =>
            m.id === id ? { ...m, timing: { ...m.timing, [key]: val } } : m
        ));
    };

    const removeMedicine = (id: string) => {
        setMedicines(prev => prev.filter(m => m.id !== id));
        if (selectedMedId === id) setSelectedMedId(null);
    };

    const copyFromHistory = (items: any[]) => {
        const newItems = items.map(item => ({
            ...item,
            id: Date.now().toString() + Math.random().toString(), // New ID
        }));
        setMedicines(prev => [...prev, ...newItems]);
        setActiveTab('current');
    };

    return (
        <div className={`flex h-full ${TxTheme.background}`}>
            {/* --- LEFT PANEL --- */}
            <div className={`w-[400px] flex flex-col border-r ${TxTheme.border} ${TxTheme.surface}`}>
                {/* Tabs */}
                <div className="p-4 border-b border-slate-100">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('current')}
                            className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", activeTab === 'current' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
                        >
                            Current Rx
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", activeTab === 'history' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
                        >
                            History
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'current' ? (
                        <div className="flex flex-col h-full">
                            {/* --- Active List (Top - Reduced Height) --- */}
                            <div className="h-[35%] overflow-y-auto p-4 border-b border-slate-200 bg-white">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Active Prescriptions ({medicines.length})</span>
                                </div>

                                {medicines.length === 0 ? (
                                    <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                                        <p className="text-xs text-slate-400">No medicines added yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {medicines.map(med => (
                                            <div
                                                key={med.id}
                                                onClick={() => setSelectedMedId(med.id)}
                                                className={cn(
                                                    "p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3",
                                                    selectedMedId === med.id ? "bg-blue-50 border-blue-200 shadow-sm" : "bg-white border-slate-200 hover:border-blue-200"
                                                )}
                                            >
                                                <div className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-500">{med.type}</div>
                                                <div className="flex-1 font-medium text-sm text-slate-900 truncate">{med.name}</div>
                                                {selectedMedId === med.id && <Edit3 className="w-3.5 h-3.5 text-blue-600" />}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* --- Add New (Bottom - Expanded) --- */}
                            <div className="flex-1 p-4 bg-slate-50 flex flex-col min-h-0">
                                <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-3">Add Medicine</span>

                                {/* Search */}
                                <div className="relative mb-4 shrink-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search brands or generics..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && searchQuery) addMedicine(searchQuery);
                                        }}
                                        className="w-full pl-9 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                                    />
                                </div>

                                {/* Suggestions Grid */}
                                <div className="flex-1 overflow-y-auto">
                                    <div className="flex flex-wrap gap-2 content-start">
                                        {searchResults
                                            .filter(m => !medicines.some(added => added.name === m.name)) // Filter out added
                                            .map((m, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => addMedicine(m.name, m.type || 'TAB')}
                                                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm text-left"
                                                >
                                                    <span className="block font-bold">{m.name}</span>
                                                    {m.manufacturer_name && <span className="block text-[10px] text-slate-400 truncate">{m.manufacturer_name}</span>}
                                                </button>
                                            ))}
                                        {searchQuery && (
                                            <button
                                                onClick={() => addMedicine(searchQuery)}
                                                className="px-3 py-2 bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-200 transition-colors"
                                            >
                                                Add "{searchQuery}"
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 space-y-4">
                            {loadingHistory ? (
                                <div className="text-center py-8 text-slate-400 text-xs">Loading history...</div>
                            ) : historyList.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-xs">No history found.</div>
                            ) : (
                                historyList.map(visit => (
                                    <div key={visit.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <History className="w-3.5 h-3.5 text-slate-500" />
                                                <span className="text-xs font-bold text-slate-700">
                                                    {new Date(visit.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => copyFromHistory(visit.rx_list_json)}
                                                className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100"
                                            >
                                                <Copy className="w-3 h-3" /> Copy All
                                            </button>
                                        </div>
                                        <div className="p-3 space-y-2">
                                            {visit.rx_list_json.map((m: any, i: number) => (
                                                <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                                    <span>{m.name}</span>
                                                    <span className="text-slate-400">({m.dosage})</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* --- RIGHT PANEL (Editor) --- */}
            <div className="flex-1 bg-slate-50/50 flex flex-col">
                {selectedMed ? (
                    <div className="flex flex-col h-full">
                        {/* Header */}
                        <div className="px-8 py-6 bg-white border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                                    <Plus className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{selectedMed.type}</span>
                                    </div>
                                    <h2 className="text-xl font-extrabold text-slate-900">{selectedMed.name}</h2>
                                </div>
                            </div>
                            <button onClick={() => removeMedicine(selectedMed.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Editor Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            {/* Dosage */}
                            <div>
                                <SectionHeader title="DOSAGE PER INTAKE" icon={PieChart} />
                                <div className="mt-3 flex flex-wrap gap-3">
                                    {["1/4", "1/2", "1", "1½", "2", "3"].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => updateMedicine(selectedMed.id, { dosage: d })}
                                            className={cn(
                                                "w-12 h-12 rounded-full border flex items-center justify-center text-sm font-bold transition-all",
                                                selectedMed.dosage === d
                                                    ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200"
                                                    : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                                            )}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Timing */}
                            <div>
                                <SectionHeader title="TIMING & FREQUENCY" icon={Clock} />
                                <div className="mt-3 grid grid-cols-3 gap-4">
                                    <TimingBlock
                                        label="Breakfast"
                                        icon={Clock}
                                        before={selectedMed.timing.bb}
                                        after={selectedMed.timing.ab}
                                        onToggleBefore={() => updateTiming(selectedMed.id, 'bb', !selectedMed.timing.bb)}
                                        onToggleAfter={() => updateTiming(selectedMed.id, 'ab', !selectedMed.timing.ab)}
                                    />
                                    <TimingBlock
                                        label="Lunch"
                                        icon={Clock}
                                        before={selectedMed.timing.bl}
                                        after={selectedMed.timing.al}
                                        onToggleBefore={() => updateTiming(selectedMed.id, 'bl', !selectedMed.timing.bl)}
                                        onToggleAfter={() => updateTiming(selectedMed.id, 'al', !selectedMed.timing.al)}
                                    />
                                    <TimingBlock
                                        label="Dinner"
                                        icon={Clock}
                                        before={selectedMed.timing.bd}
                                        after={selectedMed.timing.ad}
                                        onToggleBefore={() => updateTiming(selectedMed.id, 'bd', !selectedMed.timing.bd)}
                                        onToggleAfter={() => updateTiming(selectedMed.id, 'ad', !selectedMed.timing.ad)}
                                    />
                                </div>
                            </div>

                            {/* Duration */}
                            <div>
                                <SectionHeader title="DURATION" icon={Calendar} />
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {["3d", "5d", "7d", "10d", "15d", "1m", "3m"].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => updateMedicine(selectedMed.id, { duration: d })}
                                            className={cn(
                                                "px-4 py-2 rounded-lg border text-xs font-bold transition-all",
                                                selectedMed.duration === d
                                                    ? "bg-slate-800 text-white border-slate-800"
                                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                            )}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-xs font-bold text-slate-900 mb-2 block">Instructions / Notes</label>
                                <input
                                    type="text"
                                    value={selectedMed.note}
                                    onChange={(e) => updateMedicine(selectedMed.id, { note: e.target.value })}
                                    placeholder="e.g. Take with warm water..."
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="p-6 bg-white rounded-full shadow-sm mb-4">
                            <Plus className="w-10 h-10 opacity-20" />
                        </div>
                        <p className="text-lg font-semibold text-slate-600">No Medicine Selected</p>
                        <p className="text-sm">Select or add a medicine to configure.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Sub Components ---

function SectionHeader({ title, icon: Icon }: { title: string, icon: any }) {
    return (
        <div className="flex items-center gap-2 text-slate-400">
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-bold tracking-widest">{title}</span>
        </div>
    );
}

function TimingBlock({ label, icon: Icon, before, after, onToggleBefore, onToggleAfter }: any) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-2 flex justify-center border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
            </div>
            <div className="flex divide-x divide-slate-100">
                <button
                    onClick={onToggleBefore}
                    className={cn("flex-1 py-2 text-[10px] font-bold transition-colors", before ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}
                >
                    Before
                </button>
                <button
                    onClick={onToggleAfter}
                    className={cn("flex-1 py-2 text-[10px] font-bold transition-colors", after ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}
                >
                    After
                </button>
            </div>
        </div>
    );
}
