"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Phone, Stethoscope, Cake, CalendarDays, BeakerIcon, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";


// Import the sheet components
import InvestigationSheetPage from "./investigation-sheet";
import DoctorVisitPage from "./doctor-visit";
import PatientChargesSheet from "./patient-charges-sheet";
import GlucoseMonitoringSheet from "./glucose-monitoring-sheet";
import IndoorPatientProgressNotes from "./indoor-patient-progress-notes";
import NursesNotesSheet from "./nurses-notes";
import VitalsSheet from "./vitals-sheet";
import AdmissionAssessmentForm from "./admission-assessment-form";
import DrugChartSheet from "./drug-chart";
import IVInfusionSheet from "./iv-infusion-sheet";
import ClinicalNotesSheet from "./clinical-notes-sheet";
import EmergencyCareRecordSheet from "./emergency-care-record-sheet"; 
import PatientFileForm from "./patient-file"; 
import BloodTransfusionConsentForm from "./blood-transfusion-consent-form"; 
import BloodTransfusionRecord from "./blood-transfusion-record"; 
import SurgicalConsentForm from "./surgical-consent-form"; 
import DischargeAgainstMedicalAdvice from "./discharge-against-medical-advice"; 
import DischargeSummary from "./discharge-summary"; 

// --- Type Definitions ---

// Patient detail object
interface PatientDetail {
  uhid: string;
  name: string;
  number: string;
  age: number | null;
  gender: string | null;
}

interface PatientDetails {
  uhid: string;
  name: string;
  number: string;
  roomType: string;
  bedNumber: number | string;
  ipdId: string;
  age: number | null;
  gender: string | null;
  consultantDoctor: string | null;
  admissionDate: string | null;
  isTPA: boolean; // Added TPA status
}

interface IPDRegistrationData {
  uhid: string;
  under_care_of_doctor: string | null;
  admission_date: string | null;
  tpa: boolean | null; // Added tpa to be fetched
  patient_detail: { name: string; number: number | null; age: number | null; gender: string | null } | null;
  bed_management: { room_type: string; bed_number: number | string } | null;
}

// Blood Test from zblood_test table
interface BloodTest {
  id: number
  test_name: string
  price: number
}


