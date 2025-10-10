"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
// FIX 1: Import File as GeminiFile to avoid conflict with global DOM File type
import { GoogleGenAI, File as GeminiFile } from "@google/genai"; 
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Trash2,
  Mic,
  MicOff,
  RefreshCw,
  UserCheck,
  History,
  FileText,
  ArrowLeft,
  Eye,
  Download,
  Send,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";
import Layout from "@/components/global/Layout";

// 🔴 ⚠️ WARNING: API KEY EXPOSED FOR TESTING ONLY ⚠️ 🔴
// Replace with your actual key if testing, but NEVER deploy this to production.
const GEMINI_API_KEY = "AIzaSyAcw76IAvX5ZuJtrSGzXqy594TpU3BkCxA"; 
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });


// --- Type Definitions ---
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

interface OPDPrescriptionRow {
  id: string;
  opd_id: number;
  uhid: string;
  symptoms: string | null;
  known_case_of: string | null;
  treatment: string | null;
  past_history: string | null;
  follow_up: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface PrescriptionFormInputs {
  symptoms: string;
  known_case_of: string;
  treatment: string;
  past_history: string;
  follow_up: string;
}
// --- End Type Definitions ---

// --- Core Gemini API Call Function (Client-Side) ---
async function getPrescriptionFromAudio(audioBlob: Blob): Promise<PrescriptionFormInputs> {
    
    // 1. Convert Blob to File object for Gemini's SDK (using the aliased import)
    const audioFile = new File([audioBlob], `conversation-${uuidv4()}.webm`, { type: 'audio/webm' });

    let uploadedFile: GeminiFile | null = null;

    try {
        // 2. Upload audio file to Gemini's Files API
        toast.loading("Uploading audio to Gemini...", { id: 'gemini-upload' });
        // The File constructor here is the global DOM one, which works with the Gemini SDK.
        uploadedFile = await ai.files.upload({
            file: audioFile,
            config: { mimeType: 'audio/webm' }
        });
        toast.success("Audio uploaded successfully.", { id: 'gemini-upload' });
        
        // 3. Define the structured prompt and JSON schema
        const prompt = `
            You are a medical scribe. Your task is to analyze the doctor-patient conversation in the provided audio file.
            Extract the following details and return them STRICTLY as a clean JSON object.
            
            - symptoms: The main complaints and clinical signs mentioned.
            - known_case_of: Relevant chronic conditions or known history.
            - treatment: The prescribed plan, including medications, dosages, and any investigations.
            - past_history: Any significant past medical or surgical history.
            - follow-up: Instructions for the next visit or conditions for returning.
            
            Format the output only as JSON.
        `;

        const prescriptionSchema = {
            type: "object",
            properties: {
                symptoms: { type: "string", description: "Clinical symptoms and complaints." },
                known_case_of: { type: "string", description: "Known case of or relevant medical history." },
                treatment: { type: "string", description: "Full treatment plan, including drugs, dosage, and investigations." },
                past_history: { type: "string", description: "Relevant past medical history." },
                follow_up: { type: "string", description: "Follow-up instructions or next visit details." },
            },
            required: ["symptoms", "known_case_of", "treatment", "past_history", "follow_up"]
        };

        // 4. Call generateContent with the uploaded file and structured output config
        toast.loading("Analyzing conversation with AI...", { id: 'gemini-analysis' });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Good for multi-modal tasks
            contents: [
                {
                    parts: [
                        { fileData: { mimeType: uploadedFile.mimeType, fileUri: uploadedFile.uri } },
                        { text: prompt }
                    ]
                }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: prescriptionSchema,
                // Increase token limit for potentially long outputs (treatment fields)
                maxOutputTokens: 2048, 
            },
        });
        toast.success("AI analysis complete!", { id: 'gemini-analysis' });
        
        // FIX 2: Check for undefined response.text
        if (!response.text) {
             throw new Error("AI returned an empty response text (content likely blocked).");
        }

