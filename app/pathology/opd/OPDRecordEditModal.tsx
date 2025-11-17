// @/app/opd/opd-dashboard/OPDRecordEditModal.tsx

"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, X, FileText, Save, Plus, Heart, Scale, Stethoscope, FilePenLine, UserCircle, Phone } from 'lucide-react'; 
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
    patient_detail: PatientDetails | null;
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
    discountAmount: number;
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
        discountAmount: record?.discount_amount || 0,
        paymentEntries: record?.payment_entries || [],
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
            details: watchedFields.referringDoctorName ? `Ref: ${watchedFields.referringDoctorName}` : 'Self'
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
            <Dialog open={true}>
                <DialogContent className="sm:max-w-[800px] flex items-center justify-center py-10">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin text-blue-600" /> <span className="text-lg text-gray-700">Loading record data...</span>
                </DialogContent>
            </Dialog>
        );
    }

    if (!record) {
        return (
             <Dialog open={true}>
                <DialogContent className="sm:max-w-[800px]"><div className="text-red-500">Record not found.</div><Button onClick={() => onClose(false)}>Close</Button></DialogContent>
            </Dialog>
        );
    }


    return (
        <Dialog open={true} onOpenChange={() => onClose(false)}>
            <DialogContent className="sm:max-w-[1100px]"> {/* Expanded width for more details */}
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span className="flex items-center"><FilePenLine className="mr-2 h-6 w-6 text-blue-600" /> Edit OPD Registration: {opdId}</span>
                        <Button variant="ghost" size="sm" onClick={() => onClose(false)}><X className="h-5 w-5" /></Button>
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleUpdate}>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        {/* 1. Patient Details Card */}
                        <div className="col-span-1 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <h3 className="text-md font-bold text-blue-800 mb-3 flex items-center"><UserCircle className="h-4 w-4 mr-2" /> Patient Information (UHID: {record.uhid})</h3>
                            <div className="space-y-2">
                                {/* Title */}
                                <div><Label className="text-xs">Title</Label>
                                    <Select value={watchedFields.title} onValueChange={(v) => setValue("title", v)}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>{[".", "MR", "MRS", "MAST", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map((t) => (<SelectItem key={t} value={t}>{t === "." ? "NoTitle" : t}</SelectItem>))}</SelectContent></Select></div>
                                
                                {/* Name */}
                                <div><Label className="text-xs">Full Name</Label>
                                    <Input {...register("name", { required: true })} className="h-8" placeholder="Name" /></div>
                                
                                {/* Contact */}
                                <div><Label className="text-xs flex items-center"><Phone className="h-3 w-3 mr-1"/> Contact Number</Label>
                                    <Input {...register("number", { required: true, pattern: { value: /^[0-9]{10}$/, message: "10 digits" } })} className="h-8" placeholder="10-digit mobile" /></div>
                                
                                {/* Age & Unit */}
                                <div className='grid grid-cols-3 gap-2'>
                                    <div className='col-span-2'><Label className="text-xs">Age</Label>
                                        <Input type="number" {...register("age", { required: true, valueAsNumber: true })} className="h-8" placeholder="Age" /></div>
                                    <div><Label className="text-xs">Unit</Label>
                                        <Select value={watchedFields.dayType} onValueChange={(v) => setValue("dayType", v as any)}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                            <SelectContent> <SelectItem value="year">Yr</SelectItem> <SelectItem value="month">Mon</SelectItem> <SelectItem value="day">Day</SelectItem> </SelectContent></Select></div>
                                </div>

                                {/* Gender */}
                                <div><Label className="text-xs">Gender</Label>
                                    <Select value={watchedFields.gender} onValueChange={(v) => setValue("gender", v)}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
                                
                                {/* Address */}
                                <div><Label className="text-xs">Address</Label>
                                    <Input {...register("address")} className="h-8" placeholder="Address" /></div>
                            </div>
                        </div>


                        {/* 2. Consultation & Vitals Section */}
                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <h3 className="text-md font-bold text-gray-700 mb-3">Consultation Details</h3>
                                <div className="space-y-3">
                                    {/* Treating Doctor */}
                                    <div>
                                        <Label className="text-sm">Treating Doctor *</Label>
                                        <Select 
                                            value={String(watchedFields.treatingDoctorId)} 
                                            onValueChange={(v) => setValue("treatingDoctorId", Number(v))}
                                        >
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Select Treating Doctor" /></SelectTrigger>
                                            <SelectContent className="max-h-60 overflow-y-auto">
                                                {doctorList.map((d) => (
                                                    <SelectItem key={d.id} value={String(d.id)}>{d.doctor_name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {/* Visit Category */}
                                    <div>
                                        <Label className="text-sm">Visit Type *</Label>
                                        <Select 
                                            value={watchedFields.visitCategory} 
                                            onValueChange={(v) => setValue("visitCategory", v as any)}
                                        >
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Select Visit Type" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="First Visit">First Visit</SelectItem>
                                                <SelectItem value="Follow Up">Follow Up</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {/* Referring Doctor */}
                                    <div>
                                        <Label className="text-sm">Referring Doctor</Label>
                                        <Input 
                                            {...register("referringDoctorName")} 
                                            className="h-9" 
                                            placeholder="External/Internal Referral" 
                                        />
                                    </div>
                                    
                                    {/* Calculated Fee Display */}
                                    <div>
                                        <Label className="text-sm">Calculated Fee</Label>
                                        <Input type="text" value={`₹${totalFees.toFixed(2)}`} readOnly className="h-9 font-bold bg-blue-100 cursor-not-allowed" />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <h3 className="text-md font-bold text-gray-700 mb-3">Vitals</h3>
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-sm flex items-center"><Heart className="h-3 w-3 mr-1"/> BP (Systolic/Diastolic)</Label>
                                        <Input {...register("bp")} className="h-9" placeholder="e.g., 120/80"/>
                                    </div>
                                    <div>
                                        <Label className="text-sm flex items-center"><Stethoscope className="h-3 w-3 mr-1"/> Pulse (BPM)</Label>
                                        <Input type="number" {...register("pulse", { valueAsNumber: true })} className="h-9" placeholder="e.g., 72" />
                                    </div>
                                    <div>
                                        <Label className="text-sm flex items-center"><Scale className="h-3 w-3 mr-1"/> Weight (Kg)</Label>
                                        <Input type="number" step="0.1" {...register("weight", { valueAsNumber: true })} className="h-9" placeholder="e.g., 65.5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* --- 3. Payments and Summary Section --- */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Payment Details */}
                        <div className="bg-white p-3 rounded-lg border">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-semibold text-gray-700">Payment Entries</h3>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddPaymentEntry}><Plus className="h-4 w-4 mr-1" /> Add Payment</Button>
                            </div>
                            
                            <div className="mb-3">
                                <Label className="text-sm">Discount (₹)</Label>
                                <Input 
                                    type="number" 
                                    step="0.01" 
                                    {...register("discountAmount", { valueAsNumber: true })} 
                                    placeholder="0" 
                                    className="h-9" 
                                />
                            </div>
                            
                            <div className="max-h-40 overflow-y-auto space-y-2">
                                {paymentFields.map((field, idx) => (
                                    <div key={field.id} className="border rounded-lg p-2 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium">Payment {idx + 1}</span>
                                            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePayment(idx)}> 
                                                <X className="h-3 w-3 text-red-500" /> 
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div> 
                                                <Label className="text-xs">Amount (₹)</Label> 
                                                <Input type="number" step="0.01" {...register(`paymentEntries.${idx}.amount`, { valueAsNumber: true })} className="h-8" placeholder="Amount" /> 
                                            </div>
                                            <div> 
                                                <Label className="xs">Mode</Label>
                                                <Select value={watchedFields.paymentEntries[idx]?.paymentMode} onValueChange={(v) => setValue(`paymentEntries.${idx}.paymentMode`, v as any)}>
                                                    <SelectTrigger className="h-8"> <SelectValue /> </SelectTrigger>
                                                    <SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="bg-white p-3 rounded-lg border flex flex-col justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700 mb-3">Summary</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between"><span>Calculated Fee:</span><span className="font-medium">₹{totalFees.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span>Discount:</span><span className="font-medium">₹{watchedDiscount.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span>Total Paid:</span><span className="font-medium">₹{totalPaid.toFixed(2)}</span></div>
                                    <div className="flex justify-between border-t pt-2">
                                        <span className="font-semibold">Remaining Amount:</span>
                                        <span className={`font-semibold ${remainingAmount < 0 ? "text-red-600" : remainingAmount > 0 ? "text-orange-600" : "text-green-600"}`}>
                                            ₹{remainingAmount.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-2 mt-4">
                                <Button type="button" variant="outline" onClick={handleDownloadBill}><FileText className="h-4 w-4 mr-2" /> Download Bill</Button>
                                <Button type="submit" disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700">
                                    {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} 
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default OPDRecordEditModal;