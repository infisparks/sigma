"use client"

import { jsPDF } from "jspdf"
import { format } from "date-fns"
import { toWords } from "number-to-words"
import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"

// --- Helper Types for Universal Bill ---

// Common patient info fields used by the bill generator
export interface PatientBillInfo {
    uhid: string;
    name: string;
    contact: string;
    age: number;
    dayType: "year" | "month" | "day";
    gender: string;
    address?: string;
    title: string;
}

// Doctor list for lookup
export interface DoctorLite {
    id: number | string
    doctor_name: string
}

// Service item for the bill table
export interface BillServiceItem {
    type: 'Pathology' | 'Xray' | 'Sonography' | 'OPD' | 'Custom';
    name: string;
    charges: number;
    doctor?: string; // Doctor name or ID relevant to this specific service
    details?: string; // Optional extra details (e.g., test type, visit type)
}

// Data structure for payment history (for displaying in bill summary)
export interface PaymentEntry {
    amount: number;
    paymentMode: 'online' | 'cash' | 'card';
    time: string; // ISO string
}

// Input data for the Bill Generator
export interface UniversalBillData {
    patientInfo: PatientBillInfo;
    registrationId: number | null; // The main registration/bill ID
    date: Date;
    time: string; // e.g., "12:00 PM"
    referredBy: string; // Main referring doctor for the whole bill
    discount: number;
    services: BillServiceItem[];
    paymentEntries: PaymentEntry[];
    vitals?: {
        bp?: string;
        pulse?: string;
        weight?: string;
        spo2?: string;
        sugar?: string;
        temp?: string;
    };
    sendWhatsApp: boolean;
}

// Define the arguments for the core PDF generation function
interface GeneratePdfArgs {
    billData: UniversalBillData
    doctors: DoctorLite[]
}

// --- Core PDF Generation Logic ---

// Helper to load image
const loadImage = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) { reject("Could not get canvas context"); return; }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = (err) => reject(err);
    });
};

