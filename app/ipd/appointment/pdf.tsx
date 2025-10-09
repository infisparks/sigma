// pdf.tsx
"use client"
import jsPDF from "jspdf"
import { Button } from "@/components/ui/button"

import letterhead from "@/public/letterhead.png"

interface Option {
  value: string
  label: string
}

interface Doctor {
  id: number // Changed to number
  dr_name: string // Consistent: changed from 'name' to 'dr_name'
  department: string;
  specialist: any;
  charges: any;
}

interface BedData {
  id: number // Consistent: Changed from string to number to match DB schema
  bed_number: number // Assuming number from DB and page.tsx
  bed_type: string
  created_at: string;
  room_type: string;
  status: "available" | "occupied" | "maintenance" | "reserved";
}

interface PaymentDetailItem {
  date: string;
  type: string;
  amount: number;
  createdAt: string;
  paymentType: string;
  through: string;
  amountType?: "advance" | "deposit" | "settlement" | "refund" | "discount"; // Added to match usage in page.tsx
}

interface ServiceDetailItem {
  type: string;
  amount: number;
  createdAt: string;
  doctorName: string;
  serviceName: string;
}

interface IPDFormInputForPDF { // Renamed for clarity that this is the data shape specifically for PDF
  uhid: string;
  name: string;
  phone: string; // Expect string for PDF rendering, ensure page.tsx converts
  age: number; // Expect number for PDF rendering, ensure page.tsx converts
  ageUnit: string;
  gender: string; // Expect string for PDF rendering, ensure page.tsx converts
  address: string; // Expect string for PDF rendering, ensure page.tsx converts
  relativeName: string;
  relativePhone: string | number | null; // Keep original type for relativePhone
  relativeAddress: string | null; // Keep original type for relativeAddress
  admissionSource: string;
  admissionType: string;
  referralDoctor: string; // Expect string for PDF rendering, ensure page.tsx converts
  underCareOfDoctor: string;
  depositAmount: string | number | null; // Can be string | number | null
  paymentMode: string;
  bed: number; // Must be number for PDF to match BedData.id, ensure page.tsx converts
  roomType: string;
  date: string;
  time: string;
  ipd_id?: number; // Optional
  paymentDetails: PaymentDetailItem[] | null;
  serviceDetails: ServiceDetailItem[] | null;
  mrd?: string | null; // Added new field for MRD
  tpa?: boolean; // Added new field for TPA
}

interface IPDSignaturePDFProps {
  data: IPDFormInputForPDF
  genderOptions: Option[]
  admissionSourceOptions: Option[]
  admissionTypeOptions: Option[]
  paymentModeOptions: Option[]
  roomTypeOptions: Option[]
  doctors: Doctor[]
  beds: BedData[]
}

