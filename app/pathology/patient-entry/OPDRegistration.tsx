
import React, { useMemo } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, X, User, Heart, Scale, Stethoscope, Activity } from "lucide-react"
import { format } from "date-fns"
import { Checkbox } from "@/components/ui/checkbox"

// --- Supabase and Config Imports ---
// 🚨 IMPORTANT: Ensure this path is correct for your Supabase client setup
import { supabase } from "@/lib/supabase"

// Import types from universal-bill-generator
import { openUniversalBillInNewTabProgrammatically, type UniversalBillData, type BillServiceItem, type DoctorLite } from "./universal-bill-generator"

// --- Component Types & Constants ---

const TABLE = {
    OPD_REGISTRATION: "opd_registration",
} as const;

interface DoctorFee extends DoctorLite {
    first_visit_fee: number;
    follow_up_fee: number;
}

interface OPDData {
    treatingDoctorId: number | null;
    referringDoctorName: string;
    visitCategory: 'First Visit' | 'Follow Up';
    bp: string;
    pulse: number | null;
    weight: number | null;
    spo2: string;
    sugar: string;
    discountAmount: number;
    paymentEntries: any[];
}

interface CommonRegDetails {
    hospitalName: string; visitType: any; doctorName: string; tpa: any;
    registrationDate: string; registrationTime: string; sendWhatsApp: any;
    sourceOpdId: number | null; sourceIpdId: number | null;
}
interface PatientData {
    uhid: string; name: string; contact: string; age: number;
    dayType: "year" | "month" | "day"; title: string; address?: string; gender: string;
}

interface OPDRegFormFields extends CommonRegDetails, OPDData { }

interface OPDProps {
    patientData: PatientData;
    isExistingPatient: boolean;
    doctorList: DoctorFee[];
    opdData: OPDData;
    setOpdData: (data: OPDData) => void;
    commonRegDetails: CommonRegDetails;
    setCommonRegDetails: (key: keyof CommonRegDetails, value: any) => void;
    onSuccess: () => void;
}

// --- Helper Functions (DB interaction) ---
function throwIfError(error: any) { if (error) throw error; }
const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
    // Simplified retry logic, returns the function execution result
    return fn()
}

// 🟢 REAL SUPABASE INSERTION FUNCTION
const insertOPDRegistration = async (data: any): Promise<number> => {
    // We use withRetry helper for robustness
    const { data: newP, error: insertErr } = await withRetry(async () =>
        supabase
            .from(TABLE.OPD_REGISTRATION)
            .insert(data)
            .select("id") // Select the primary key (id) back
            .single()
    );

    if (insertErr) {
        console.error("Supabase Error during OPD insert:", insertErr);
        throw new Error(insertErr.message || "Failed to save OPD registration to database.");
    }

    const registrationId = newP?.id;
    if (!registrationId) {
        throw new Error("Database failed to return the new registration ID.");
    }
    return registrationId;
};


