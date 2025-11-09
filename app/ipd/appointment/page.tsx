"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { User, Phone, Calendar, Bed, Eye, XCircle, AlertCircle, PersonStandingIcon as PersonIcon } from "lucide-react"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { SearchableSelect } from "@/components/global/searchable-select"
import IPDSignaturePDF from "@/app/ipd/appointment/pdf"


// --- Type Definitions (Defined directly in this file) ---

interface Option {
  value: string;
  label: string;
}

interface PatientDetail {
  patient_id: number;
  created_at: string;
  name: string;
  number: number | null;
  age: number | null;
  gender: string | null;
  address: string | null;
  age_unit: string | null;
  dob: string | null;
  uhid: string;
  updated_at: string | null;
  title: string | null;
  total_day: number | null;
}

interface Doctor {
  id: number;
  created_at: string;
  dr_name: string;
  department: string;
  specialist: any;
  charges: any;
}

interface BedData {
  id: number;
  created_at: string;
  room_type: string;
  bed_number: number;
  bed_type: string;
  status: "available" | "occupied" | "maintenance" | "reserved";
}

interface PaymentDetailItem {
  date: string;
  type: string;
  amount: number;
  createdAt: string;
  paymentType: string;
  through: string;
  amountType?: "advance" | "deposit" | "settlement" | "refund" | "discount";
}

interface ServiceDetailItem {
  type: string;
  amount: number;
  createdAt: string;
  doctorName: string;
  serviceName: string;
}

interface IPDFormInput {
  uhid: string;
  name: string;
  phone: string | number | null;
  age: string | number | null;
  ageUnit: string;
  gender: string | null;
  address: string | null;
  title: string;
  totalDay: number | null;
  relativeName: string;
  relativePhone: string | number | null;
  relativeAddress: string | null;
  admissionSource: string;
  admissionType: string;
  referralDoctor: string;
  underCareOfDoctor: string;
  depositAmount: string | number | null;
  paymentMode: string;
  through: string | null;
  bed: number | null;
  roomType: string;
  date: string;
  time: string;
  id?: number;
  mrd?: string | null;
  tpa?: boolean;
}

// --- End Type Definitions ---

// Options for various form fields
const admissionSourceOptions: Option[] = [
  { value: "ipd", label: "IPD" },
  { value: "opd", label: "OPD" },
  { value: "casualty", label: "Casualty" },
  { value: "referral", label: "Referral" },
]

const admissionTypeOptions: Option[] = [
  { value: "general", label: "General" },
  { value: "surgery", label: "Surgery" },
  { value: "accident_emergency", label: "Accident/Emergency" },
  { value: "day_observation", label: "Day Observation" },
]

const paymentModeOptions: Option[] = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "mixed", label: "Cash + Online" },
]

const ageUnitOptions: Option[] = [
  { value: "year", label: "Years" },
  { value: "month", label: "Months" },
  { value: "day", label: "Days" },
]

const onlineThroughOptions: Option[] = [
  { value: "upi", label: "UPI" },
  { value: "credit-card", label: "Credit Card" },
  { value: "debit-card", label: "Debit Card" },
  { value: "netbanking", label: "Net Banking" },
  { value: "cheque", label: "Cheque" },
]

const cashThroughOptions: Option[] = [
  { value: "cash", label: "Cash" },
];

const TitleOptions: Option[] = [
    { value: "MR", label: "Mr." },
    { value: "MS", label: "Ms." },
    { value: "MRS", label: "Mrs." },
    { value: "MISS", label: "Miss" },
    { value: "DR", label: "Dr." },
    { value: "BABY", label: "Baby" },
    { value: "MAST", label: "Master" },
    { value: "SMT", label: "Smt." },
    { value: "BABA", label: "Baba" },
    { value: "BABY OF", label: "Baby Of" },
    { value: ".", label: "." },
] as const;