// Core function to generate the jsPDF document
async function generatePdfDocument({ billData, doctors }: GeneratePdfArgs): Promise<jsPDF> {
    // Load assets once
    let logoData: string | null = null;
    let watermarkData: string | null = null;
    try { logoData = await loadImage("/bill-logo.png"); } catch (e) { console.error("Failed to load bill logo", e); }
    try { watermarkData = await loadImage("/watermark.png"); } catch (e) { console.warn("Watermark failed to load", e); }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const contentHeight = pageHeight / 2 // 148.5mm

    // Helper to get doctor name from ID
    const getDoctorName = (doctorIdentifier: string | number): string => {
        if (!doctorIdentifier) return "-"
        if (typeof doctorIdentifier === 'number') {
            const doc = doctors.find((d) => d.id === doctorIdentifier)
            return doc ? String(doc.doctor_name) : String(doctorIdentifier)
        }
        return String(doctorIdentifier);
    }

    const renderSingleBill = async (yOffset: number, copyType: "PATIENT COPY" | "OFFICE COPY") => {
        let yPos = yOffset;
        let currentPageNum = 1;

        const { patientInfo, registrationId, date, time, referredBy, discount, services, paymentEntries } = billData;

        // --- Inner Drawing Helpers ---
        const drawHeaderAndBorder = (yOff: number) => {
            // Page Border
            doc.setDrawColor(41, 128, 185);
            doc.setLineWidth(0.5);
            doc.rect(5, yOff + 5, pageWidth - 10, contentHeight - 10, "S");

            let headerH = 20;

            if (logoData) {
                const imgProps = doc.getImageProperties(logoData);
                const pdfWidth = 65; // Slightly reduced to fit labels
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                doc.addImage(logoData, 'PNG', 15, yOff + 8, pdfWidth, pdfHeight);
                headerH = Math.max(pdfHeight + 12, 18);
            } else {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.setTextColor(41, 128, 185);
                doc.text("CIGMA", 15, yOff + 12);
                headerH = 20;
            }

            // Copy Label
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(41, 128, 185);
            doc.text(copyType, pageWidth - 15, yOff + 15, { align: "right" });

            // Divider Line
            doc.setDrawColor(41, 128, 185);
            doc.setLineWidth(0.5);
            doc.line(15, yOff + headerH, pageWidth - 15, yOff + headerH);
            doc.setTextColor(0, 0, 0);

            return headerH;
        };

        const drawWatermark = (yOff: number) => {
            if (!watermarkData) return;
            try {
                const imgProps = doc.getImageProperties(watermarkData);
                const targetHeight = contentHeight * 0.35;
                const targetWidth = (imgProps.width * targetHeight) / imgProps.height;
                const x = (pageWidth - targetWidth) / 2;
                const y = yOff + (contentHeight - targetHeight) / 2 + 15;
                doc.saveGraphicsState();
                doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
                doc.addImage(watermarkData, 'PNG', x, y, targetWidth, targetHeight);
                doc.restoreGraphicsState();
            } catch (e) { }
        };

        const drawTableHeader = (y: number) => {
            const isOPD = services.length > 0 && services.every(s => s.type === 'OPD');
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setFillColor(41, 128, 185);
            doc.setTextColor(255, 255, 255);
            doc.rect(15, y - 3.5, pageWidth - 30, 5, "F");
            doc.text("SN", 17, y);
            if (isOPD) {
                doc.text("Physician", 30, y);
                doc.text("Visit Type", 110, y);
            } else {
                doc.text("Service Name", 30, y);
                doc.text("Type", 130, y);
            }
            doc.text("Amount", pageWidth - 17, y, { align: "right" });
            doc.setTextColor(0, 0, 0);
        };

        // --- Start Rendering ---
        doc.setPage(currentPageNum);
        drawWatermark(yOffset);
        let headerHeight = drawHeaderAndBorder(yOffset);
        yPos = yOffset + headerHeight + 6;

        // Date & Time
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`Date: ${format(date, "dd/MM/yyyy")} | Time: ${time}`, pageWidth - 15, yOffset + 10, { align: "right" });

        // Bill Section
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`Bill No: ${String(registrationId || 'N/A')}`, 15, yPos);
        doc.text(`UHID: ${patientInfo.uhid || '-'}`, 70, yPos);
        yPos += 6;

        // Patient Details
        doc.setFillColor(236, 240, 241);
        doc.rect(15, yPos - 3, pageWidth - 30, 5, "F");
        doc.text("PATIENT DETAILS", 17, yPos + 0.5);
        yPos += 6;

        const col1X = 17, col2X = pageWidth / 2 + 5;
        doc.setFont("helvetica", "bold"); doc.text("Name:", col1X, yPos);
        doc.setFont("helvetica", "normal"); doc.text(`${patientInfo.title} ${patientInfo.name}`, col1X + 18, yPos);
        doc.setFont("helvetica", "bold"); doc.text("Phone:", col2X, yPos);
        doc.setFont("helvetica", "normal"); doc.text(String(patientInfo.contact), col2X + 18, yPos);
        yPos += 4.5;

        doc.setFont("helvetica", "bold"); doc.text("Age/Sex:", col1X, yPos);
        doc.setFont("helvetica", "normal");
        const genderStr = patientInfo.gender ? patientInfo.gender.charAt(0).toUpperCase() + patientInfo.gender.slice(1) : "-";
        doc.text(`${String(patientInfo.age ?? "-")} ${String(patientInfo.dayType || "Y")} / ${genderStr}`, col1X + 18, yPos);
        doc.setFont("helvetica", "bold"); doc.text("Ref. By:", col2X, yPos);
        doc.setFont("helvetica", "normal"); doc.text(String(referredBy), col2X + 18, yPos);
        yPos += 4.5;

        if (patientInfo.address) {
            doc.setFont("helvetica", "bold"); doc.text("Address:", col1X, yPos);
            doc.setFont("helvetica", "normal");
            const addressText = String(patientInfo.address.length > 55 ? `${patientInfo.address.slice(0, 55)}...` : patientInfo.address);
            doc.text(addressText, col1X + 18, yPos);
            yPos += 4.5;
        }

        // Vitals
        if (billData.vitals && Object.values(billData.vitals).some(val => !!val)) {
            yPos += 2;
            doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 100, 100);
            let vTextParts = [];
            const v = billData.vitals;
            if (v.bp) vTextParts.push(`BP: ${v.bp}`);
            if (v.pulse) vTextParts.push(`P: ${v.pulse}`);
            if (v.temp) vTextParts.push(`T: ${v.temp}`);
            if (v.sugar) vTextParts.push(`Sugar: ${v.sugar}`);
            if (v.spo2) vTextParts.push(`SpO2: ${v.spo2}`);
            if (v.weight) vTextParts.push(`Wt: ${v.weight}kg`);
            doc.text(vTextParts.join("  |  "), 15, yPos);
            yPos += 5;
            doc.setTextColor(0, 0, 0);
        }

        yPos += 2;
        drawTableHeader(yPos);
        yPos += 5;

        doc.setFont("helvetica", "normal");
        let totalCharges = 0;
        const isOPD = services.length > 0 && services.every(s => s.type === 'OPD');

        for (let i = 0; i < services.length; i++) {
            const m = services[i];
            // Page Break Check relative to the HALF height
            if (yPos > (yOffset + contentHeight - 35)) {
                currentPageNum++;
                if (yOffset === 0) {
                    doc.addPage();
                } else {
                    doc.setPage(currentPageNum);
                }
                drawWatermark(yOffset);
                drawHeaderAndBorder(yOffset);
                yPos = yOffset + headerHeight + 8;
                drawTableHeader(yPos);
                yPos += 5;
                doc.setFont("helvetica", "normal");
            }

            if (i % 2 === 0) {
                doc.setFillColor(242, 243, 244);
                doc.rect(15, yPos - 3.5, pageWidth - 30, 5, "F");
            }

            const rawDocName = getDoctorName(m.doctor || "");
            const doctorDisplay = m.doctor ? `Dr. ${rawDocName.replace(/^Dr\.?\s*/i, "")}` : "-";
            const amt = Number(m.charges) || 0;
            doc.text(String(i + 1), 17, yPos);

            if (isOPD) {
                doc.text(doctorDisplay.length > 45 ? `${doctorDisplay.slice(0, 45)}…` : doctorDisplay, 30, yPos);
                doc.text(m.details || "Consultation", 110, yPos);
            } else {
                doc.text(m.name.length > 55 ? `${m.name.slice(0, 55)}…` : m.name, 30, yPos);
                doc.text(m.details || "-", 130, yPos);
            }
            doc.text(amt.toFixed(2), pageWidth - 17, yPos, { align: "right" });
            totalCharges += amt;
            yPos += 5;
        }

        yPos += 2;
        if (yPos > (yOffset + contentHeight - 40)) {
            currentPageNum++;
            if (yOffset === 0) doc.addPage();
            else doc.setPage(currentPageNum);
            drawWatermark(yOffset);
            drawHeaderAndBorder(yOffset);
            yPos = yOffset + headerHeight + 8;
        }

        doc.setDrawColor(200, 200, 200); doc.line(15, yPos, pageWidth - 15, yPos); yPos += 4;

        const totalPaid = paymentEntries.reduce((sum, p) => sum + (p.amount || 0), 0);
        const net = totalCharges - discount;
        const due = net - totalPaid;

        doc.setFontSize(8); doc.setFont("helvetica", "italic");
        const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        doc.text(`In Words: ${capitalize(toWords(Math.floor(totalPaid)))} Rupees Only`, 15, yPos + 4);

        const summaryX = pageWidth - 70;
        const valX = pageWidth - 17;
        doc.setFont("helvetica", "bold");
        doc.text("Total Charges:", summaryX, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(totalCharges.toFixed(2), valX, yPos, { align: "right" });
        yPos += 4;

        if (discount > 0) {
            doc.setFont("helvetica", "bold"); doc.text("Discount:", summaryX, yPos);
            doc.text(discount.toFixed(2), valX, yPos, { align: "right" }); yPos += 4;
        }

        doc.setFont("helvetica", "bold"); doc.text("Net Amount:", summaryX, yPos);
        doc.text(net.toFixed(2), valX, yPos, { align: "right" }); yPos += 4;
        doc.text("Paid Amount:", summaryX, yPos);
        doc.text(totalPaid.toFixed(2), valX, yPos, { align: "right" }); yPos += 4;

        if (due > 0) {
            doc.setTextColor(192, 57, 43); doc.text("Balance Due:", summaryX, yPos);
            doc.text(due.toFixed(2), valX, yPos, { align: "right" }); doc.setTextColor(0, 0, 0);
        }

        // Footer
        const footerY = yOffset + contentHeight - 15;
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text("Authorized Signatory", pageWidth - 15, footerY, { align: "right" });
        doc.setFontSize(7); doc.setFont("helvetica", "normal");
        doc.text("Cigma Clinic And Diagnostic Centre : Ground Floor, Virani Plaza, Beside Bank of Maharashtra, Near Kausa Petrol Pump, Kausa,", pageWidth / 2, yOffset + contentHeight - 10, { align: "center" });
        doc.text("Mumbra - 612. Mob.: 8928805286 / 91671 97303", pageWidth / 2, yOffset + contentHeight - 7, { align: "center" });
    };

    // First Copy (Top)
    await renderSingleBill(0, "PATIENT COPY");

    // Second Copy (Bottom)
    await renderSingleBill(contentHeight, "OFFICE COPY");

    // Add Cut Line on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        (doc as any).setLineDash([2, 5]);
        doc.line(0, contentHeight, pageWidth, contentHeight);
        (doc as any).setLineDash([]);
        doc.setFontSize(6);
        doc.setTextColor(150, 150, 150);
        // doc.text("✂ CUT HERE", pageWidth / 2, contentHeight + 2, { align: "center" });
    }

    return doc
}

