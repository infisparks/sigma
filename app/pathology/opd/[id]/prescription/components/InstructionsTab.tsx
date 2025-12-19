"use client"

import React, { useState, useMemo, useEffect } from 'react';
import { Search, CheckCircle, List, Check } from 'lucide-react';
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

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
    // Instructions Tab State
    const [selectedSubTab, setSelectedSubTab] = useState(0); // 0: Instructions, 1: Investigations, 2: Procedures
    const [searchQuery, setSearchQuery] = useState("");
    const [masterData, setMasterData] = useState<{
        instructions: string[];
        investigations: string[];
        procedures: string[];
    }>({ instructions: [], investigations: [], procedures: [] });

    const [selections, setSelections] = useState<{
        instructions: Set<string>;
        investigations: Set<string>;
        procedures: Set<string>;
    }>({
        instructions: new Set(),
        investigations: new Set(),
        procedures: new Set(),
    });
    const [loading, setLoading] = useState(true);
    const [isLoaded, setIsLoaded] = useState(false);

    const [isFinalized, setIsFinalized] = useState(false);

    // --- Fetch Data ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch Master Data
                const { data: masterDataRes } = await supabase
                    .from('opd_datasets')
                    .select('dataname, datajson');

                if (masterDataRes) {
                    const newMasterData = { instructions: [], investigations: [], procedures: [] };
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
                }

                // 2. Fetch Status & Server Data
                const { data: serverData, error } = await supabase
                    .from('opd_registration')
                    .select('is_finalized, instructions_list_json, investigations_list_json, procedures_list_json')
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                const finalized = serverData?.is_finalized || false;
                const serverLists = {
                    instructions: new Set<string>(serverData?.instructions_list_json || []),
                    investigations: new Set<string>(serverData?.investigations_list_json || []),
                    procedures: new Set<string>(serverData?.procedures_list_json || []),
                };
                setIsFinalized(finalized);

                // 3. Decide Source
                if (finalized) {
                    // Finalized: Strictly load from server
                    setSelections(serverLists);
                } else {
                    // Draft: Prioritize Local Storage
                    const saved = localStorage.getItem(`draft_instructions_${opdId}`);

                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            setSelections({
                                instructions: new Set(parsed.instructions),
                                investigations: new Set(parsed.investigations),
                                procedures: new Set(parsed.procedures),
                            });
                        } catch (e) {
                            console.error("Local draft corrupt", e);
                            setSelections(serverLists);
                        }
                    } else {
                        // No local draft? Initialize from server (sync)
                        setSelections(serverLists);
                        // Sync to local
                        const serializable = {
                            instructions: Array.from(serverLists.instructions),
                            investigations: Array.from(serverLists.investigations),
                            procedures: Array.from(serverLists.procedures),
                        };
                        localStorage.setItem(`draft_instructions_${opdId}`, JSON.stringify(serializable));
                    }
                }
                setIsLoaded(true);

            } catch (err) {
                console.error("Error fetching data:", err);
                setIsLoaded(true);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [opdId]);

    // --- Save Drafts ---
    useEffect(() => {
        if (isLoaded) {
            const serializable = {
                instructions: Array.from(selections.instructions),
                investigations: Array.from(selections.investigations),
                procedures: Array.from(selections.procedures),
            };
            localStorage.setItem(`draft_instructions_${opdId}`, JSON.stringify(serializable));
        }
    }, [selections, opdId, isLoaded]);

    // --- Helpers ---
    const currentList = useMemo(() => {
        let source: string[] = [];
        if (selectedSubTab === 0) source = masterData.instructions;
        else if (selectedSubTab === 1) source = masterData.investigations;
        else source = masterData.procedures;

        if (searchQuery) {
            return source.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return source;
    }, [selectedSubTab, masterData, searchQuery]);

    const currentSelectedSet = useMemo(() => {
        if (selectedSubTab === 0) return selections.instructions;
        if (selectedSubTab === 1) return selections.investigations;
        return selections.procedures;
    }, [selectedSubTab, selections]);

    const toggleSelection = (item: string) => {
        setSelections(prev => {
            const newSet = new Set(currentSelectedSet);
            if (newSet.has(item)) newSet.delete(item);
            else newSet.add(item);

            const newSelections = { ...prev };
            if (selectedSubTab === 0) newSelections.instructions = newSet;
            else if (selectedSubTab === 1) newSelections.investigations = newSet;
            else newSelections.procedures = newSet;

            return newSelections;
        });
    };

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
                        placeholder={`Search...`}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-100 text-[11px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Selection Bar */}
            {currentSelectedSet.size > 0 && (
                <div className="bg-blue-50 border-b border-slate-200 px-4 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-wider">{currentSelectedSet.size} Selected</span>
                    </div>
                    <span className="text-[9px] text-slate-400 italic font-medium">Auto-saved</span>
                </div>
            )}

            {/* List Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {currentList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <List className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-[11px] font-bold">No items found</p>
                    </div>
                ) : (
                    currentList.map((item, idx) => {
                        const isSelected = currentSelectedSet.has(item);
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
