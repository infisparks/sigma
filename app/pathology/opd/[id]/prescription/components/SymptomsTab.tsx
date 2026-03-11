"use client"

import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, Check, X, Heart, Settings, Plus, Trash2,
    Clock, Activity, AlertCircle
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePrescription } from "../context/PrescriptionContext";
import { SymptomDetail, CustomOptionGroup } from "../types";

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

interface SymptomsTabProps {
    opdId: number;
}

export default function SymptomsTab({ opdId }: SymptomsTabProps) {
    // --- Context ---
    const { symptoms, addSymptom, removeSymptom, updateSymptom, isLoading } = usePrescription();

    // --- State ---
    const [selectedTabIndex, setSelectedTabIndex] = useState(0); // 0: Symptoms, 1: Findings, 2: All
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSymptomForDetail, setSelectedSymptomForDetail] = useState<string | null>(null);

    const [rawSymptoms, setRawSymptoms] = useState<string[]>([]);
    const [rawFindings, setRawFindings] = useState<string[]>([]);
    const [isOptionDialogOpen, setIsOptionDialogOpen] = useState(false);

    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean, name: string } | null>(null);

    // --- Fetch Master Data Only ---
    useEffect(() => {
        const fetchMasterData = async () => {
            const cacheKey = 'OPD_MASTER_SYMPTOMS_CACHE';

            // 1. Try Cache
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed.symptoms) setRawSymptoms(parsed.symptoms);
                    if (parsed.findings) setRawFindings(parsed.findings);
                }
            } catch (e) { console.error("Cache read error", e); }

            // 2. Fetch Network
            const { data: masterData } = await supabase.from('opd_datasets').select('dataname, datajson');

            let fetchedSymptoms: string[] = [];
            let fetchedFindings: string[] = [];

            if (masterData) {
                masterData.forEach((row: any) => {
                    const list = Array.isArray(row.datajson) ? row.datajson : [];
                    if (row.dataname === 'Symptoms') {
                        setRawSymptoms(list);
                        fetchedSymptoms = list;
                    }
                    else if (row.dataname === 'Findings') {
                        setRawFindings(list);
                        fetchedFindings = list;
                    }
                });

                // 3. Update Cache
                try {
                    const cachePayload = { symptoms: fetchedSymptoms, findings: fetchedFindings };
                    localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
                } catch (e) { console.error("Cache write error", e); }
            }
        };
        fetchMasterData();
    }, []);

    // --- Logic ---
    const isSymptom = (name: string) => rawSymptoms.includes(name);

    const selectSymptom = useCallback((label: string) => {
        if (!symptoms[label]) {
            addSymptom({
                name: label,
                note: '',
                customGroups: [],
                selectedCustomOptions: []
            });
        }
        setSelectedSymptomForDetail(label);
    }, [symptoms, addSymptom]);

    const handleRemoveSymptom = useCallback((label: string) => {
        removeSymptom(label);
        if (selectedSymptomForDetail === label) {
            setSelectedSymptomForDetail(null);
        }
    }, [removeSymptom, selectedSymptomForDetail]);

    const handleUpdateDetail = (label: string, field: keyof SymptomDetail, value: any) => {
        updateSymptom(label, { [field]: value });
    };

    const toggleCustomOption = (label: string, option: string) => {
        const currentOptions = symptoms[label]?.selectedCustomOptions || [];
        const isSelected = currentOptions.includes(option);

        let newOptions;
        if (isSelected) {
            newOptions = currentOptions.filter(o => o !== option);
        } else {
            newOptions = [...currentOptions, option];
        }
        updateSymptom(label, { selectedCustomOptions: newOptions });
    };

    const addCustomGroup = (group: CustomOptionGroup) => {
        if (!selectedSymptomForDetail) return;
        const currentGroups = [...(symptoms[selectedSymptomForDetail]?.customGroups || []), group];
        updateSymptom(selectedSymptomForDetail, { customGroups: currentGroups });
    };

    // --- Add New Item Logic ---
    const addNewItem = async () => {
        if (!searchQuery.trim()) return;
        const newItemName = searchQuery.trim();

        const isFinding = selectedTabIndex === 1;
        const dbName = isFinding ? 'Findings' : 'Symptoms';

        // 1. Optimistic Local Update
        if (isFinding) setRawFindings(prev => [...prev, newItemName]);
        else setRawSymptoms(prev => [...prev, newItemName]);

        // Select immediately
        selectSymptom(newItemName);
        setSearchQuery("");

        // 2. Persist to Master DB
        try {
            const { data: currentData } = await supabase
                .from('opd_datasets')
                .select('datajson')
                .eq('dataname', dbName)
                .single();

            const list: string[] = Array.isArray(currentData?.datajson) ? currentData.datajson : [];
            if (!list.includes(newItemName)) {
                await supabase.from('opd_datasets').update({ datajson: [...list, newItemName] }).eq('dataname', dbName);
            }
        } catch (e) {
            console.error(`Failed to add new ${dbName}`, e);
        }
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
        return source.filter(s => !symptoms[s]);
    })();

    if (isLoading) return <div className="flex items-center justify-center h-full">Loading...</div>;

    return (
        <div className={`flex h-full ${AppColors.bg}`}>
            {/* --- LEFT PANEL (List) --- */}
            <div className={`w-[35%] flex flex-col border-r ${AppColors.border} ${AppColors.surface}`}>
                {/* Search & Tabs */}
                <div className="p-3 space-y-2 border-b border-slate-100">
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
                    <div className="flex bg-slate-100 p-0.5 rounded-md">
                        {['Symptoms', 'Findings', 'All'].map((t, i) => (
                            <button
                                key={t}
                                onClick={() => setSelectedTabIndex(i)}
                                className={cn(
                                    "flex-1 py-1 text-[10px] font-bold rounded transition-all",
                                    selectedTabIndex === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-slate-200/50"
                                )}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Active Selections */}
                {Object.keys(symptoms).length > 0 && (
                    <div className="border-b border-slate-100">
                        <div className="px-3 py-1.5 bg-blue-50/50 flex items-center gap-1.5">
                            <div className="bg-blue-100 p-0.5 rounded-full"><Check className="w-2.5 h-2.5 text-blue-600" /></div>
                            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">Active ({Object.keys(symptoms).length})</span>
                        </div>
                        <div className="p-3 max-h-[140px] overflow-y-auto">
                            <div className="flex flex-wrap gap-1.5">
                                {Object.values(symptoms).map(detail => (
                                    <SelectedChip
                                        key={detail.name}
                                        detail={detail}
                                        isViewing={selectedSymptomForDetail === detail.name}
                                        isSym={isSymptom(detail.name)}
                                        onClick={() => setSelectedSymptomForDetail(detail.name)}
                                        onRemove={() => handleRemoveSymptom(detail.name)}
                                        onLongPress={() => setDeleteConfirm({ isOpen: true, name: detail.name })}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Suggestions List */}
                <div className="flex-1 overflow-y-auto p-3">
                    {/* Add New Button */}
                    {searchQuery && !currentLeftList.some(s => s.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                        <button
                            onClick={addNewItem}
                            className="w-full flex items-center gap-2 mb-2 px-3 py-2 bg-blue-50 border border-blue-200 border-dashed rounded-lg text-blue-700 hover:bg-blue-100 transition-colors group"
                        >
                            <div className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center group-hover:bg-blue-300">
                                <Plus className="w-3 h-3 text-blue-700" />
                            </div>
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] font-bold">Add "{searchQuery}"</span>
                                <span className="text-[9px] opacity-70">to {selectedTabIndex === 1 ? 'Findings' : 'Symptoms'} list</span>
                            </div>
                        </button>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                        {currentLeftList.map(s => (
                            <button
                                key={s}
                                onClick={() => selectSymptom(s)}
                                className="px-2 py-1.5 bg-white border border-slate-200 rounded-md text-[10px] font-medium text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- RIGHT PANEL (Details) --- */}
            <div className="flex-1 bg-slate-50/50 flex flex-col">
                {selectedSymptomForDetail && symptoms[selectedSymptomForDetail] ? (
                    <DetailPanel
                        detail={symptoms[selectedSymptomForDetail]}
                        isSym={isSymptom(selectedSymptomForDetail)}
                        onUpdate={(field, val) => handleUpdateDetail(selectedSymptomForDetail, field, val)}
                        onRemove={() => handleRemoveSymptom(selectedSymptomForDetail)}
                        onToggleCustom={(opt) => toggleCustomOption(selectedSymptomForDetail, opt)}
                        onAddGroup={() => setIsOptionDialogOpen(true)}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="p-4 bg-white rounded-full shadow-sm mb-3">
                            <Activity className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-base font-bold text-slate-600">No Selection</p>
                        <p className="text-[11px]">Select an item to configure.</p>
                    </div>
                )}
            </div>

            <AddOptionDialog
                isOpen={isOptionDialogOpen}
                onClose={() => setIsOptionDialogOpen(false)}
                onSave={addCustomGroup}
            />

            {deleteConfirm && (
                <DeleteConfirmation
                    isOpen={deleteConfirm.isOpen}
                    itemName={deleteConfirm.name}
                    onClose={() => setDeleteConfirm(null)}
                    onConfirm={() => handleRemoveSymptom(deleteConfirm.name)}
                />
            )}
        </div>
    );
}

// --- Sub Components ---

const SelectedChip = React.memo(({
    detail, isViewing, isSym, onClick, onRemove, onLongPress
}: {
    detail: SymptomDetail, isViewing: boolean, isSym: boolean,
    onClick: (name: string) => void, onRemove: (name: string) => void, onLongPress: (name: string) => void
}) => {
    const activeColor = isSym ? "bg-pink-500 border-pink-500 text-white" : "bg-orange-500 border-orange-500 text-white";
    const inactiveColor = isSym ? "bg-pink-50 border-pink-200 text-pink-700" : "bg-orange-50 border-orange-200 text-orange-700";

    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPress = React.useRef(false);

    const handlePointerDown = (e: React.PointerEvent) => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            onLongPress(detail.name);
        }, 500);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            if (!isLongPress.current && e.type !== 'pointerleave' && e.type !== 'pointercancel') {
                onClick(detail.name);
            }
        }
    };

    return (
        <div
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
                "flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-all shadow-sm select-none touch-pan-y active:scale-95 active:opacity-80",
                isViewing ? activeColor : inactiveColor
            )}
        >
            <span className="truncate max-w-[80px]">{detail.name}</span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(detail.name); }} className="hover:bg-black/10 rounded-full p-0.5">
                <X className="w-2.5 h-2.5" />
            </button>
        </div>
    );
});
SelectedChip.displayName = 'SelectedChip';

const DeleteConfirmation = React.memo(({ isOpen, onClose, onConfirm, itemName }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, itemName: string }) => {
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
});
DeleteConfirmation.displayName = 'DeleteConfirmation';

