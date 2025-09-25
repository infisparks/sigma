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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { User, Phone, Calendar, Bed, Eye, XCircle, AlertCircle } from "lucide-react"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { SearchableSelect } from "@/components/global/searchable-select"
import { useRouter } from "next/navigation"

// --- Type Definitions ---

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
  ipd_id?: number;
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
  referralDoctor: string | null;
  underCareOfDoctor: string;
  depositAmount: string | number | null;
  paymentMode: string;
  paymentThrough: string | null;
  bed: number | null;
  roomType: string;
  date: string;
  time: string;
  paymentDetails: PaymentDetailItem[] | null;
  serviceDetails: ServiceDetailItem[] | null;
  mrd?: string | null;
  tpa?: boolean;
}

interface IPDRegistrationSupabaseFetch {
  referral_doctor: string | null;
  ipd_id: number;
  admission_source: string | null;
  admission_type: string | null;
  under_care_of_doctor: string | null;
  payment_detail: PaymentDetailItem[] | null;
  bed_id: number | null;
  service_detail: ServiceDetailItem[] | null;
  created_at: string;
  discharge_date: string | null;
  relative_name: string | null;
  relative_ph_no: number | null;
  relative_address: string | null;
  admission_date: string | null;
  admission_time: string | null;
  uhid: string;
  patient_detail: PatientDetail | null;
  bed_management: {
    id: number;
    room_type: string;
    bed_number: number;
    bed_type: string;
    status: string;
  } | null;
  discharge_type: string | null;
  ipd_notes: string | null;
  mrd: string | null;
  tpa: boolean | null;
}

// --- Options Constants ---

const admissionSourceOptions: Option[] = [
  { value: "ipd", label: "IPD" },
  { value: "opd", label: "OPD" },
  { value: "casualty", label: "Casualty" },
  { value: "referral", label: "Referral" },
];

const admissionTypeOptions: Option[] = [
  { value: "general", label: "General" },
  { value: "surgery", label: "Surgery" },
  { value: "accident_emergency", label: "Accident/Emergency" },
  { value: "day_observation", label: "Day Observation" },
];

const paymentModeOptions: Option[] = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "mixed", label: "Cash + Online" },
];

const paymentThroughCashOptions: Option[] = [{ value: "cash", label: "Cash" }];

const paymentThroughOnlineOptions: Option[] = [
  { value: "upi", label: "UPI" },
  { value: "credit-card", label: "Credit Card" },
  { value: "debit-card", label: "Debit Card" },
  { value: "netbanking", label: "Net Banking" },
  { value: "cheque", label: "Cheque" },
];

