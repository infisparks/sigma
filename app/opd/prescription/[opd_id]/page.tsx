"use client";

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import Layout from "@/components/global/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Search,
  PlusCircle,
  Trash2,
  Zap,
  User,
  Heart,
  Droplet,
  AlertTriangle,
  Send,
  Save,
  RefreshCw,
  X,
  ArrowLeft,
  FileText,
} from 'lucide-react';

// --- TYPE DEFINITIONS ---

interface PatientDetail {
  patient_id: number;
  name: string;
  number: string | null;
  age: number | null;
  gender: string | null;
  address: string | null;
  age_unit: string | null;
  uhid: string;
}

interface Vitals {
  temp?: number | string;
  bp?: string;
  pulse?: number | string;
  weight?: number | string;
}

interface PrescriptionItem {
  drug: string;
  dosage: string;
  freq: string;
  duration: string;
}

// This is the main state for the form data
interface FormDataState {
  allergies: string[];
  followUpPlan: string;
  vitals: Vitals;
  chiefComplaints: string[];
  diagnosis: string;
  prescription: PrescriptionItem[];
  investigations: string[];
  dispensingNotes: string[];
}

// This will hold the data fetched from the `opd_datasets` table
interface DatasetsState {
  complaints: string[];
  drugs: string[];
  templates: { [key: string]: any };
  investigations: string[];
  allergies: string[];
  followUp: string[];
  dispensingNotes: string[];
  quickDosages: string[];
  quickDurations: string[];
  quickFrequencies: { [key: string]: string };
  quickDiagnosisPhrases: string[];
}

// Type for the row in `opd_clinical_notes`
interface ClinicalNoteRow {
  id: string;
  opd_id: number;
  uhid: string;
  allergies: string[];
  follow_up_plan: string;
  vitals: Vitals;
  chief_complaints: string[];
  diagnosis: string;
  prescription: PrescriptionItem[];
  investigations: string[];
  dispensing_notes: string[];
}

// --- INITIAL STATES ---

const INITIAL_DATASETS_STATE: DatasetsState = {
  complaints: [],
  drugs: [],
  templates: {},
  investigations: [],
  allergies: [],
  followUp: [],
  dispensingNotes: [],
  quickDosages: [],
  quickDurations: [],
  quickFrequencies: {},
  quickDiagnosisPhrases: [],
};

const INITIAL_FORM_DATA_STATE: FormDataState = {
  allergies: [],
  followUpPlan: '',
  vitals: { temp: '', bp: '', pulse: '', weight: '' },
  chiefComplaints: [],
  diagnosis: '',
  prescription: [],
  investigations: [],
  dispensingNotes: [],
};

// --- MODAL COMPONENTS ---

// 1. Dynamic Add Modal (For all custom lists)
const DynamicAddModal = ({ show, onClose, onSave, title, field }: {
  show: boolean,
  onClose: () => void,
  onSave: (field: string, newItem: any) => void,
  title: string,
  field: string
}) => {
    const [newItem, setNewItem] = useState('');
    const [newValue, setNewValue] = useState(''); // Only for Frequency

    if (!show) return null;

    const isFrequency = field === 'quickFrequencies';

    const handleSave = () => {
        if (newItem.trim()) {
            if (isFrequency && !newValue.trim()) return;
            onSave(field, isFrequency ? { key: newItem.trim(), value: newValue.trim() } : newItem.trim());
            setNewItem('');
            setNewValue('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-[100] flex items-center justify-center p-4 sm:p-8">
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-2xl w-full max-w-md transform transition-all">
                <div className="flex justify-between items-start border-b pb-3 mb-4">
                    <h3 className="text-xl font-bold text-indigo-700">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
                </div>

                <p className="text-gray-600 mb-4 text-sm">Enter the value to add to your quick-select list.</p>

                <input
                    type="text"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder={isFrequency ? "Abbreviation (e.g., QHS)" : "New Option Name"}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 mb-3 text-sm"
                />

                {isFrequency && (
                    <input
                        type="text"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Full Description (e.g., At Bedtime)"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 mb-6 text-sm"
                    />
                )}

                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-full hover:bg-gray-300 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!newItem.trim() || (isFrequency && !newValue.trim())}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:bg-indigo-300 transition"
                    >
                        Add Item
                    </button>
                </div>
            </div>
        </div>
    );
};

// 2. Quick Phrase Confirmation Modal
const QuickPhraseModal = ({ show, onClose, onConfirm, phrase }: {
  show: boolean,
  onClose: () => void,
  onConfirm: (phrase: string) => void,
  phrase: string
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-[100] flex items-center justify-center p-4 sm:p-8">
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-2xl w-full max-w-lg transform transition-all">
                <div className="flex justify-between items-start border-b pb-3 mb-4">
                    <h3 className="text-xl font-bold text-indigo-700">Confirm Diagnosis Phrase</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
                </div>

                <p className="text-gray-800 mb-4 text-sm font-semibold">Phrase to be added:</p>
                <div className="p-4 bg-gray-100 rounded-lg border border-gray-300 mb-6 text-sm whitespace-pre-wrap">
                    {phrase}
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-full hover:bg-gray-300 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => { onConfirm(phrase); onClose(); }}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700 transition"
                    >
                        Add to Notes
                    </button>
                </div>
            </div>
        </div>
    );
};

