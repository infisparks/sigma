"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
    SymptomDetail,
    DiagnosisDetail,
    PrescriptionEntry,
    Vitals
} from '../types';

interface PrescriptionState {
    // Meta
    isLoading: boolean;
    isSaving: boolean;
    isFinalized: boolean; // From DB
    lastSavedAt: string | null;

    // Data - Clinical
    symptoms: Record<string, SymptomDetail>;
    diagnoses: Record<string, DiagnosisDetail>;
    medicines: PrescriptionEntry[];

    // Data - Instructions / Plans
    instructions: string[];
    investigations: string[];
    procedures: string[];

    // Data - Global
    clinicalNote: string;
    followUpDuration: string;
    followUpNote: string;
    referringDoctor: string;
    vitals: Vitals;
    // AI Suggestions
    suggestedDiagnoses: string[];
    suggestedMedicines: string[];
    suggestedInvestigations?: string[];
    suggestedInstructions?: string[];
    suggestedProcedures?: string[];
}

// --- Actions ---
interface PrescriptionActions {
    // Symptoms
    addSymptom: (detail: SymptomDetail) => void;
    removeSymptom: (name: string) => void;
    updateSymptom: (name: string, updates: Partial<SymptomDetail>) => void;

    // Diagnoses
    addDiagnosis: (detail: DiagnosisDetail) => void;
    removeDiagnosis: (name: string) => void;
    updateDiagnosis: (name: string, updates: Partial<DiagnosisDetail>) => void;

    // Medicines
    addMedicine: (med: PrescriptionEntry) => void;
    removeMedicine: (id: string) => void;
    updateMedicine: (id: string, updates: Partial<PrescriptionEntry>) => void;
    setMedicines: (meds: PrescriptionEntry[]) => void; // For reordering or bulk

    // Instructions
    setInstructions: (list: string[]) => void;
    setInvestigations: (list: string[]) => void;
    setProcedures: (list: string[]) => void;

    // Global
    setClinicalNote: (note: string) => void;
    setFollowUp: (duration: string, note: string) => void;
    setReferringDoctor: (name: string) => void;

    // Core
    saveAndFinalize: () => Promise<void>;
    refreshData: () => Promise<void>;
    clearPrescription: () => void;
}

const PrescriptionContext = createContext<(PrescriptionState & PrescriptionActions) | null>(null);

export function usePrescription() {
    const context = useContext(PrescriptionContext);
    if (!context) {
        throw new Error("usePrescription must be used within a PrescriptionProvider");
    }
    return context;
}

interface PrescriptionProviderProps {
    children: ReactNode;
    opdId: number;
}