// --- Main Page Component ---
const IPDRecordPage = () => {
  const { ipdId } = useParams();
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("patient-file"); 
  const [isBloodTestModalOpen, setIsBloodTestModalOpen] = useState(false);

  const tabs = [
    { value: "surgical-consent", label: "Surgical Consent" },
    { value: "blood-transfusion-record", label: "Transfusion Record" },
    { value: "blood-transfusion-consent", label: "Blood Consent" },
    { value: "patient-file", label: "Patient File" },
    { value: "charge", label: "Charges" },
    { value: "glucose", label: "Glucose" },
    { value: "admission", label: "Admission" },
    { value: "investigation", label: "Investigation" },
    // { value: "clinic", label: "Clinic" },
    { value: "progress", label: "Progress" },
    { value: "nurse", label: "Nurse" },
    { value: "vital", label: "Vitals" },
    { value: "doctor", label: "Doctor" },
    { value: "drug-chart", label: "Drug Chart" },
    { value: "iv-infusion", label: "IV Infusion" },
    { value: "clinical-notes", label: "Clinical Notes" },
    { value: "discharge", label: "Discharge" }, 
    { value: "discharge-against-medical-advice", label: "Discharge AMA" }, 
    { value: "emergency-care", label: "Emergency Care" },
  ];

  // Function to fetch the IPD record and patient details
  const fetchDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const { data: ipdData, error: ipdError } = await supabase
        .from('ipd_registration')
        .select(`
          uhid,
          patient_detail (name, number, age, gender),
          bed_management (room_type, bed_number),
          under_care_of_doctor,
          admission_date,
          tpa
        `)
        .eq('ipd_id', ipdId)
        .single<IPDRegistrationData>();

      if (ipdError) throw ipdError;

      const patientDetail = ipdData.patient_detail;
      const bedManagement = ipdData.bed_management;

      const formattedPatientDetails: PatientDetails = {
        uhid: ipdData.uhid,
        name: patientDetail?.name || 'Unknown Patient',
        number: patientDetail?.number ? String(patientDetail.number) : 'N/A',
        roomType: bedManagement?.room_type || 'N/A',
        bedNumber: bedManagement?.bed_number || 'N/A',
        ipdId: ipdId as string,
        age: patientDetail?.age || null,
        gender: patientDetail?.gender || null,
        consultantDoctor: ipdData.under_care_of_doctor || null,
        admissionDate: ipdData.admission_date || null,
        isTPA: ipdData.tpa || false, // Use tpa from IPD record
      };
      setPatientDetails(formattedPatientDetails);
    } catch (error) {
      console.error("Failed to fetch IPD record or patient details:", error);
      toast.error("Failed to load IPD record.");
      setPatientDetails(null);
    } finally {
      setIsLoading(false);
    }
  }, [ipdId]);

  useEffect(() => {
    if (ipdId) fetchDetails();
  }, [ipdId, fetchDetails]);
  
  const openBloodTestModal = () => {
    if (patientDetails) {
      setIsBloodTestModalOpen(true);
    } else {
      toast.error("Patient details not loaded yet.");
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <RefreshCw className="h-12 w-12 animate-spin text-blue-600" />
        <p className="ml-4 text-xl text-gray-600">Loading details...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <Card className="mb-6 shadow-md">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-blue-50 space-y-2 md:space-y-0">
          <CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-700">
            <span className="text-blue-600 font-bold">Patient Details</span>
          </CardTitle>
          <div className="flex items-center gap-4">
            {/* Blood Test Booking Button */}
            <Button 
                onClick={openBloodTestModal} 
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md transition-colors duration-200"
                size="sm"
                disabled={!patientDetails}
            >
                <BeakerIcon className="h-4 w-4 mr-2" />
                Book Lab Test
            </Button>
            {patientDetails && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <Badge variant="secondary" className="bg-blue-200 text-blue-800">Patient: {patientDetails.name}</Badge>
                    <Badge variant="secondary" className="bg-orange-200 text-orange-800 flex items-center gap-1"><Phone className="h-3 w-3" /> Mobile: {patientDetails.number}</Badge>
                    <Badge variant="secondary" className="bg-gray-200 text-gray-800">UHID: {patientDetails.uhid}</Badge>
                    {patientDetails.age && (<Badge variant="secondary" className="bg-purple-200 text-purple-800 flex items-center gap-1"><Cake className="h-3 w-3" /> Age: {patientDetails.age} {patientDetails.gender ? `(${patientDetails.gender.charAt(0)})` : ''}</Badge>)}
                    {patientDetails.consultantDoctor && (<Badge variant="secondary" className="bg-indigo-200 text-indigo-800 flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Doctor: {patientDetails.consultantDoctor}</Badge>)}
                    <Badge variant="secondary" className="bg-green-200 text-green-800">Room: {patientDetails.roomType} - Bed: {patientDetails.bedNumber}</Badge>
                    {patientDetails.admissionDate && (<Badge variant="secondary" className="bg-teal-200 text-teal-800 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Admitted: {format(parseISO(patientDetails.admissionDate), 'dd MMM, yyyy')}</Badge>)}
                    <Badge variant="secondary" className="bg-red-200 text-red-800">IPD ID: {ipdId}</Badge>
                </div>
            )}
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 h-auto gap-1 p-2 rounded-lg shadow-md">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2 text-sm font-medium rounded-md data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:bg-gray-100">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        
        <TabsContent value="patient-file" className="mt-6">
          <PatientFileForm ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="discharge" className="mt-6">
          <DischargeSummary ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="surgical-consent" className="mt-6">
          <SurgicalConsentForm ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="blood-transfusion-record" className="mt-6">
          <BloodTransfusionRecord ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="blood-transfusion-consent" className="mt-6">
          <BloodTransfusionConsentForm ipdId={ipdId as string} />
        </TabsContent>
        
        <TabsContent value="admission" className="mt-6">
          <AdmissionAssessmentForm ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="charge" className="mt-6">
          <PatientChargesSheet ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="glucose" className="mt-6">
          <GlucoseMonitoringSheet ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="investigation" className="mt-6">
          <InvestigationSheetPage ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="progress" className="mt-6">
          <IndoorPatientProgressNotes ipdId={ipdId as string}  />
        </TabsContent>
        
        <TabsContent value="nurse" className="mt-6">
          <NursesNotesSheet ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="vital" className="mt-6">
          <VitalsSheet ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="doctor" className="mt-6">
          <DoctorVisitPage ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="drug-chart" className="mt-6">
          <DrugChartSheet ipdId={ipdId as string} />
        </TabsContent>
        
        <TabsContent value="iv-infusion" className="mt-6">
          <IVInfusionSheet ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="clinical-notes" className="mt-6">
          <ClinicalNotesSheet ipdId={ipdId as string} />
        </TabsContent>

        <TabsContent value="discharge-against-medical-advice" className="mt-6">
          <DischargeAgainstMedicalAdvice ipdId={ipdId as string} />
        </TabsContent>
        
        <TabsContent value="emergency-care" className="mt-6">
          <EmergencyCareRecordSheet ipdId={ipdId as string} />
        </TabsContent>

        {/* Placeholder Tabs for other content */}
        {tabs.filter(t => !["admission", "charge", "glucose", "investigation", "progress", "nurse", "vital", "doctor", "drug-chart", "iv-infusion", "clinical-notes", "emergency-care", "patient-file", "blood-transfusion-consent", "blood-transfusion-record", "surgical-consent", "discharge-against-medical-advice", "discharge"].includes(t.value)).map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="mt-6">
            <Card className="bg-white shadow-md p-6">
              <CardTitle className="text-lg font-semibold text-gray-800">
                {tab.label}
              </CardTitle>
              <CardContent className="mt-4 text-gray-600">
                <p>Content for the "{tab.label}" section will be displayed here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      
      {/* IPD Blood Test Modal */}
      {patientDetails && (
        <IPDBloodTestModal
          isOpen={isBloodTestModalOpen}
          onClose={() => setIsBloodTestModalOpen(false)}
          patientDetails={patientDetails}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// IPD BLOOD TEST BOOKING MODAL COMPONENT (NEW)
// ----------------------------------------------------------------------

interface IPDBloodTestModalProps {
  isOpen: boolean
  onClose: () => void
  patientDetails: PatientDetails
}

const IPDBloodTestModal: React.FC<IPDBloodTestModalProps> = ({ isOpen, onClose, patientDetails }) => {
  const [allTests, setAllTests] = useState<BloodTest[]>([])
  const [selectedTests, setSelectedTests] = useState<Set<number>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Initialize with the IPD record's TPA status
  const [isTPA, setIsTPA] = useState(patientDetails.isTPA) 
  // Initialize with the IPD record's consultant doctor
  const [customDoctorName, setCustomDoctorName] = useState<string>(patientDetails.consultantDoctor || "") 

  useEffect(() => {
    if (isOpen) {
      // Re-initialize states based on current props (important if props change while modal is closed)
      setIsTPA(patientDetails.isTPA);
      setCustomDoctorName(patientDetails.consultantDoctor || "");
      
      const fetchBloodTests = async () => {
        setIsLoading(true)
        const { data, error } = await supabase
          .from("zblood_test")
          .select("id, test_name, price")
          .order("test_name", { ascending: true })

        if (error) {
          toast.error("Failed to fetch blood tests: " + error.message)
        } else {
          setAllTests(data || [])
        }
        setIsLoading(false)
      }
      fetchBloodTests()
    } else {
      // Reset test selection state on close
      setAllTests([])
      setSelectedTests(new Set())
      setSearchTerm("")
    }
  }, [isOpen, patientDetails]) // Re-run when modal opens or patientDetails change

  const filteredTests = useMemo(() => {
    return allTests.filter(test => test.test_name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [allTests, searchTerm])

  const handleTestSelection = (testId: number) => {
    setSelectedTests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(testId)) {
        newSet.delete(testId)
      } else {
        newSet.add(testId)
      }
      return newSet
    })
  }

  const handleSubmit = async () => {
    if (selectedTests.size === 0) {
      toast.warning("Please select at least one test to book.")
      return
    }

    setIsSubmitting(true)
    const testsToBook = allTests.filter(test => selectedTests.has(test.id))
    const totalAmount = testsToBook.reduce((sum, test) => sum + test.price, 0)
    const currentTime = new Date().toISOString()
    
    // Use the potentially custom doctor name
    const doctorName = customDoctorName.trim() || null;


    const newRegistrationData = {
      UHID: patientDetails.uhid,
      amount_paid: 0,
      visit_type: "ipd", // Changed to ipd
      registration_time: currentTime,
      samplecollected_time: currentTime,
      discount_amount: 0,
      hospital_name: "MEDFORD HOSPITAL",
      payment_mode: "online",
      bloodtest_detail: null, 
      bloodtest_data: testsToBook.map(test => ({
        price: test.price,
        testId: test.id,
        testName: test.test_name,
        testType: "inhospital",
      })),
      amount_paid_history: JSON.stringify({
        discount: 0,
        totalAmount: totalAmount,
        paymentHistory: [],
      }),
      doctor_name: doctorName, 
      tpa: isTPA, 
      source_opd_id: null, // Clear OPD ID
      source_ipd_id: patientDetails.ipdId, // Save IPD ID
      is_enterbydoctor: true,
    }

    // Ensure source_ipd_id is a number for insertion if the table expects bigint
    const ipdIdAsNumber = parseInt(patientDetails.ipdId, 10);
    if (isNaN(ipdIdAsNumber)) {
        toast.error("Invalid IPD ID. Cannot book test.");
        setIsSubmitting(false);
        return;
    }
    
    const registrationDataWithParsedIpdId = {
        ...newRegistrationData,
        source_ipd_id: ipdIdAsNumber
    }

    const { error } = await supabase.from("zregistration").insert([registrationDataWithParsedIpdId])

    if (error) {
      toast.error("Failed to book blood test: " + error.message)
      console.error("Supabase Error:", error);
    } else {
      toast.success("Blood test(s) booked successfully for IPD ID: " + patientDetails.ipdId)
      onClose()
    }
    setIsSubmitting(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Book IPD Lab Test</DialogTitle>
          <DialogDescription>
            Search and select tests for{" "}
            <span className="font-bold text-blue-700">{patientDetails.name}</span> (UHID:{" "}
            {patientDetails.uhid}).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
             <div className="flex items-center space-x-3">
                <Checkbox
                    id="is-tpa"
                    checked={isTPA}
                    onCheckedChange={(checked) => setIsTPA(checked === true)}
                />
                <label
                    htmlFor="is-tpa"
                    className="text-sm font-medium leading-none cursor-pointer"
                >
                    Book under **TPA**
                </label>
            </div>
            <div className="space-y-1">
                <label htmlFor="doctor-name" className="text-sm font-medium leading-none block">
                    Referring Doctor Name
                </label>
                <Input
                    id="doctor-name"
                    placeholder="Enter custom doctor name"
                    value={customDoctorName}
                    onChange={e => setCustomDoctorName(e.target.value)}
                    className="h-9"
                />
            </div>
        </div>

        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Search for a blood test..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-72 w-full rounded-md border p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filteredTests.length > 0 ? (
            <div className="space-y-2">
              {filteredTests.map(test => (
                <div
                  key={test.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id={`test-${test.id}`}
                      checked={selectedTests.has(test.id)}
                      onCheckedChange={() => handleTestSelection(test.id)}
                    />
                    <label htmlFor={`test-${test.id}`} className="text-sm font-medium leading-none cursor-pointer">
                      {test.test_name}
                    </label>
                  </div>
                  <span className="text-sm text-gray-600">₹{test.price}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500">No tests found.</p>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || selectedTests.size === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Booking...
              </>
            ) : (
              `Book ${selectedTests.size} Test(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default IPDRecordPage;