"use client"

import React, { useState, useEffect } from 'react';
import {
    Search, Check, X, Heart, Settings, Plus, Trash2,
    Clock, Activity, AlertCircle
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// --- Theme ---
const AppColors = {
    primaryBlue: "text-blue-600",
    primaryBg: "bg-blue-600",
    bg: "bg-slate-50",
    surface: "bg-white",
    textDark: "text-slate-900",
    textGrey: "text-slate-500",
    border: "border-slate-200",
    accentPink: "text-pink-500",
    accentOrange: "text-orange-500",
};

// --- Models ---
interface CustomOptionGroup {
    title: string;
    options: string[];
}

interface SymptomDetail {
    name: string;
    note: string;
    duration?: string;
    severity?: string;
    customGroups: CustomOptionGroup[];
    selectedCustomOptions: Set<string>;
}

interface SymptomsTabProps {
    opdId: number;
}

export default function SymptomsTab({ opdId }: SymptomsTabProps) {
    // --- State ---
    const [selectedTabIndex, setSelectedTabIndex] = useState(0); // 0: Symptoms, 1: Findings, 2: All
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSymptomForDetail, setSelectedSymptomForDetail] = useState<string | null>(null);
    const [selectedSymptomDetails, setSelectedSymptomDetails] = useState<Record<string, SymptomDetail>>({});

    const [rawSymptoms, setRawSymptoms] = useState<string[]>([]);
    const [rawFindings, setRawFindings] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLoaded, setIsLoaded] = useState(false);

    const [isOptionDialogOpen, setIsOptionDialogOpen] = useState(false);

    const [isFinalized, setIsFinalized] = useState(false);

    // --- Fetch Data ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Load Master Data
                const { data: masterData } = await supabase.from('opd_datasets').select('dataname, datajson');
                if (masterData) {
                    masterData.forEach((row: any) => {
                        const list = Array.isArray(row.datajson) ? row.datajson : [];
                        if (row.dataname === 'Symptoms') setRawSymptoms(list);
                        else if (row.dataname === 'Findings') setRawFindings(list);
                    });
                }

                // 2. Load Status & Server Data
                const { data: serverData, error } = await supabase
                    .from('opd_registration')
                    .select('is_finalized, symptoms_list_json')
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                const finalized = serverData?.is_finalized || false;
                const serverList = serverData?.symptoms_list_json || [];
                setIsFinalized(finalized);

                // Helper to convert List (Server/JSON) -> Record (Local State)
                const parseListToRecord = (list: any[]) => {
                    const record: Record<string, SymptomDetail> = {};
                    list.forEach((item: any) => {
                        record[item.name] = {
                            ...item,
                            selectedCustomOptions: new Set(item.selectedCustomOptions || [])
                        };
                    });
                    return record;
                };

                // Helper to parse Local Storage JSON -> Record
                const parseLocalJSON = (jsonStr: string) => {
                    const parsed = JSON.parse(jsonStr);
                    for (const key in parsed) {
                        parsed[key].selectedCustomOptions = new Set(parsed[key].selectedCustomOptions || []);
                    }
                    return parsed;
                };

                // 3. Decide Source
                if (finalized) {
                    // Finalized: Strictly load from server
                    setSelectedSymptomDetails(parseListToRecord(serverList));
                } else {
                    // Draft: Prioritize Local Storage
                    const savedDetails = localStorage.getItem(`draft_symptom_details_${opdId}`);

                    if (savedDetails) {
                        try {
                            setSelectedSymptomDetails(parseLocalJSON(savedDetails));
                        } catch (e) {
                            console.error("Local draft corrupt", e);
                            setSelectedSymptomDetails(parseListToRecord(serverList));
                        }
                    } else {
                        // No local draft? Initialize from server (sync)
                        const initialData = parseListToRecord(serverList);
                        setSelectedSymptomDetails(initialData);

                        // Sync to local immediately
                        // We need to serialize the Set back to Array for storage
                        const serializable = Object.fromEntries(
                            Object.entries(initialData).map(([k, v]) => [k, { ...v, selectedCustomOptions: Array.from(v.selectedCustomOptions) }])
                        );
                        localStorage.setItem(`draft_symptom_details_${opdId}`, JSON.stringify(serializable));
                    }
                }

                setIsLoaded(true);
            } catch (e) {
                console.error("Error fetching symptoms data", e);
                setIsLoaded(true); // Ensure loaded is set even on error
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [opdId]);

    useEffect(() => {
        if (isLoaded) {
            const serializableDetails = Object.fromEntries(
                Object.entries(selectedSymptomDetails).map(([key, detail]) => [
                    key,
                    {
                        ...detail,
                        selectedCustomOptions: Array.from(detail.selectedCustomOptions)
                    }
                ])
            );
            localStorage.setItem(`draft_symptom_details_${opdId}`, JSON.stringify(serializableDetails));
            // Also save list of keys for easier access if needed
            localStorage.setItem(`draft_symptoms_${opdId}`, JSON.stringify(Object.keys(selectedSymptomDetails)));
        }
    }, [selectedSymptomDetails, opdId, isLoaded]);

    // --- Logic ---
    const isSymptom = (name: string) => rawSymptoms.includes(name);

    const selectSymptom = (label: string) => {
        if (!selectedSymptomDetails[label]) {
            setSelectedSymptomDetails(prev => ({
                ...prev,
                [label]: { name: label, note: '', customGroups: [], selectedCustomOptions: new Set() }
            }));
        }
        setSelectedSymptomForDetail(label);
    };

    const removeSymptom = (label: string) => {
        const newDetails = { ...selectedSymptomDetails };
        delete newDetails[label];
        setSelectedSymptomDetails(newDetails);

        if (selectedSymptomForDetail === label) {
            setSelectedSymptomForDetail(null);
        }
    };

    const updateDetail = (label: string, field: keyof SymptomDetail, value: any) => {
        setSelectedSymptomDetails(prev => ({
            ...prev,
            [label]: { ...prev[label], [field]: value }
        }));
    };

    const toggleCustomOption = (label: string, option: string) => {
        const currentSet = new Set(selectedSymptomDetails[label].selectedCustomOptions);
        if (currentSet.has(option)) currentSet.delete(option);
        else currentSet.add(option);
        updateDetail(label, 'selectedCustomOptions', currentSet);
    };

    const addCustomGroup = (group: CustomOptionGroup) => {
        if (!selectedSymptomForDetail) return;
        const currentGroups = [...selectedSymptomDetails[selectedSymptomForDetail].customGroups, group];
        updateDetail(selectedSymptomForDetail, 'customGroups', currentGroups);
    };

    // Filter List
    const currentLeftList = (() => {
        let source: string[] = [];
        if (selectedTabIndex === 0) source = rawSymptoms;
        else if (selectedTabIndex === 1) source = rawFindings;
        else source = [...rawSymptoms, ...rawFindings];

        if (searchQuery) {
            source = source.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return source.filter(s => !selectedSymptomDetails[s]);
    })();

    if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

    return (
        <div className={`flex h-full ${AppColors.bg}`}>
            {/* --- LEFT PANEL (List) --- */}
            <div className={`w-[40%] flex flex-col border-r ${AppColors.border} ${AppColors.surface}`}>
                {/* Search & Tabs */}
                <div className="p-4 space-y-3 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search symptoms..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                        />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        {['Symptoms', 'Findings', 'All'].map((t, i) => (
                            <button
                                key={t}
                                onClick={() => setSelectedTabIndex(i)}
                                className={cn(
                                    "flex-1 py-1.5 text-xs font-bold rounded-md transition-all",
                                    selectedTabIndex === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-slate-200/50"
                                )}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Active Selections */}
                {Object.keys(selectedSymptomDetails).length > 0 && (
                    <div className="border-b border-slate-100">
                        <div className="px-4 py-2 bg-blue-50/50 flex items-center gap-2">
                            <div className="bg-blue-100 p-1 rounded-full"><Check className="w-3 h-3 text-blue-600" /></div>
                            <span className="text-[10px] font-bold text-slate-500 tracking-wider">ACTIVE SELECTIONS ({Object.keys(selectedSymptomDetails).length})</span>
                        </div>
                        <div className="p-4 max-h-[180px] overflow-y-auto">
                            <div className="flex flex-wrap gap-2">
                                {Object.values(selectedSymptomDetails).map(detail => (
                                    <SelectedChip
                                        key={detail.name}
                                        detail={detail}
                                        isViewing={selectedSymptomForDetail === detail.name}
                                        isSym={isSymptom(detail.name)}
                                        onClick={() => setSelectedSymptomForDetail(detail.name)}
                                        onRemove={() => removeSymptom(detail.name)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Suggestions List */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex flex-wrap gap-2">
                        {currentLeftList.map(s => (
                            <button
                                key={s}
                                onClick={() => selectSymptom(s)}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- RIGHT PANEL (Details) --- */}
            <div className="flex-1 bg-slate-50/50 flex flex-col">
                {selectedSymptomForDetail ? (
                    <DetailPanel
                        detail={selectedSymptomDetails[selectedSymptomForDetail]}
                        isSym={isSymptom(selectedSymptomForDetail)}
                        onUpdate={(field, val) => updateDetail(selectedSymptomForDetail, field, val)}
                        onRemove={() => removeSymptom(selectedSymptomForDetail)}
                        onToggleCustom={(opt) => toggleCustomOption(selectedSymptomForDetail, opt)}
                        onAddGroup={() => setIsOptionDialogOpen(true)}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="p-6 bg-white rounded-full shadow-sm mb-4">
                            <Activity className="w-10 h-10 opacity-20" />
                        </div>
                        <p className="text-lg font-semibold text-slate-600">No Symptom Selected</p>
                        <p className="text-sm">Select a symptom to configure details.</p>
                    </div>
                )}
            </div>

            <AddOptionDialog
                isOpen={isOptionDialogOpen}
                onClose={() => setIsOptionDialogOpen(false)}
                onSave={addCustomGroup}
            />
        </div>
    );
}

// --- Sub Components ---

function SelectedChip({ detail, isViewing, isSym, onClick, onRemove }: { detail: SymptomDetail, isViewing: boolean, isSym: boolean, onClick: () => void, onRemove: () => void }) {
    const activeColor = isSym ? "bg-pink-500 border-pink-500 text-white" : "bg-orange-500 border-orange-500 text-white";
    const inactiveColor = isSym ? "bg-pink-50 border-pink-200 text-pink-700" : "bg-orange-50 border-orange-200 text-orange-700";

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all shadow-sm",
                isViewing ? activeColor : inactiveColor
            )}
        >
            <span>{detail.name}</span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:bg-black/10 rounded-full p-0.5">
                <X className="w-3 h-3" />
            </button>
        </div>
    );
}

function DetailPanel({ detail, isSym, onUpdate, onRemove, onToggleCustom, onAddGroup }: {
    detail: SymptomDetail, isSym: boolean, onUpdate: (f: keyof SymptomDetail, v: any) => void, onRemove: () => void, onToggleCustom: (o: string) => void, onAddGroup: () => void
}) {
    const accentColor = isSym ? "text-pink-500" : "text-orange-500";
    const accentBg = isSym ? "bg-pink-50" : "bg-orange-50";

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-8 py-6 bg-white border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${accentBg} ${accentColor}`}>
                        {isSym ? <Heart className="w-6 h-6" /> : <Search className="w-6 h-6" />}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                            {isSym ? "CONFIGURING SYMPTOM" : "CONFIGURING FINDING"}
                        </p>
                        <h2 className="text-2xl font-extrabold text-slate-900">{detail.name}</h2>
                    </div>
                </div>
                <button onClick={onRemove} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Notes */}
                <div>
                    <label className="text-xs font-bold text-slate-900 mb-2 block">Clinical Notes</label>
                    <textarea
                        value={detail.note}
                        onChange={(e) => onUpdate('note', e.target.value)}
                        placeholder="Add specific observations..."
                        className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none h-24 shadow-sm"
                    />
                </div>

                {/* Severity */}
                <div>
                    <SectionHeader title="SEVERITY LEVEL" icon={Activity} />
                    <div className="mt-3 bg-slate-200 p-1 rounded-xl flex">
                        {['Mild', 'Moderate', 'Severe'].map(sev => {
                            const isSel = detail.severity === sev;
                            let color = "text-slate-500";
                            if (isSel) {
                                if (sev === 'Mild') color = "text-emerald-600";
                                if (sev === 'Moderate') color = "text-orange-600";
                                if (sev === 'Severe') color = "text-red-600";
                            }
                            return (
                                <button
                                    key={sev}
                                    onClick={() => onUpdate('severity', sev)}
                                    className={cn(
                                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                                        isSel ? "bg-white shadow-sm" : "hover:bg-slate-300/50"
                                    )}
                                >
                                    {isSel && <div className={`w-2 h-2 rounded-full bg-current ${color}`} />}
                                    <span className={color}>{sev}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Duration (Only for Symptoms) */}
                {isSym && (
                    <div>
                        <SectionHeader title="DURATION" icon={Clock} />
                        <div className="mt-3 flex flex-wrap gap-2">
                            {['1d', '2d', '3d', '4d', '1w', '2w', '1m', '3m', '6m', '1y'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => onUpdate('duration', d)}
                                    className={cn(
                                        "w-12 h-10 rounded-lg text-xs font-bold border transition-all",
                                        detail.duration === d
                                            ? "bg-slate-800 text-white border-slate-800 shadow-lg"
                                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Options */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <SectionHeader title="ADDITIONAL PARAMETERS" icon={Settings} />
                        <button
                            onClick={onAddGroup}
                            className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                        >
                            <Plus className="w-3 h-3" /> New Group
                        </button>
                    </div>

                    {detail.customGroups.length === 0 ? (
                        <div className="p-6 border border-dashed border-slate-300 rounded-xl text-center">
                            <p className="text-xs text-slate-400 italic">No custom parameters added.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {detail.customGroups.map((group, idx) => (
                                <div key={idx} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                    <p className="text-xs font-bold text-slate-900 mb-3">{group.title}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {group.options.map(opt => {
                                            const isSel = detail.selectedCustomOptions.has(opt);
                                            return (
                                                <button
                                                    key={opt}
                                                    onClick={() => onToggleCustom(opt)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                                        isSel
                                                            ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200"
                                                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                                                    )}
                                                >
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SectionHeader({ title, icon: Icon }: { title: string, icon: any }) {
    return (
        <div className="flex items-center gap-2 text-slate-400">
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-bold tracking-widest">{title}</span>
        </div>
    );
}

function AddOptionDialog({ isOpen, onClose, onSave }: { isOpen: boolean, onClose: () => void, onSave: (g: CustomOptionGroup) => void }) {
    const [title, setTitle] = useState("");
    const [options, setOptions] = useState<string[]>([""]);

    const handleSave = () => {
        const validOptions = options.filter(o => o.trim().length > 0);
        if (title.trim() && validOptions.length > 0) {
            onSave({ title, options: validOptions });
            setTitle("");
            setOptions([""]);
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Configure Options</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">GROUP TITLE</label>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pain Location" />
                    </div>
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-xs font-bold text-slate-500 block">OPTIONS LIST</label>
                            <button onClick={() => setOptions([...options, ""])} className="text-xs font-bold text-blue-600">+ Add Item</button>
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {options.map((opt, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <span className="text-xs font-bold text-slate-300 pt-2">{idx + 1}.</span>
                                    <Input
                                        value={opt}
                                        onChange={e => {
                                            const newOpts = [...options];
                                            newOpts[idx] = e.target.value;
                                            setOptions(newOpts);
                                        }}
                                        placeholder="Option Name"
                                        className="h-8 text-xs"
                                    />
                                    <button onClick={() => {
                                        const newOpts = [...options];
                                        newOpts.splice(idx, 1);
                                        setOptions(newOpts);
                                    }} className="text-red-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Configuration</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
