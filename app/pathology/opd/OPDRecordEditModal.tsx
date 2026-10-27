
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, X, FileText, Save, Plus, Heart, Scale, Stethoscope, FilePenLine, UserCircle, Phone, Activity, CreditCard } from 'lucide-react';
import { openUniversalBillInNewTabProgrammatically, type BillServiceItem, type UniversalBillData, type DoctorLite } from "../patient-entry/universal-bill-generator";

// --- Helper Functions (Duplicated for self-sufficiency) ---

function formatDate(isoString: string | null | undefined): string {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
        });
    } catch { return 'Invalid Date'; }
}

function calculateDOB(age: number, unit: 'year' | 'month' | 'day'): string {
    const today = new Date(); const dob = new Date(today);
    dob.setHours(0, 0, 0, 0);
    if (unit === 'year') { dob.setFullYear(dob.getFullYear() - age); }
    else if (unit === 'month') { dob.setMonth(dob.getMonth() - age); }
    else if (unit === 'day') { dob.setDate(dob.getDate() - age); }
    return dob.toISOString().split('T')[0];
}


// --- Types ---
interface PaymentEntry { amount: number; paymentMode: string; time: string; }
interface DoctorFee { id: number; doctor_name: string; first_visit_fee: number; follow_up_fee: number; }

interface PatientDetails {
    name: string; number: number; age: number; age_unit: 'year' | 'month' | 'day'; title: string; gender: string; address: string;
}

interface FullOPDRecord {
    id: number;
    uhid: string;
    created_at: string;
    treating_doctor_id: number;
    referring_doctor_name: string;
    visit_category: 'First Visit' | 'Follow Up';
    total_fees: number;
    discount_amount: number;
    amount_paid: number;
    payment_entries: PaymentEntry[];
    bp: string | null;
    pulse: number | null;
    weight: number | null;
    spo2: string | null;
    sugar: string | null;
    patient_detail: PatientDetails | null;
}

/**
 * Helper to send WhatsApp notification for payment updates
 */
const sendPaymentWhatsAppNotification = async (
    contactNumber: string,
    patientName: string,
    regId: number,
    financials: { total: number; paidNow: number; totalPaid: number; balance: number }
) => {
    const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || ""
    if (!apiKey) return

    const messageText = `Dear *${patientName}*,\n\nWe have received a payment of *₹${financials.paidNow.toFixed(2)}* for your OPD Registration (ID: ${regId}).\n\n*Updated Payment Summary:*\n💰 Total Bill: ₹${financials.total.toFixed(2)}\n✅ Total Paid: ₹${financials.totalPaid.toFixed(2)}\n⚠️ Remaining Balance: ₹${financials.balance.toFixed(2)}\n\nThank you for choosing Cigma Clinic!`

    try {
        await fetch("https://evo.infispark.in/message/sendText/cigmadiagnostic", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": apiKey
            },
            body: JSON.stringify({
                number: `91${contactNumber}`,
                text: messageText
            }),
        });
        console.log(`✅ WhatsApp payment update sent to ${contactNumber}`);
    } catch (error) {
        console.error("❌ WhatsApp Error:", error);
    }
}

// 🟢 EXPANDED FORM FIELDS to include editable patient details
interface EditFormFields {
    // Patient Details
    title: string;
    name: string;
    number: string; // Keep as string for RHF input
    age: number;
    dayType: 'year' | 'month' | 'day';
    gender: string;
    address: string;

    // Registration/Service Details
    treatingDoctorId: number;
    referringDoctorName: string;
    visitCategory: 'First Visit' | 'Follow Up';
    bp: string;
    pulse: number | null;
    weight: number | null;
    spo2: string;
    sugar: string;
    discountAmount: number;
    sendWhatsApp: boolean;
    paymentEntries: PaymentEntry[];
}

interface OPDRecordEditModalProps {
    opdId: number;
    doctorList: DoctorFee[];
    onClose: (shouldRefresh: boolean) => void;
}

// Helper to convert ISO date string back to Date
const getDateFromISO = (isoString: string) => {
    try {
        return new Date(isoString.split('T')[0]);
    } catch {
        return new Date();
    }
};

// Helper to calculate total paid from payment entries
const calculateTotalPaid = (payments: PaymentEntry[]): number => {
    return payments.reduce((s, p) => s + (p.amount || 0), 0);
};