export default function IPDSignaturePDF({
  data,
  genderOptions,
  admissionSourceOptions,
  admissionTypeOptions,
  paymentModeOptions,
  roomTypeOptions,
  doctors,
  beds,
}: IPDSignaturePDFProps) {
  /* ----------------------------------------
   *   Load Hindi font (Noto Sans Devanagari)
   *   ---------------------------------------- */
  const loadHindiFont = async (doc: jsPDF): Promise<boolean> => {
    // Try multiple paths to handle basePath, assetPrefix, or routing nuances
    const candidatePaths = [
      "/font/NotoSansDevanagari_Condensed-Medium.ttf",
      (typeof window !== "undefined" ? `${window.location.origin}/font/NotoSansDevanagari_Condensed-Medium.ttf` : undefined),
      (typeof document !== "undefined" ? new URL("/font/NotoSansDevanagari_Condensed-Medium.ttf", document.baseURI).toString() : undefined),
    ].filter(Boolean) as string[]

    for (const path of candidatePaths) {
      try {
        const res = await fetch(path)
        if (!res.ok) continue
        const blob = await res.blob()
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(",")[1])
          reader.onerror = () => reject(new Error("Failed to read font file."))
          reader.readAsDataURL(blob)
        })

        doc.addFileToVFS("NotoSansDevanagari_Condensed-Medium.ttf", base64)
        doc.addFont("NotoSansDevanagari_Condensed-Medium.ttf", "NotoSansDev", "normal")

        const fontList = (doc.internal as any).getFontList()
        if (fontList["NotoSansDev"] && fontList["NotoSansDev"].includes("normal")) {
          return true
        }
      } catch (_) {
        // try next path
      }
    }
    console.error("Failed to load NotoSansDev font from all candidate paths.")
    return false
  }

  /* ----------------------------------------
   *   Helpers shared by both generators
   *   ---------------------------------------- */
  let cachedLetterheadDataUrl: string | null = null

  const loadAndAddLetterhead = async (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    if (!cachedLetterheadDataUrl) {
      try {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.src = letterhead.src
        await new Promise((res, rej) => {
          img.onload = () => res(null)
          img.onerror = () => rej(new Error("Failed to load letterhead"))
        })

        // Downscale to page size and convert to JPEG for better compression
        const canvas = document.createElement("canvas")
        // Render at 2x for sharper output
        canvas.width = Math.floor(pageWidth * 2)
        canvas.height = Math.floor(pageHeight * 2)
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        cachedLetterheadDataUrl = canvas.toDataURL("image/jpeg", 0.95)
      } catch (_) {
        // Fallback to original asset if transform fails
        cachedLetterheadDataUrl = letterhead.src
      }
    }

    const format = cachedLetterheadDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG"
    // Prefer higher-quality rendering
    doc.addImage(cachedLetterheadDataUrl, format as any, 0, 0, pageWidth, pageHeight, undefined, "SLOW")
  }

  const initializeDoc = async () => {
    const doc = new jsPDF({ orientation: "p", unit: "pt", format: "A4", compress: true as any })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    await loadAndAddLetterhead(doc)
    return { doc, pageWidth, pageHeight }
  }

  /* ================================================================
   *   ===============   ENGLISH‑LANGUAGE PDF   ==========================
   *   ================================================================ */
  const generatePDF = async () => {
    const { doc, pageWidth, pageHeight } = await initializeDoc()
    // Move content lower to avoid overlapping the letterhead top band
    let y = 140
    const left = 50
    const right = pageWidth - 50
    const lh = 14

    const newPageIfNeeded = () => {
      if (y > pageHeight - 50) {
        doc.addPage()
        // Reuse cached, already compressed letterhead
        const format = (cachedLetterheadDataUrl && cachedLetterheadDataUrl.startsWith("data:image/jpeg")) ? "JPEG" : "PNG"
        doc.addImage(cachedLetterheadDataUrl || letterhead.src, format as any, 0, 0, pageWidth, pageHeight, undefined, "SLOW")
        y = 140
      }
    }

    const sep = () => {
      doc.setDrawColor(180)
      doc.setLineWidth(0.6)
      doc.line(left, y, right, y)
      y += lh
      newPageIfNeeded()
    }

    const useHindiFont = await loadHindiFont(doc)

    const addField = (label: string, value?: string | number | null) => {
      if (useHindiFont) {
        doc.setFont("NotoSansDev", "normal").setFontSize(10).text(label, left, y)
        doc.setFont("NotoSansDev", "normal").text(String(value ?? "N/A"), left + 120, y)
      } else {
        doc.setFont("Helvetica", "bold").setFontSize(10).text(label, left, y)
        doc.setFont("Helvetica", "normal").text(String(value ?? "N/A"), left + 120, y)
      }
      y += lh
      newPageIfNeeded()
    }

    const addSection = (title: string) => {
      y += 20
      newPageIfNeeded()
      if (useHindiFont) {
        doc.setFont("NotoSansDev", "normal").setFontSize(11).setTextColor(0, 0, 128).text(title, left, y)
      } else {
        doc.setFont("Helvetica", "bold").setFontSize(11).setTextColor(0, 0, 128).text(title, left, y)
      }
      y += 10
      sep()
      if (useHindiFont) {
        doc.setFont("NotoSansDev", "normal").setFontSize(10).setTextColor(0)
      } else {
        doc.setFont("Helvetica", "normal").setFontSize(10).setTextColor(0)
      }
    }

    /* ---------- Title ---------- */
    if (useHindiFont) {
      doc.setFont("NotoSansDev", "normal").setFontSize(16).setTextColor(0, 0, 128).text("Patient's Admission Summary", pageWidth / 2, y, { align: "center" })
    } else {
      doc.setFont("Helvetica", "bold").setFontSize(16).setTextColor(0, 0, 128).text("Patient's Admission Summary", pageWidth / 2, y, { align: "center" })
    }
    y += lh + 14
    sep()

    /* ---------- Patient details ---------- */
    addSection("Patient Details")
    const patientGenderLabel = genderOptions.find((opt) => opt.value === data.gender)?.label
    addField("Patient Name", data.name || "NA")
    addField("Age / Sex", `${data.age || "NA"} Yrs / ${patientGenderLabel || "NA"}`)
    
    // Find doctor by dr_name from the doctors list
    const underCareOfDoctorName = doctors.find(doc => doc.dr_name === data.underCareOfDoctor)?.dr_name || "NA";
    addField("Under Care of Doctor", underCareOfDoctorName);

    addField("Address", data.address || "NA")
    addField("Number", data.phone || "NA")

    if (data.mrd) {
      addField("MRD Number", data.mrd);
    }

    if (data.tpa !== undefined) {
      addField("TPA ", data.tpa ? "Yes" : "No");
    }

    /* ---------- Admission ---------- */
    addSection("Admission Details")
    const admissionDate = data.date ? new Date(data.date) : null
    const adDate = admissionDate
      ? admissionDate.toLocaleDateString("en-GB")
      : "NA"
    const adTime = data.time || "NA"
    addField("Admission Date / Time", `${adDate} - ${adTime}`)
    addField("Referral Doctor", data.referralDoctor || "NA")

    /* ---------- Room / Ward ---------- */
    addSection("Room / Ward")
    const roomTypeLabel = roomTypeOptions.find((opt) => opt.value === data.roomType)?.label
    // Now bed.id is number, so direct comparison is fine
    const selectedBed = beds.find((bed) => bed.id === data.bed)
    const bedNumberAndType = selectedBed ? `Bed ${selectedBed.bed_number} - ${selectedBed.bed_type}` : "NA"
    addField("Room / Ward", roomTypeLabel || "NA")
    addField("Bed No", bedNumberAndType)

    /* ---------- Instructions ---------- */
    addSection("Instructions")
    const instructions = [
      "Please have an attendant to accompany you till discharge.",
      "Billing Cycle will be of 24 hours from the date and time of admission.",
      "Consultant Visit charges will be charged as per their visits.",
      "All other services like Oxygen, Nebulizer, Monitor, Syringe pump, Ventilator, BiPAP, etc., are chargeable.",
      "Any other visiting consultants other than the treating doctor will be charged extra.",
      "Normal delivery basic package consists of 1 induction; if more than that, it will be charged.",
      "Normal delivery basic package includes 1 pediatric visit.",
      "Consumption of alcohol, smoking, chewing gum, and spitting are strictly prohibited.",
      "Patients are advised not to carry cash or wear/keep any jewelry during hospitalization. The hospital is not responsible for any kind of loss.",
      "Photography is prohibited on hospital premises.",
      "If the patient is required to be transferred to the ICU/Room/Ward, the room/bed they were occupying prior to transfer is to be vacated by the attendants.",
      "For any further assistance, you may reach us on 9958399157 / 9958399157",
    ]
    instructions.forEach((txt) => {
      doc.setFont("Helvetica", "bold").setTextColor(0, 0, 128).text("•", left, y)
      doc
        .setFont("Helvetica", "normal")
        .setTextColor(60)
        .splitTextToSize(txt, right - left - 15)
        .forEach((line: string | string[]) => {
          doc.text(line, left + 15, y)
          y += lh
          newPageIfNeeded()
        })
    })

    /* ---------- Acknowledgment & Sign ---------- */
    y += lh
    newPageIfNeeded()
    doc
      .setFont("Helvetica", "bold")
      .setTextColor(0)
      .text("I have read all the information mentioned above and hereby acknowledge and confirm:", left, y)
    y += lh * 2
    newPageIfNeeded()

    doc
      .setFont("Helvetica", "normal")
      .text("Signature: ______________", left, y)
      .text("Billing Executive: ______________", right, y, { align: "right" })
    y += lh * 2
    newPageIfNeeded()
    doc.text("Name: ______________", left, y)
    y += lh * 1.5
    newPageIfNeeded()
    doc.text("Relation with Patient: ______________", left, y)

    doc.save(`IPD_Admission_Letter_${data.name || "Patient"}.pdf`)
  }

  /* ================================================================
   *   ===============   HINDI‑LANGUAGE PDF   ============================
   *   ================================================================ */
  const generatePDFHindi = async () => {
    const { doc, pageWidth, pageHeight } = await initializeDoc()
    let y = 120
    const left = 50
    const right = pageWidth - 50
    const lh = 14

    const useHindiFont = await loadHindiFont(doc)

    const newPageIfNeeded = () => {
      if (y > pageHeight - 50) {
        doc.addPage()
        const format = (cachedLetterheadDataUrl && cachedLetterheadDataUrl.startsWith("data:image/jpeg")) ? "JPEG" : "PNG"
        doc.addImage(cachedLetterheadDataUrl || letterhead.src, format as any, 0, 0, pageWidth, pageHeight, undefined, "FAST")
        y = 120
      }
    }

    const sep = () => {
      doc.setDrawColor(180).setLineWidth(0.6).line(left, y, right, y)
      y += lh
      newPageIfNeeded()
    }

    /* ---------- Section title (Hindi) ---------- */
    const addSectionHI = (title: string) => {
      y += 20
      newPageIfNeeded()
      if (useHindiFont) {
        doc.setFont("NotoSansDev", "normal").setFontSize(11).setTextColor(0, 0, 128).text(title, left, y)
      } else {
        doc.setFont("Helvetica", "bold").setFontSize(11).setTextColor(0, 0, 128).text(title, left, y) // Fallback
      }
      y += 4
      sep()
      if (useHindiFont) {
        doc.setFont("NotoSansDev", "normal").setFontSize(10).setTextColor(0)
      } else {
        doc.setFont("Helvetica", "normal").setFontSize(10).setTextColor(0) // Fallback
      }
    }

    /* ---------- Field (English labels + values) ---------- */
    const addFieldEN = (label: string, value?: string | number | null) => {
      // Labels remain in Helvetica; values switch to Hindi font if available
      doc.setFont("Helvetica", "bold").text(label, left, y)
      if (useHindiFont) {
        doc.setFont("NotoSansDev", "normal").text(String(value ?? "N/A"), left + 120, y)
      } else {
        doc.setFont("Helvetica", "normal").text(String(value ?? "N/A"), left + 120, y)
      }
      y += lh
      newPageIfNeeded()
    }

    /* ---------- Bullet in Hindi ---------- */
    const addBulletHI = (txt: string) => {
      if (useHindiFont) {
        doc.setFont("NotoSansDev", "normal").text("•", left, y)
        doc.splitTextToSize(txt, right - left - 15).forEach((line: string | string[]) => {
          doc.text(line, left + 15, y)
          y += lh
          newPageIfNeeded()
        })
      } else {
        doc.setFont("Helvetica", "normal").text("•", left, y) // Fallback
        doc.splitTextToSize(txt, right - left - 15).forEach((line: string | string[]) => {
          doc.text(line, left + 15, y)
          y += lh
          newPageIfNeeded()
        })
      }
    }

    /* ---------- Title ---------- */
    if (useHindiFont) {
      doc
        .setFont("NotoSansDev", "normal")
        .setFontSize(14)
        .setTextColor(0, 0, 128)
        .text("रोगी का प्रवेश सारांश", pageWidth / 2, y, { align: "center" })
    } else {
      // Keep English title if Hindi font is unavailable to avoid garbled glyphs
      doc
        .setFont("Helvetica", "bold")
        .setFontSize(14)
        .setTextColor(0, 0, 128)
        .text("Patient's Admission Summary", pageWidth / 2, y, { align: "center" })
    }
    y += lh + 8
    sep()

    /* ---------- Patient details (labels & values in English) ---------- */
    addSectionHI("रोगी विवरण / PATIENT DETAILS")
    const patientGenderLabel = genderOptions.find((opt) => opt.value === data.gender)?.label
    addFieldEN("Patient Name", data.name || "NA")
    addFieldEN("Age / Sex", `${data.age || "NA"} Yrs / ${patientGenderLabel || "NA"}`)
    
    const underCareOfDoctorName = doctors.find(doc => doc.dr_name === data.underCareOfDoctor)?.dr_name || "NA";
    addFieldEN("Under Care of Doctor", underCareOfDoctorName);

    addFieldEN("Address", data.address || "NA")
    addFieldEN("Number", data.phone || "NA")

    if (data.mrd) {
      addFieldEN("MRD Number", data.mrd);
    }

    if (data.tpa !== undefined) {
      addFieldEN("TPA ", data.tpa ? "Yes" : "No");
    }

    /* ---------- Admission details ---------- */
    addSectionHI("भर्ती विवरण / ADMISSION DETAILS")
    const admissionDate = data.date ? new Date(data.date) : null
    const adDate = admissionDate
      ? admissionDate.toLocaleDateString("en-GB")
      : "NA"
    const adTime = data.time || "NA"
    addFieldEN("Admission Date / Time", `${adDate} - ${adTime}`)
    addFieldEN("Referral Doctor", data.referralDoctor || "NA")

    /* ---------- Room / Ward ---------- */
    addSectionHI("कक्ष / वार्ड")
    const roomTypeLabel = roomTypeOptions.find((opt) => opt.value === data.roomType)?.label
    const selectedBed = beds.find((bed) => bed.id === data.bed) // bed.id is now number
    const bedNumberAndType = selectedBed ? `Bed ${selectedBed.bed_number} - ${selectedBed.bed_type}` : "NA"
    addFieldEN("Room / Ward", roomTypeLabel || "NA")
    addFieldEN("Bed No", bedNumberAndType)

    /* ---------- Instructions ---------- */
    addSectionHI("निर्देश")
    ;[
      "कृपया डिस्चार्ज तक एक परिचारक आपके साथ रहे।",
      "भर्ती की तारीख और समय से 24 घंटे का बिलिंग चक्र होगा।",
      "परामर्शदाता की विजिट चार्जेज उनकी विजिट के अनुसार लगाए जाएंगे।",
      "सोनोग्राफी, रक्त/मूत्र परीक्षण, एक्स‑रे, 2D‑इको जैसी जांचें अतिरिक्त शुल्क पर होंगी।",
      "पैकेज में मौखिक एवं गैर‑चिकित्सा वस्तुएँ रोगी द्वारा भुगतान योग्य हैं।",
      "ऑक्सीजन, नेबुलाइज़र, मॉनिटर, सिरिंज पंप, वेंटीलेटर, BiPAP आदि चार्जेबल सेवाएँ हैं।",
      "इलाज करने वाले डॉक्टर के अलावा अन्य परामर्शदाता की विजिट पर अतिरिक्त शुल्क लगेगा।",
      "साधारण प्रसव पैकेज में 1 इंडक्शन शामिल है; अधिक होने पर शुल्क लगेगा।",
      "साधारण प्रसव में 1 बाल रोग विशेषज्ञ की विजिट शामिल है।",
      "अस्पताल परिसर में शराब, धूम्रपान, च्यूइंग गम एवं थूकना वर्जित है।",
      "अस्पताल में नकदी या आभूषण न रखें; किसी भी हानि के लिए अस्पताल उत्तरदायी नहीं है।",
      "अस्पताल परिसर में फोटोग्राफी वर्जित है।",
      "ICU/कक्ष/वार्ड में स्थानांतरण पर पूर्व बिस्तर खाली करें।",
      "अन्य सहायता हेतु 9769000091 / 9769000092 पर संपर्क करें।",
    ].forEach(addBulletHI)

    /* ---------- Acknowledgment & Sign ---------- */
    y += lh
    if (useHindiFont) {
      doc.setFont("NotoSansDev", "normal").text("मैंने उपरोक्त सभी जानकारी पढ़ ली है एवं पुष्टि करता हूँ:", left, y)
    } else {
      // Use English fallback to avoid mojibake
      doc.setFont("Helvetica", "normal").text("I have read the above information and confirm:", left, y)
    }
    y += lh * 2
    newPageIfNeeded()

    if (useHindiFont) {
      doc.setFont("NotoSansDev", "normal").text("हस्ताक्षर: ______________", left, y)
      doc.text("बिलिंग कार्यकारी: ______________", right, y, { align: "right" })
    } else {
      doc.setFont("Helvetica", "normal").text("Signature: ______________", left, y)
      doc.text("Billing Executive: ______________", right, y, { align: "right" })
    }
    y += lh * 2
    newPageIfNeeded()
    if (useHindiFont) {
      doc.setFont("NotoSansDev", "normal").text("नाम: ______________", left, y)
    } else {
      doc.setFont("Helvetica", "normal").text("Name: ______________", left, y)
    }
    y += lh * 1.5
    newPageIfNeeded()
    if (useHindiFont) {
      doc.setFont("NotoSansDev", "normal").text("रोगी के साथ संबंध: ______________", left, y)
    } else {
      doc.setFont("Helvetica", "normal").text("Relation with Patient: ______________", left, y)
    }

    doc.save(`IPD_Admission_Letter_${data.name || "Patient"}_HI.pdf`)
  }

  /* ================================================================
   *   ===============   RENDER PDF BUTTONS   ============================
   *   ================================================================ */
  return (
    <div className="flex gap-4">
      <Button
        type="button"
        onClick={generatePDF}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200"
      >
        Download Letter
      </Button>
    </div>
  )
}