export function PrescriptionProvider({ children, opdId }: PrescriptionProviderProps) {
    // --- State ---
    const [state, setState] = useState<PrescriptionState>({
        isLoading: true,
        isSaving: false,
        isFinalized: false,
        lastSavedAt: null,
        vitals: {},
        symptoms: {},
        diagnoses: {},
        medicines: [],
        instructions: [],
        investigations: [],
        procedures: [],
        clinicalNote: "",
        followUpDuration: "",
        followUpNote: "",
        referringDoctor: "",
        suggestedDiagnoses: [],
        suggestedMedicines: [],
        suggestedInvestigations: [],
        suggestedInstructions: [],
        suggestedProcedures: [],
    });

    // --- AI Prediction Engine ---
    useEffect(() => {
        const predict = async () => {
            // Derive arrays of names
            const symptomNames = Object.values(state.symptoms).map(s => s.name);
            const diagnosisNames = Object.values(state.diagnoses).map(d => d.name);

            // Only search if we have inputs
            if (symptomNames.length === 0 && diagnosisNames.length === 0) {
                if (state.suggestedDiagnoses?.length > 0 || state.suggestedMedicines?.length > 0) {
                    setState(prev => ({ ...prev, suggestedDiagnoses: [], suggestedMedicines: [] }));
                }
                return;
            }

            try {
                // Prepare filters
                let orFilter = "";
                const sList = symptomNames.length > 0 ? `and(source_type.eq.symptom,source_value.in.(${JSON.stringify(symptomNames).replace(/^\[|\]$/g, '')}))` : null;
                const dList = diagnosisNames.length > 0 ? `and(source_type.eq.diagnosis,source_value.in.(${JSON.stringify(diagnosisNames).replace(/^\[|\]$/g, '')}))` : null;

                if (sList && dList) orFilter = `${sList},${dList}`;
                else if (sList) orFilter = sList;
                else if (dList) orFilter = dList;

                // 1. Fetch Associations
                const { data } = await supabase
                    .from('opd_ai_associations')
                    .select('target_type, target_value, weight')
                    .or(orFilter);

                if (!data) return;

                // 2. Aggregate Scores
                const diagScores: Record<string, number> = {};
                const medScores: Record<string, number> = {};
                const invScores: Record<string, number> = {};
                const instScores: Record<string, number> = {};
                const procScores: Record<string, number> = {};

                data.forEach((row: any) => {
                    if (row.target_type === 'diagnosis') {
                        diagScores[row.target_value] = (diagScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'medicine') {
                        medScores[row.target_value] = (medScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'investigation') {
                        invScores[row.target_value] = (invScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'instruction') {
                        instScores[row.target_value] = (instScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'procedure') {
                        procScores[row.target_value] = (procScores[row.target_value] || 0) + row.weight;
                    }
                });

                // 3. Sort & Extract
                const getTop = (scores: Record<string, number>, limit: number) => Object.entries(scores).sort(([, a], [, b]) => b - a).map(([k]) => k).slice(0, limit);

                setState(prev => ({
                    ...prev,
                    suggestedDiagnoses: getTop(diagScores, 10),
                    suggestedMedicines: getTop(medScores, 20),
                    suggestedInvestigations: getTop(invScores, 10),
                    suggestedInstructions: getTop(instScores, 10),
                    suggestedProcedures: getTop(procScores, 10),
                }));

            } catch (e) {
                console.error("AI Prediction Error", e);
            }
        };

        const timer = setTimeout(predict, 800);
        return () => clearTimeout(timer);
    }, [state.symptoms, state.diagnoses]);

    // --- Helpers for Normalization ---
    // Convert Array of objects to Record<Name, Object>
    const normalizeListToRecord = <T extends { name: string }>(list: T[] | null): Record<string, T> => {
        if (!list || !Array.isArray(list)) return {};
        return list.reduce((acc, item) => {
            acc[item.name] = item;
            return acc;
        }, {} as Record<string, T>);
    };

    // --- Load Data ---
    const loadData = async () => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const { data, error } = await supabase
                .from('opd_registration')
                .select(`
                    *,
                    opd_reg_symptoms(*),
                    opd_reg_diagnosis(*),
                    opd_reg_rx(*),
                    opd_reg_reports(*)
                `)
                .eq('id', opdId)
                .single();

            if (error) throw error;

            if (data) {
                // Mapping helpers for structured tables
                const mappedSymptoms: Record<string, SymptomDetail> = normalizeListToRecord((data.opd_reg_symptoms || []).map((s: any) => ({
                    name: s.name,
                    note: s.note || "",
                    duration: s.duration || "",
                    severity: s.severity || "",
                    customGroups: s.custom_groups || [],
                    selectedCustomOptions: s.selected_options || []
                })));

                const mappedDiagnoses: Record<string, DiagnosisDetail> = normalizeListToRecord((data.opd_reg_diagnosis || []).map((d: any) => ({
                    name: d.name,
                    note: d.note || "",
                    status: "Confirmed", 
                    customGroups: [],
                    selectedCustomOptions: []
                })));

                const mappedMedicines = (data.opd_reg_rx || []).map((m: any) => ({
                    id: m.id.toString(),
                    name: m.medicine_name,
                    type: m.medicine_type || "Tab",
                    unit: m.unit || "",
                    dosage: m.dosage || "1",
                    duration: m.duration || "5d",
                    note: m.note || "",
                    timing: m.timing_json || { bb: false, ab: true, bl: false, al: true, bd: false, ad: true }
                }));

                const instructions = (data.opd_reg_reports || [])
                    .filter((r: any) => r.report_type === 'instruction')
                    .map((r: any) => r.item_name);
                const investigations = (data.opd_reg_reports || [])
                    .filter((r: any) => r.report_type === 'investigation')
                    .map((r: any) => r.item_name);
                const procedures = (data.opd_reg_reports || [])
                    .filter((r: any) => r.report_type === 'procedure')
                    .map((r: any) => r.item_name);

                // --- Load Temp from Reports if available ---
                const tempReport = (data.opd_reg_reports || []).find((r: any) => r.item_name === 'temp' && r.report_type === 'vital');
                let currentVitals = {
                    bp: data.bp,
                    pulse: data.pulse,
                    weight: data.weight ? String(data.weight) : undefined,
                    spo2: data.spo2,
                    sugar: data.sugar,
                    temp: tempReport ? tempReport.note || "" : undefined
                };

                // --- Final State Update ---
                setState(prev => ({
                    ...prev,
                    isFinalized: data.is_finalized,
                    lastSavedAt: data.finalized_at || null,
                    symptoms: mappedSymptoms,
                    diagnoses: mappedDiagnoses,
                    medicines: mappedMedicines,
                    instructions: instructions,
                    investigations: investigations,
                    procedures: procedures,
                    clinicalNote: data.clinical_notes || "",
                    followUpDuration: data.follow_up_duration || "",
                    followUpNote: data.follow_up_note || "",
                    referringDoctor: data.referring_doctor_name || "",
                    vitals: currentVitals,
                    isLoading: false,
                }));
            }
        } catch (e) {
            console.error("Error loading prescription data:", e);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    };

    useEffect(() => {
        loadData();
    }, [opdId]);

    // --- Actions Implementation ---

    // Symptoms
    const addSymptom = (detail: SymptomDetail) => {
        setState(prev => ({
            ...prev,
            symptoms: { ...prev.symptoms, [detail.name]: detail }
        }));
    };
    const removeSymptom = (name: string) => {
        setState(prev => {
            const next = { ...prev.symptoms };
            delete next[name];
            return { ...prev, symptoms: next };
        });
    };
    const updateSymptom = (name: string, updates: Partial<SymptomDetail>) => {
        setState(prev => {
            const current = prev.symptoms[name];
            if (!current) return prev;
            return {
                ...prev,
                symptoms: { ...prev.symptoms, [name]: { ...current, ...updates } }
            };
        });
    };

    // Diagnoses
    const addDiagnosis = (detail: DiagnosisDetail) => {
        setState(prev => ({
            ...prev,
            diagnoses: { ...prev.diagnoses, [detail.name]: detail }
        }));
    };
    const removeDiagnosis = (name: string) => {
        setState(prev => {
            const next = { ...prev.diagnoses };
            delete next[name];
            return { ...prev, diagnoses: next };
        });
    };
    const updateDiagnosis = (name: string, updates: Partial<DiagnosisDetail>) => {
        setState(prev => {
            const current = prev.diagnoses[name];
            if (!current) return prev;
            return {
                ...prev,
                diagnoses: { ...prev.diagnoses, [name]: { ...current, ...updates } }
            };
        });
    };

    // Medicines
    const addMedicine = (med: PrescriptionEntry) => {
        setState(prev => ({ ...prev, medicines: [...prev.medicines, med] }));
    };
    const removeMedicine = (id: string) => {
        setState(prev => ({ ...prev, medicines: prev.medicines.filter(m => m.id !== id) }));
    };
    const updateMedicine = (id: string, updates: Partial<PrescriptionEntry>) => {
        setState(prev => ({
            ...prev,
            medicines: prev.medicines.map(m => m.id === id ? { ...m, ...updates } : m)
        }));
    };
    const setMedicines = (meds: PrescriptionEntry[]) => {
        setState(prev => ({ ...prev, medicines: meds }));
    };

    // Others
    const setInstructions = (list: string[]) => setState(prev => ({ ...prev, instructions: list }));
    const setInvestigations = (list: string[]) => setState(prev => ({ ...prev, investigations: list }));
    const setProcedures = (list: string[]) => setState(prev => ({ ...prev, procedures: list }));

    const setClinicalNote = (n: string) => setState(prev => ({ ...prev, clinicalNote: n }));
    const setFollowUp = (d: string, n: string) => setState(prev => ({ ...prev, followUpDuration: d, followUpNote: n }));
    const setReferringDoctor = (n: string) => setState(prev => ({ ...prev, referringDoctor: n }));

    // Core
    const refreshData = async () => {
        await loadData();
    };

    const saveAndFinalize = async () => {
        setState(prev => ({ ...prev, isSaving: true }));
        try {
            // 1. Prepare Main Record Update
            const registrationPayload = {
                clinical_notes: state.clinicalNote,
                follow_up_duration: state.followUpDuration,
                follow_up_note: state.followUpNote,
                referring_doctor_name: state.referringDoctor,
                weight: state.vitals.weight ? Number(state.vitals.weight) : null,
                bp: state.vitals.bp || null,
                pulse: state.vitals.pulse || null,
                spo2: state.vitals.spo2 || null,
                sugar: state.vitals.sugar || null,
                is_finalized: true,
                finalized_at: new Date().toISOString()
            };

            // Start a logical transaction (since we can't do real transactions easily with client lib, 
            // we do sequential operations. In production, we might use an RPC)
            
            // A. Update Main Table
            const { error: mainError } = await supabase
                .from('opd_registration')
                .update(registrationPayload)
                .eq('id', opdId);
            if (mainError) throw mainError;

            // B. Sync Structured Tables - Delete Old & Insert New
            
            // --- SYMPTOMS ---
            await supabase.from('opd_reg_symptoms').delete().eq('opd_id', opdId);
            const symptomEntries = Object.values(state.symptoms);
            if (symptomEntries.length > 0) {
                const { error: sError } = await supabase.from('opd_reg_symptoms').insert(
                    symptomEntries.map(s => ({
                        opd_id: opdId,
                        name: s.name,
                        note: s.note,
                        duration: s.duration,
                        severity: s.severity,
                        custom_groups: s.customGroups,
                        selected_options: s.selectedCustomOptions
                    }))
                );
                if (sError) throw sError;
            }

            // --- DIAGNOSIS ---
            await supabase.from('opd_reg_diagnosis').delete().eq('opd_id', opdId);
            const diagEntries = Object.values(state.diagnoses);
            if (diagEntries.length > 0) {
                const { error: dError } = await supabase.from('opd_reg_diagnosis').insert(
                    diagEntries.map(d => ({
                        opd_id: opdId,
                        name: d.name,
                        note: d.note
                    }))
                );
                if (dError) throw dError;
            }

            // --- RX (MEDICINES) ---
            await supabase.from('opd_reg_rx').delete().eq('opd_id', opdId);
            if (state.medicines.length > 0) {
                const { error: rxError } = await supabase.from('opd_reg_rx').insert(
                    state.medicines.map(m => ({
                        opd_id: opdId,
                        medicine_name: m.name,
                        medicine_type: m.type,
                        unit: m.unit,
                        dosage: m.dosage,
                        duration: m.duration,
                        timing_json: m.timing,
                        note: m.note
                    }))
                );
                if (rxError) throw rxError;
            }

            // --- REPORTS (Instructions, Investigations, Procedures) ---
            await supabase.from('opd_reg_reports').delete().eq('opd_id', opdId);
            const reportEntries: any[] = [
                ...state.instructions.map(item => ({ opd_id: opdId, item_name: item, report_type: 'instruction' })),
                ...state.investigations.map(item => ({ opd_id: opdId, item_name: item, report_type: 'investigation' })),
                ...state.procedures.map(item => ({ opd_id: opdId, item_name: item, report_type: 'procedure' }))
            ];
            
            // Add temp if it has a value
            if (state.vitals.temp) {
                reportEntries.push({
                    opd_id: opdId,
                    item_name: 'temp',
                    report_type: 'vital',
                    note: state.vitals.temp
                });
            }

            if (reportEntries.length > 0) {
                const { error: repError } = await supabase.from('opd_reg_reports').insert(reportEntries);
                if (repError) throw repError;
            }

            // --- AI Learning Trigger ---
            try {
                // Fetch patient details for AI context if needed
                const { data: opdRec } = await supabase.from('opd_registration').select('patient_detail(age_unit, age, gender)').eq('id', opdId).single();

                let p_age_group = 'adult';
                let p_gender = 'male';

                if (opdRec?.patient_detail) {
                    const pd = opdRec.patient_detail as any;
                    p_gender = pd.gender || 'male';
                    const age = Number(pd.age);
                    if (pd.age_unit === 'Y') {
                        if (age < 12) p_age_group = 'child';
                        else if (age > 60) p_age_group = 'senior';
                    } else { p_age_group = 'child'; }
                }

                await supabase.rpc('learn_from_prescription_v2', {
                    p_age_group,
                    p_gender,
                    p_symptoms: Object.values(state.symptoms).map(s => ({ name: s.name, severity: s.severity || '', duration: s.duration || '' })),
                    p_diagnoses: Object.values(state.diagnoses).map(d => ({ name: d.name, status: d.status || '' })),
                    p_medicines: state.medicines.map(m => m.name),
                    p_investigations: state.investigations,
                    p_instructions: state.instructions,
                    p_procedures: state.procedures
                });
            } catch (aiError) {
                console.error("AI Learning Trigger failed:", aiError);
            }

            setState(prev => ({ ...prev, isFinalized: true, isSaving: false }));
            await loadData();
            toast.success("Prescription finalized and stored successfully!");

        } catch (e: any) {
            console.error("Save error:", e);
            toast.error("Failed to finalize: " + (e.message || "Unknown error"));
            setState(prev => ({ ...prev, isSaving: false }));
        }
    };

    const clearPrescription = () => {
        if (!confirm("Clear clinical data (Symptoms, Diagnosis, Rx, Reports)? Vitals will be preserved.")) return;
        
        setState(prev => ({
            ...prev,
            lastSavedAt: null,
            symptoms: {},
            diagnoses: {},
            medicines: [],
            instructions: [],
            investigations: [],
            procedures: [],
            clinicalNote: "",
            followUpDuration: "",
            followUpNote: "",
            isFinalized: false,
        }));

        toast.info("Clinical data cleared. Vitals and basic info preserved.");
    };


    return (
        <PrescriptionContext.Provider value={{
            ...state,
            addSymptom, removeSymptom, updateSymptom,
            addDiagnosis, removeDiagnosis, updateDiagnosis,
            addMedicine, removeMedicine, updateMedicine, setMedicines,
            setInstructions, setInvestigations, setProcedures,
            setClinicalNote, setFollowUp, setReferringDoctor,
            saveAndFinalize, refreshData, clearPrescription
        }}>
            {children}
        </PrescriptionContext.Provider>
    );
}
