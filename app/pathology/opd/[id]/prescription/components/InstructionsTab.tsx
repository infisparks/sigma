"use client"

import React, { useState, useMemo, useEffect } from 'react';
import {
    Search, Check, X,
    List, CheckCircle, Plus
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { usePrescription } from "../context/PrescriptionContext";

// --- Theme Constants ---
const ModernTheme = {
    background: "bg-slate-100",
    surface: "bg-white",
    primary: "text-blue-600",
    textMain: "text-slate-900",
    textSub: "text-slate-500",
    border: "border-slate-200",
};

interface InstructionsTabProps {
    opdId: number;
}

export default function InstructionsTab({ opdId }: InstructionsTabProps) {
    // --- Context ---
    const {
        instructions, setInstructions,
        investigations, setInvestigations,
        procedures, setProcedures,
        suggestedInstructions, suggestedInvestigations, suggestedProcedures
    } = usePrescription();

    // --- Helpers Wrappers ---
    const addInstruction = (item: string) => setInstructions([...instructions, item]);
    const removeInstruction = (item: string) => setInstructions(instructions.filter(i => i !== item));

    const addInvestigation = (item: string) => setInvestigations([...investigations, item]);
    const removeInvestigation = (item: string) => setInvestigations(investigations.filter(i => i !== item));

    const addProcedure = (item: string) => setProcedures([...procedures, item]);
    const removeProcedure = (item: string) => setProcedures(procedures.filter(i => i !== item));

    // --- State ---
    const [selectedSubTab, setSelectedSubTab] = useState(0); // 0: Instructions, 1: Investigations, 2: Procedures
    const [searchQuery, setSearchQuery] = useState("");

    // Master Data (from DB)
    const [masterData, setMasterData] = useState<{
        instructions: string[];
        investigations: string[];
        procedures: string[];
    }>({ instructions: [], investigations: [], procedures: [] });

    // --- Fetch Master Data ---
    useEffect(() => {
        const fetchMaster = async () => {
            const cacheKey = 'OPD_MASTER_DATA_CACHE';

            // 1. Try Load from Cache
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setMasterData(prev => ({
                        instructions: parsed.instructions || [],
                        investigations: parsed.investigations || [],
                        procedures: parsed.procedures || []
                    }));
                }
            } catch (e) { console.error("Cache read error", e); }

            // 2. Fetch Fresh from Network
            const { data: masterDataRes } = await supabase
                .from('opd_datasets')
                .select('dataname, datajson');

            const newMasterData: { instructions: string[]; investigations: string[]; procedures: string[]; } = { instructions: [], investigations: [], procedures: [] };
            if (masterDataRes) {
                masterDataRes.forEach((row: any) => {
                    let list: string[] = [];
                    try {
                        if (Array.isArray(row.datajson)) list = row.datajson;
                        else if (typeof row.datajson === 'string') list = JSON.parse(row.datajson);
                    } catch (e) { console.error("JSON Parse Error", e); }

                    if (row.dataname === 'Instructions') newMasterData.instructions = list as any;
                    else if (row.dataname === 'Investigations') newMasterData.investigations = list as any;
                    else if (row.dataname === 'Procedures') newMasterData.procedures = list as any;
                });
                setMasterData(newMasterData);

                // 3. Update Cache
                try {
                    const currentCache = localStorage.getItem(cacheKey) ? JSON.parse(localStorage.getItem(cacheKey)!) : {};
                    const updatedCache = {
                        ...currentCache,
                        instructions: newMasterData.instructions,
                        investigations: newMasterData.investigations,
                        procedures: newMasterData.procedures
                    };
                    localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
                } catch (e) { console.error("Cache write error", e); }
            }
        };
        fetchMaster();
    }, []);

    // --- Helpers ---
    const currentContextList = useMemo(() => {
        if (selectedSubTab === 0) return instructions;
        if (selectedSubTab === 1) return investigations;
        return procedures;
    }, [selectedSubTab, instructions, investigations, procedures]);

    const addAction = (item: string) => {
        if (selectedSubTab === 0) addInstruction(item);
        else if (selectedSubTab === 1) addInvestigation(item);
        else addProcedure(item);
    };

    const removeAction = (item: string) => {
        if (selectedSubTab === 0) removeInstruction(item);
        else if (selectedSubTab === 1) removeInvestigation(item);
        else removeProcedure(item);
    };

    const addCustomItem = () => {
        if (!searchQuery.trim()) return;
        const item = searchQuery.trim();
        addAction(item);
        setSearchQuery("");
    };

    const toggleSelection = (item: string) => {
        if (currentContextList.includes(item)) {
            removeAction(item);
        } else {
            addAction(item);
        }
    };

    const currentList = useMemo(() => {
        // Master list + Any currently selected items that are NOT in master (custom)
        let master: string[] = [];
        if (selectedSubTab === 0) master = masterData.instructions;
        else if (selectedSubTab === 1) master = masterData.investigations;
        else master = masterData.procedures;

        const custom = currentContextList.filter(i => !master.includes(i));
        const combined = Array.from(new Set([...master, ...custom]));

        if (searchQuery) {
            return combined.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return combined;
    }, [selectedSubTab, masterData, currentContextList, searchQuery]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Tab Header */}
            <div className={`${ModernTheme.surface} border-b border-slate-200 p-3`}>
                <div className="flex bg-slate-100 p-0.5 rounded-lg mb-3">
                    <SegmentTab title="Instructions" index={0} selectedIndex={selectedSubTab} onSelect={setSelectedSubTab} />
                    <SegmentTab title="Investigations" index={1} selectedIndex={selectedSubTab} onSelect={setSelectedSubTab} />
                    <SegmentTab title="Procedures" index={2} selectedIndex={selectedSubTab} onSelect={setSelectedSubTab} />
                </div>

                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                    <input
                        type="text"
                        placeholder={`Search or add new...`}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-100 text-[11px] font-bold text-slate-700"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') addCustomItem();
                        }}
                    />
                </div>
            </div>

            {/* Selection Bar */}
            {currentContextList.length > 0 && (
                <div className="bg-blue-50 border-b border-slate-200 px-4 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-wider">{currentContextList.length} Selected</span>
                    </div>
                </div>
            )}

            {/* List Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {/* Add Custom Item Button - Show if searching and no exact match or just always facilitate adding */}
                {searchQuery && !currentList.some(item => item.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                    <button
                        onClick={addCustomItem}
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 text-blue-600 transition-all mb-2"
                    >
                        <div className="w-4 h-4 rounded-full border-2 border-blue-300 flex items-center justify-center font-bold text-lg leading-none pb-0.5">+</div>
                        <span className="text-[11px] font-bold">Add "{searchQuery}"</span>
                    </button>
                )}

                {/* AI Suggestions Section */}
                {(selectedSubTab === 0 ? suggestedInstructions :
                    selectedSubTab === 1 ? suggestedInvestigations :
                        suggestedProcedures)?.length! > 0 && !searchQuery && (
                        <div className="mb-2">
                            <div className="flex items-center gap-1.5 mb-1.5 px-1">
                                <div className="w-1 h-1 rounded-full bg-purple-500 animate-pulse" />
                                <span className="text-[9px] font-black text-purple-600 uppercase tracking-wider">Suggested</span>
                            </div>
                            <div className="space-y-1.5">
                                {(selectedSubTab === 0 ? suggestedInstructions :
                                    selectedSubTab === 1 ? suggestedInvestigations :
                                        suggestedProcedures)?.map((item: string, idx: number) => {
                                            const isSelected = currentContextList.includes(item);
                                            if (isSelected) return null; // Don't show in suggestions if already picked
                                            return (
                                                <div
                                                    key={`sug-${idx}`}
                                                    onClick={() => toggleSelection(item)}
                                                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-purple-100 bg-purple-50/30 hover:bg-purple-50 transition-all cursor-pointer"
                                                >
                                                    <div className="w-4 h-4 rounded-full border-2 border-purple-200 flex items-center justify-center">
                                                        <Plus className="w-2.5 h-2.5 text-purple-400" />
                                                    </div>
                                                    <span className="text-[11px] font-bold text-slate-800">{item}</span>
                                                </div>
                                            );
                                        })}
                            </div>
                            <div className="my-3 border-t border-slate-100 relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-50 px-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                    All Items
                                </div>
                            </div>
                        </div>
                    )}

                {currentList.length === 0 && !searchQuery ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <List className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-[11px] font-bold">No items found</p>
                    </div>
                ) : (
                    currentList.map((item, idx) => {
                        // Filter out if in suggestions to avoid duplication? No, keep it simple for now or filter.
                        // Ideally we remove from main list if shown in suggestions, similar to DiagnosisTab.
                        const isSelected = currentContextList.includes(item);
                        return (
                            <div
                                key={idx}
                                onClick={() => toggleSelection(item)}
                                className={cn(
                                    "flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer",
                                    isSelected
                                        ? "bg-blue-50 border-blue-200 shadow-sm"
                                        : "bg-white border-slate-200 hover:border-blue-200"
                                )}
                            >
                                <div className={cn(
                                    "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                                    isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"
                                )}>
                                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <span className={cn(
                                    "text-[11px] font-bold",
                                    isSelected ? "text-slate-900" : "text-slate-600"
                                )}>{item}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function SegmentTab({ title, index, selectedIndex, onSelect }: { title: string, index: number, selectedIndex: number, onSelect: (i: number) => void }) {
    const isSelected = index === selectedIndex;
    return (
        <button
            onClick={() => onSelect(index)}
            className={cn(
                "flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all",
                isSelected ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-slate-200/50"
            )}
        >
            {title}
        </button>
    );
}