// 3. Template Modal (For Saving Templates)
const TemplateModal = ({ show, onClose, onSave }: {
  show: boolean,
  onClose: () => void,
  onSave: (name: string) => void,
}) => {
    const [templateName, setTemplateName] = useState('');

    if (!show) return null;

    const handleSave = () => {
        if (templateName.trim()) {
            onSave(templateName.trim());
            setTemplateName('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-[100] flex items-center justify-center p-4 sm:p-8">
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-2xl w-full max-w-md transform transition-all">
                <div className="flex justify-between items-start border-b pb-3 mb-4">
                    <h3 className="text-xl font-bold text-indigo-700">Save Current State as Template</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
                </div>

                <p className="text-gray-600 mb-4 text-sm">Enter a name for the new template. This will save all current complaints, prescription items, and diagnosis notes.</p>

                <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Enter Template Name (e.g., Acute Gastroenteritis)"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 mb-6 text-sm"
                />

                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-full hover:bg-gray-300 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!templateName.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700 disabled:bg-red-300 transition"
                    >
                        Save Template
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- REUSABLE SEARCHABLE DROPDOWN COMPONENT (for Drug Search) ---
const SearchableSelect = ({ label, options, selected, onSelect, placeholder = "Search and select...", onAddNew }: {
  label: string,
  options: string[],
  selected: string,
  onSelect: (value: string) => void,
  placeholder?: string,
  onAddNew: () => void
}) => {
  const [searchTerm, setSearchTerm] = useState(selected || '');
  const [isOpen, setIsOpen] = useState(false);

  // Sync internal state with external prop change
  React.useEffect(() => {
    if (selected !== searchTerm) {
        setSearchTerm(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const filteredOptions = useMemo(() => {
    if (!options) return [];
    if (!searchTerm) return options;
    return options.filter(option =>
      option.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 10);
  }, [searchTerm, options]);

  const handleSelect = (option: string) => {
    onSelect(option);
    setSearchTerm(option);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    onSelect(e.target.value); // Allow free text entry
    setIsOpen(true);
  }

  return (
    <div className="relative w-full">
      <div className="flex justify-between items-end mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {onAddNew && (
            <button type="button" onClick={onAddNew} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center shrink-0">
                <PlusCircle className="w-3 h-3 mr-1"/> Add New
            </button>
        )}
      </div>

      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 text-sm"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <div
                key={index}
                className="px-4 py-2 cursor-pointer hover:bg-indigo-50 transition duration-150 text-sm"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(option); }}
              >
                {option}
              </div>
            ))
          ) : (
            <div className="px-4 py-2 text-gray-500 text-sm italic">
              No results. Type to add or select.
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// --- MAIN OPD FORM COMPONENT ---
export default function OPDClinicalFormPage() {
  const { opd_id } = useParams<{ opd_id: string }>();
  const router = useRouter();

  // --- SUPABASE/CONTEXT STATE ---
  const [patientInfo, setPatientInfo] = useState<PatientDetail | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null); // To track if we are updating or inserting
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- DATASET STATE (from Supabase) ---
  const [datasets, setDatasets] = useState<DatasetsState>(INITIAL_DATASETS_STATE);

  // --- MODAL STATE ---
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isDynamicModalOpen, setIsDynamicModalOpen] = useState(false);
  const [isPhraseModalOpen, setIsPhraseModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState({ title: '', field: '' });
  const [selectedPhrase, setSelectedPhrase] = useState('');

  // --- FORM DATA STATE ---
  const [formData, setFormData] = useState<FormDataState>(INITIAL_FORM_DATA_STATE);
  
  // --- SEARCH STATE ---
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [complaintSearchTerm, setComplaintSearchTerm] = useState('');
  const [allergySearchTerm, setAllergySearchTerm] = useState('');
  const [dispensingSearchTerm, setDispensingSearchTerm] = useState('');


  // --- DATA FETCHING ---
  const fetchAllData = useCallback(async () => {
    if (!opd_id) {
      setIsPageLoading(false);
      toast.error("No OPD ID found.");
      router.push("/opd/list"); // Redirect to a safe page
      return;
    }
    
    setIsPageLoading(true);
    const opdNum = Number(opd_id);

    try {
      // 1. Fetch Patient Info
      const { data: opdData, error: opdError } = await supabase
        .from("opd_registration")
        .select(`uhid, patient_detail:patient_detail!opd_registration_uhid_fkey (*)`)
        .eq("opd_id", opdNum)
        .single();
      
      if (opdError || !opdData) {
        throw new Error(opdError?.message || "Failed to load patient data.");
      }
      // FIX (TS2352): Cast to unknown first to satisfy TypeScript's strict checking
      setPatientInfo(opdData.patient_detail as unknown as PatientDetail);

      // 2. Fetch Datasets (using 'dataname' and 'datajson')
      const { data: datasetData, error: datasetError } = await supabase
        .from("opd_datasets")
        .select("dataname, datajson");
      
      if (datasetError) throw new Error(datasetError.message);

      const newDatasets: any = {};
      datasetData.forEach(item => {
        if (item.dataname) {
          newDatasets[item.dataname] = item.datajson;
        }
      });
      setDatasets(newDatasets as DatasetsState);

      // 3. Fetch Existing Clinical Note
      const { data: noteData, error: noteError } = await supabase
        .from("opd_clinical_notes")
        .select("*")
        .eq("opd_id", opdNum)
        .single();
      
      if (noteData) {
        // Found existing note, populate form
        setFormData({
          allergies: noteData.allergies || [],
          followUpPlan: noteData.follow_up_plan || '',
          vitals: noteData.vitals || { temp: '', bp: '', pulse: '', weight: '' },
          chiefComplaints: noteData.chief_complaints || [],
          diagnosis: noteData.diagnosis || '',
          prescription: noteData.prescription || [],
          investigations: noteData.investigations || [],
          dispensingNotes: noteData.dispensing_notes || [],
        });
        setCurrentNoteId(noteData.id);
        toast.success("Loaded existing clinical notes.");
      } else {
        // No note found, start fresh
        setFormData({
            ...INITIAL_FORM_DATA_STATE,
            // Pre-fill prescription with one empty row if no data
            prescription: [{ drug: '', dosage: newDatasets.quickDosages[0] || '', freq: 'OD', duration: newDatasets.quickDurations[0] || '' }]
        });
        setCurrentNoteId(null);
      }
    } catch (error: any) {
      toast.error(`Error loading page: ${error.message}`);
      router.push("/opd/list");
    } finally {
      setIsPageLoading(false);
    }
  }, [opd_id, router]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // --- HANDLERS ---

  // Universal handler for lists (checkbox/toggle items)
  const handleToggleState = useCallback((field: keyof FormDataState, item: string) => {
    setFormData(prev => {
      const currentList = prev[field] as string[];
      if (!Array.isArray(currentList)) return prev; // Safety check
      
      const isSelected = currentList.includes(item);
      return {
        ...prev,
        [field]: isSelected
          ? currentList.filter(i => i !== item)
          : [...currentList, item]
      };
    });
  }, []);
  
  // Handlers for basic input fields
  const handleInputTextChange = useCallback((field: keyof FormDataState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  const handleVitalsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      vitals: { ...prev.vitals, [name]: value }
    }));
  }, []);

  const handleDrugUpdate = useCallback((index: number, field: keyof PrescriptionItem, value: string) => {
    setFormData(prev => {
      const newPrescription = [...prev.prescription];
      newPrescription[index] = {
        ...newPrescription[index],
        [field]: value
      };
      return { ...prev, prescription: newPrescription };
    });
  }, []);

  const addDrug = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      prescription: [...prev.prescription, { 
        drug: '', 
        dosage: datasets.quickDosages[0] || '', 
        freq: 'OD', 
        duration: datasets.quickDurations[0] || '' 
      }]
    }));
  }, [datasets.quickDosages, datasets.quickDurations]);

  const removeDrug = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      prescription: prev.prescription.filter((_, i) => i !== index)
    }));
  }, []);
  
  // Quick Diagnosis Phrase Confirmation
  const confirmQuickNote = useCallback((phrase: string) => {
      setSelectedPhrase(phrase);
      setIsPhraseModalOpen(true);
  }, []);

  // Quick Diagnosis Phrase Application (Called by modal)
  const handleQuickNote = useCallback((note: string) => {
      setFormData(prev => {
        const newNote = prev.diagnosis.trim() === '' ? note : prev.diagnosis.trim() + '\n\n' + note;
        return { ...prev, diagnosis: newNote };
      });
      toast.success("Note added to diagnosis.");
  }, []);
  
  // Vitals and Exam Quick-Fill
  const handleQuickFill = useCallback((type: string, payload: any) => {
    if (type === 'vitals') {
      setFormData(prev => ({
        ...prev,
        vitals: { ...prev.vitals, ...payload.vitals }
      }));
      toast.success("Vitals updated.");
    }
  }, []);


  // --- DYNAMIC LIST MANAGEMENT (Now with Supabase) ---

  const openDynamicModal = useCallback((title: string, field: string) => {
      setModalContext({ title, field });
      setIsDynamicModalOpen(true);
  }, []);

  // Saves a new item to the `opd_datasets` table
  const saveNewOption = useCallback(async (field: string, newItem: any) => {
      const currentData = datasets[field as keyof DatasetsState];
      let newData;

      if (field === 'quickFrequencies') {
          newData = { ...currentData as object, [newItem.key]: newItem.value };
      } else {
          // Ensure currentData is an array before spreading
          const arrayData = Array.isArray(currentData) ? currentData : [];
          newData = [...arrayData, newItem];
      }

      // FIX: Use 'dataname' and 'datajson'
      const { error } = await supabase
          .from('opd_datasets')
          .update({ datajson: newData, updated_at: new Date().toISOString() })
          .eq('dataname', field);

      if (error) {
          toast.error(`Failed to add new item: ${error.message}`);
      } else {
          // Update local state immediately for responsiveness
          setDatasets(prev => ({ ...prev, [field]: newData }));
          toast.success(`"${newItem.key || newItem}" added to ${field} list.`);
      }
  }, [datasets]);


  // --- TEMPLATE LOGIC (Now with Supabase) ---

  const applyTemplate = useCallback((templateName: string) => {
    const template = datasets.templates[templateName];
    if (!template) return;

    setFormData(prev => ({
      ...prev,
      chiefComplaints: template.complaints || prev.chiefComplaints,
      diagnosis: template.diagnosis || prev.diagnosis,
      prescription: template.prescription.map((p: any) => ({
        ...p,
        dosage: p.dosage || datasets.quickDosages[0],
        freq: p.freq || 'OD',
        duration: p.duration || datasets.quickDurations[0]
      })) || prev.prescription
    }));

    toast.success(`Template '${templateName}' applied!`);
  }, [datasets.templates, datasets.quickDosages, datasets.quickDurations]);

  const saveNewTemplate = useCallback(async (templateName: string) => {
    const newTemplate = {
      complaints: formData.chiefComplaints,
      prescription: formData.prescription.map(p => ({ ...p })),
      diagnosis: formData.diagnosis,
    };

    const newTemplatesData = {
        ...datasets.templates,
        [templateName]: newTemplate
    };

    // FIX: Use 'dataname' and 'datajson'
    const { error } = await supabase
        .from('opd_datasets')
        .update({ datajson: newTemplatesData, updated_at: new Date().toISOString() })
        .eq('dataname', 'templates');

    if (error) {
        toast.error(`Failed to save template: ${error.message}`);
    } else {
        setDatasets(prev => ({...prev, templates: newTemplatesData }));
        toast.success(`New template '${templateName}' saved!`);
    }

  }, [formData, datasets.templates]);

  // --- FILTERED LISTS ---

  const filteredTemplates = useMemo(() => {
    if (!datasets.templates) return [];
    const templateKeys = Object.keys(datasets.templates);
    if (!templateSearchTerm) return templateKeys;
    const term = templateSearchTerm.toLowerCase();
    return templateKeys.filter(key => key.toLowerCase().includes(term));
  }, [datasets.templates, templateSearchTerm]);

  const filteredComplaints = useMemo(() => {
    if (!datasets.complaints) return [];
    if (!complaintSearchTerm) return datasets.complaints;
    const term = complaintSearchTerm.toLowerCase();
    return datasets.complaints.filter(c => c.toLowerCase().includes(term));
  }, [datasets.complaints, complaintSearchTerm]);

  const filteredAllergies = useMemo(() => {
    if (!datasets.allergies) return [];
    if (!allergySearchTerm) return datasets.allergies;
    const term = allergySearchTerm.toLowerCase();
    return datasets.allergies.filter(a => a.toLowerCase().includes(term));
  }, [datasets.allergies, allergySearchTerm]);

  const filteredDispensingNotes = useMemo(() => {
    if (!datasets.dispensingNotes) return [];
    if (!dispensingSearchTerm) return datasets.dispensingNotes;
    const term = dispensingSearchTerm.toLowerCase();
    return datasets.dispensingNotes.filter(n => n.toLowerCase().includes(term));
  }, [datasets.dispensingNotes, dispensingSearchTerm]);


  // --- FORM SUBMISSION (Save to Supabase) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !patientInfo) return;
    
    setIsSubmitting(true);
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const currentUserEmail = user?.email || "unknown";

        const payload = {
            opd_id: Number(opd_id),
            uhid: patientInfo.uhid,
            chief_complaints: formData.chiefComplaints,
            diagnosis: formData.diagnosis,
            prescription: formData.prescription.filter(p => p.drug && p.drug.trim() !== ''), // Filter out empty drug rows
            investigations: formData.investigations,
            allergies: formData.allergies,
            follow_up_plan: formData.followUpPlan,
            dispensing_notes: formData.dispensingNotes,
            vitals: formData.vitals,
            updated_at: new Date().toISOString(),
            updated_by: currentUserEmail,
        };

        if (currentNoteId) {
            // Update existing note
            // FIX (TS1005): Corrected destructuring
            const { error } = await supabase
                .from('opd_clinical_notes')
                .update(payload)
                .eq('id', currentNoteId);
            if (error) throw error;
            toast.success("Clinical notes updated successfully!");
        } else {
            // Insert new note
            const { data: newData, error } = await supabase
                .from('opd_clinical_notes')
                .insert({
                    ...payload,
                    created_at: new Date().toISOString(),
                    created_by: currentUserEmail
                })
                .select('id')
                .single();
            if (error) throw error;
            if (newData) {
              setCurrentNoteId(newData.id); // Start tracking the new note
            }
            toast.success("Clinical notes saved successfully!");
        }

    // FIX (TS7031): Explicitly type 'error' as 'any'
    } catch (error: any) {
        toast.error(`Failed to save: ${error.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
      setFormData({
        ...INITIAL_FORM_DATA_STATE,
        prescription: [{ 
            drug: '', 
            dosage: datasets.quickDosages[0] || '', 
            freq: 'OD', 
            duration: datasets.quickDurations[0] || '' 
        }]
      });
      toast.success('Form cleared.');
  };

  if (isPageLoading) {
    return (
        <Layout>
            <div className="flex justify-center items-center min-h-screen">
                <RefreshCw className="h-10 w-10 animate-spin" />
            </div>
        </Layout>
    );
  }

  if (!patientInfo) {
    return (
        <Layout>
            <div className="flex justify-center items-center min-h-screen text-red-600">
                <p>Patient data not found for OPD ID {opd_id}.</p>
            </div>
        </Layout>
    );
  }
  
  return (
    <Layout>
    <div className="container mx-auto p-2 sm:p-4 font-['Inter']">

        {/* Header from File 1 */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2"><FileText />OPD Clinical Notes</h1>
          <Button onClick={() => router.push("/opd/list")} variant="outline" className="w-full sm:w-auto mt-2 sm:mt-0"><ArrowLeft className="h-4 w-4 mr-2" /> Back to List</Button>
        </div>

        {/* Patient Info Card from File 1 */}
        <Card className="shadow-lg mb-6">
          <CardHeader>
            <CardTitle>{patientInfo.name} (UHID: {patientInfo.uhid})</CardTitle>
            <p className="text-sm text-gray-600">
                OPD ID: {opd_id} | 
                Age: {patientInfo.age} {patientInfo.age_unit || ''} | 
                Gender: {patientInfo.gender}
            </p>
          </CardHeader>
        </Card>

      {/* Form from File 2 */}
      <div className="max-w-7xl mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-indigo-700 mb-2 flex items-center">
          <Heart className="w-6 h-6 sm:w-8 sm:h-8 mr-2" />
          Ultra-Fast OPD Clinical Form
        </h1>
        <p className="text-gray-500 mb-8 text-sm sm:text-base">Dynamic, customizable form for lightning-fast documentation.</p>

        <form onSubmit={handleSubmit}>
          {/* --- 1. PATIENT INFO, VITALS & QUICK FILLS --- */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 p-4 bg-indigo-50 rounded-xl shadow-inner">
            <h2 className="col-span-full text-xl font-semibold text-indigo-800 border-b pb-3 mb-4 flex items-center">
              <User className="w-5 h-5 mr-2" /> Patient Info & Vitals
            </h2>

            {/* Patient Info Fields (Read-only from fetched data) */}
            <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <input type="text" name="name" value={patientInfo.name} placeholder="Patient Name" disabled className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 text-sm bg-gray-100" />
              <input type="text" name="age" value={`${patientInfo.age || ''} ${patientInfo.age_unit || ''}`} placeholder="Age" disabled className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 text-sm bg-gray-100" />
              <input type="text" name="gender" value={patientInfo.gender || ''} placeholder="Gender" disabled className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 text-sm bg-gray-100" />
            </div>

            {/* Vitals - Fast Numeric Input */}
            <div className="col-span-full grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input type="text" name="temp" value={formData.vitals.temp} onChange={handleVitalsChange} placeholder="Temp (°F)" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 text-sm" />
              <input type="text" name="bp" value={formData.vitals.bp} onChange={handleVitalsChange} placeholder="BP (mmHg)" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 text-sm" />
              <input type="text" name="pulse" value={formData.vitals.pulse} onChange={handleVitalsChange} placeholder="Pulse (bpm)" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 text-sm" />
              <input type="text" name="weight" value={formData.vitals.weight} onChange={handleVitalsChange} placeholder="Weight (kg)" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 text-sm" />
            </div>

            {/* Quick-Fill Vitals & Exam Buttons */}
            <div className="col-span-full mt-2 border-t border-indigo-200 pt-3">
              <h3 className="text-sm font-medium text-indigo-700 mb-2">Vitals & Exam Quick-Fill</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleQuickFill('vitals', { vitals: { temp: 101.0, pulse: 95 } })} className="px-3 py-1 text-xs bg-red-200 text-red-800 rounded-full hover:bg-red-300 transition shrink-0">Fever (101°F)</button>
                <button type="button" onClick={() => handleQuickFill('vitals', { vitals: { bp: '140/90', pulse: 80 } })} className="px-3 py-1 text-xs bg-yellow-200 text-yellow-800 rounded-full hover:bg-yellow-300 transition shrink-0">High BP (140/90)</button>
                <button type="button" onClick={() => handleQuickFill('vitals', { vitals: { temp: 98.6, pulse: 72 } })} className="px-3 py-1 text-xs bg-green-200 text-green-800 rounded-full hover:bg-green-300 transition shrink-0">Afebrile & Normal</button>
                <button type="button" onClick={() => confirmQuickNote('Patient is alert, oriented, and in no acute distress (NAD).')} className="px-3 py-1 text-xs bg-indigo-200 text-indigo-800 rounded-full hover:bg-indigo-300 transition shrink-0">NAD Note</button>
              </div>
            </div>
          </div>

          {/* --- 2. QUICK TEMPLATES (TOP PRIORITY + SEARCH) --- */}
          <div className="mb-8 p-4 bg-red-50 rounded-xl shadow-lg border border-red-100">
            <h2 className="text-xl font-semibold text-red-800 border-b pb-3 mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-red-600" /> Quick Templates (Apply entire record)
            </h2>

            <div className="relative mb-4">
                <input
                    type="text"
                    value={templateSearchTerm}
                    onChange={(e) => setTemplateSearchTerm(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full shadow-sm focus:ring-red-500 focus:border-red-500 transition text-sm"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>

            <div className="flex flex-wrap gap-3 max-h-40 overflow-y-auto pr-2">
              {filteredTemplates.length > 0 ? (
                filteredTemplates.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyTemplate(name)}
                      className="px-4 py-2 bg-red-600 text-white font-medium rounded-full shadow-md hover:bg-red-700 transition duration-150 transform hover:scale-[1.01] text-sm shrink-0"
                    >
                      {name} <PlusCircle className="inline w-4 h-4 ml-1" />
                    </button>
                ))
              ) : (
                <p className="text-sm text-gray-600 italic">No templates found.</p>
              )}
            </div>
            <p className="mt-4 text-sm text-gray-600 italic">
                Applying a template will overwrite current **complaints, diagnosis, and prescription**.
            </p>
          </div>
          
          {/* --- 3. ALLERGIES (SEARCHABLE & DYNAMIC) --- */}
          <div className="mb-8 p-4 bg-yellow-50 rounded-xl shadow-lg border border-yellow-100">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-xl font-semibold text-yellow-800 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2"/> Allergies
                </h3>
                <button type="button" onClick={() => openDynamicModal('Add New Allergy', 'allergies')} className="px-3 py-1 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-full hover:bg-indigo-200 transition shrink-0">
                    <PlusCircle className="inline w-4 h-4 mr-1"/> Add
                </button>
            </div>

            <div className="relative mb-4">
                <input type="text" value={allergySearchTerm} onChange={(e) => setAllergySearchTerm(e.target.value)} placeholder="Search allergies..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full shadow-sm focus:ring-yellow-500 focus:border-yellow-500 transition text-sm" />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>

            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2">
              {filteredAllergies.length > 0 ? (
                filteredAllergies.map(allergy => (
                    <div
                        key={allergy}
                        className={`px-3 py-1 text-sm rounded-full border cursor-pointer transition duration-150 select-none shrink-0 ${
                          formData.allergies.includes(allergy)
                            ? 'bg-red-500 text-white border-red-700 font-medium'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                        onClick={() => handleToggleState('allergies', allergy)}
                    >
                        {allergy}
                    </div>
                ))
              ) : (
                <p className="text-sm text-gray-600 italic">No allergies found matching search.</p>
              )}
            </div>
          </div>

          {/* --- 4. CHIEF COMPLAINTS (SEARCHABLE & DYNAMIC) --- */}
          <div className="mb-8 p-4 bg-white rounded-xl shadow-lg border border-gray-100">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Chief Complaints</h2>
                <button type="button" onClick={() => openDynamicModal('Add New Complaint', 'complaints')} className="px-3 py-1 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-full hover:bg-indigo-200 transition shrink-0">
                    <PlusCircle className="inline w-4 h-4 mr-1"/> Add
                </button>
            </div>

            <div className="relative mb-4">
                <input type="text" value={complaintSearchTerm} onChange={(e) => setComplaintSearchTerm(e.target.value)} placeholder="Search complaints..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full shadow-sm focus:ring-green-500 focus:border-green-500 transition text-sm" />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-48 overflow-y-auto pr-2">
              {filteredComplaints.length > 0 ? (
                filteredComplaints.map((complaint) => (
                    <div
                      key={complaint}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition duration-150 text-sm ${
                        formData.chiefComplaints.includes(complaint)
                          ? 'bg-green-100 border-green-500'
                          : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                      }`}
                      onClick={() => handleToggleState('chiefComplaints', complaint)}
                    >
                      <input
                        type="checkbox"
                        checked={formData.chiefComplaints.includes(complaint)}
                        readOnly
                        className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500 shrink-0"
                      />
                      <label className="ml-3 font-medium text-gray-700 select-none flex-1 min-w-0 break-words">{complaint}</label>
                    </div>
                ))
              ) : (
                <p className="text-sm text-gray-600 italic col-span-full">No complaints found matching search.</p>
              )}
            </div>
          </div>
          
          {/* --- 5. DIAGNOSIS / NOTES (WITH QUICK PHRASES & DYNAMIC) --- */}
          <div className="mb-8 p-4 bg-white rounded-xl shadow-lg border border-gray-100">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Diagnosis / Notes</h2>
                <button type="button" onClick={() => openDynamicModal('Add New Quick Phrase', 'quickDiagnosisPhrases')} className="px-3 py-1 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-full hover:bg-indigo-200 transition shrink-0">
                    <PlusCircle className="inline w-4 h-4 mr-1"/> Add Phrase
                </button>
            </div>

            <div>
              <textarea
                id="diagnosis"
                rows={5}
                value={formData.diagnosis}
                onChange={handleInputTextChange('diagnosis')}
                placeholder="Final Diagnosis or Doctor's Notes..."
                className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 text-sm"
              />
            </div>

            <div className="mt-3">
              <h3 className="text-sm font-medium text-indigo-700 mb-2">Quick Phrases / Auto-fill:</h3>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-2 border border-indigo-100 p-2 rounded-lg bg-indigo-50">
                {datasets.quickDiagnosisPhrases.map((phrase, index) => (
                    <button
                        key={index}
                        type="button"
                        onClick={() => confirmQuickNote(phrase)}
                        className="px-3 py-1 text-xs bg-indigo-200 text-indigo-800 rounded-full hover:bg-indigo-300 transition shrink-0"
                    >
                        {phrase.split(' ')[0]}...
                    </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* --- 6. INVESTIGATIONS & FOLLOW-UP (DYNAMIC) --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="p-4 bg-white rounded-xl shadow-lg border border-gray-100">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                    <Droplet className="w-5 h-5 mr-2" /> Investigations
                </h2>
                <button type="button" onClick={() => openDynamicModal('Add New Investigation', 'investigations')} className="px-3 py-1 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-full hover:bg-indigo-200 transition shrink-0">
                    <PlusCircle className="inline w-4 h-4 mr-1"/> Add
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm max-h-48 overflow-y-auto pr-2">
                {datasets.investigations.map((test) => (
                    <div
                      key={test}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition duration-150 ${
                        formData.investigations.includes(test)
                          ? 'bg-purple-100 border-purple-500'
                          : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                      }`}
                      onClick={() => handleToggleState('investigations', test)}
                    >
                      <input type="checkbox" checked={formData.investigations.includes(test)} readOnly className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 shrink-0" />
                      <label className="ml-3 font-medium text-gray-700 select-none flex-1 min-w-0 break-words">{test}</label>
                    </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl shadow-lg border border-gray-100">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                    <Send className="w-5 h-5 mr-2" /> Follow-up & Plan
                </h2>
                <button type="button" onClick={() => openDynamicModal('Add New Follow-up Plan', 'followUp')} className="px-3 py-1 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-full hover:bg-indigo-200 transition shrink-0">
                    <PlusCircle className="inline w-4 h-4 mr-1"/> Add
                </button>
              </div>
              <div className="space-y-3 mb-4 max-h-48 overflow-y-auto pr-2">
                {datasets.followUp.map(plan => (
                    <button
                        key={plan}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, followUpPlan: plan }))}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition duration-150 text-sm ${
                            formData.followUpPlan === plan
                            ? 'bg-blue-100 border-blue-500 text-blue-800 font-semibold'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                        {plan}
                    </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* --- 7. PRESCRIPTION --- */}
          <div className="mb-8 p-4 bg-white rounded-xl shadow-lg border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-800 border-b pb-3 mb-4">Prescription Details (Fast Entry)</h2>

            <div className="space-y-4">
              {formData.prescription.map((item, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                    
                    {/* Responsive Grid for Prescription Line Item */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3 items-end">
                        
                        {/* 1. Drug Name Search: Takes most space */}
                        <div className="col-span-full sm:col-span-4 lg:col-span-3 xl:col-span-4">
                            <SearchableSelect
                              label="Drug Name"
                              options={datasets.drugs}
                              selected={item.drug}
                              onSelect={(val) => handleDrugUpdate(index, 'drug', val)}
                              placeholder="Search or Type Drug Name"
                              onAddNew={() => openDynamicModal('Add New Drug Name', 'drugs')}
                            />
                        </div>

                        {/* 2. Dosage Dropdown */}
                        <div className="col-span-1 sm:col-span-1 lg:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
                            <div className='flex items-center space-x-1'>
                              <select value={item.dosage} onChange={(e) => handleDrugUpdate(index, 'dosage', e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 bg-white text-sm">
                                {datasets.quickDosages.map(dose => (<option key={dose} value={dose}>{dose}</option>))}
                              </select>
                              <button type="button" onClick={() => openDynamicModal('Add New Dosage', 'quickDosages')} title="Add New Dosage" className="text-indigo-600 hover:text-indigo-800 p-1 shrink-0"><PlusCircle className="w-4 h-4"/></button>
                            </div>
                        </div>

                        {/* 3. Duration Dropdown */}
                        <div className="col-span-1 sm:col-span-1 lg:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                            <div className='flex items-center space-x-1'>
                              <select value={item.duration} onChange={(e) => handleDrugUpdate(index, 'duration', e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 bg-white text-sm">
                                {datasets.quickDurations.map(duration => (<option key={duration} value={duration}>{duration}</option>))}
                              </select>
                                <button type="button" onClick={() => openDynamicModal('Add New Duration', 'quickDurations')} title="Add New Duration" className="text-indigo-600 hover:text-indigo-800 p-1 shrink-0"><PlusCircle className="w-4 h-4"/></button>
                            </div>
                        </div>
                        
                        {/* 4. Remove Button */}
                        <div className="col-span-full sm:col-span-4 lg:col-span-1 xl:col-span-1 flex justify-end">
                            <button type="button" onClick={() => removeDrug(index)} className="p-3 bg-red-100 rounded-lg text-red-600 hover:bg-red-200 transition duration-150 shadow-sm" title="Remove Drug">
                              <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Frequency Quick Set Buttons */}
                    <div className="pt-3 mt-4 border-t border-gray-200">
                      <div className='flex justify-between items-center mb-2'>
                          <h4 className="text-xs font-medium text-gray-600">Frequency Quick-Set:</h4>
                          <button type="button" onClick={() => openDynamicModal('Add New Frequency', 'quickFrequencies')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center shrink-0">
                              <PlusCircle className="w-3 h-3 mr-1"/> Add New
                          </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                          {Object.entries(datasets.quickFrequencies).map(([key, description]) => (
                              <button
                                  key={key}
                                  type="button"
                                  onClick={() => handleDrugUpdate(index, 'freq', key)}
                                  title={description}
                                  className={`px-3 py-1 text-xs rounded-full border transition duration-150 shrink-0 ${
                                      item.freq === key
                                        ? 'bg-blue-600 text-white border-blue-700'
                                        : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                                  }`}
                              >
                                  {key}
                              </button>
                          ))}
                      </div>
                    </div>
                </div>
              ))}
            </div>

            <div className='flex flex-col sm:flex-row justify-between mt-6 space-y-3 sm:space-y-0'>
                <button type="button" onClick={addDrug} className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-full shadow-sm text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150">
                  <PlusCircle className="w-5 h-5 mr-2" />
                  Add Another Drug
                </button>
                 <button type="button" onClick={() => setIsTemplateModalOpen(true)} className="flex items-center justify-center px-4 py-3 border border-red-500 text-sm font-medium rounded-full shadow-sm text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-150">
                    <Save className="w-5 h-5 mr-2" />
                    Save as New Template
                  </button>
            </div>

            {/* Dispensing Notes - SEARCHABLE & DYNAMIC */}
            <div className="mt-8 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-md font-semibold text-gray-800">Dispensing Instructions</h3>
                    <button type="button" onClick={() => openDynamicModal('Add New Dispensing Note', 'dispensingNotes')} className="px-3 py-1 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-full hover:bg-indigo-200 transition shrink-0">
                        <PlusCircle className="inline w-4 h-4 mr-1"/> Add
                    </button>
                </div>

                <div className="relative mb-4">
                    <input type="text" value={dispensingSearchTerm} onChange={(e) => setDispensingSearchTerm(e.target.value)} placeholder="Search dispensing instructions..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full shadow-sm focus:ring-orange-500 focus:border-orange-500 transition text-sm" />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>

                <div className="flex flex-wrap gap-3 max-h-32 overflow-y-auto pr-2">
                    {filteredDispensingNotes.length > 0 ? (
                        filteredDispensingNotes.map((note) => (
                            <div
                                key={note}
                                className={`flex items-center p-2 rounded-full border cursor-pointer transition duration-150 text-xs shrink-0 ${
                                  formData.dispensingNotes.includes(note)
                                    ? 'bg-orange-100 border-orange-500 text-orange-800'
                                    : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                                }`}
                                onClick={() => handleToggleState('dispensingNotes', note)}
                            >
                              {note}
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-600 italic">No dispensing notes found matching search.</p>
                    )}
                </div>
            </div>
          </div>
          
          {/* --- ACTION BUTTONS --- */}
          <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between gap-4">
            <button
                type="button"
                onClick={handleResetForm}
                className="flex items-center justify-center py-3 px-4 rounded-xl text-md font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 transition duration-200 w-full sm:w-auto"
            >
                <RefreshCw className="w-5 h-5 mr-2"/> Clear Form
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-2/3 flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 transition duration-200 transform hover:scale-[1.01]"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <RefreshCw className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                  Saving Record...
                </div>
              ) : (
                'Save and Finalize OPD Record'
              )}
            </button>
          </div>
        </form>

        <TemplateModal
            show={isTemplateModalOpen}
            onClose={() => setIsTemplateModalOpen(false)}
            onSave={saveNewTemplate}
        />
        <DynamicAddModal
            show={isDynamicModalOpen}
            onClose={() => setIsDynamicModalOpen(false)}
            onSave={saveNewOption}
            title={modalContext.title}
            field={modalContext.field}
        />
        <QuickPhraseModal
            show={isPhraseModalOpen}
            onClose={() => setIsPhraseModalOpen(false)}
            onConfirm={handleQuickNote}
            phrase={selectedPhrase}
        />
      </div>
    </div>
    </Layout>
  );
};