// --- Component ---
const OPDRecordEditModal: React.FC<OPDRecordEditModalProps> = ({ opdId, doctorList, onClose }) => {
    const [record, setRecord] = useState<FullOPDRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [totalFees, setTotalFees] = useState(0);

    const defaultValues: EditFormFields = useMemo(() => ({
        // Patient Details defaults
        title: record?.patient_detail?.title || '',
        name: record?.patient_detail?.name || '',
        number: String(record?.patient_detail?.number || ''),
        age: record?.patient_detail?.age || 0,
        dayType: (record?.patient_detail?.age_unit as 'year' | 'month' | 'day') || 'year',
        gender: record?.patient_detail?.gender || '',
        address: record?.patient_detail?.address || '',

        // Registration/Service Details defaults
        treatingDoctorId: record?.treating_doctor_id || doctorList[0]?.id || 0,
        referringDoctorName: record?.referring_doctor_name || '',
        visitCategory: record?.visit_category || 'First Visit',
        bp: record?.bp || '',
        pulse: record?.pulse || null,
        weight: record?.weight || null,
        spo2: record?.spo2 || '',
        sugar: record?.sugar || '',
        discountAmount: record?.discount_amount || 0,
        paymentEntries: record?.payment_entries || [],
        sendWhatsApp: true,
    }), [record, doctorList]);

    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<EditFormFields>({
        defaultValues,
        values: defaultValues,
    });

    const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control, name: "paymentEntries" });

    // Watch fields for dynamic calculation
    const watchedFields = watch();
    const watchedDiscount = watchedFields.discountAmount || 0;
    const watchedPayments = watchedFields.paymentEntries || [];

    const treatingDoctor = useMemo(() =>
        doctorList.find(d => d.id === watchedFields.treatingDoctorId),
        [doctorList, watchedFields.treatingDoctorId]
    );

    // Recalculate Total Fees based on watched Doctor/Visit Category
    useEffect(() => {
        if (treatingDoctor) {
            const fees = watchedFields.visitCategory === 'Follow Up'
                ? treatingDoctor.follow_up_fee || 0
                : treatingDoctor.first_visit_fee || 0;
            setTotalFees(fees);
        } else {
            setTotalFees(0);
        }
    }, [treatingDoctor, watchedFields.visitCategory]);


    // --- Data Fetching (Initial Load) ---
    useEffect(() => {
        const fetchRecord = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('opd_registration')
                    .select(`
                        *,
                        patient_detail (name, number, age, age_unit, title, gender, address) 
                    `)
                    .eq('id', opdId)
                    .single();

                if (error) throw error;

                if (data && data.payment_entries === null) {
                    data.payment_entries = [];
                }

                setRecord(data as FullOPDRecord);
            } catch (err: any) {
                console.error("Error fetching record:", err);
                alert(`Error fetching OPD record: ${err.message}`);
                onClose(false);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRecord();
    }, [opdId, onClose]);

    // --- Handlers ---

    const handleAddPaymentEntry = () => {
        appendPayment({ amount: 0, paymentMode: "cash", time: new Date().toISOString() });
    }

    const handleUpdate = handleSubmit(async (data) => {
        if (!record || !record.uhid) return;

        setIsUpdating(true);
        try {
            // --- 1. Update Patient Detail ---
            const patientPayload = {
                title: data.title,
                name: data.name.toUpperCase(),
                number: Number(data.number),
                age: data.age,
                age_unit: data.dayType,
                gender: data.gender,
                address: data.address,
                // Calculate DOB and total days again
                dob: calculateDOB(data.age, data.dayType),
                total_day: data.age * (data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1),
                // REMOVED updated_at
            };

            const { error: patientErr } = await supabase
                .from('patient_detail')
                .update(patientPayload)
                .eq('uhid', record.uhid);

            if (patientErr) throw patientErr;

            // --- 2. Update OPD Registration Detail ---
            const finalPayments = data.paymentEntries.filter(p => p.amount > 0);
            const finalTotalPaid = calculateTotalPaid(finalPayments);

            const registrationPayload = {
                treating_doctor_id: data.treatingDoctorId,
                referring_doctor_name: data.referringDoctorName,
                visit_category: data.visitCategory,
                bp: data.bp || null,
                pulse: data.pulse || null,
                weight: data.weight || null,
                spo2: data.spo2 || null, // Added SpO2
                sugar: data.sugar || null,
                discount_amount: data.discountAmount,
                total_fees: totalFees,
                amount_paid: finalTotalPaid,
                payment_entries: finalPayments,
                // REMOVED updated_at
            };

            const { error: opdErr } = await supabase
                .from('opd_registration')
                .update(registrationPayload)
                .eq('id', opdId);

            if (opdErr) throw opdErr;

            // --- 3. Send WhatsApp Notification for New Payment ---
            const amountReceivedNow = finalTotalPaid - (record.amount_paid || 0);
            if (data.sendWhatsApp && amountReceivedNow > 0 && data.number) {
                const netTotal = totalFees - data.discountAmount;
                const balance = netTotal - finalTotalPaid;
                await sendPaymentWhatsAppNotification(
                    String(data.number),
                    data.name,
                    opdId,
                    {
                        total: totalFees,
                        paidNow: amountReceivedNow,
                        totalPaid: finalTotalPaid,
                        balance: balance
                    }
                );
            }

            alert("Patient and OPD Record updated successfully! ✅");
            onClose(true); // Refresh dashboard after successful update
        } catch (err: any) {
            console.error("Error updating record:", err);
            alert(`Failed to update records: ${err.message}`);
        } finally {
            setIsUpdating(false);
        }
    });

    const handleDownloadBill = async () => {
        if (!record || !record.patient_detail) {
            alert("Cannot generate bill: Missing patient data.");
            return;
        }

        const patientData = record.patient_detail;
        const doctorName = treatingDoctor?.doctor_name || record.referring_doctor_name;

        // Use the currently watched values for the bill (to reflect unsaved changes)
        const currentDiscount = watchedDiscount;
        const currentTotalFees = totalFees;
        const currentPayments = watchedPayments.filter(p => p.amount > 0);

        const serviceItems: BillServiceItem[] = [{
            type: 'OPD',
            name: `${doctorName} Consultation (${watchedFields.visitCategory})`,
            charges: currentTotalFees,
            doctor: doctorName,
            details: watchedFields.visitCategory // Show only Visit Type (First Visit/Follow Up)
        }];

        const regDate = getDateFromISO(record.created_at);
        const regTime = new Date(record.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const billData: UniversalBillData = {
            patientInfo: {
                uhid: record.uhid,
                // Use watched fields for the bill patient info (if user changed them)
                name: watchedFields.name,
                contact: watchedFields.number,
                age: watchedFields.age,
                dayType: watchedFields.dayType as any,
                title: watchedFields.title,
                address: watchedFields.address,
                gender: watchedFields.gender,
            },
            registrationId: record.id,
            date: regDate,
            time: regTime,
            referredBy: watchedFields.referringDoctorName || doctorName,
            discount: currentDiscount,
            services: serviceItems,
            paymentEntries: currentPayments.map(p => ({
                amount: p.amount,
                paymentMode: p.paymentMode.toLowerCase() as 'online' | 'cash' | 'card',
                time: p.time
            })),
            vitals: {
                bp: watchedFields.bp,
                pulse: String(watchedFields.pulse || ""),
                weight: String(watchedFields.weight || ""),
                spo2: watchedFields.spo2,
                sugar: watchedFields.sugar,
            },
            sendWhatsApp: false
        };

        try {
            await openUniversalBillInNewTabProgrammatically(billData, doctorList.map(d => ({ id: d.id, doctor_name: d.doctor_name } as DoctorLite)));
        } catch (e) {
            alert("Failed to open bill generator. Is the required universal-bill-generator component linked/available?");
            console.error(e);
        }
    };

    const totalPaid = calculateTotalPaid(watchedPayments);
    const remainingAmount = totalFees - watchedDiscount - totalPaid;

    if (isLoading) {
        return (
            <Dialog open={true} onOpenChange={() => onClose(false)}>
                <DialogContent className="w-[90vw] max-w-[420px] p-6 flex flex-col items-center justify-center text-center rounded-2xl shadow-xl">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-3" />
                    <span className="text-sm font-semibold text-slate-700">Loading OPD record details...</span>
                </DialogContent>
            </Dialog>
        );
    }

    if (!record) {
        return (
            <Dialog open={true} onOpenChange={() => onClose(false)}>
                <DialogContent className="w-[90vw] max-w-[420px] p-6 text-center rounded-2xl shadow-xl">
                    <div className="text-rose-500 font-semibold mb-3">Record not found.</div>
                    <Button onClick={() => onClose(false)} className="w-full bg-slate-800 hover:bg-slate-900 text-white">Close</Button>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={true} onOpenChange={() => onClose(false)}>
            <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[1100px] h-[92vh] sm:h-auto max-h-[92vh] sm:max-h-[88vh] p-0 flex flex-col gap-0 overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xl bg-slate-50/50">
                {/* Fixed / Sticky Header */}
                <DialogHeader className="p-3.5 sm:p-5 border-b border-slate-100 bg-white sticky top-0 z-20 flex flex-row items-center justify-between pr-12 shrink-0 space-y-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                            <FilePenLine className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 text-left">
                            <DialogTitle className="text-sm sm:text-base md:text-lg font-bold text-slate-800 truncate">
                                Edit OPD Registration #{opdId}
                            </DialogTitle>
                            <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                                UHID: <span className="font-semibold text-slate-700">{record.uhid}</span>
                                {record.patient_detail?.name ? ` • ${record.patient_detail.name}` : ''}
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={handleUpdate} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    {/* Scrollable Container with Smooth Touch Scrolling */}
                    <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4 touch-pan-y">
                        {/* Section 1: Top 3 Cards (Patient Info, Consultation Details, Vitals) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                            {/* 1. Patient Details Card */}
                            <div className="p-3.5 sm:p-4 bg-white rounded-xl border border-blue-100 shadow-xs ring-1 ring-blue-500/10">
                                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-blue-100/80">
                                    <h3 className="text-xs sm:text-sm font-bold text-blue-900 flex items-center">
                                        <UserCircle className="h-4 w-4 mr-1.5 text-blue-600 shrink-0" />
                                        Patient Information
                                    </h3>
                                    <span className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                                        UHID: {record.uhid}
                                    </span>
                                </div>
                                <div className="space-y-2.5">
                                    {/* Title + Name */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="col-span-1">
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Title</Label>
                                            <Select value={watchedFields.title} onValueChange={(v) => setValue("title", v)}>
                                                <SelectTrigger className="h-8 text-xs bg-slate-50/50">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[300]">
                                                    {[".", "MR", "MRS", "MAST", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map((t) => (
                                                        <SelectItem key={t} value={t}>{t === "." ? "NoTitle" : t}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Full Name *</Label>
                                            <Input
                                                {...register("name", { required: true })}
                                                className="h-8 text-xs bg-slate-50/50"
                                                placeholder="Patient Name"
                                            />
                                        </div>
                                    </div>

                                    {/* Contact + Gender */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center">
                                                <Phone className="h-2.5 w-2.5 mr-1 text-slate-400" /> Contact *
                                            </Label>
                                            <Input
                                                {...register("number", { required: true, pattern: { value: /^[0-9]{10}$/, message: "10 digits" } })}
                                                className="h-8 text-xs bg-slate-50/50"
                                                placeholder="10-digit number"
                                                type="tel"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Gender</Label>
                                            <Select value={watchedFields.gender} onValueChange={(v) => setValue("gender", v)}>
                                                <SelectTrigger className="h-8 text-xs bg-slate-50/50">
                                                    <SelectValue placeholder="Gender" />
                                                </SelectTrigger>
                                                <SelectContent className="z-[300]">
                                                    <SelectItem value="male">Male</SelectItem>
                                                    <SelectItem value="female">Female</SelectItem>
                                                    <SelectItem value="other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Age + Unit */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="col-span-2">
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Age *</Label>
                                            <Input
                                                type="number"
                                                {...register("age", { required: true, valueAsNumber: true })}
                                                className="h-8 text-xs bg-slate-50/50"
                                                placeholder="Age"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Unit</Label>
                                            <Select value={watchedFields.dayType} onValueChange={(v) => setValue("dayType", v as any)}>
                                                <SelectTrigger className="h-8 text-xs bg-slate-50/50">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[300]">
                                                    <SelectItem value="year">Yr</SelectItem>
                                                    <SelectItem value="month">Mon</SelectItem>
                                                    <SelectItem value="day">Day</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Address */}
                                    <div>
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Address</Label>
                                        <Input
                                            {...register("address")}
                                            className="h-8 text-xs bg-slate-50/50"
                                            placeholder="Address / Location"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 2. Consultation Details Card */}
                            <div className="p-3.5 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-xs ring-1 ring-slate-100">
                                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center">
                                        <Stethoscope className="h-4 w-4 mr-1.5 text-indigo-600 shrink-0" />
                                        Consultation Details
                                    </h3>
                                </div>
                                <div className="space-y-2.5">
                                    <div>
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Treating Doctor *</Label>
                                        <Select
                                            value={String(watchedFields.treatingDoctorId)}
                                            onValueChange={(v) => setValue("treatingDoctorId", Number(v))}
                                        >
                                            <SelectTrigger className="h-8 text-xs bg-slate-50/50 w-full">
                                                <SelectValue placeholder="Select Treating Doctor" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-60 overflow-y-auto z-[300]">
                                                {doctorList.map((d) => (
                                                    <SelectItem key={d.id} value={String(d.id)}>{d.doctor_name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Visit Type *</Label>
                                            <Select
                                                value={watchedFields.visitCategory}
                                                onValueChange={(v) => setValue("visitCategory", v as any)}
                                            >
                                                <SelectTrigger className="h-8 text-xs bg-slate-50/50">
                                                    <SelectValue placeholder="Visit Type" />
                                                </SelectTrigger>
                                                <SelectContent className="z-[300]">
                                                    <SelectItem value="First Visit">First Visit</SelectItem>
                                                    <SelectItem value="Follow Up">Follow Up</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Calculated Fee</Label>
                                            <div className="h-8 px-2.5 rounded-md border border-indigo-200 bg-indigo-50/80 text-indigo-800 font-bold text-xs flex items-center">
                                                ₹{totalFees.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Referring Doctor</Label>
                                        <Input
                                            {...register("referringDoctorName")}
                                            className="h-8 text-xs bg-slate-50/50"
                                            placeholder="External/Internal Referral"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 3. Vitals Card */}
                            <div className="p-3.5 sm:p-4 bg-white rounded-xl border border-amber-100 shadow-xs ring-1 ring-amber-500/10 md:col-span-2 lg:col-span-1">
                                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-amber-100/80">
                                    <h3 className="text-xs sm:text-sm font-bold text-amber-900 flex items-center">
                                        <Activity className="h-4 w-4 mr-1.5 text-amber-600 shrink-0" />
                                        Vitals
                                    </h3>
                                    <span className="text-[10px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">Optional</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center">
                                            <Heart className="h-2.5 w-2.5 mr-1 text-rose-500" /> BP
                                        </Label>
                                        <Input {...register("bp")} className="h-8 text-xs bg-slate-50/50" placeholder="120/80" />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center">
                                            <Stethoscope className="h-2.5 w-2.5 mr-1 text-indigo-500" /> Pulse (BPM)
                                        </Label>
                                        <Input
                                            type="number"
                                            inputMode="numeric"
                                            {...register("pulse", { valueAsNumber: true })}
                                            className="h-8 text-xs bg-slate-50/50"
                                            placeholder="72"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center">
                                            <Activity className="h-2.5 w-2.5 mr-1 text-teal-500" /> SpO2 (%)
                                        </Label>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            {...register("spo2")}
                                            className="h-8 text-xs bg-slate-50/50"
                                            placeholder="98"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center">
                                            <Activity className="h-2.5 w-2.5 mr-1 text-amber-500" /> Sugar (mg/dL)
                                        </Label>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            {...register("sugar")}
                                            className="h-8 text-xs bg-slate-50/50"
                                            placeholder="110"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <Label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center">
                                            <Scale className="h-2.5 w-2.5 mr-1 text-purple-500" /> Weight (Kg)
                                        </Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            inputMode="decimal"
                                            {...register("weight", { valueAsNumber: true })}
                                            className="h-8 text-xs bg-slate-50/50"
                                            placeholder="65.5"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Payments and Financial Summary */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
                            {/* 4. Payment Details Card */}
                            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
                                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center">
                                        <CreditCard className="h-4 w-4 mr-1.5 text-emerald-600 shrink-0" />
                                        Payment Entries
                                    </h3>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleAddPaymentEntry}
                                        className="h-7 text-xs px-2.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium"
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> Add Payment
                                    </Button>
                                </div>

                                <div className="mb-3">
                                    <Label className="text-[11px] font-medium text-slate-600 mb-1 block">Discount (₹)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        {...register("discountAmount", { valueAsNumber: true })}
                                        placeholder="0"
                                        className="h-8 text-xs bg-slate-50/50"
                                    />
                                </div>

                                <div className="max-h-48 overflow-y-auto space-y-2 pr-0.5">
                                    {paymentFields.length === 0 ? (
                                        <div className="text-center py-5 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs">
                                            No payment entries yet. Click &quot;+ Add Payment&quot; to record a payment.
                                        </div>
                                    ) : (
                                        paymentFields.map((field, idx) => (
                                            <div key={field.id} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/60 shadow-xs">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[11px] font-bold text-slate-700">Payment #{idx + 1}</span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-5 w-5 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                        onClick={() => removePayment(idx)}
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-slate-500 font-medium mb-0.5 block">Amount (₹)</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            {...register(`paymentEntries.${idx}.amount`, { valueAsNumber: true })}
                                                            className="h-7 text-xs bg-white"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] text-slate-500 font-medium mb-0.5 block">Mode</Label>
                                                        <Select
                                                            value={watchedFields.paymentEntries[idx]?.paymentMode}
                                                            onValueChange={(v) => setValue(`paymentEntries.${idx}.paymentMode` as any, v as any)}
                                                        >
                                                            <SelectTrigger className="h-7 text-xs bg-white">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="z-[300]">
                                                                <SelectItem value="online">Online</SelectItem>
                                                                <SelectItem value="cash">Cash</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* 5. Summary Card */}
                            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                                        <h3 className="text-xs sm:text-sm font-bold text-slate-800">Financial Summary</h3>
                                        <span className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full ${remainingAmount <= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                                            {remainingAmount <= 0 ? "Fully Paid" : "Payment Pending"}
                                        </span>
                                    </div>

                                    <div className="space-y-2 text-xs sm:text-sm bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span>Calculated Fee:</span>
                                            <span className="font-semibold text-slate-900">₹{totalFees.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span>Discount:</span>
                                            <span className="font-semibold text-amber-600">-₹{watchedDiscount.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span>Total Paid:</span>
                                            <span className="font-semibold text-emerald-600">₹{totalPaid.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-slate-200 pt-2 font-bold text-xs sm:text-sm">
                                            <span className="text-slate-800">Remaining Amount:</span>
                                            <span className={remainingAmount < 0 ? "text-rose-600" : remainingAmount > 0 ? "text-amber-600" : "text-emerald-600"}>
                                                ₹{remainingAmount.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2.5 py-3 mt-3 border-t border-slate-100">
                                        <Checkbox
                                            id="edit-send-whatsapp"
                                            checked={watchedFields.sendWhatsApp}
                                            onCheckedChange={(checked) => setValue("sendWhatsApp", !!checked)}
                                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                        />
                                        <Label htmlFor="edit-send-whatsapp" className="text-xs sm:text-sm font-medium cursor-pointer flex items-center gap-1.5 text-slate-700">
                                            <span className="text-emerald-600">📱</span>
                                            Send WhatsApp Payment Notification
                                        </Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Fixed / Sticky Footer with Touch-Friendly Action Buttons */}
                    <div className="border-t border-slate-200 bg-white p-3 sm:p-4 px-4 sm:px-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center justify-between sm:justify-start gap-4">
                            <div className="text-xs sm:text-sm text-slate-600">
                                Remaining Due:{" "}
                                <span
                                    className={`font-bold ${
                                        remainingAmount > 0
                                            ? "text-amber-600"
                                            : remainingAmount < 0
                                            ? "text-rose-600"
                                            : "text-emerald-600"
                                    }`}
                                >
                                    ₹{remainingAmount.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleDownloadBill}
                                className="flex-1 sm:flex-initial h-9 sm:h-10 px-4 text-xs sm:text-sm font-medium border-slate-200 hover:bg-slate-50 text-slate-700 shadow-xs"
                            >
                                <FileText className="h-4 w-4 mr-1.5 text-slate-500" />
                                Download Bill
                            </Button>
                            <Button
                                type="submit"
                                disabled={isUpdating}
                                className="flex-1 sm:flex-initial h-9 sm:h-10 px-5 text-xs sm:text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                            >
                                {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default OPDRecordEditModal;