const genderOptions: Option[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const ageUnitOptions: Option[] = [
  { value: "year", label: "Years" },
  { value: "month", label: "Months" },
  { value: "day", label: "Days" },
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
];

interface IPDAppointmentEditPageProps {
  params: { ipd_id: string };
}

const IPDAppointmentEditPage = ({ params }: IPDAppointmentEditPageProps) => {
  const { ipd_id } = params;
  const router = useRouter();

  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [beds, setBeds] = useState<BedData[]>([]);
  const [availableBeds, setAvailableBeds] = useState<BedData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAvailability, setShowAvailability] = useState(false);
  const [originalBedId, setOriginalBedId] = useState<number | null>(null);
  const [roomTypeOptions, setRoomTypeOptions] = useState<Option[]>([]);

  const [formData, setFormData] = useState<IPDFormInput>({
    ipd_id: Number(ipd_id),
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
    admissionSource: "",
    admissionType: "",
    referralDoctor: null,
    underCareOfDoctor: "",
    depositAmount: "",
    paymentMode: "cash",
    paymentThrough: "cash",
    roomType: "",
    bed: null,
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    paymentDetails: [],
    serviceDetails: [],
    mrd: null,
    tpa: false,
  });

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
    const maleTitles = new Set(["MR", "MAST", "BABA"]);
    const femaleTitles = new Set(["MS", "MISS", "MRS", "BABY", "SMT"]);

    let newGender: string | null = formData.gender;
    if (maleTitles.has(formData.title)) {
      newGender = "male";
    } else if (femaleTitles.has(formData.title)) {
      newGender = "female";
    }

    if (newGender !== formData.gender) {
      setFormData((prev) => ({ ...prev, gender: newGender }));
    }
  }, [formData.title, formData.gender]);

  const currentPaymentThroughOptions = useMemo(() => {
    if (formData.paymentMode === "cash") {
      return paymentThroughCashOptions;
    }
    if (formData.paymentMode === "online" || formData.paymentMode === "mixed") {
      return paymentThroughOnlineOptions;
    }
    return [];
  }, [formData.paymentMode]);

  useEffect(() => {
    if (formData.paymentMode === "cash") {
      setFormData((prev) => ({ ...prev, paymentThrough: "cash" }));
    } else if (formData.paymentMode === "online") {
      setFormData((prev) => ({ ...prev, paymentThrough: "upi" }));
    }
  }, [formData.paymentMode]);

  useEffect(() => {
    const fetchRoomTypes = async () => {
      const { data, error } = await supabase.from("bed_management").select("room_type").neq("room_type", null);
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

    const fetchData = async () => {
      setIsLoading(true);
      await Promise.all([fetchAllDoctors(), fetchBeds(), fetchRoomTypes()]);
      if (ipd_id) {
        await fetchIPDRecord(Number(ipd_id));
      }
      setIsLoading(false);
    };

    fetchData();
  }, [ipd_id]);

  useEffect(() => {
    if (formData.roomType) {
      const roomBeds = beds.filter(
        (bed) => bed.room_type === formData.roomType && (bed.status === "available" || bed.id === formData.bed)
      );
      setAvailableBeds(roomBeds);
    } else {
      setAvailableBeds([]);
    }
  }, [formData.roomType, beds, formData.bed]);

  const fetchIPDRecord = async (id: number) => {
    try {
      const { data, error } = await supabase
        .from("ipd_registration")
        .select(`*, patient_detail(*), bed_management(*)`)
        .eq("ipd_id", id)
        .single<IPDRegistrationSupabaseFetch>();

      if (error) throw error;
      if (data) {
        const depositPayment = data.payment_detail?.find((p) => p.type === "deposit");
        setFormData({
          ipd_id: data.ipd_id,
          uhid: data.uhid,
          name: data.patient_detail?.name || "",
          phone: data.patient_detail?.number || "",
          age: data.patient_detail?.age || "",
          ageUnit: data.patient_detail?.age_unit || "year",
          gender: data.patient_detail?.gender || null,
          address: data.patient_detail?.address || null,
          title: data.patient_detail?.title || "MR",
          totalDay: data.patient_detail?.total_day || calculateTotalDays(data.patient_detail?.age, data.patient_detail?.age_unit),
          relativeName: data.relative_name || "",
          relativePhone: data.relative_ph_no || "",
          relativeAddress: data.relative_address || null,
          admissionSource: data.admission_source || "",
          admissionType: data.admission_type || "",
          referralDoctor: data.referral_doctor || "",
          underCareOfDoctor: data.under_care_of_doctor || "",
          depositAmount: depositPayment?.amount ? String(depositPayment.amount) : "",
          paymentMode: depositPayment?.paymentType || "cash",
          paymentThrough: depositPayment?.through || null,
          roomType: data.bed_management?.room_type || "",
          bed: data.bed_id || null,
          date: data.admission_date || new Date().toISOString().split("T")[0],
          time: data.admission_time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
          paymentDetails: data.payment_detail || [],
          serviceDetails: data.service_detail || [],
          mrd: data.mrd || null,
          tpa: data.tpa || false,
        });
        setOriginalBedId(data.bed_id);
      }
    } catch (error) {
      console.error("Error fetching IPD record for edit:", error);
      toast.error("Failed to load IPD record for editing.");
    }
  };

  const fetchAllDoctors = async () => {
    try {
      const { data, error } = await supabase.from("doctor").select("*");
      if (error) throw error;
      setAllDoctors(data ? data.map((doc) => ({ ...doc, id: Number(doc.id) })) : []);
    } catch (error) {
      console.error("Error fetching doctors:", error);
    }
  };

  const fetchBeds = async () => {
    try {
      const { data, error } = await supabase.from("bed_management").select("*");
      if (error) throw error;
      setBeds(data ? data.map((bed) => ({ ...bed, id: Number(bed.id) })) : []);
    } catch (error) {
      console.error("Error fetching beds:", error);
      toast.error("Failed to fetch beds");
    }
  };

  const handlePatientNameChange = (value: string) => {
    setFormData((prev: IPDFormInput) => ({ ...prev, name: value.toUpperCase() }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.phone || !formData.roomType || formData.bed === null) {
      toast.error("Please fill all required fields (Patient Name, Phone, Room Type, Bed).");
      return;
    }

    setIsLoading(true);

    try {
      const ageNum = formData.age ? Number(formData.age) : null;
      const totalDayNum = calculateTotalDays(formData.age, formData.ageUnit);
      let calculatedDob: string | null = null;

      if (ageNum !== null && formData.ageUnit) {
        const today = new Date();
        let dobDate = new Date(today);
        if (formData.ageUnit === "year") dobDate.setFullYear(today.getFullYear() - ageNum);
        else if (formData.ageUnit === "month") dobDate.setMonth(today.getMonth() - ageNum);
        else if (formData.ageUnit === "day") dobDate.setDate(today.getDate() - ageNum);
        calculatedDob = dobDate.toISOString().split("T")[0];
      }

      const { error: patientUpdateError } = await supabase
        .from("patient_detail")
        .update({
          name: formData.name.trim(),
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
        .eq("uhid", formData.uhid);

      if (patientUpdateError) throw patientUpdateError;
      toast.success("Patient details updated successfully!");

      let paymentDetail: PaymentDetailItem[] = formData.paymentDetails ? [...formData.paymentDetails] : [];
      const depositAmount = formData.depositAmount ? Number.parseFloat(String(formData.depositAmount)) : 0;
      const existingDepositIndex = paymentDetail.findIndex((p) => p.type === "deposit");

      if (depositAmount > 0) {
        const newDepositEntry: PaymentDetailItem = {
          date: new Date().toISOString(),
          type: "deposit",
          amountType: "deposit",
          amount: depositAmount,
          createdAt: new Date().toISOString(),
          paymentType: formData.paymentMode,
          through: formData.paymentThrough || "",
        };
        if (existingDepositIndex !== -1) {
          paymentDetail[existingDepositIndex] = newDepositEntry;
        } else {
          paymentDetail.push(newDepositEntry);
        }
      } else if (existingDepositIndex !== -1) {
        paymentDetail.splice(existingDepositIndex, 1);
      }

      const newBedId = formData.bed;
      if (originalBedId !== null && originalBedId !== newBedId) {
        await supabase.from("bed_management").update({ status: "available" }).eq("id", originalBedId);
      }
      await supabase.from("bed_management").update({ status: "occupied" }).eq("id", newBedId);

      const { error: ipdError } = await supabase
        .from("ipd_registration")
        .update({
          admission_source: formData.admissionSource,
          admission_type: formData.admissionType,
          under_care_of_doctor: formData.underCareOfDoctor,
          payment_detail: paymentDetail,
          bed_id: newBedId,
          relative_name: formData.relativeName,
          relative_ph_no: formData.relativePhone ? Number(formData.relativePhone) : null,
          relative_address: formData.relativeAddress,
          admission_date: formData.date,
          admission_time: formData.time,
          mrd: formData.mrd || null,
          tpa: formData.tpa || false,
        })
        .eq("ipd_id", formData.ipd_id);

      if (ipdError) throw ipdError;
      toast.success("IPD admission updated successfully!");

      router.push("/ipd/management");
    } catch (error) {
      console.error("Error submitting admission:", error);
      toast.error("Failed to update admission: " + (error as any).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.push("/ipd/management");
  };

  const handleBedSelectFromPopup = (bedId: number) => {
    const selectedBed = beds.find((bed) => bed.id === bedId);
    if (selectedBed) {
      setFormData((prev: IPDFormInput) => ({
        ...prev,
        roomType: selectedBed.room_type,
        bed: selectedBed.id,
      }));
      setShowAvailability(false);
    }
  };

  const groupedBeds = useMemo(
    () =>
      beds.reduce((acc, bed) => {
        (acc[bed.room_type] = acc[bed.room_type] || []).push(bed);
        return acc;
      }, {} as Record<string, BedData[]>),
    [beds]
  );

  const filteredDoctorOptions = useMemo(
    () => allDoctors.map((doctor) => ({ value: doctor.dr_name, label: doctor.dr_name })),
    [allDoctors]
  );

  const bedSelectOptions = useMemo(() => {
    const options = availableBeds.map((bed) => ({
      value: String(bed.id),
      label: `Bed ${bed.bed_number} - ${bed.bed_type}`,
    }));

    if (formData.bed !== null && !options.some((opt) => Number(opt.value) === formData.bed)) {
      const selectedBed = beds.find((bed) => bed.id === formData.bed);
      if (selectedBed) {
        options.unshift({
          value: String(selectedBed.id),
          label: `Bed ${selectedBed.bed_number} - ${selectedBed.bed_type} (Selected - ${selectedBed.status})`,
        });
      }
    }
    return options;
  }, [availableBeds, formData.bed, beds]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <p>Loading IPD Record...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 p-4 md:p-8">
        <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white py-8 rounded-lg shadow-md">
          <h1 className="text-4xl font-bold mb-3">Edit IPD Admission</h1>
          <p className="text-lg opacity-90">Modify existing IPD patient details</p>
        </div>

        <form id="ipd-form" onSubmit={handleSubmit} className="space-y-6">
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
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, title: value }))}
                    placeholder="Select title"
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
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="Enter phone number"
                    value={formData.phone || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    required
                    autoComplete="off"
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uhid">UHID</Label>
                  <Input
                    id="uhid"
                    value={formData.uhid}
                    readOnly
                    className="placeholder-gray-400 bg-gray-100 cursor-not-allowed"
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
                    value={formData.age || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, age: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Age Unit</Label>
                  <SearchableSelect
                    options={ageUnitOptions}
                    value={formData.ageUnit}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, ageUnit: value }))}
                    placeholder="Select unit"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <SearchableSelect
                    options={genderOptions}
                    value={formData.gender || ""}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, gender: value }))}
                    placeholder="Select gender"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalDay">Total Day (Auto)</Label>
                  <Input
                    id="totalDay"
                    type="number"
                    placeholder="Auto-calculated"
                    value={formData.totalDay || ""}
                    readOnly
                    className="placeholder-gray-400 bg-gray-100 cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="Enter patient address"
                  value={formData.address || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value.toUpperCase() }))}
                  autoComplete="off"
                  className="placeholder-gray-400"
                />
              </div>
            </CardContent>
          </Card>

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
                    onChange={(e) => setFormData((prev) => ({ ...prev, relativeName: e.target.value.toUpperCase() }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relativePhone">Relative Phone No.</Label>
                  <Input
                    id="relativePhone"
                    placeholder="Enter relative phone"
                    value={formData.relativePhone || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, relativePhone: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relativeAddress">Relative Address</Label>
                  <Input
                    id="relativeAddress"
                    placeholder="Enter relative address"
                    value={formData.relativeAddress || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, relativeAddress: e.target.value.toUpperCase() }))}
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
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, admissionSource: value, referralDoctor: "" }))}
                    placeholder="Select admission source"
                  />
                </div>
                {formData.admissionSource === "referral" && (
                  <div className="space-y-2">
                    <Label htmlFor="referralDoctor">Referral Doctor</Label>
                    <Input
                      id="referralDoctor"
                      placeholder="Enter referral doctor name"
                      value={formData.referralDoctor || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, referralDoctor: e.target.value.toUpperCase() }))}
                      className="placeholder-gray-400"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mrd">MRD Number (Optional)</Label>
                  <Input
                    id="mrd"
                    placeholder="Enter MRD number"
                    value={formData.mrd || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mrd: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label>TPA (Third Party Administrator)</Label>
                  <SearchableSelect
                    options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
                    value={String(formData.tpa)}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, tpa: value === "true" }))}
                    placeholder="Select TPA option"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Admission Type</Label>
                  <SearchableSelect
                    options={admissionTypeOptions}
                    value={formData.admissionType}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, admissionType: value }))}
                    placeholder="Select admission type"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Under Care of Doctor</Label>
                  <SearchableSelect
                    options={filteredDoctorOptions}
                    value={formData.underCareOfDoctor}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, underCareOfDoctor: value }))}
                    placeholder="Select doctor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depositAmount">Deposit Amount</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    placeholder="Enter deposit amount"
                    value={formData.depositAmount || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, depositAmount: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  <SearchableSelect
                    options={paymentModeOptions}
                    value={formData.paymentMode}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, paymentMode: value }))}
                    placeholder="Select payment mode"
                  />
                </div>
                {Number(formData.depositAmount) > 0 && (
                  <div className="space-y-2">
                    <Label>Through</Label>
                    <SearchableSelect
                      options={currentPaymentThroughOptions}
                      value={formData.paymentThrough || ""}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, paymentThrough: value }))}
                      placeholder="Select method"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="date">Admission Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Admission Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData((prev) => ({ ...prev, time: e.target.value }))}
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
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowAvailability(true)} className="text-xs">
                      <Eye className="h-3 w-3 mr-1" /> View Availability
                    </Button>
                  </div>
                  <SearchableSelect
                    options={roomTypeOptions}
                    value={formData.roomType}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, roomType: value, bed: null }))}
                    placeholder="Select room type"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bed</Label>
                  <SearchableSelect
                    options={bedSelectOptions}
                    value={formData.bed !== null ? String(formData.bed) : ""}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, bed: Number(value) }))}
                    placeholder={!formData.roomType || availableBeds.length === 0 ? "No Beds Available" : "Select bed"}
                    disabled={!formData.roomType || availableBeds.length === 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center space-x-4">
            <Button type="button" variant="outline" onClick={handleCancel} className="border-gray-600 text-gray-600 hover:bg-gray-50 bg-transparent">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>

        <Dialog open={showAvailability} onOpenChange={setShowAvailability}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-blue-700 flex items-center">
                <Bed className="h-5 w-5 mr-2" />
                Bed Availability
              </DialogTitle>
            </DialogHeader>
            {beds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mb-2" />
                <p className="text-gray-500">No bed data available</p>
              </div>
            ) : (
              <div className="space-y-6">
                {roomTypeOptions.map((roomTypeOption) => {
                  const roomBeds = groupedBeds[roomTypeOption.value] || [];
                  const availableBedsCount = roomBeds.filter((bed) => bed.status === "available").length;
                  const totalBedsCount = roomBeds.length;

                  return (
                    <div key={roomTypeOption.value} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                        <h3 className="text-lg font-semibold capitalize">{roomTypeOption.label}</h3>
                        <span className={`px-3 py-1 rounded-full text-sm ${availableBedsCount > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {availableBedsCount} of {totalBedsCount} available
                        </span>
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {roomBeds.map((bed) => {
                          const isAvailable = bed.status === "available";
                          const statusColorMap: Record<BedData['status'], string> = {
                            available: "bg-green-100 text-green-800",
                            occupied: "bg-red-100 text-red-800",
                            maintenance: "bg-yellow-100 text-yellow-800",
                            reserved: "bg-blue-100 text-blue-800",
                          };
                          return (
                            <div
                              key={bed.id}
                              className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                                isAvailable ? "border-green-500 bg-green-50 hover:bg-green-100 cursor-pointer" : "border-gray-300 bg-gray-50 opacity-80"
                              }`}
                              onClick={() => isAvailable && handleBedSelectFromPopup(bed.id)}
                            >
                              <Bed size={24} className={isAvailable ? "text-green-600" : "text-gray-500"} />
                              <span className="text-sm mt-1 font-medium">Bed {bed.bed_number}</span>
                              <span className={`text-xs px-2 py-1 rounded-full mt-1 ${statusColorMap[bed.status] || "bg-gray-100 text-gray-800"}`}>
                                {bed.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default IPDAppointmentEditPage;