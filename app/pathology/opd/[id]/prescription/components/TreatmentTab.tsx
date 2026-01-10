"use client"

import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, Plus, Trash2, Edit3, Clock, Calendar,
    PieChart, Check, X, Copy, History
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePrescription } from "../context/PrescriptionContext";
import { PrescriptionEntry, TimingSchedule } from "../types";
import { useMedicineMaster } from "../hooks/useMedicineMaster";

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

interface TreatmentTabProps {
    opdId: number;
    patientId: string; // For history fetching
}

export default function TreatmentTab({ opdId, patientId }: TreatmentTabProps) {
    // --- Context ---
    const {
        medicines, addMedicine, removeMedicine,
        updateMedicine, setMedicines, suggestedMedicines,
        isOnline, hasLocalChanges, lastSavedAt
    } = usePrescription();

    // --- Hooks ---
    const { searchMedicines, isSyncing, isLoading: masterLoading, addToMaster } = useMedicineMaster();

    // --- State ---
    const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
    const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [historyList, setHistoryList] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean, id: string, name: string } | null>(null);

    // Derived
    const selectedMed = medicines.find(m => m.id === selectedMedId);

    // --- Search Logic (Instant from Cache) ---
    useEffect(() => {
        setSearchResults(searchMedicines(searchQuery));
    }, [searchQuery, searchMedicines]);

    // --- History Logic ---
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
    const handleAddMedicine = (name: string, type: string = 'TAB') => {
        // Track if this is a new medicine to persist it to master
        if (isOnline) {
            addToMaster(name);
        }

        const newMed: PrescriptionEntry = {
            id: Date.now().toString() + Math.random().toString().slice(2),
            name,
            type: type || 'TAB',
            dosage: "1",
            duration: "5d",
            note: "",
            timing: { bb: false, ab: false, bl: false, al: false, bd: false, ad: false }
        };
        addMedicine(newMed);
        setSelectedMedId(newMed.id);
        setSearchQuery("");
    };

    // Wrapper for updateMedicine context action to match local signature if needed
    const handleUpdateMedicine = (id: string, updates: Partial<PrescriptionEntry>) => {
        updateMedicine(id, updates);
    };

    const handleUpdateTiming = (id: string, key: keyof TimingSchedule, val: boolean) => {
        const med = medicines.find(m => m.id === id);
        if (med) {
            updateMedicine(id, { timing: { ...med.timing, [key]: val } });
        }
    };

    const handleRemoveMedicine = (id: string) => {
        removeMedicine(id);
        if (selectedMedId === id) setSelectedMedId(null);
    };

    const copyFromHistory = (items: any[]) => {
        const newItems = items.map(item => ({
            ...item,
            id: Date.now().toString() + Math.random().toString(), // New ID
        }));
        // Append or replace? Append is better.
        // But setMedicines replaces. I need to append.
        newItems.forEach(item => addMedicine(item));
        setActiveTab('current');
    };

    return (
        <div className={`flex h-full ${TxTheme.background}`}>
            {/* --- LEFT PANEL --- */}
            <div className={`w-[380px] flex flex-col border-r ${TxTheme.border} ${TxTheme.surface}`}>
                {/* Tabs */}
                <div className="p-3 border-b border-slate-100">
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        <button
                            onClick={() => setActiveTab('current')}
                            className={cn("flex-1 py-1 text-[10px] font-bold rounded transition-all", activeTab === 'current' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
                        >
                            Current
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={cn("flex-1 py-1 text-[10px] font-bold rounded transition-all", activeTab === 'history' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
                        >
                            History
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Status Bar */}
                    <div className="px-3 py-1 flex items-center justify-between bg-white border-b border-slate-200">
                        <div className="flex items-center gap-2.5">
                            <div className="flex items-center gap-1.5">
                                <div className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" : "bg-red-500 animate-pulse")} />
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                                    {isOnline ? 'System Online' : 'Offline Mode'}
                                </span>
                            </div>
                            {lastSavedAt && (
                                <span className="text-[9px] text-slate-400 font-medium">
                                    Saved at {new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {isSyncing && (
                                <div className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded cursor-default">
                                    <div className="w-2 h-2 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[8px] font-black text-blue-600 uppercase">Indexing Medicines</span>
                                </div>
                            )}
                            {!isOnline && hasLocalChanges && (
                                <span className="text-[8px] font-black text-amber-600 uppercase px-1.5 py-0.5 bg-amber-50 rounded border border-amber-100">Local Changes Active</span>
                            )}
                            {isOnline && !hasLocalChanges && (
                                <div className="flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded">
                                    <Check className="w-2 h-2 text-emerald-600" />
                                    <span className="text-[8px] font-black text-emerald-600 uppercase">Synced</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {activeTab === 'current' ? (
                        <div className="flex flex-col h-full">
                            {/* --- Active List (Top - Reduced Height) --- */}
                            <div className="h-[35%] overflow-y-auto p-3 border-b border-slate-200 bg-white">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">Active ({medicines.length})</span>
                                </div>

                                {medicines.length === 0 ? (
                                    <div className="text-center py-4 border-2 border-dashed border-slate-100 rounded-lg">
                                        <p className="text-[10px] text-slate-400">No medicines.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {medicines.map(med => (
                                            <MedicineCard
                                                key={med.id}
                                                med={med}
                                                isSelected={selectedMedId === med.id}
                                                onClick={() => setSelectedMedId(med.id)}
                                                onLongPress={() => setDeleteConfirm({ isOpen: true, id: med.id, name: med.name })}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* --- Add New (Bottom - Expanded) --- */}
                            <div className="flex-1 p-3 bg-slate-50 flex flex-col min-h-0">
                                <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase mb-2">Add Medicine</span>

                                {/* Search */}
                                <div className="relative mb-3 shrink-0">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && searchQuery) handleAddMedicine(searchQuery);
                                        }}
                                        className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-100 shadow-sm"
                                    />
                                </div>

                                {/* Suggestions Grid */}
                                <div className="flex-1 overflow-y-auto">
                                    <div className="flex flex-wrap gap-1.5 content-start">
                                        {/* AI Suggested Medicines (Top Priority) */}
                                        {(!searchQuery || searchQuery.length < 2) && suggestedMedicines && suggestedMedicines.length > 0 && (
                                            <div className="w-full mb-2">
                                                <div className="text-[10px] font-black text-purple-600 mb-1.5 flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                                                    SUGGESTED
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {suggestedMedicines
                                                        .filter(m => !medicines.some(added => added.name === m))
                                                        .map((mName: string, i: number) => (
                                                            <button
                                                                key={`ai-${i}`}
                                                                onClick={() => handleAddMedicine(mName)} // Default to TAB, can be refined if we store type in AI
                                                                className="px-2 py-1.5 bg-purple-50 border border-purple-100 rounded-md text-[10px] font-bold text-slate-700 hover:bg-purple-100 hover:border-purple-300 transition-colors shadow-sm text-left"
                                                            >
                                                                {mName}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Search Results */}
                                        {searchResults
                                            .filter(m => !medicines.some(added => added.name === (m.medicine_name || m.name))) // Filter out added
                                            .map((m, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleAddMedicine(m.medicine_name || m.name, m.medicine?.type || 'TAB')}
                                                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-md text-[10px] font-medium text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm text-left max-w-full"
                                                >
                                                    <span className="block font-bold leading-tight">{m.medicine_name || m.name}</span>
                                                    {m.medicine?.manufacturer_name && <span className="block text-[8px] text-slate-400 leading-tight">{m.medicine.manufacturer_name}</span>}
                                                </button>
                                            ))}
                                        {searchQuery && (
                                            <button
                                                onClick={() => handleAddMedicine(searchQuery)}
                                                className="px-2 py-1 bg-blue-100 border border-blue-200 rounded-md text-[10px] font-bold text-blue-700 hover:bg-blue-200 transition-colors"
                                            >
                                                Add "{searchQuery}"
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 space-y-3">
                            {loadingHistory ? (
                                <div className="text-center py-4 text-slate-400 text-[10px]">Loading...</div>
                            ) : historyList.length === 0 ? (
                                <div className="text-center py-4 text-slate-400 text-[10px]">No history.</div>
                            ) : (
                                historyList.map(visit => (
                                    <div key={visit.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                        <div className="bg-slate-50 px-2 py-1.5 border-b border-slate-200 flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <History className="w-3 h-3 text-slate-500" />
                                                <span className="text-[10px] font-bold text-slate-700">
                                                    {new Date(visit.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => copyFromHistory(visit.rx_list_json)}
                                                className="flex items-center gap-1 text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                                            >
                                                <Copy className="w-2.5 h-2.5" /> Copy
                                            </button>
                                        </div>
                                        <div className="p-2 space-y-1">
                                            {visit.rx_list_json.map((m: any, i: number) => (
                                                <div key={i} className="text-[10px] text-slate-600 flex items-center gap-1.5">
                                                    <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                                    <span className="truncate">{m.name}</span>
                                                    <span className="text-slate-400 text-[9px]">({m.dosage})</span>
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
                        <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-[8px] font-black bg-slate-100 px-1 py-0.5 rounded text-slate-500 uppercase">{selectedMed.type}</span>
                                    </div>
                                    <h2 className="text-lg font-black text-slate-900 leading-tight">{selectedMed.name}</h2>
                                </div>
                            </div>
                            <button onClick={() => handleRemoveMedicine(selectedMed.id)} className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-md transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Editor Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* Dosage */}
                            <div>
                                <SectionHeader title="DOSAGE PER INTAKE" icon={PieChart} />
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {["1/4", "1/2", "1", "1½", "2", "3"].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => handleUpdateMedicine(selectedMed.id, { dosage: d })}
                                            className={cn(
                                                "w-10 h-10 rounded-full border flex items-center justify-center text-[11px] font-black transition-all",
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
                                <div className="mt-2 grid grid-cols-3 gap-3">
                                    <TimingBlock
                                        label="Breakfast"
                                        icon={Clock}
                                        before={selectedMed.timing.bb}
                                        after={selectedMed.timing.ab}
                                        onToggleBefore={() => handleUpdateTiming(selectedMed.id, 'bb', !selectedMed.timing.bb)}
                                        onToggleAfter={() => handleUpdateTiming(selectedMed.id, 'ab', !selectedMed.timing.ab)}
                                    />
                                    <TimingBlock
                                        label="Lunch"
                                        icon={Clock}
                                        before={selectedMed.timing.bl}
                                        after={selectedMed.timing.al}
                                        onToggleBefore={() => handleUpdateTiming(selectedMed.id, 'bl', !selectedMed.timing.bl)}
                                        onToggleAfter={() => handleUpdateTiming(selectedMed.id, 'al', !selectedMed.timing.al)}
                                    />
                                    <TimingBlock
                                        label="Dinner"
                                        icon={Clock}
                                        before={selectedMed.timing.bd}
                                        after={selectedMed.timing.ad}
                                        onToggleBefore={() => handleUpdateTiming(selectedMed.id, 'bd', !selectedMed.timing.bd)}
                                        onToggleAfter={() => handleUpdateTiming(selectedMed.id, 'ad', !selectedMed.timing.ad)}
                                    />
                                </div>
                            </div>

                            {/* Duration */}
                            <div>
                                <SectionHeader title="DURATION" icon={Calendar} />
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {["3d", "5d", "7d", "10d", "15d", "1m", "3m"].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => handleUpdateMedicine(selectedMed.id, { duration: d })}
                                            className={cn(
                                                "px-3 py-1.5 rounded-md text-[10px] font-black border transition-all",
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
                                <label className="text-[10px] font-black text-slate-900 mb-1.5 block uppercase tracking-wider">Instructions</label>
                                <input
                                    type="text"
                                    value={selectedMed.note}
                                    onChange={(e) => handleUpdateMedicine(selectedMed.id, { note: e.target.value })}
                                    placeholder="..."
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-100"
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="p-4 bg-white rounded-full shadow-sm mb-3">
                            <Plus className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-base font-bold text-slate-600">No Selection</p>
                        <p className="text-[11px]">Select or add a medicine.</p>
                    </div>
                )}
            </div>

            {deleteConfirm && (
                <DeleteConfirmation
                    isOpen={deleteConfirm.isOpen}
                    itemName={deleteConfirm.name}
                    onClose={() => setDeleteConfirm(null)}
                    onConfirm={() => handleRemoveMedicine(deleteConfirm.id)}
                />
            )}
        </div>
    );
}

// --- Sub Components ---

function SectionHeader({ title, icon: Icon }: { title: string, icon: any }) {
    return (
        <div className="flex items-center gap-1.5 text-slate-400">
            <Icon className="w-3 h-3" />
            <span className="text-[9px] font-black tracking-widest uppercase">{title}</span>
        </div>
    );
}

function MedicineCard({ med, isSelected, onClick, onLongPress }: { med: any, isSelected: boolean, onClick: () => void, onLongPress: () => void }) {
    const timerRef = React.useRef<NodeJS.Timeout | null>(null);
    const isLongPress = React.useRef(false);

    const handlePointerDown = (e: React.PointerEvent) => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            onLongPress();
        }, 500);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            if (!isLongPress.current && e.type !== 'pointerleave') {
                onClick();
            }
        }
    };

    return (
        <div
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
                "p-2 rounded-lg border cursor-pointer transition-all flex items-center gap-2 select-none touch-none",
                isSelected ? "bg-blue-50 border-blue-200 shadow-sm" : "bg-white border-slate-200 hover:border-blue-200"
            )}
        >
            <div className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500">{med.type}</div>
            <div className="flex-1 font-bold text-[11px] text-slate-900 leading-tight">{med.name}</div>
            {isSelected && <Edit3 className="w-3 h-3 text-blue-600 shrink-0" />}
        </div>
    );
}

function DeleteConfirmation({ isOpen, onClose, onConfirm, itemName }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, itemName: string }) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[300px]">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold">Delete Item?</DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    <p className="text-xs text-slate-500">Do you want to delete <span className="font-bold text-slate-700">"{itemName}"</span> from this prescription?</p>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                    <Button variant="ghost" size="sm" onClick={onClose} className="text-xs h-8">No</Button>
                    <Button variant="destructive" size="sm" onClick={() => { onConfirm(); onClose(); }} className="text-xs h-8">Yes, Delete</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function TimingBlock({ label, icon: Icon, before, after, onToggleBefore, onToggleAfter }: any) {
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="p-1.5 flex justify-center border-b border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase">{label}</span>
            </div>
            <div className="flex divide-x divide-slate-100">
                <button
                    onClick={onToggleBefore}
                    className={cn("flex-1 py-1.5 text-[9px] font-black transition-colors", before ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}
                >
                    Before
                </button>
                <button
                    onClick={onToggleAfter}
                    className={cn("flex-1 py-1.5 text-[9px] font-black transition-colors", after ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}
                >
                    After
                </button>
            </div>
        </div>
    );
}