const IPDAppointmentPage = () => {
  const [patients, setPatients] = useState<PatientDetail[]>([])
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([])
  const [beds, setBeds] = useState<BedData[]>([])
  const [availableBeds, setAvailableBeds] = useState<BedData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  // OPD-like search and edit states
  const [searchUhIdInput, setSearchUhIdInput] = useState("")
  const [searchPhoneInput, setSearchPhoneInput] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchedPatientResults, setSearchedPatientResults] = useState<PatientDetail[] | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<PatientDetail | null>(null)
  const [isEditingPatient, setIsEditingPatient] = useState(false)

  const [formData, setFormData] = useState<IPDFormInput>({
    uhid: "",
    name: "",
    phone: "",
    age: "",
    ageUnit: "year",
    gender: null,
    address: null,
    title: "MR",
    totalDay: null,
    relativeName: "",
    relativePhone: "",
    relativeAddress: null,
    admissionSource: "ipd",
    admissionType: "general",
    referralDoctor: "",
    underCareOfDoctor: "",
    depositAmount: "",
    paymentMode: "cash",
    through: "cash",
    roomType: "",
    bed: null,
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    mrd: null,
    tpa: false,
  })

  const [roomTypeOptions, setRoomTypeOptions] = useState<Option[]>([]);

  const genderOptions: Option[] = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
  ]
  
  const calculateTotalDays = useCallback((age?: string | number | null, unit?: string | null): number | null => {
    const ageNum = Number(age);
    if (isNaN(ageNum) || !age || !unit) return null;
    
    switch (unit) {
      case "year":
        return Math.floor(ageNum * 365);
      case "month":
        return Math.floor(ageNum * 30);
      case "day":
        return ageNum;
      default:
        return null;
    }
  }, []);

  useEffect(() => {
    const newTotalDay = calculateTotalDays(formData.age, formData.ageUnit);
    if (newTotalDay !== formData.totalDay) {
      setFormData((prev) => ({ ...prev, totalDay: newTotalDay }));
    }
  }, [formData.age, formData.ageUnit, formData.totalDay, calculateTotalDays]);

  useEffect(() => {
    const male = new Set(["MR", "MAST", "BABA"])
    const female = new Set(["MS", "MISS", "MRS", "BABY", "SMT"])
    
    let newGender: string | null = null;
    if (male.has(formData.title)) newGender = "male";
    else if (female.has(formData.title)) newGender = "female";

    if (newGender !== null && newGender !== formData.gender) {
        setFormData((prev) => ({ ...prev, gender: newGender }));
    } else if (newGender === null && (formData.gender === "male" || formData.gender === "female")) {
        setFormData((prev) => ({ ...prev, gender: null }));
    }
  }, [formData.title, formData.gender]);
  
  useEffect(() => {
    if (formData.paymentMode === "cash") {
      setFormData((prev) => ({ ...prev, through: "cash" }));
    } else if (formData.paymentMode === "online") {
      setFormData((prev) => ({ ...prev, through: onlineThroughOptions[0]?.value || null }));
    } else if (formData.paymentMode === "mixed") {
      setFormData((prev) => ({ ...prev, through: null }));
    }
  }, [formData.paymentMode]);

  useEffect(() => {
    const fetchRoomTypes = async () => {
      const { data, error } = await supabase
        .from("bed_management")
        .select("room_type")
        .neq("room_type", null);
      if (!error && data) {
        const uniqueTypes = Array.from(new Set(data.map((row) => row.room_type).filter(Boolean)));
        setRoomTypeOptions(
          uniqueTypes.map((type) => ({
            value: type,
            label: type.charAt(0).toUpperCase() + type.slice(1),
          }))
        );
      }
    };
    fetchRoomTypes();
  }, []);


  useEffect(() => {
    fetchPatients()
    fetchAllDoctors()
    fetchBeds()
  }, [])

  useEffect(() => {
    if (formData.roomType) {
      const roomBeds = beds.filter((bed) => bed.room_type === formData.roomType && bed.status === "available")
      setAvailableBeds(roomBeds)
    } else {
      setAvailableBeds([])
    }
  }, [formData.roomType, beds])

  const fetchPatientDetailsByUHID = useCallback(async (uhid: string) => {
    if (!uhid) return;
    try {
      const { data, error } = await supabase
        .from("patient_detail")
        .select("*")
        .eq("uhid", uhid)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setFormData((prev: IPDFormInput) => ({
          ...prev,
          name: data.name || "",
          phone: data.number || "",
          age: data.age || "",
          ageUnit: data.age_unit || "year",
          gender: data.gender || null,
          address: data.address || null,
          title: data.title || "MR",
          totalDay: data.total_day || null,
        }));
        toast.success(`Patient details loaded for UHID: ${uhid}`);
      } else {
        toast.info(`No existing patient found for UHID: ${uhid}. Please fill details.`);
        setFormData((prev: IPDFormInput) => ({
          ...prev,
          name: "",
          phone: "",
          age: "",
          ageUnit: "year",
          gender: null,
          address: null,
          title: "MR",
          totalDay: null,
        }));
      }
    } catch (error) {
      console.error("Error fetching patient by UHID:", error);
      toast.error("Failed to fetch patient details by UHID.");
    }
  }, []);

  useEffect(() => {
    if (formData.uhid && !selectedPatient) {
      fetchPatientDetailsByUHID(formData.uhid);
    }
  }, [formData.uhid, fetchPatientDetailsByUHID, selectedPatient]);

  const fillFormWithPatientData = useCallback((p: PatientDetail) => {
    setFormData((prev) => ({
      ...prev,
      uhid: p.uhid || "",
      name: p.name || "",
      phone: p.number ?? "",
      age: p.age ?? "",
      ageUnit: p.age_unit || "year",
      gender: p.gender,
      address: p.address,
      title: p.title || "MR",
      totalDay: p.total_day || null,
    }))
    setSelectedPatient(p)
    setIsEditingPatient(false)
  }, [])

  const resetForNewPatient = useCallback(() => {
    setSelectedPatient(null)
    setIsEditingPatient(false)
    setSearchedPatientResults(null)
    setSearchUhIdInput("")
    setSearchPhoneInput("")
    setFormData((prev) => ({
        uhid: "", 
        name: "", 
        phone: "", 
        age: "", 
        ageUnit: "year", 
        gender: null, 
        address: null, 
        title: "MR", 
        totalDay: null, 
        relativeName: "", 
        relativePhone: "", 
        relativeAddress: null, 
        admissionSource: "ipd", 
        admissionType: "general", 
        referralDoctor: "", 
        underCareOfDoctor: "", 
        depositAmount: "", 
        paymentMode: "cash", 
        through: "cash", 
        roomType: "", 
        bed: null, 
        date: prev.date, 
        time: prev.time,
        mrd: null,
        tpa: false,
    }));
  }, [])

  const handleSearchByUhId = useCallback(async () => {
    if (!searchUhIdInput.trim()) {
      toast.error("Enter UHID or counter number to search.")
      return
    }
    setIsSearching(true)
    setSearchedPatientResults(null)
    try {
      const raw = searchUhIdInput.trim().toUpperCase()
      const isCounterOnly = /^\d+$/.test(raw)
      let query = supabase
        .from("patient_detail")
        .select("patient_id, name, number, age, age_unit, dob, gender, address, uhid, title, total_day")
      if (isCounterOnly) {
        const formattedCounter = raw.padStart(5, '0')
        query = query.ilike("uhid", `%-${formattedCounter}`)
      } else {
        query = query.eq("uhid", raw)
      }
      const { data, error } = await query
      if (error) throw error
      if (!data || (Array.isArray(data) && data.length === 0)) {
        toast.error("No patient found.")
        return
      }
      if (Array.isArray(data)) {
        if (data.length === 1) {
          fillFormWithPatientData(data[0] as PatientDetail)
          toast.success("Patient loaded.")
        } else {
          setSearchedPatientResults(data as PatientDetail[])
          toast.info("Select patient from list.")
        }
      } else {
        fillFormWithPatientData(data as unknown as PatientDetail)
        toast.success("Patient loaded.")
      }
    } catch (e: any) {
      console.error(e)
      toast.error("UHID search failed.")
    } finally {
      setIsSearching(false)
    }
  }, [fillFormWithPatientData, searchUhIdInput])

  const handleSearchByPhoneNumber = useCallback(async () => {
    if (!searchPhoneInput.trim()) {
      toast.error("Enter phone number to search.")
      return
    }
    const phoneAsNumber = Number(searchPhoneInput.trim())
    if (Number.isNaN(phoneAsNumber)) {
      toast.error("Invalid phone number.")
      return
    }
    setIsSearching(true)
    setSearchedPatientResults(null)
    try {
      const { data, error } = await supabase
        .from("patient_detail")
        .select("patient_id, name, number, age, age_unit, dob, gender, address, uhid, title, total_day")
        .eq("number", phoneAsNumber)
      if (error) throw error
      if (!data || data.length === 0) {
        toast.error("No patients found with this phone number.")
        return
      }
      if (data.length === 1) {
        fillFormWithPatientData(data[0] as PatientDetail)
        toast.success("Patient loaded.")
      } else {
        setSearchedPatientResults(data as PatientDetail[])
        toast.info("Select patient from list.")
      }
    } catch (e: any) {
      console.error(e)
      toast.error("Phone search failed.")
    } finally {
      setIsSearching(false)
    }
  }, [searchPhoneInput, fillFormWithPatientData])

  const handleUpdatePatientDetails = useCallback(async () => {
    if (!selectedPatient) return
    setIsLoading(true)
    try {
      const phoneNum = formData.phone !== null && formData.phone !== '' ? Number(formData.phone) : null
      const ageNum = formData.age !== null && formData.age !== '' ? Number(formData.age) : null
      const totalDayNum = calculateTotalDays(formData.age, formData.ageUnit);

      const { error } = await supabase
        .from("patient_detail")
        .update({
          name: String(formData.name).trim().toUpperCase(),
          number: phoneNum,
          age: ageNum,
          age_unit: formData.ageUnit,
          gender: formData.gender,
          address: formData.address,
          title: formData.title,
          total_day: totalDayNum,
        })
        .eq("patient_id", selectedPatient.patient_id)
        .eq("uhid", selectedPatient.uhid)
      if (error) throw error
      const updated: PatientDetail = {
        ...selectedPatient,
        name: String(formData.name).trim().toUpperCase(),
        number: phoneNum,
        age: ageNum,
        age_unit: formData.ageUnit,
        gender: formData.gender,
        address: formData.address,
        title: formData.title,
        total_day: totalDayNum,
      }
      setSelectedPatient(updated)
      toast.success("Patient details updated.")
      setIsEditingPatient(false)
    } catch (e: any) {
      console.error("Failed to update patient details:", e)
      toast.error(`Failed to update patient details: ${e.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [selectedPatient, formData, calculateTotalDays])

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from("patient_detail")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setPatients(data || [])
    } catch (error) {
      console.error("Error fetching patients:", error)
    }
  }

  const fetchAllDoctors = async () => {
    try {
      const { data, error } = await supabase.from("doctor").select("*")

      if (error) throw error
      setAllDoctors(data ? data.map(doc => ({ ...doc, id: Number(doc.id) })) : [])
    } catch (error) {
      console.error("Error fetching doctors:", error)
    }
  }

  const fetchBeds = async () => {
    try {
      const { data, error } = await supabase.from("bed_management").select("*")

      if (error) {
        console.error("Supabase fetch beds error:", error)
        throw error
      }
      setBeds(data ? data.map(bed => ({ ...bed, id: Number(bed.id) })) : [])
    }
    catch (error) {
      console.error("Error fetching beds:", error)
      toast.error("Failed to fetch beds")
    }
  }

  const handlePatientNameChange = (value: string) => {
    setFormData((prev: IPDFormInput) => ({ ...prev, name: value.toUpperCase(), uhid: selectedPatient ? prev.uhid : "" }));
  }

  const sendWhatsAppNotification = async (phoneNumber: string, message: string) => {
    // 1. Validate the phone number
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim() === '') {
      console.warn("Skipping WhatsApp notification: Phone number is missing or invalid.");
      return;
    }

    // 2. Get the API key from your environment variables
    const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || "";

    // 3. Add a check to make sure the API key is loaded
    if (!apiKey) {
      console.error("WhatsApp API Key is missing. Check NEXT_PUBLIC_WHATSAPP_API_KEY environment variable.");
      toast.error("WhatsApp configuration error. Cannot send message.");
      return;
    }

    // 4. Create the new payload structure { number, text }
    const whatsappPayload = {
      number: `91${phoneNumber}`,
      text: message,
    };

    try {
      // 5. Use the new URL and fetch options
      const response = await fetch("https://evo.infispark.in/message/sendText/medfordlab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey // Use the 'apikey' header here
        },
        body: JSON.stringify(whatsappPayload),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`WhatsApp message sent to ${phoneNumber} successfully!`);
      } else {
        toast.error(`Failed to send WhatsApp message to ${phoneNumber}: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Error sending WhatsApp message:", error);
      toast.error(`Error sending WhatsApp message to ${phoneNumber}.`);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.phone || !formData.roomType || formData.bed === null) {
      toast.error("Please fill all required fields (Patient Name, Phone, Room Type, Bed).")
      return
    }

    if ((formData.paymentMode === "online" || formData.paymentMode === "mixed") && !formData.through) {
      toast.error(`Please select a 'Through' method for ${formData.paymentMode} payment.`);
      return;
    }

    setIsLoading(true)

    try {
      let patientUhid = formData.uhid;
      let calculatedDob: string | null = null;
      const ageNum = formData.age ? Number(formData.age) : null;
      const totalDayNum = calculateTotalDays(formData.age, formData.ageUnit);

      if (ageNum !== null && formData.ageUnit) {
        const today = new Date();
        let dobDate = new Date(today);
        if (formData.ageUnit === "year") {
          dobDate.setFullYear(today.getFullYear() - ageNum);
        } else if (formData.ageUnit === "month") {
          dobDate.setMonth(today.getMonth() - ageNum);
        } else if (formData.ageUnit === "day") {
          dobDate.setDate(today.getDate() - ageNum);
        }
        calculatedDob = dobDate.toISOString().split('T')[0];
      }

      let existingPatient: PatientDetail | null = null;
      if (patientUhid) {
        const { data: existing, error: existingError } = await supabase
          .from("patient_detail")
          .select("uhid")
          .eq("uhid", patientUhid)
          .single();
        if (existingError && existingError.code !== 'PGRST116') throw existingError;
        existingPatient = existing && existing.uhid ? { ...existing } as PatientDetail : null;
      }

      if (existingPatient) {
        patientUhid = existingPatient.uhid;
        const { error: patientUpdateError } = await supabase
          .from("patient_detail")
          .update({
            name: formData.name.toUpperCase(),
            number: formData.phone ? Number(formData.phone) : null,
            age: ageNum,
            age_unit: formData.ageUnit,
            gender: formData.gender,
            address: formData.address,
            dob: calculatedDob,
            title: formData.title,
            total_day: totalDayNum,
            updated_at: new Date().toISOString(),
          })
          .eq("uhid", patientUhid);
        if (patientUpdateError) throw patientUpdateError;
        toast.success(`Existing patient (UHID: ${patientUhid}) details updated.`);
      } else {
        const { data: newPatientData, error: patientInsertError } = await supabase
          .from("patient_detail")
          .insert({
            name: formData.name.toUpperCase(),
            number: formData.phone ? Number(formData.phone) : null,
            age: ageNum,
            age_unit: formData.ageUnit,
            gender: formData.gender,
            address: formData.address,
            dob: calculatedDob,
            title: formData.title,
            total_day: totalDayNum,
          })
          .select()
          .single();
        if (patientInsertError) throw patientInsertError;
        patientUhid = newPatientData.uhid;
        toast.success(`New patient registered with UHID: ${patientUhid}`);
      }

      const paymentDetail: PaymentDetailItem[] = [];
      const depositAmount = formData.depositAmount ? Number.parseFloat(String(formData.depositAmount)) : 0;

      if (depositAmount > 0) {
        paymentDetail.push({
          date: new Date().toISOString(),
          type: "deposit",
          amount: depositAmount,
          createdAt: new Date().toISOString(),
          paymentType: formData.paymentMode,
          through: formData.through || (formData.paymentMode === 'cash' ? 'cash' : ''),
          amountType: "deposit",
        });
      }

      const serviceDetail: ServiceDetailItem[] = [];
      const selectedBedIdForDb = formData.bed;
      if (selectedBedIdForDb === null) {
        throw new Error("Invalid bed selection.");
      }

      const doctorNameForDB = getDoctorNameById(formData.underCareOfDoctor);

      const { error: ipdError } = await supabase
        .from("ipd_registration")
        .insert({
          uhid: patientUhid,
          admission_source: formData.admissionSource,
          admission_type: formData.admissionType,
          under_care_of_doctor: doctorNameForDB,
          payment_detail: paymentDetail,
          bed_id: selectedBedIdForDb,
          service_detail: serviceDetail,
          relative_name: formData.relativeName,
          relative_ph_no: formData.relativePhone ? Number(formData.relativePhone) : null,
          relative_address: formData.relativeAddress,
          admission_date: formData.date,
          admission_time: formData.time,
          mrd: formData.mrd || null,
          tpa: formData.tpa || false,
        })
        .select()

      if (ipdError) throw ipdError
      toast.success("IPD admission registered successfully!")

      const { error: bedError } = await supabase
        .from("bed_management")
        .update({ status: "occupied" })
        .eq("id", selectedBedIdForDb)

      if (bedError) throw bedError

      const selectedBed = beds.find(bed => bed.id === selectedBedIdForDb);

      if (formData.phone) {
        const patientMessage = `
🏥 *IPD Admission Confirmation - INFIPLUS Hospital*

Dear *${formData.name}*,

Your IPD admission has been successfully registered.

*Details:*
•   *UHID:* ${patientUhid}
•   *Admission Date:* ${formData.date}
•   *Admission Time:* ${formData.time}
•   *Room Type:* ${roomTypeOptions.find(opt => opt.value === formData.roomType)?.label || 'N/A'}
•   *Bed Number:* ${selectedBed?.bed_number || 'N/A'} (${selectedBed?.bed_type || 'N/A'})
•   *Under Care Of:* Dr. ${doctorNameForDB}

We wish you a speedy recovery!
INFIPLUS Hospital`;
        await sendWhatsAppNotification(String(formData.phone), patientMessage);
      }

      if (formData.relativeName && formData.relativePhone) {
        const relativeMessage = `
🏥 *IPD Admission Update - INFIPLUS Hospital*

Dear ${formData.relativeName},

This message is to confirm the IPD admission of *${formData.name}*.

*Patient Details:*
•   *Name:* ${formData.name}
•   *UHID:* ${patientUhid}

*Admission Details:*
•   *Date:* ${formData.date}
•   *Time:* ${formData.time}
•   *Room Type:* ${roomTypeOptions.find(opt => opt.value === formData.roomType)?.label || 'N/A'}
•   *Bed Number:* ${selectedBed?.bed_number || 'N/A'} (${selectedBed?.bed_type || 'N/A'})
•   *Under Care Of:* Dr. ${doctorNameForDB}

We will keep you updated on their progress.
INFIPLUS Hospital`;
        await sendWhatsAppNotification(String(formData.relativePhone), relativeMessage);
      }

      resetForNewPatient()
      fetchBeds()
    } catch (error) {
      console.error("Error submitting admission:", error)
      toast.error("Failed to register/update admission: " + (error as any).message)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreview = () => {
    if (!formData.name || !formData.phone || !formData.roomType || formData.bed === null) {
      toast.error("Please fill patient information, room type, and bed before previewing.")
      return
    }
    if ((formData.paymentMode === "online" || formData.paymentMode === "mixed") && !formData.through) {
      toast.error(`Please select a 'Through' method for ${formData.paymentMode} payment before previewing.`);
      return;
    }
    setShowPreview(true)
  }

  const handleConfirmSubmit = () => {
    setShowPreview(false)
    const form = document.getElementById("ipd-form") as HTMLFormElement
    if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    }
  }

  const handleBedSelectFromPopup = (bedId: number) => {
    const selectedBed = beds.find((bed) => bed.id === bedId)
    if (selectedBed) {
      setFormData((prev: IPDFormInput) => ({
        ...prev,
        roomType: selectedBed.room_type,
        bed: selectedBed.id,
      }))
      setShowAvailability(false)
    }
  }

  const groupBedsByRoomType = () => {
    const groupedBeds: Record<string, BedData[]> = {}
    beds.forEach((bed) => {
      if (!groupedBeds[bed.room_type]) {
        groupedBeds[bed.room_type] = []
      }
      groupedBeds[bed.room_type].push(bed)
    })
    return groupedBeds
  }

  const groupedBeds = groupBedsByRoomType()

  const filteredDoctorOptions = useMemo(() => {
    return allDoctors.map((doctor) => ({
      value: doctor.dr_name,
      label: doctor.dr_name,
    }));
  }, [allDoctors]);

  const bedSelectOptions = useMemo(() => {
    const options = availableBeds.map((bed) => ({
      value: String(bed.id),
      label: `Bed ${bed.bed_number} - ${bed.bed_type}`,
    }))

    if (formData.bed !== null && !options.some((opt) => Number(opt.value) === formData.bed)) {
      const selectedBed = beds.find((bed) => bed.id === formData.bed)
      if (selectedBed) {
        options.unshift({
          value: String(selectedBed.id),
          label: `Bed ${selectedBed.bed_number} - ${selectedBed.bed_type} (Selected)`,
        })
      }
    }
    return options
  }, [availableBeds, formData.bed, beds])

  const getDoctorNameById = useCallback((doctorId: string | number | null) => {
    return typeof doctorId === 'string' ? doctorId : "N/A";
  }, []);


  return (
    <Layout>
      <div className="space-y-8">
        {/* Search Existing Patient */}
        <Card className="shadow-md rounded-lg border-none">
          <CardHeader className="bg-blue-50 border-b border-blue-200 py-4">
            <CardTitle className="flex items-center gap-3 text-lg text-blue-800">
              Search Existing Patient
              {selectedPatient && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForNewPatient}
                  className="ml-auto text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <XCircle className="h-4 w-4" /> Clear Patient
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="search-uhid">Search by UHID</Label>
                <div className="flex gap-2">
                  <Input
                    id="search-uhid"
                    placeholder="Enter UHID or counter number"
                    value={searchUhIdInput}
                    onChange={(e) => setSearchUhIdInput(e.target.value)}
                    disabled={isSearching || !!selectedPatient}
                    className="h-10"
                  />
                  <Button onClick={handleSearchByUhId} disabled={isSearching || !!selectedPatient} className="min-w-[100px]">
                    {isSearching ? "Searching..." : "Search"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-phone">Search by Phone</Label>
                <div className="flex gap-2">
                  <Input
                    id="search-phone"
                    placeholder="Enter 10-digit phone number"
                    value={searchPhoneInput}
                    onChange={(e) => setSearchPhoneInput(e.target.value)}
                    disabled={isSearching || !!selectedPatient}
                    className="h-10"
                  />
                  <Button onClick={handleSearchByPhoneNumber} disabled={isSearching || !!selectedPatient} className="min-w-[100px]">
                    {isSearching ? "Searching..." : "Search"}
                  </Button>
                </div>
              </div>
            </div>

            {searchedPatientResults && (
              <div className="space-y-2">
                <Label>Select Patient from Results</Label>
                <SearchableSelect
                  options={searchedPatientResults.map((p) => ({ value: p.uhid, label: `${p.name} (${p.uhid}) – ${p.number ?? ''}` }))}
                  value={""}
                  onValueChange={(v) => {
                    const sel = searchedPatientResults.find((p) => p.uhid === v)
                    if (sel) {
                      fillFormWithPatientData(sel)
                      toast.success(`Selected: ${sel.name}`)
                    }
                  }}
                  placeholder="Choose patient"
                />
              </div>
            )}

            {selectedPatient && (
              <div className="bg-blue-100 p-4 rounded-lg flex items-center justify-between text-base text-blue-900 border border-blue-200">
                <span>
                  Selected Patient: <span className="font-semibold">{selectedPatient.name}</span> (UHID: <span className="font-mono font-bold">{selectedPatient.uhid}</span>)
                </span>
                <div className="flex gap-2">
                  {!isEditingPatient ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingPatient(true)} className="text-blue-600 border-blue-500 hover:bg-blue-50">
                      Edit Details
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingPatient(false)} className="text-gray-600 border-gray-500 hover:bg-gray-50">
                        Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={handleUpdatePatientDetails} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {isLoading ? "Updating..." : "Update Details"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Header */}
        <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white py-8 rounded-lg shadow-md">
          <h1 className="text-4xl font-bold mb-3">IPD Admission</h1>
          <p className="text-lg opacity-90">Register new IPD patient admission</p>
        </div>

        <form id="ipd-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Information */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-blue-800">
                <User className="h-5 w-5" />
                <span>Patient Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <SearchableSelect
                    options={TitleOptions}
                    value={formData.title}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, title: value }))}
                    placeholder="Select title"
                    disabled={selectedPatient ? !isEditingPatient : false}
                  />
                </div>
                <div className="space-y-2 col-span-1 md:col-span-2 lg:col-span-1">
                  <Label htmlFor="name">Patient Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter patient name"
                    value={formData.name}
                    onChange={(e) => handlePatientNameChange(e.target.value)}
                    required
                    autoComplete="off"
                    className="placeholder-gray-400 uppercase"
                    disabled={selectedPatient ? !isEditingPatient : false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="Enter phone number"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, phone: e.target.value }))}
                    required
                    autoComplete="off"
                    className="placeholder-gray-400"
                    disabled={selectedPatient ? !isEditingPatient : false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uhid">UHID</Label>
                  <Input
                    id="uhid"
                    placeholder={selectedPatient?.uhid ? "Auto-populated" : "Auto-generated on submit"}
                    value={selectedPatient?.uhid || formData.uhid || ""}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, uhid: e.target.value }))}
                    onBlur={(e) => {
                      if (!selectedPatient) {
                        fetchPatientDetailsByUHID(e.target.value)
                      }
                    }}
                    autoComplete="off"
                    className={`placeholder-gray-400 ${selectedPatient ? "bg-gray-100 cursor-not-allowed" : ""}`}
                    disabled={!!selectedPatient}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder="Enter age"
                    value={formData.age || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, age: e.target.value }))}
                    className="placeholder-gray-400"
                    disabled={selectedPatient ? !isEditingPatient : false}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Age Unit</Label>
                  <SearchableSelect
                    options={ageUnitOptions}
                    value={formData.ageUnit}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, ageUnit: value }))}
                    placeholder="Select unit"
                    disabled={selectedPatient ? !isEditingPatient : false}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <SearchableSelect
                    options={genderOptions}
                    value={formData.gender || ''}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, gender: value }))}
                    placeholder="Select gender"
                    disabled={selectedPatient ? !isEditingPatient : false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalDay">Total Day (Auto)</Label>
                  <Input
                    id="totalDay"
                    type="number"
                    placeholder="Auto-calculated"
                    value={formData.totalDay || ''}
                    readOnly
                    className="placeholder-gray-400 bg-gray-100 cursor-not-allowed"
                    disabled
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="Enter patient address"
                  value={formData.address || ''}
                  onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, address: e.target.value }))}
                  autoComplete="off"
                  className="placeholder-gray-400"
                  disabled={selectedPatient ? !isEditingPatient : false}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Other Cards (Relative Info, Admission, Bed) */}
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-green-800">
                <Phone className="h-5 w-5" />
                <span>Relative Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="relativeName">Relative Name</Label>
                  <Input
                    id="relativeName"
                    placeholder="Enter relative name"
                    value={formData.relativeName}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, relativeName: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relativePhone">Relative Phone No.</Label>
                  <Input
                    id="relativePhone"
                    placeholder="Enter relative phone"
                    value={formData.relativePhone || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, relativePhone: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relativeAddress">Relative Address</Label>
                  <Input
                    id="relativeAddress"
                    placeholder="Enter relative address"
                    value={formData.relativeAddress || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, relativeAddress: e.target.value }))}
                    autoComplete="off"
                    className="placeholder-gray-400"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-purple-800">
                <Calendar className="h-5 w-5" />
                <span>Admission Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Admission Source</Label>
                  <SearchableSelect
                    options={admissionSourceOptions}
                    value={formData.admissionSource}
                    onValueChange={(value) =>
                      setFormData((prev: IPDFormInput) => ({ ...prev, admissionSource: value, referralDoctor: "" }))
                    }
                    placeholder="Select admission source"
                  />
                </div>

                {formData.admissionSource === "referral" && (
                  <div className="space-y-2">
                    <Label htmlFor="referralDoctor">Referral Doctor</Label>
                    <Input
                      id="referralDoctor"
                      placeholder="Enter referral doctor name"
                      value={formData.referralDoctor}
                      onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, referralDoctor: e.target.value }))}
                      className="placeholder-gray-400"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mrd">MRD Number (Optional)</Label>
                  <Input
                    id="mrd"
                    placeholder="Enter MRD number"
                    value={formData.mrd || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, mrd: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label>TPA </Label>
                  <SearchableSelect
                    options={[
                      { value: "true", label: "Yes" },
                      { value: "false", label: "No" },
                    ]}
                    value={String(formData.tpa)}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, tpa: value === "true" }))}
                    placeholder="Select TPA option"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Admission Type</Label>
                  <SearchableSelect
                    options={admissionTypeOptions}
                    value={formData.admissionType}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, admissionType: value }))}
                    placeholder="Select admission type"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Under Care of Doctor</Label>
                  <SearchableSelect
                    options={filteredDoctorOptions}
                    value={formData.underCareOfDoctor}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, underCareOfDoctor: value }))}
                    placeholder="Select doctor"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="depositAmount">Deposit Amount</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    placeholder="Enter deposit amount"
                    value={formData.depositAmount || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, depositAmount: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  <SearchableSelect
                    options={paymentModeOptions}
                    value={formData.paymentMode}
                    onValueChange={(value) => {
                      setFormData((prev: IPDFormInput) => ({ ...prev, paymentMode: value }));
                    }}
                    placeholder="Select payment mode"
                  />
                </div>

                {(formData.paymentMode === "online" || formData.paymentMode === "mixed") && (
                  <div className="space-y-2">
                    <Label>Through</Label>
                    <SearchableSelect
                      options={onlineThroughOptions}
                      value={formData.through || ''}
                      onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, through: value }))}
                      placeholder="Select method"
                    />
                  </div>
                )}

                {formData.paymentMode === "cash" && (
                  <div className="space-y-2">
                    <Label>Through</Label>
                    <SearchableSelect
                      options={cashThroughOptions}
                      value={formData.through || 'cash'}
                      onValueChange={() => {}}
                      placeholder="Cash"
                      disabled
                    />
                  </div>
                )}


                <div className="space-y-2">
                  <Label htmlFor="date">Admission Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, date: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time">Admission Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, time: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-orange-50 border-orange-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-orange-800">
                <Bed className="h-5 w-5" />
                <span>Room & Bed Assignment</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Room Type</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAvailability(true)}
                      className="text-xs"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View Availability
                    </Button>
                  </div>
                  <SearchableSelect
                    options={roomTypeOptions}
                    value={formData.roomType}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, roomType: value, bed: null }))}
                    placeholder="Select room type"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bed</Label>
                  <SearchableSelect
                    options={bedSelectOptions}
                    value={formData.bed !== null ? String(formData.bed) : ''}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, bed: Number(value) }))}
                    placeholder={!formData.roomType || availableBeds.length === 0 ? "No Beds Available" : "Select bed"}
                    disabled={!formData.roomType || availableBeds.length === 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-center space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              className="border-blue-600 text-blue-600 hover:bg-blue-50 bg-transparent"
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? "Submitting..." : "Submit Admission"}
            </Button>
          </div>
        </form>

        {showAvailability && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-blue-700 flex items-center">
                  <Bed className="h-5 w-5 mr-2" />
                  Bed Availability
                </h2>
                <button onClick={() => setShowAvailability(false)} className="text-gray-500 hover:text-gray-700">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {beds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertCircle className="h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-gray-500">No bed data available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {roomTypeOptions.map((roomTypeOption) => {
                    const roomBeds = groupedBeds[roomTypeOption.value] || []
                    const availableBedsCount = roomBeds.filter((bed) => bed.status === "available").length
                    const totalBedsCount = roomBeds.length

                    return (
                      <div key={roomTypeOption.value} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 p-4 border-b">
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold capitalize">{roomTypeOption.label}</h3>
                            <span
                              className={`px-3 py-1 rounded-full text-sm ${
                                availableBedsCount > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {availableBedsCount} of {totalBedsCount} available
                            </span>
                          </div>
                        </div>

                        <div className="p-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {roomBeds.map((bed) => {
                              const isAvailable = bed.status === "available"
                              const statusColorMap: Record<BedData['status'], string> = {
                                available: "bg-green-100 text-green-800",
                                occupied: "bg-red-100 text-red-800",
                                maintenance: "bg-yellow-100 text-yellow-800",
                                reserved: "bg-blue-100 text-blue-800",
                              };
                              const statusColor = statusColorMap[bed.status] || "bg-gray-100 text-gray-800";

                              return (
                                <div
                                  key={bed.id}
                                  className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                    isAvailable
                                      ? "border-green-500 bg-green-50 hover:bg-green-100"
                                      : "border-gray-300 bg-gray-50 opacity-80"
                                  }`}
                                  onClick={() => isAvailable && handleBedSelectFromPopup(bed.id)}
                                >
                                  <Bed size={24} className={isAvailable ? "text-green-600" : "text-gray-500"} />
                                  <span className="text-sm mt-1 font-medium">Bed {bed.bed_number}</span>
                                  <span className={`text-xs px-2 py-1 rounded-full mt-1 ${statusColor}`}>
                                    {bed.status}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Admission Preview</DialogTitle>
              <DialogDescription>Review the details before confirming admission.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Card className="border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-800">Patient Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium">Name:</span> {formData.name || "-"}</div>
                  <div><span className="font-medium">UHID:</span> {selectedPatient?.uhid || formData.uhid || "-"}</div>
                  <div><span className="font-medium">Age / Sex:</span> {`${formData.age || "-"} / ${genderOptions.find(g=>g.value===formData.gender)?.label || "-"}`}</div>
                  <div><span className="font-medium">Phone:</span> {formData.phone || "-"}</div>
                  <div className="md:col-span-2"><span className="font-medium">Address:</span> {formData.address || "-"}</div>
                  {formData.mrd ? (<div><span className="font-medium">MRD:</span> {formData.mrd}</div>) : null}
                  <div><span className="font-medium">TPA:</span> {formData.tpa ? "Yes" : "No"}</div>
                </CardContent>
              </Card>

              <Card className="border-purple-200">
                <CardHeader>
                  <CardTitle className="text-purple-800">Admission Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium">Admission Source:</span> {admissionSourceOptions.find(o=>o.value===formData.admissionSource)?.label || "-"}</div>
                  <div><span className="font-medium">Admission Type:</span> {admissionTypeOptions.find(o=>o.value===formData.admissionType)?.label || "-"}</div>
                  <div><span className="font-medium">Date:</span> {formData.date}</div>
                  <div><span className="font-medium">Time:</span> {formData.time}</div>
                  {formData.admissionSource === "referral" ? (
                    <div className="md:col-span-2"><span className="font-medium">Referral Doctor:</span> {formData.referralDoctor || "-"}</div>
                  ) : null}
                  <div className="md:col-span-2"><span className="font-medium">Under Care Of:</span> {formData.underCareOfDoctor || "-"}</div>
                </CardContent>
              </Card>

              <Card className="border-orange-200">
                <CardHeader>
                  <CardTitle className="text-orange-800">Room & Bed</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium">Room Type:</span> {roomTypeOptions.find(o=>o.value===formData.roomType)?.label || "-"}</div>
                  <div>
                    <span className="font-medium">Bed:</span> {(() => {
                      const b = beds.find(bed => bed.id === formData.bed)
                      return b ? `Bed ${b.bed_number} - ${b.bed_type}` : "-"
                    })()}
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  You can also download the admission letter directly:
                </div>
                <IPDSignaturePDF
                  data={{
                    uhid: selectedPatient?.uhid || formData.uhid || "",
                    name: formData.name || "",
                    phone: String(formData.phone || ""),
                    age: Number(formData.age || 0),
                    ageUnit: formData.ageUnit,
                    gender: String(formData.gender || ""),
                    address: String(formData.address || ""),
                    relativeName: formData.relativeName,
                    relativePhone: formData.relativePhone || null,
                    relativeAddress: formData.relativeAddress || null,
                    admissionSource: formData.admissionSource,
                    admissionType: formData.admissionType,
                    referralDoctor: formData.referralDoctor || "",
                    underCareOfDoctor: formData.underCareOfDoctor || "",
                    depositAmount: formData.depositAmount,
                    paymentMode: formData.paymentMode,
                    bed: formData.bed || 0,
                    roomType: formData.roomType,
                    date: formData.date,
                    time: formData.time,
                    paymentDetails: null,
                    serviceDetails: null,
                    mrd: formData.mrd || null,
                    tpa: formData.tpa || false,
                  }}
                  genderOptions={genderOptions}
                  admissionSourceOptions={admissionSourceOptions}
                  admissionTypeOptions={admissionTypeOptions}
                  paymentModeOptions={paymentModeOptions}
                  roomTypeOptions={roomTypeOptions}
                  doctors={allDoctors}
                  beds={beds}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowPreview(false)}>Back</Button>
                <Button type="button" onClick={handleConfirmSubmit} className="bg-blue-600 hover:bg-blue-700">Confirm & Submit</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

export default IPDAppointmentPage