// --- React Component and Programmatic Utility ---

interface UniversalBillGeneratorProps {
    billData: UniversalBillData
    doctors?: DoctorLite[]
    className?: string
}

export function UniversalBillGenerator({ billData, doctors = [], className = "" }: UniversalBillGeneratorProps) {

    // Function to generate and download PDF
    const downloadPDF = async () => {
        const doc = await generatePdfDocument({ billData, doctors });
        const fileName = `Bill_${String(billData.patientInfo.name).replace(/\s+/g, "_")}__${format(billData.date, "ddMMyyyy")}.pdf`
        doc.save(fileName)
    }

    // Function to generate PDF and view in new tab
    const viewPDF = async () => {
        const doc = await generatePdfDocument({ billData, doctors });
        const pdfBlob = doc.output("blob")
        const blobUrl = URL.createObjectURL(pdfBlob)

        const newWindow = window.open(blobUrl, "_blank")
        if (newWindow) {
            newWindow.focus()
            setTimeout(() => { URL.revokeObjectURL(blobUrl) }, 1000) // Revoke after a short delay
        } else {
            console.error("Failed to open new window. Pop-ups might be blocked.");
            URL.revokeObjectURL(blobUrl); // Revoke immediately if popup blocked
        }
    }

    return (
        <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={viewPDF} className={`gap-2 ${className}`}>
                <Eye className="h-4 w-4" /> View Bill
            </Button>
            <Button type="button" variant="outline" onClick={downloadPDF} className={`gap-2 ${className}`}>
                <Download className="h-4 w-4" /> Download Bill
            </Button>
        </div>
    )
}

// Utility function for opening in new tab programmatically (export for page.tsx)
export async function openUniversalBillInNewTabProgrammatically(billData: UniversalBillData, doctors: DoctorLite[] = []) {
    try {
        const doc = await generatePdfDocument({ billData, doctors });
        const pdfBlob = doc.output("blob")
        const blobUrl = URL.createObjectURL(pdfBlob)

        const newWindow = window.open(blobUrl, "_blank")
        if (newWindow) {
            newWindow.focus()
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000); // Revoke after 30 seconds
        } else {
            throw new Error("Failed to open new window. Pop-ups might be blocked.");
        }
    } catch (error) {
        console.error("Error in openUniversalBillInNewTabProgrammatically:", error);
        throw error; // Re-throw to be caught by the calling function (Pathology/XrayRegistration)
    }
}