        // 5. Parse and return the JSON response
        const jsonText = response.text.trim().replace(/^```json|```$/g, '').trim();
        return JSON.parse(jsonText) as PrescriptionFormInputs;

    } catch (error) {
        console.error("Gemini API Error:", error);
        toast.error(`AI analysis failed: ${(error as Error).message}`, { id: 'gemini-analysis' });
        throw new Error("Failed to generate prescription from audio.");
    } finally {
        // 6. Clean up the uploaded file from the Gemini Files API
        // FIX 3: Ensure uploadedFile and uploadedFile.name exist before deleting
        if (uploadedFile && uploadedFile.name) {
            try {
                // Deleting the file ensures we don't hold on to patient audio data unnecessarily.
                await ai.files.delete({ name: uploadedFile.name });
                console.log(`Cleaned up Gemini file: ${uploadedFile.name}`);
            } catch (cleanupError) {
                console.error("Error cleaning up Gemini file:", cleanupError);
            }
        }
    }
}
// --- End Core Gemini API Call Function ---


export default function OPDPrescriptionPage() {
  const { opd_id } = useParams<{ opd_id: string }>();
  const router = useRouter();

  // State
  const [patientData, setPatientData] = useState<PatientDetail | null>(null);
  const [currentPrescription, setCurrentPrescription] = useState<OPDPrescriptionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyModalItems, setHistoryModalItems] = useState<OPDPrescriptionRow[]>([]);

  // NEW: Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Refs
  const prescriptionContentRef = useRef<HTMLDivElement>(null);

  const { register, handleSubmit, reset, setValue, getValues } = useForm<PrescriptionFormInputs>({
    defaultValues: { symptoms: "", known_case_of: "", treatment: "", past_history: "", follow_up: "" },
  });

  // --- Audio Recording Logic ---
  const startRecording = async () => {
    if (isRecording || isProcessingAudio) return;
    try {
      // Check for MediaRecorder support
      if (!window.MediaRecorder || !navigator.mediaDevices) {
        toast.error("Recording is not supported by your browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Use 'audio/webm' as it is widely supported and efficient for MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        // Create the final audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Stop all tracks from the stream to release the mic
        stream.getTracks().forEach(track => track.stop()); 
        
        if (audioBlob.size > 0) {
             processAudio(audioBlob);
        } else {
             toast.error("Recording failed or was too short.");
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      toast.info("Conversation recording started... Click 'Stop Recording' when finished.");
    } catch (err) {
      toast.error("Failed to start recording. Check microphone permissions.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };
  
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessingAudio(true);
    const opdNum = opd_id;
    if (!opdNum) {
      toast.error("Missing OPD ID.");
      setIsProcessingAudio(false);
      return;
    }

    try {
      // Call the AI service to process the audio
      const aiData = await getPrescriptionFromAudio(audioBlob);

      // Populate form with AI results
      setValue("symptoms", aiData.symptoms);
      setValue("known_case_of", aiData.known_case_of);
      setValue("treatment", aiData.treatment);
      setValue("past_history", aiData.past_history);
      setValue("follow_up", aiData.follow_up);
      
      toast.success("AI analysis complete! Prescription fields updated. Please review before saving.");

    } catch (err: any) {
      // Error handling is inside getPrescriptionFromAudio
    } finally {
      setIsProcessingAudio(false);
    }
  };
  // --- END Audio Recording Logic ---
  
  // --- Form Submission Logic (Remains mostly the same) ---
  const onSubmit: SubmitHandler<PrescriptionFormInputs> = async (formData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";
      const opdNum = Number(opd_id);
      const patientUHID = patientData?.uhid;

      if (!patientUHID) {
        toast.error("Patient UHID not found.");
        return;
      }

      const prescriptionPayload = {
        opd_id: opdNum,
        uhid: patientUHID,
        symptoms: formData.symptoms,
        known_case_of: formData.known_case_of,
        treatment: formData.treatment,
        past_history: formData.past_history,
        follow_up: formData.follow_up,
        updated_at: new Date().toISOString(),
        updated_by: currentUserEmail,
      };

      const { error } = currentPrescription
        ? await supabase.from("opd_prescriptions").update(prescriptionPayload).eq("opd_id", opdNum)
        : await supabase.from("opd_prescriptions").insert({ ...prescriptionPayload, created_by: currentUserEmail });
      
      if (error) throw new Error(error.message);
      
      toast.success("Prescription saved successfully!");
      await fetchPatientAndPrescriptionData();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Data Fetching & Component Logic ---
  const fetchPatientAndPrescriptionData = useCallback(async () => {
    if (!opd_id) { setIsLoading(false); return; }
    setIsLoading(true);
    const opdNum = Number(opd_id);
    try {
      const { data: opdData, error: opdError } = await supabase.from("opd_registration").select(`uhid, patient_detail:patient_detail!opd_registration_uhid_fkey (*)`).eq("opd_id", opdNum).single();
      if (opdError || !opdData) { toast.error("Failed to load patient data."); router.push("/opd/list/opdlistprescripitono"); return; }
      setPatientData(opdData.patient_detail as unknown as PatientDetail);
      
      const { data: presData, error: presError } = await supabase.from("opd_prescriptions").select("*").eq("opd_id", opdNum).single();
      if (presError && presError.code !== "PGRST116") { toast.error("Failed to load prescription."); }
      else if (presData) {
        setCurrentPrescription(presData);
        setValue("symptoms", presData.symptoms || "");
        setValue("known_case_of", presData.known_case_of || "");
        setValue("treatment", presData.treatment || "");
        setValue("past_history", presData.past_history || "");
        setValue("follow_up", presData.follow_up || "");
      } else {
        setCurrentPrescription(null); reset();
      }
    } catch (error) { toast.error("An unexpected error occurred."); router.push("/opd/list/opdlistprescripitono"); }
    finally { setIsLoading(false); }
  }, [opd_id, router, setValue, reset]);

  useEffect(() => { fetchPatientAndPrescriptionData(); }, [fetchPatientAndPrescriptionData]);

  // --- Real-time Subscription ---
  useEffect(() => {
    if (!opd_id) return;
    const channel = supabase.channel(`opd_prescription_opd_id_${opd_id}`).on("postgres_changes", { event: "*", schema: "public", table: "opd_prescriptions", filter: `opd_id=eq.${opd_id}`}, payload => { toast.info(`Prescription data updated.`); fetchPatientAndPrescriptionData(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [opd_id, fetchPatientAndPrescriptionData]);

  // --- Helper Functions ---
  const clearPrescription = () => {
    reset();
    toast.info("Form cleared.");
  };

  // --- PDF & WhatsApp Functions (Kept as is) ---
  const generatePDFBlob = useCallback(async (prescriptionData: OPDPrescriptionRow | null) => {
      const dataToUse = prescriptionData || currentPrescription;
      if (!prescriptionContentRef.current || !patientData || !dataToUse) return null;
      
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const letterheadImage = "/letterhead.png";
      
      const originalRefStyle = prescriptionContentRef.current.style.cssText;
      prescriptionContentRef.current.style.position = "static";
      prescriptionContentRef.current.style.background = `url(${letterheadImage}) no-repeat center top / contain`;
      prescriptionContentRef.current.style.color = "#000";
      
      // Temporarily set the inner HTML for PDF generation
      prescriptionContentRef.current.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8mm; border-bottom: 1px solid #ccc; padding-bottom: 2mm;">
          <div><p><strong>Name:</strong> ${patientData.name}</p><p><strong>UHID:</strong> ${patientData.uhid}</p><p><strong>OPD ID:</strong> ${dataToUse.opd_id}</p></div>
          <div style="text-align: right;"><p><strong>Date:</strong> ${format(parseISO(dataToUse.created_at), "MMM dd, yyyy")}</p><p><strong>Age:</strong> ${patientData.age} ${patientData.age_unit || ""}</p><p><strong>Gender:</strong> ${patientData.gender}</p></div>
        </div>
        <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Clinical Symptoms</h3><p>${dataToUse.symptoms || "N/A"}</p></div>
        <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Known Case of/History</h3><p>${dataToUse.known_case_of || "N/A"}</p></div>
        <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Treatment</h3><p>${dataToUse.treatment || "N/A"}</p></div>
        <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Past History</h3><p>${dataToUse.past_history || "N/A"}</p></div>
        <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Follow-up</h3><p>${dataToUse.follow_up || "N/A"}</p></div>
      `;
      
      const canvas = await html2canvas(prescriptionContentRef.current, { scale: 2 });
      pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", 0, 0, pdfWidth, canvas.height * pdfWidth / canvas.width);
      
      // Restore original state
      if (prescriptionContentRef.current) { 
        prescriptionContentRef.current.style.cssText = originalRefStyle; 
        prescriptionContentRef.current.innerHTML = ''; 
      }
      return pdf.output("blob");
  }, [patientData, currentPrescription]);

  const downloadPrescription = async () => {
      const pdfBlob = await generatePDFBlob(currentPrescription);
      if (!pdfBlob) { toast.error("Failed to generate PDF."); return; }
      const blobURL = URL.createObjectURL(pdfBlob);
      window.open(blobURL, "_blank");
      toast.success("PDF opened successfully!");
  };
  
  const uploadPdfAndSendWhatsApp = async () => {
      if (!currentPrescription || !patientData?.number) { toast.error(!patientData?.number ? "Patient phone number missing." : "Prescription data not loaded."); return; }
      setIsSendingWhatsApp(true);
      try {
        const pdfBlob = await generatePDFBlob(currentPrescription);
        if (!pdfBlob) throw new Error("Failed to generate PDF for WhatsApp.");
        const fileName = `prescription-${patientData.uhid}-${uuidv4()}.pdf`;
        const { error: uploadError } = await supabase.storage.from("dpr-documents").upload(`opd_prescriptions/${fileName}`, pdfBlob);
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        const { data: { publicUrl } } = supabase.storage.from("dpr-documents").getPublicUrl(`opd_prescriptions/${fileName}`);
        if (!publicUrl) throw new Error("Failed to get public URL.");
        const formattedNumber = patientData.number.startsWith("91") ? patientData.number : `91${patientData.number}`;
        const response = await fetch("https://a.infispark.in/send-image-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "9958399157", number: formattedNumber, imageUrl: publicUrl, caption: `Dear ${patientData.name}, here is your prescription for OPD ID ${opd_id}.` }) });
        if (!response.ok) throw new Error(`API Error: ${await response.text()}`);
        const result = await response.json();
        if (result.status === "success") toast.success("Prescription sent via WhatsApp!");
        else toast.error(`WhatsApp failed: ${result.message || "Unknown error"}`);
      } catch (error: any) { toast.error(`WhatsApp Error: ${error.message}`); }
      finally { setIsSendingWhatsApp(false); }
  };
  
  const viewHistoryPrescription = async (historyItem: OPDPrescriptionRow) => {
      const pdfBlob = await generatePDFBlob(historyItem);
      if (!pdfBlob) { toast.error("Failed to generate historical PDF."); return; }
      window.open(URL.createObjectURL(pdfBlob), "_blank");
  };
  
  // --- History Fetching ---
  const fetchPreviousPrescriptions = useCallback(async () => {
    if (!patientData?.uhid) return;
    try {
      const { data, error } = await supabase.from("opd_prescriptions").select("*").eq("uhid", patientData.uhid).order("created_at", { ascending: false });
      if (error) throw error;
      setHistoryModalItems(data.filter((item) => item.opd_id !== currentPrescription?.opd_id));
    } catch { toast.error("Failed to load history."); }
  }, [patientData, currentPrescription]);

  useEffect(() => { if (showHistoryModal) fetchPreviousPrescriptions(); }, [showHistoryModal, fetchPreviousPrescriptions]);

  // --- Render Logic ---
  if (isLoading) return <div className="flex justify-center items-center min-h-screen"><RefreshCw className="h-10 w-10 animate-spin" /></div>;
  if (!patientData) return <div className="flex justify-center items-center min-h-screen text-red-600"><p>Patient data not found for OPD ID {opd_id}.</p></div>;

  return (
    <Layout>
      <div className="container mx-auto p-2 sm:p-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2"><FileText />OPD Prescription</h1>
          <Button onClick={() => router.push("/opd/list/opdlistprescripitono")} variant="outline" className="w-full sm:w-auto mt-2 sm:mt-0"><ArrowLeft className="h-4 w-4 mr-2" /> Back to List</Button>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{patientData.name} (UHID: {patientData.uhid})</CardTitle>
            <p className="text-sm text-gray-600">OPD ID: {opd_id}</p>
          </CardHeader>
          <CardContent>
            {/* NEW: Voice Recording and AI Processing Control */}
            <Button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessingAudio}
              className={`w-full mb-3 text-lg ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {isProcessingAudio ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing Conversation...</>
              ) : isRecording ? (
                <><MicOff className="mr-2 animate-pulse h-5 w-5" /> Stop Recording</>
              ) : (
                <><Mic className="mr-2 h-5 w-5" /> Start Conversation Recording</>
              )}
            </Button>
            
            {isProcessingAudio && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-center font-medium">
                Please wait. AI is extracting prescription details from the audio. This may take up to a minute for long recordings.
              </div>
            )}
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Clinical Symptoms Input */}
              <div>
                <label htmlFor="symptoms" className="block text-sm font-medium">1. Clinical Symptoms</label>
                <div className="relative">
                  <Textarea id="symptoms" {...register("symptoms")} placeholder="AI results for symptoms will appear here. Manual edits possible." className="pr-10 text-sm min-h-[100px]" />
                  <Button variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("symptoms", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Known Case of/History Input */}
              <div>
                <label htmlFor="known_case_of" className="block text-sm font-medium">2. Known Case of/History</label>
                <div className="relative">
                  <Textarea id="known_case_of" {...register("known_case_of")} placeholder="AI results for known history will appear here. Manual edits possible." className="pr-10 text-sm min-h-[100px]" />
                  <Button variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("known_case_of", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Treatment Input */}
              <div>
                <label htmlFor="treatment" className="block text-sm font-medium">3. Treatment (Meds, Investigations, etc.)</label>
                <div className="relative">
                  <Textarea id="treatment" {...register("treatment")} placeholder="AI results for treatment will appear here. Manual edits possible." className="pr-10 text-sm min-h-[150px]" />
                  <Button variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("treatment", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Past History Input */}
              <div>
                <label htmlFor="past_history" className="block text-sm font-medium">4. Past History</label>
                <div className="relative">
                  <Textarea id="past_history" {...register("past_history")} placeholder="AI results for past history will appear here. Manual edits possible." className="pr-10 text-sm min-h-[100px]" />
                  <Button variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("past_history", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              
              {/* Follow-up Input */}
              <div>
                <label htmlFor="follow_up" className="block text-sm font-medium">5. Follow-up / Next Visit</label>
                <div className="relative">
                  <Textarea id="follow_up" {...register("follow_up")} placeholder="AI results for follow-up will appear here. Manual edits possible." className="pr-10 text-sm min-h-[100px]" />
                  <Button variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("follow_up", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                <Button type="submit" disabled={isSubmitting || isProcessingAudio} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {isSubmitting ? <><RefreshCw className="mr-2 animate-spin"/>Saving...</> : <><UserCheck className="mr-2"/>Finalize & Save Prescription</>}
                </Button>
                <Button type="button" onClick={clearPrescription} variant="outline" className="flex-1 text-red-600 border-red-300 hover:bg-red-50" disabled={isProcessingAudio}>
                  <Trash2 className="mr-2"/>Clear Form
                </Button>
                
                {/* History Dialog */}
                <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1" disabled={isProcessingAudio}><History className="mr-2" /> View History</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px]">
                    <DialogHeader>
                      <DialogTitle>Previous Prescriptions for {patientData.name}</DialogTitle>
                      <DialogDescription>This is a history of prescriptions for this patient.</DialogDescription>
                    </DialogHeader>
                    {historyModalItems.length > 0 ? (
                      <div className="overflow-auto max-h-[60vh]">
                        <Table>
                          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Symptoms</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                          <TableBody>{historyModalItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{format(parseISO(item.created_at), "MMM dd, yyyy")}</TableCell>
                                <TableCell className="whitespace-normal max-w-[200px] overflow-hidden text-ellipsis">{item.symptoms}</TableCell>
                                <TableCell><Button size="sm" onClick={() => viewHistoryPrescription(item)}><Eye className="h-4 w-4 mr-1" /> View PDF</Button></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500">No previous prescriptions found.</p>
                    )}
                  </DialogContent>
                </Dialog>
              </div>

              {currentPrescription && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button type="button" onClick={downloadPrescription} variant="secondary"><Download className="mr-2"/>View/Download PDF</Button>
                  <Button type="button" onClick={uploadPdfAndSendWhatsApp} disabled={isSendingWhatsApp || !patientData?.number} className="bg-green-500 hover:bg-green-600 text-white">
                    {isSendingWhatsApp ? <><RefreshCw className="mr-2 animate-spin"/>Sending...</> : <><Send className="mr-2"/>Send WhatsApp</>}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Hidden Div for PDF Generation (Kept as is) */}
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <div ref={prescriptionContentRef} style={{ width: "210mm", minHeight: "297mm", padding: "60mm 15mm 15mm 15mm", color: "#000", fontFamily: "Arial, sans-serif", background: 'white' }}></div>
        </div>
      </div>
    </Layout>
  );
}