"use client"

import React, { useState, useEffect } from 'react';
import {
    Search, Check, X, Activity, Plus, Trash2
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
    accentBlue: "text-blue-600",
    accentCyan: "text-cyan-600",
};

// --- Models ---
interface CustomOptionGroup {
    title: string;
    options: string[];
}

interface DiagnosisDetail {
    name: string;
    note: string;
    location?: string; // For "Location" field in screenshot
    status?: string; // For "To rule out", "Suspected", etc.
    customGroups: CustomOptionGroup[];
    selectedCustomOptions: Set<string>;
}

interface DiagnosisTabProps {
    opdId: number;
}

export default function DiagnosisTab({ opdId }: DiagnosisTabProps) {
    // --- State ---
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDiagnosisForDetail, setSelectedDiagnosisForDetail] = useState<string | null>(null);
    const [selectedDiagnosisDetails, setSelectedDiagnosisDetails] = useState<Record<string, DiagnosisDetail>>({});

    const [rawDiagnoses, setRawDiagnoses] = useState<string[]>([]);
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
                        if (row.dataname === 'Diagnosis') setRawDiagnoses(list);
                    });
                }

                // 2. Load Status & Server Data
                const { data: serverData, error } = await supabase
                    .from('opd_registration')
                    .select('is_finalized, diagnosis_list_json')
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                const finalized = serverData?.is_finalized || false;
                const serverList = serverData?.diagnosis_list_json || [];
                setIsFinalized(finalized);

                // Helper to convert List (Server/JSON) -> Record (Local State)
                const parseListToRecord = (list: any[]) => {
                    const record: Record<string, DiagnosisDetail> = {};
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
                    setSelectedDiagnosisDetails(parseListToRecord(serverList));
                } else {
                    // Draft: Prioritize Local Storage
                    const savedDetails = localStorage.getItem(`draft_diagnosis_details_${opdId}`);

                    if (savedDetails) {
                        try {
                            setSelectedDiagnosisDetails(parseLocalJSON(savedDetails));
                        } catch (e) {
                            console.error("Local draft corrupt", e);
                            setSelectedDiagnosisDetails(parseListToRecord(serverList));
                        }
                    } else {
                        // No local draft? Initialize from server (sync)
                        const initialData = parseListToRecord(serverList);
                        setSelectedDiagnosisDetails(initialData);

                        // Sync to local immediately
                        const serializable = Object.fromEntries(
                            Object.entries(initialData).map(([k, v]) => [k, { ...v, selectedCustomOptions: Array.from(v.selectedCustomOptions) }])
                        );
                        localStorage.setItem(`draft_diagnosis_details_${opdId}`, JSON.stringify(serializable));
                    }
                }

                setIsLoaded(true);
            } catch (e) {
                console.error("Error fetching diagnosis data", e);

                // Fallback: Try to load from local storage on error (e.g. missing column)
                try {
                    const savedDetails = localStorage.getItem(`draft_diagnosis_details_${opdId}`);
                    if (savedDetails) {
                        const parsed = JSON.parse(savedDetails);
                        for (const key in parsed) {
                            parsed[key].selectedCustomOptions = new Set(parsed[key].selectedCustomOptions || []);
                        }
                        setSelectedDiagnosisDetails(parsed);
                    }
                } catch (err) {
                    console.error("Error loading draft fallback", err);
                }

                setIsLoaded(true);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [opdId]);

    useEffect(() => {
        if (isLoaded) {
            const serializableDetails = Object.fromEntries(
                Object.entries(selectedDiagnosisDetails).map(([key, detail]) => [
                    key,
                    {
                        ...detail,
                        selectedCustomOptions: Array.from(detail.selectedCustomOptions)
                    }
                ])
            );
            localStorage.setItem(`draft_diagnosis_details_${opdId}`, JSON.stringify(serializableDetails));
            localStorage.setItem(`draft_diagnosis_${opdId}`, JSON.stringify(Object.keys(selectedDiagnosisDetails)));
        }
    }, [selectedDiagnosisDetails, opdId, isLoaded]);

    // --- Logic ---
    const selectDiagnosis = (label: string) => {
        if (!selectedDiagnosisDetails[label]) {
            setSelectedDiagnosisDetails(prev => ({
                ...prev,
                [label]: {
                    name: label,
                    note: '',
                    location: '',
                    status: 'Suspected', // Default status
                    customGroups: [],
                    selectedCustomOptions: new Set()
                }
            }));
        }
        setSelectedDiagnosisForDetail(label);
    };

    const removeDiagnosis = (label: string) => {
        const newDetails = { ...selectedDiagnosisDetails };
        delete newDetails[label];
        setSelectedDiagnosisDetails(newDetails);

        if (selectedDiagnosisForDetail === label) {
            setSelectedDiagnosisForDetail(null);
        }
    };

    const updateDetail = (label: string, field: keyof DiagnosisDetail, value: any) => {
        setSelectedDiagnosisDetails(prev => ({
            ...prev,
            [label]: { ...prev[label], [field]: value }
        }));
    };

    const toggleCustomOption = (label: string, option: string) => {
        const currentSet = new Set(selectedDiagnosisDetails[label].selectedCustomOptions);
        if (currentSet.has(option)) currentSet.delete(option);
        else currentSet.add(option);
        updateDetail(label, 'selectedCustomOptions', currentSet);
    };

    const addCustomGroup = (group: CustomOptionGroup) => {
        if (!selectedDiagnosisForDetail) return;
        const currentGroups = [...selectedDiagnosisDetails[selectedDiagnosisForDetail].customGroups, group];
        updateDetail(selectedDiagnosisForDetail, 'customGroups', currentGroups);
    };

    // Filter List
    const currentList = (() => {
        let source = rawDiagnoses;
        if (searchQuery) {
            source = source.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return source.filter(s => !selectedDiagnosisDetails[s]);
    })();

    if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

    return (
        <div className={`flex h-full ${AppColors.bg}`}>
            {/* --- LEFT PANEL (List) --- */}
            <div className={`w-[35%] flex flex-col border-r ${AppColors.border} ${AppColors.surface}`}>
                {/* Search */}
                <div className="p-3 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-100 shadow-sm"
                        />
                    </div>
                </div>

                {/* Active Selections */}
                {Object.keys(selectedDiagnosisDetails).length > 0 && (
                    <div className="border-b border-slate-100">
                        <div className="px-3 py-1.5 bg-blue-50/50 flex items-center gap-1.5">
                            <div className="bg-blue-100 p-0.5 rounded-full"><Check className="w-2.5 h-2.5 text-blue-600" /></div>
                            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">Active ({Object.keys(selectedDiagnosisDetails).length})</span>
                        </div>
                        <div className="p-3 max-h-[140px] overflow-y-auto">
                            <div className="flex flex-wrap gap-1.5">
                                {Object.values(selectedDiagnosisDetails).map(detail => (
                                    <SelectedChip
                                        key={detail.name}
                                        detail={detail}
                                        isViewing={selectedDiagnosisForDetail === detail.name}
                                        onClick={() => setSelectedDiagnosisForDetail(detail.name)}
                                        onRemove={() => removeDiagnosis(detail.name)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Suggestions List */}
                <div className="flex-1 overflow-y-auto p-3">
                    <div className="flex flex-wrap gap-1.5">
                        {currentList.map(s => (
                            <button
                                key={s}
                                onClick={() => selectDiagnosis(s)}
                                className="px-2 py-1.5 bg-white border border-slate-200 rounded-full text-[10px] font-medium text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- RIGHT PANEL (Details) --- */}
            <div className="flex-1 bg-slate-50/50 flex flex-col">
                {selectedDiagnosisForDetail ? (
                    <DetailPanel
                        detail={selectedDiagnosisDetails[selectedDiagnosisForDetail]}
                        onUpdate={(field, val) => updateDetail(selectedDiagnosisForDetail, field, val)}
                        onRemove={() => removeDiagnosis(selectedDiagnosisForDetail)}
                        onToggleCustom={(opt) => toggleCustomOption(selectedDiagnosisForDetail, opt)}
                        onAddGroup={() => setIsOptionDialogOpen(true)}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="p-4 bg-white rounded-full shadow-sm mb-3">
                            <Activity className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-base font-bold text-slate-600">No Selection</p>
                        <p className="text-[11px]">Select a diagnosis to configure.</p>
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

function SelectedChip({ detail, isViewing, onClick, onRemove }: { detail: DiagnosisDetail, isViewing: boolean, onClick: () => void, onRemove: () => void }) {
    const activeColor = "bg-blue-600 border-blue-600 text-white";
    const inactiveColor = "bg-blue-50 border-blue-200 text-blue-700";

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full border text-[10px] font-bold cursor-pointer transition-all shadow-sm",
                isViewing ? activeColor : inactiveColor
            )}
        >
            <span className="truncate max-w-[80px]">{detail.name}</span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:bg-black/10 rounded-full p-0.5">
                <X className="w-2.5 h-2.5" />
            </button>
        </div>
    );
}

function DetailPanel({ detail, onUpdate, onRemove, onToggleCustom, onAddGroup }: {
    detail: DiagnosisDetail, onUpdate: (f: keyof DiagnosisDetail, v: any) => void, onRemove: () => void, onToggleCustom: (o: string) => void, onAddGroup: () => void
}) {
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-[8px] font-black text-slate-400 tracking-widest uppercase">
                            Diagnosis Details
                        </p>
                        <h2 className="text-lg font-black text-slate-900 leading-tight">{detail.name}</h2>
                    </div>
                </div>
                <button onClick={onRemove} className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-md transition-colors">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    {/* Note */}
                    <div>
                        <label className="text-[10px] font-black text-slate-900 mb-1.5 block uppercase tracking-wider">Note</label>
                        <textarea
                            value={detail.note}
                            onChange={(e) => onUpdate('note', e.target.value)}
                            placeholder="..."
                            className="w-full p-3 bg-slate-100 border-none rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-100 resize-none h-20"
                        />
                    </div>

                    {/* Location */}
                    <div>
                        <label className="text-[10px] font-black text-slate-900 mb-1.5 block uppercase tracking-wider">Location</label>
                        <textarea
                            value={detail.location || ''}
                            onChange={(e) => onUpdate('location', e.target.value)}
                            placeholder="..."
                            className="w-full p-3 bg-slate-100 border-none rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-100 resize-none h-20"
                        />
                    </div>
                </div>

                {/* Description / Status */}
                <div>
                    <label className="text-[10px] font-black text-slate-900 mb-1.5 block uppercase tracking-wider">Status</label>
                    <div className="bg-slate-100 p-0.5 rounded-lg flex gap-0.5">
                        {['To rule out', 'Suspected', 'Follow up', '?'].map(status => {
                            const isSel = detail.status === status;
                            return (
                                <button
                                    key={status}
                                    onClick={() => onUpdate('status', status)}
                                    className={cn(
                                        "flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all",
                                        isSel ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:bg-slate-200/50"
                                    )}
                                >
                                    {status}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Custom Options / History Query */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                            <span className="text-blue-500 font-black text-[10px] uppercase tracking-wider">+ History Query</span>
                        </div>
                        <button
                            onClick={onAddGroup}
                            className="flex items-center gap-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100 transition-colors"
                        >
                            <Plus className="w-2.5 h-2.5" /> New Group
                        </button>
                    </div>

                    <div className="space-y-3">
                        {/* Duration/Years */}
                        <div className="flex flex-wrap gap-1.5">
                            {['6y', '7y', '8y', '9y', '10y', '11y', '12y', '13y', '14y', '15y', '16y', '17y', '18y', '19y', '20y', '>20y'].map(opt => {
                                const isSel = detail.selectedCustomOptions.has(opt);
                                return (
                                    <button
                                        key={opt}
                                        onClick={() => onToggleCustom(opt)}
                                        className={cn(
                                            "px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all",
                                            isSel ? "bg-cyan-50 text-cyan-600 border-cyan-200" : "bg-white text-cyan-500 border-cyan-200 hover:bg-cyan-50"
                                        )}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Statuses */}
                        <div className="flex flex-wrap gap-1.5">
                            {['Recently Diagnosed', 'Uncontrolled', 'Controlled', 'Borderline', 'On treatment', 'Not on treatment'].map(opt => {
                                const isSel = detail.selectedCustomOptions.has(opt);
                                return (
                                    <button
                                        key={opt}
                                        onClick={() => onToggleCustom(opt)}
                                        className={cn(
                                            "px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                                            isSel ? "bg-cyan-50 text-cyan-600 border-cyan-200" : "bg-white text-cyan-500 border-cyan-200 hover:bg-cyan-50"
                                        )}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>

                        {/* User Custom Groups */}
                        {detail.customGroups.map((group, idx) => (
                            <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                <p className="text-[10px] font-bold text-slate-900 mb-2">{group.title}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {group.options.map(opt => {
                                        const isSel = detail.selectedCustomOptions.has(opt);
                                        return (
                                            <button
                                                key={opt}
                                                onClick={() => onToggleCustom(opt)}
                                                className={cn(
                                                    "px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                                                    isSel
                                                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
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
                </div>
            </div>
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
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Side Effects" />
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