// 🟢 Helper to safely create ISO time, defaulting to current time if input is invalid
function safeTime12ToISO(dateString: string, time12String: string): string {
    try {
        const [time, mer] = time12String.split(" ");
        let [hh, mm] = time.split(":").map(Number);
        if (mer === "PM" && hh < 12) hh += 12;
        if (mer === "AM" && hh === 12) hh = 0;

        if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
            console.warn("Invalid time input, falling back to current time.");
            return new Date().toISOString();
        }

        const isoDate = new Date(`${dateString}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).toISOString();
        if (isoDate === "Invalid Date") throw new Error("Invalid Date/Time combination");
        return isoDate;
    } catch (e) {
        console.error("Error creating ISO time, falling back:", e);
        return new Date().toISOString();
    }
}



// 🟢 UPDATED: WhatsApp Sender Function
const sendWhatsAppNotification = async (
    contactNumber: string,
    patientName: string,
    regId: number,
    estTimeDuration: string,
    testNames: string,
    financials: { total: number, paid: number, balance: number }
): Promise<void> => {
    const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || "";

    if (!apiKey) {
        console.warn("⚠️ WhatsApp API Key missing. Notification skipped.");
        return;
    }

    const messageText = `Dear *${patientName}*,\n\nThank you for visiting Cigma Clinic.\n\n*OPD Registration Confirmed*\n🆔 Reg ID: *${regId}*\n👨‍⚕️ Service: ${testNames}\n\n*Payment Summary:*\n💰 Total: ₹${financials.total.toFixed(2)}\n✅ Paid: ₹${financials.paid.toFixed(2)}\n⚠️ Balance: ₹${financials.balance.toFixed(2)}\n\nThank you!`;

    try {
        const response = await fetch("https://evo.infispark.in/message/sendText/cigmadiagnostic", {
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

        if (!response.ok) {
            const errData = await response.json();
            console.error("❌ WhatsApp API Error:", errData);
        } else {
            console.log(`✅ WhatsApp sent to ${contactNumber}`);
        }
    } catch (error) {
        console.error("❌ WhatsApp Network Error:", error);
    }
};


const OPDRegistration: React.FC<OPDProps> = ({
    patientData, isExistingPatient, doctorList,
    opdData, setOpdData,
    commonRegDetails, setCommonRegDetails,
    onSuccess,
}) => {

    const defaultRHFValues: OPDRegFormFields = useMemo(() => ({
        ...commonRegDetails,
        ...opdData,
    }), [commonRegDetails, opdData]);

    const {
        control, watch, setValue, getValues, handleSubmit, reset,
        formState: { isSubmitting, errors },
    } = useForm<OPDRegFormFields>({ defaultValues: defaultRHFValues });

    const watchFields = watch();
    const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control, name: "paymentEntries" as "paymentEntries" });

    // Save form state to parent ONLY when the component unmounts (e.g. tab switch)
    // This avoids rendering feedback loops on every single keystroke.
    const getValuesRef = React.useRef(getValues);
    getValuesRef.current = getValues;

    React.useEffect(() => {
        return () => {
            const currentValues = getValuesRef.current();
            const { treatingDoctorId, referringDoctorName, visitCategory, bp, pulse, weight, spo2, sugar, discountAmount, paymentEntries, ...regDetails } = currentValues;
            
            // Sync OPD specific details
            setOpdData({ treatingDoctorId, referringDoctorName, visitCategory, bp, pulse, weight, spo2, sugar, discountAmount, paymentEntries });

            // Sync DoctorName to parent (doctorName refers to the treating doctor's name in OPD context)
            const doctor = doctorList.find(d => String(d.id) === String(treatingDoctorId));
            setCommonRegDetails("doctorName", doctor?.doctor_name || "");

            // Sync other common registration details
            (Object.keys(regDetails) as Array<keyof CommonRegDetails>).forEach((key) => {
                setCommonRegDetails(key, regDetails[key]);
            });
        };
    }, [setOpdData, setCommonRegDetails, doctorList]);

    const watchTreatingDoctorId = watch("treatingDoctorId");
    const watchVisitCategory = watch("visitCategory");
    const watchVisitType = watch("visitType");
    const discountAmount = watch("discountAmount") || 0;
    const paymentEntries = watch("paymentEntries") || [];

    // --- Pricing Logic ---
    const treatingDoctor = useMemo(() =>
        doctorList.find(d => String(d.id) === String(watchTreatingDoctorId)),
        [doctorList, watchTreatingDoctorId]
    );

    const totalFees = useMemo(() => {
        if (!treatingDoctor) return 0;
        return watchVisitCategory === 'Follow Up'
            ? treatingDoctor.follow_up_fee || 0
            : treatingDoctor.first_visit_fee || 0;
    }, [treatingDoctor, watchVisitCategory]);

    const totalPaid = paymentEntries.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const remainingAmount = totalFees - discountAmount - totalPaid;

    const addPaymentEntry = () => {
        // Set default amount to null/undefined so the input box is visually empty
        appendPayment({ amount: null, paymentMode: "cash", time: new Date().toISOString() });
    }

    // --- ON SUBMIT HANDLER ---
    const onSubmit: SubmitHandler<OPDRegFormFields> = async (data) => {
        if (!isExistingPatient || !patientData.uhid) {
            alert("Please select or register the patient first.");
            return;
        }
        if (!data.treatingDoctorId) { alert("Please select the Treating Doctor."); return; }
        if (!data.visitCategory) { alert("Please select the Visit Type (First Visit/Follow Up)."); return; }

        // Use safe time conversion
        const isoTime = safeTime12ToISO(data.registrationDate, data.registrationTime);
        const finalPaymentEntries = data.paymentEntries.filter(p => p.amount > 0);
        const finalTotalPaid = finalPaymentEntries.reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const doctorName = treatingDoctor?.doctor_name || data.doctorName;

        try {

            // 1. Prepare Insertion Data
            const dataToInsert = {
                uhid: patientData.uhid,
                hospital_name: data.hospitalName,
                visit_type: data.visitType.toUpperCase(),
                tpa: data.tpa,
                send_whatsapp: data.sendWhatsApp,
                source_opd_id: data.sourceOpdId,
                source_ipd_id: data.sourceIpdId,
                treating_doctor_id: Number(data.treatingDoctorId),
                referring_doctor_name: data.referringDoctorName || doctorName,
                visit_category: data.visitCategory,
                total_fees: totalFees,
                bp: data.bp || null,
                pulse: data.pulse || null,
                weight: data.weight || null,
                spo2: data.spo2 || null,
                sugar: data.sugar || null,
                discount_amount: data.discountAmount,
                amount_paid: finalTotalPaid,
                payment_entries: finalPaymentEntries,
                created_at: isoTime,
            };

            // 2. 🚨 ACTUAL SUPABASE INSERTION
            const registrationId = await insertOPDRegistration(dataToInsert);

            // 3. GENERATE AND OPEN BILL

            const serviceItems: BillServiceItem[] = [{
                type: 'OPD',
                name: `${doctorName} Consultation (${data.visitCategory})`,
                charges: totalFees,
                doctor: doctorName,
                details: data.referringDoctorName ? `Ref: ${data.referringDoctorName}` : 'Self'
            }];

            const billData: UniversalBillData = {
                patientInfo: patientData,
                registrationId: registrationId,
                date: new Date(data.registrationDate),
                time: data.registrationTime,
                referredBy: data.referringDoctorName || doctorName,
                discount: data.discountAmount,
                services: serviceItems,
                paymentEntries: finalPaymentEntries.map(p => ({
                    amount: p.amount,
                    paymentMode: p.paymentMode.toLowerCase() as 'online' | 'cash' | 'card',
                    time: new Date().toISOString()
                })),
                vitals: {
                    bp: data.bp,
                    pulse: String(data.pulse || ""),
                    weight: String(data.weight || ""),
                    spo2: data.spo2,
                    sugar: data.sugar,
                },
                sendWhatsApp: data.sendWhatsApp
            };

            await openUniversalBillInNewTabProgrammatically(billData, doctorList.map(d => ({ id: d.id, doctor_name: d.doctor_name } as DoctorLite)));

            // 4. 🟢 SEND WHATSAPP
            if (data.sendWhatsApp && patientData.contact && finalTotalPaid > 0) {
                const contactNumber = String(patientData.contact);
                const estTimeDuration = "30 Minutes"; // Default for OPD
                const testNameList = `${doctorName} Consultation (${data.visitCategory})`;

                await sendWhatsAppNotification(
                    contactNumber,
                    patientData.name,
                    registrationId,
                    estTimeDuration,
                    testNameList,
                    { total: totalFees, paid: finalTotalPaid, balance: remainingAmount }
                );
            }

            alert(`OPD Registration successful (ID: ${registrationId}) ✅`);

            // 4. CLEAR FORM: Reset component-specific fields
            reset({
                ...defaultRHFValues,
                bp: '', pulse: null, weight: null, spo2: '', sugar: '',
                discountAmount: 0,
                paymentEntries: [],
            });

            onSuccess();

        } catch (err: any) {
            console.error("Unexpected error:", err);
            alert(err.message ?? "An unexpected error occurred during OPD submission. Check console for details.");
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex items-center justify-between p-3 bg-white rounded-t-lg border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 flex items-center"><User className="mr-2 h-6 w-6 text-blue-600" />OPD Consultation</h3>
                <Button type="submit" disabled={isSubmitting || !isExistingPatient} className="bg-blue-600 hover:bg-blue-700">
                    {isSubmitting ? "Submitting..." : "Submit OPD Registration"}
                </Button>
            </div>

            <div className="p-3 space-y-3">
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-700 mb-3">Consultation & Doctor Details</h2>
                    <div className="grid grid-cols-12 gap-2">
                        {/* 1. Treating Doctor (for fees) */}
                        <div className="col-span-4">
                            <Label className="text-sm">Treating Doctor *</Label>
                            <Select
                                value={String(watchTreatingDoctorId || '')}
                                onValueChange={(v) => setValue("treatingDoctorId", Number(v) || null)}
                                disabled={!isExistingPatient}
                            >
                                <SelectTrigger className="h-8"><SelectValue placeholder="Select Treating Doctor" /></SelectTrigger>
                                <SelectContent className="max-h-60 overflow-y-auto">
                                    {doctorList.map((d) => (
                                        <SelectItem key={d.id} value={String(d.id)}>
                                            {d.doctor_name} (F:₹{d.first_visit_fee}/FU:₹{d.follow_up_fee})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.treatingDoctorId && <p className="text-red-500 text-xs mt-1">Required</p>}
                        </div>

                        {/* 2. Visit Category (for fees) */}
                        <div className="col-span-3">
                            <Label className="text-sm">Visit Type *</Label>
                            <Select
                                value={watchVisitCategory}
                                onValueChange={(v) => setValue("visitCategory", v as 'First Visit' | 'Follow Up')}
                                disabled={!isExistingPatient}
                            >
                                <SelectTrigger className="h-8"><SelectValue placeholder="Select Visit Type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="First Visit">First Visit</SelectItem>
                                    <SelectItem value="Follow Up">Follow Up</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 3. Fee Display */}
                        <div className="col-span-2">
                            <Label className="text-sm">Fee (Total)</Label>
                            <Input type="text" value={`₹${totalFees.toFixed(2)}`} readOnly className="h-8 font-bold bg-blue-100 cursor-not-allowed" />
                        </div>

                        {/* 4. Referring Doctor (Text input) */}
                        <div className="col-span-3">
                            <Label className="text-sm">Referring Doctor (Suggested by)</Label>
                            <Input
                                {...control.register("referringDoctorName")}
                                className="h-8"
                                placeholder="External/Internal Referral"
                                disabled={!isExistingPatient}
                            />
                        </div>

                        {/* 5. Hospital Selection */}
                        <div className="col-span-4 mt-2">
                            <Label className="text-sm font-bold text-blue-800">Clinic / Hospital Name *</Label>
                            <Select
                                value={watch("hospitalName")}
                                onValueChange={(v) => setValue("hospitalName", v)}
                            >
                                <SelectTrigger className="h-8 bg-blue-50 border-blue-200">
                                    <SelectValue placeholder="Select Clinic/Hospital" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Cigma Clinic">Cigma Clinic</SelectItem>
                                    <SelectItem value="Rehmania Hospital">Rehmania Hospital</SelectItem>
                                    <SelectItem value="Jeevdani Hospital">Jeevdani Hospital</SelectItem>
                                    <SelectItem value="Dausup Hospital">Dausup Hospital</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* --- Vitals Section --- */}
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <h2 className="text-lg font-bold text-gray-700 mb-3">Vitals</h2>
                    <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-3">
                            <Label className="text-sm flex items-center"><Heart className="h-3 w-3 mr-1" /> BP (Systolic/Diastolic)</Label>
                            <Input {...control.register("bp")} className="h-8" placeholder="e.g., 120/80" disabled={!isExistingPatient} />
                        </div>
                        <div className="col-span-2">
                            <Label className="text-sm flex items-center"><Stethoscope className="h-3 w-3 mr-1" /> Pulse (BPM)</Label>
                            <Input
                                type="number"
                                inputMode="numeric"
                                {...control.register("pulse", { valueAsNumber: true })}
                                className="h-8"
                                placeholder="e.g., 72"
                                disabled={!isExistingPatient}
                                onWheel={(e) => e.currentTarget.blur()} // Disable scroll wheel
                            />
                        </div>
                        <div className="col-span-2">
                            <Label className="text-sm flex items-center"><Activity className="h-3 w-3 mr-1" /> SpO2 (%)</Label>
                            <Input
                                type="text"
                                inputMode="numeric"
                                {...control.register("spo2")}
                                className="h-8"
                                placeholder="e.g., 98"
                                disabled={!isExistingPatient}
                            />
                        </div>
                        <div className="col-span-2">
                            <Label className="text-sm flex items-center"><Scale className="h-3 w-3 mr-1" /> Weight (Kg)</Label>
                            <Input
                                type="number"
                                step="0.1"
                                inputMode="decimal"
                                {...control.register("weight", { valueAsNumber: true })}
                                className="h-8"
                                placeholder="e.g., 65.5"
                                disabled={!isExistingPatient}
                                onWheel={(e) => e.currentTarget.blur()} // Disable scroll wheel
                            />
                        </div>
                        <div className="col-span-2">
                            <Label className="text-sm flex items-center"><Activity className="h-3 w-3 mr-1" /> Sugar (mg/dL)</Label>
                            <Input
                                type="text"
                                inputMode="numeric"
                                {...control.register("sugar")}
                                className="h-8"
                                placeholder="e.g., 110"
                                disabled={!isExistingPatient}
                            />
                        </div>
                        <div className="col-span-3">
                            <Label className="text-sm">Source Visit Type</Label>
                            <Input
                                type="text"
                                value={watchVisitType?.toUpperCase() ?? ""}
                                readOnly
                                className="h-8 bg-gray-100 cursor-not-allowed"
                            />
                        </div>
                        <div className="col-span-3 flex items-center h-8 mt-5">
                            <Checkbox
                                checked={watch("sendWhatsApp")}
                                onCheckedChange={(v) => setValue("sendWhatsApp", !!v)}
                                id="opd-whatsapp-checkbox"
                            />
                            <Label htmlFor="opd-whatsapp-checkbox" className="text-sm cursor-pointer ml-2 flex items-center gap-1">
                                <span className="text-green-600">📱</span>Send WhatsApp SMS
                            </Label>
                        </div>
                    </div>
                </div>

                {/* --- Payment Section --- */}
                <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="bg-white p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-gray-700">Payment Details</h3>
                            <Button type="button" variant="outline" size="sm" onClick={addPaymentEntry} disabled={!isExistingPatient}><Plus className="h-4 w-4 mr-1" /> Add Payment</Button>
                        </div>
                        <div className="mb-3">
                            <Label className="text-sm">Discount (₹)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                {...control.register("discountAmount", { valueAsNumber: true })}
                                placeholder="0"
                                className="h-8"
                                disabled={!isExistingPatient}
                                onWheel={(e) => e.currentTarget.blur()} // Disable scroll wheel
                            />
                        </div>
                        <div className="space-y-2">
                            {paymentFields.length === 0 ? (
                                <div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>
                            ) : (
                                paymentFields.map((field, idx) => (
                                    <div key={field.id} className="border rounded-lg p-2 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium">Payment {idx + 1}</span>
                                            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePayment(idx)} disabled={!isExistingPatient}>
                                                <X className="h-3 w-3 text-red-500" />
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">Amount (₹)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    {...control.register(`paymentEntries.${idx}.amount` as `paymentEntries.${number}.amount`, {
                                                        valueAsNumber: true,
                                                        required: false // Not strictly required for RHF validation if we filter amounts later
                                                    })}
                                                    className="h-8"
                                                    placeholder="Enter amount"
                                                    disabled={!isExistingPatient}
                                                    onWheel={(e) => e.currentTarget.blur()} // Disable scroll wheel
                                                    value={watch(`paymentEntries.${idx}.amount`) === 0 ? "" : watch(`paymentEntries.${idx}.amount`)} // Display empty string if value is 0
                                                />
                                            </div>
                                            <div>
                                                <Label className="xs">Mode</Label>
                                                <Select
                                                    value={watch(`paymentEntries.${idx}.paymentMode`)}
                                                    onValueChange={(v) => setValue(`paymentEntries.${idx}.paymentMode` as `paymentEntries.${number}.paymentMode`, v as any)}
                                                    disabled={!isExistingPatient}
                                                >
                                                    <SelectTrigger className="h-8"> <SelectValue /> </SelectTrigger>
                                                    <SelectContent>
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

                    <div className="bg-white p-3 rounded-lg border">
                        <h3 className="text-lg font-semibold text-gray-700">Payment Summary</h3>
                        <div className="space-y-2 mb-3">
                            <div className="flex justify-between"><span>Consultation Fee:</span><span className="font-medium">₹{totalFees.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span>Discount:</span><span className="font-medium">₹{discountAmount.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span>Total Paid:</span><span className="font-medium">₹{totalPaid.toFixed(2)}</span></div>
                            <div className="flex justify-between border-t pt-2">
                                <span className="font-semibold">Remaining Amount:</span>
                                <span className={`font-semibold ${remainingAmount < 0 ? "text-red-600" : remainingAmount > 0 ? "text-orange-600" : "text-green-600"}`}>
                                    ₹{remainingAmount.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
};

export default OPDRegistration;