const DetailPanel = React.memo(({ detail, isSym, onUpdate, onRemove, onToggleCustom, onAddGroup }: {
    detail: SymptomDetail, isSym: boolean, onUpdate: (f: keyof SymptomDetail, v: any) => void, onRemove: () => void, onToggleCustom: (o: string) => void, onAddGroup: () => void
}) => {
    const accentColor = isSym ? "text-pink-500" : "text-orange-500";
    const accentBg = isSym ? "bg-pink-50" : "bg-orange-50";

    // Custom Duration State
    const [isCustomDurationOpen, setIsCustomDurationOpen] = useState(false);
    const [customDurationValue, setCustomDurationValue] = useState("");
    const [customDurationUnit, setCustomDurationUnit] = useState("Days");

    const handleApplyCustomDuration = () => {
        if (!customDurationValue) return;
        const formatted = `${customDurationValue} ${customDurationUnit}`;
        onUpdate('duration', formatted);
        setIsCustomDurationOpen(false);
        setCustomDurationValue("");
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${accentBg} ${accentColor}`}>
                        {isSym ? <Heart className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                    </div>
                    <div>
                        <p className="text-[8px] font-black text-slate-400 tracking-widest uppercase">
                            {isSym ? "Configuring Symptom" : "Configuring Finding"}
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
                {/* Notes */}
                <div>
                    <label className="text-[10px] font-black text-slate-900 mb-1.5 block uppercase tracking-wider">Clinical Notes</label>
                    <textarea
                        value={detail.note}
                        onChange={(e) => onUpdate('note', e.target.value)}
                        placeholder="..."
                        className="w-full p-3 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-100 resize-none h-20 shadow-sm"
                    />
                </div>

                {/* Severity */}
                <div>
                    <SectionHeader title="SEVERITY LEVEL" icon={Activity} />
                    <div className="mt-2 bg-slate-200 p-0.5 rounded-lg flex">
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
                                        "flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center gap-1.5",
                                        isSel ? "bg-white shadow-sm" : "hover:bg-slate-300/50"
                                    )}
                                >
                                    {isSel && <div className={`w-1.5 h-1.5 rounded-full bg-current ${color}`} />}
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
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {['1d', '2d', '3d', '4d', '1w', '2w', '1m', '3m', '6m', '1y'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => onUpdate('duration', d)}
                                    className={cn(
                                        "w-10 h-8 rounded-md text-[10px] font-bold border transition-all",
                                        detail.duration === d
                                            ? "bg-slate-800 text-white border-slate-800 shadow-md"
                                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                            <button
                                onClick={() => setIsCustomDurationOpen(!isCustomDurationOpen)}
                                className={cn(
                                    "px-2 h-8 rounded-md text-[10px] font-bold border transition-all bg-white text-blue-600 border-blue-200 hover:border-blue-400",
                                    isCustomDurationOpen ? "bg-blue-50 border-blue-400" : ""
                                )}
                            >
                                Custom
                            </button>
                        </div>

                        {/* Custom Duration Inputs */}
                        {isCustomDurationOpen && (
                            <div className="mt-2 p-2 bg-slate-100 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                <Input
                                    type="number"
                                    value={customDurationValue}
                                    onChange={(e) => setCustomDurationValue(e.target.value)}
                                    className="h-8 text-xs w-20 bg-white"
                                    placeholder="Num"
                                />
                                <Select value={customDurationUnit} onValueChange={setCustomDurationUnit}>
                                    <SelectTrigger className="h-8 w-24 text-xs bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[9999]">
                                        <SelectItem value="Days">Days</SelectItem>
                                        <SelectItem value="Weeks">Weeks</SelectItem>
                                        <SelectItem value="Months">Months</SelectItem>
                                        <SelectItem value="Years">Years</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button size="sm" onClick={handleApplyCustomDuration} className="h-8 text-xs">
                                    Update
                                </Button>
                            </div>
                        )}
                        {/* Show selected duration if it's custom (not in the standard list) */}
                        {detail.duration && !['1d', '2d', '3d', '4d', '1w', '2w', '1m', '3m', '6m', '1y'].includes(detail.duration) && (
                            <div className="mt-2 text-[10px] font-bold text-slate-500 flex items-center gap-2">
                                Current: <span className="bg-slate-800 text-white px-2 py-1 rounded">{detail.duration}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Custom Options */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <SectionHeader title="ADDITIONAL PARAMETERS" icon={Settings} />
                        <button
                            onClick={onAddGroup}
                            className="flex items-center gap-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100 transition-colors"
                        >
                            <Plus className="w-2.5 h-2.5" /> New Group
                        </button>
                    </div>

                    {(detail.customGroups || []).length === 0 ? (
                        <div className="p-4 border border-dashed border-slate-300 rounded-lg text-center">
                            <p className="text-[10px] text-slate-400 italic">No custom parameters.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {detail.customGroups.map((group, idx) => (
                                <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-900 mb-2">{group.title}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {group.options.map(opt => {
                                            const isSel = detail.selectedCustomOptions.includes(opt);
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
                    )}
                </div>
            </div>
        </div>
    );
});
DetailPanel.displayName = 'DetailPanel';

const SectionHeader = React.memo(({ title, icon: Icon }: { title: string, icon: any }) => {
    return (
        <div className="flex items-center gap-1.5 text-slate-400">
            <Icon className="w-3 h-3" />
            <span className="text-[9px] font-black tracking-widest uppercase">{title}</span>
        </div>
    );
});
SectionHeader.displayName = 'SectionHeader';

const AddOptionDialog = React.memo(({ isOpen, onClose, onSave }: { isOpen: boolean, onClose: () => void, onSave: (g: CustomOptionGroup) => void }) => {
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
});
AddOptionDialog.displayName = 'AddOptionDialog';
