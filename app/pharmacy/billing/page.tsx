'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Search, Plus, User, ShoppingCart, Trash2, CreditCard, UserPlus, Eye,
    History as HistoryIcon, Calculator, Keyboard, CheckCircle2, AlertTriangle, RefreshCcw
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { format, subYears } from 'date-fns'

// --- Interfaces ---

interface ClinicMedicine {
    id: number
    name: string
    pack_size_label: string
    pack_size_quantity: number
}

interface BatchStock {
    batch_number: string
    expiry_date: string
    mrp: number // per pack
    remaining_units: number
    pack_size_quantity: number
}

interface CartItem {
    id: string // random
    medicine_id: number
    medicine_name: string
    batch_number: string
    expiry_date: string

    // Quantity Logic
    quantity_mode: 'Pack' | 'Unit' // Do we sell full packs or loose units?
    quantity: number // User entered quantity
    total_units_sold: number // Calculated for backend deduction

    // Price Logic
    mrp_per_pack: number
    unit_price: number // The actual selling price per Qty (calculated)

    // Discount Logic is per item in cart now
    discount_amount: number

    total_price: number
}

interface Patient {
    uhid: string
    name: string
    number: number
    age: number
    gender: string
}

export default function PharmacyBillingPage() {
    // --- Global State ---
    const [loading, setLoading] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())

    // --- Master Data ---
    const [medicineList, setMedicineList] = useState<ClinicMedicine[]>([])
    const [doctorList, setDoctorList] = useState<{ id: string, name: string }[]>([])

    // --- Form: Patient ---
    const [patientSearch, setPatientSearch] = useState('')
    const [patientHints, setPatientHints] = useState<Patient[]>([])
    const [focusedPatientIndex, setFocusedPatientIndex] = useState(-1) // For keyboard nav
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false)
    const [isRegisterMode, setIsRegisterMode] = useState(false)
    // New Patient Form
    const [newPatient, setNewPatient] = useState({ title: 'MR', name: '', number: '', age: '', gender: 'male' })

    const handleCreatePatient = async () => {
        if (!newPatient.name || !newPatient.number || !newPatient.age) return alert('Fill all fields')

        try {
            const ageInt = parseInt(newPatient.age)
            const { data, error } = await supabase.from('patient_detail').insert({
                title: newPatient.title,
                name: newPatient.name,
                number: parseInt(newPatient.number),
                age: ageInt,
                age_unit: 'year',
                total_day: ageInt * 365,
                gender: newPatient.gender.toLowerCase(),
                dob: format(subYears(new Date(), ageInt || 0), 'yyyy-MM-dd')
            }).select().single()

            if (error) throw error

            setSelectedPatient(data)
            setIsRegisterMode(false)
            setNewPatient({ title: 'MR', name: '', number: '', age: '', gender: 'male' })
        } catch (e: any) {
            alert('Error: ' + e.message)
        }
    }

    // --- Initialization ---
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        fetchInitialData()
        return () => clearInterval(timer)
    }, [])

    const fetchInitialData = async () => {
        // Fetch Medicines
        const { data: meds } = await supabase.from('clinic_medicine').select('*').order('name')
        if (meds) setMedicineList(meds)

        // Fetch Doctors (Mock or Config) - simplified for Speed
        const { data: docs } = await supabase.from('opd_datasets').select('datajson').eq('dataname', 'refer_doctors').single()
        if (docs?.datajson) setDoctorList(docs.datajson)
    }

    // --- Shortcuts ---
    const patientSearchRef = useRef<HTMLInputElement>(null)
    const medSearchRef = useRef<HTMLInputElement>(null)
    const qtyRef = useRef<HTMLInputElement>(null)
    const discountRef = useRef<HTMLInputElement>(null)

    // --- 2. Medicine Logic (State Hoisted) ---
    const [medSearch, setMedSearch] = useState('')
    const [filteredMeds, setFilteredMeds] = useState<ClinicMedicine[]>([])
    const [showMedSuggestions, setShowMedSuggestions] = useState(false)
    const [focusedMedIndex, setFocusedMedIndex] = useState(-1) // For keyboard nav
    const [selectedMed, setSelectedMed] = useState<ClinicMedicine | null>(null)
    const [medBatches, setMedBatches] = useState<BatchStock[]>([])
    const [selectedBatch, setSelectedBatch] = useState<BatchStock | null>(null)

    // Item Inputs (State Hoisted)
    const [itemMode, setItemMode] = useState<'Pack' | 'Unit'>('Pack') // Pack or Loose
    const [itemQty, setItemQty] = useState<string>('1') // Default 1
    const [itemPrice, setItemPrice] = useState<string>('') // Auto-calculated but editable
    const [itemDiscount, setItemDiscount] = useState<string>('0') // Item specific discount Amount (₹)

    // --- Cart & Totals (State Hoisted) ---
    const [cart, setCart] = useState<CartItem[]>([])
    const [discountType, setDiscountType] = useState<'Percent' | 'Amount'>('Percent')
    const [discountValue, setDiscountValue] = useState<string>('0') // The input value
    const [calculatedDiscountAmt, setCalculatedDiscountAmt] = useState(0) // The actual money off

    // --- Payment (State Hoisted) ---
    const [selectedDoctor, setSelectedDoctor] = useState('Self')
    const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online' | 'Split'>('Cash')
    const [splitCash, setSplitCash] = useState<string>('')
    const [splitOnline, setSplitOnline] = useState<string>('')
    const [remark, setRemark] = useState('')

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F1') { e.preventDefault(); patientSearchRef.current?.focus() }
            if (e.key === 'F2') { e.preventDefault(); medSearchRef.current?.focus() }
            if (e.key === 'F1') { e.preventDefault(); patientSearchRef.current?.focus() }
            if (e.key === 'F2') { e.preventDefault(); medSearchRef.current?.focus() }
            if (e.key === 'F3') { e.preventDefault(); discountRef.current?.focus() }
            if (e.key === 'Escape') { setShowMedSuggestions(false); setIsPatientSearchOpen(false) }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleCheckout() }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [cart, selectedPatient, isRegisterMode]) // Added deps for checkout check

    // --- 1. Patient Logic ---
    useEffect(() => {
        if (patientSearch.length < 2) { setPatientHints([]); return }
        const timer = setTimeout(async () => {
            let query = supabase.from('patient_detail').select('uhid, name, number, age, gender').limit(5)

            // If number, search phone or UHID logic, else search name
            if (!isNaN(Number(patientSearch))) {
                query = query.eq('number', patientSearch)
            } else {
                query = query.ilike('name', `%${patientSearch}%`)
            }

            const { data } = await query
            setPatientHints(data || [])
            setIsPatientSearchOpen(true)
            setFocusedPatientIndex(-1) // Reset focus on new search
        }, 300)
        return () => clearTimeout(timer)
    }, [patientSearch])

    const selectPatient = (p: Patient) => {
        setSelectedPatient(p)
        setPatientSearch('')
        setIsPatientSearchOpen(false)
        medSearchRef.current?.focus()
    }




    useEffect(() => {
        if (selectedMed) return // Don't search if selected
        if (medSearch.length < 2) { setFilteredMeds([]); setShowMedSuggestions(false); return }

        if (selectedMed) return // Don't search if selected
        if (medSearch.length < 2) { setFilteredMeds([]); setShowMedSuggestions(false); return }

        const matches = medicineList.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase())).slice(0, 50)
        setFilteredMeds(matches)
        setShowMedSuggestions(true)
        setFocusedMedIndex(-1) // Reset focus on new search
    }, [medSearch, medicineList, selectedMed])

    const selectMedicine = async (med: ClinicMedicine) => {
        setSelectedMed(med)
        setMedSearch(med.name)
        setShowMedSuggestions(false)

        // Fetch Batches
        const { data } = await supabase.from('pharmacy_batch_stock')
            .select('batch_number, expiry_date, mrp, remaining_units, pack_size_quantity')
            .eq('medicine_id', med.id)
            .gt('remaining_units', 0) // Only stock > 0
            .order('expiry_date')

        if (data && data.length > 0) {
            setMedBatches(data)
            setSelectedBatch(data[0]) // Auto-select first batch (soonest expiry)

            // Auto-Set Price based on Mode
            const batch = data[0]
            if (itemMode === 'Pack') {
                setItemPrice(batch.mrp.toString())
            } else {
                setItemPrice((batch.mrp / batch.pack_size_quantity).toFixed(2))
            }

            // Focus Qty
            setTimeout(() => qtyRef.current?.focus(), 100)
        } else {
            setMedBatches([])
            alert('No Stock Available for this medicine')
        }
    }

    // Recalculate Price when Mode/Batch changes
    useEffect(() => {
        if (!selectedBatch) return
        if (itemMode === 'Pack') {
            setItemPrice(selectedBatch.mrp.toString())
        } else {
            // Loose Price = MRP / Pack Size
            const loosePrice = selectedBatch.mrp / selectedBatch.pack_size_quantity
            setItemPrice(loosePrice.toFixed(2))
        }
    }, [itemMode, selectedBatch])

    const addItem = () => {
        if (!selectedMed || !selectedBatch) return
        const qty = parseFloat(itemQty)
        if (!qty || qty <= 0) return alert('Invalid Quantity')

        const price = parseFloat(itemPrice)
        const discAmount = parseFloat(itemDiscount) || 0

        // Calculate Discounted Total (Amount based)
        const baseTotal = qty * price

        if (discAmount > baseTotal) {
            alert(`Discount (₹${discAmount}) cannot exceed Total (₹${baseTotal})`)
            return
        }

        const total = baseTotal - discAmount

        // Calculate Total Units for Inventory Deduction
        let totalUnitsSold = 0
        if (itemMode === 'Pack') {
            totalUnitsSold = qty * selectedBatch.pack_size_quantity // 2 Packs * 10 = 20 Units
        } else {
            totalUnitsSold = qty // 5 Loose Units = 5 Units
        }

        // Stock Validation
        if (totalUnitsSold > selectedBatch.remaining_units) {
            alert(`Insufficient Stock! You have ${selectedBatch.remaining_units} units, trying to sell ${totalUnitsSold}.`)
            return
        }

        const newItem: CartItem = {
            id: Math.random().toString(36),
            medicine_id: selectedMed.id,
            medicine_name: selectedMed.name,
            batch_number: selectedBatch.batch_number,
            expiry_date: selectedBatch.expiry_date,
            quantity: qty,
            quantity_mode: itemMode,
            mrp_per_pack: selectedBatch.mrp,
            unit_price: price,
            discount_amount: discAmount,
            total_price: total,
            total_units_sold: totalUnitsSold
        }

        setCart([...cart, newItem])

        // Reset Item Form
        setSelectedMed(null)
        setMedSearch('')
        setMedBatches([])
        setSelectedBatch(null)
        setItemQty('1')
        setItemPrice('')
        setItemDiscount('0')
        medSearchRef.current?.focus()
    }

    // --- 3. Discount Logic ---
    const subtotal = cart.reduce((sum, i) => sum + i.total_price, 0)

    // Bi-directional sync
    const updateDiscount = (val: string, type: 'Percent' | 'Amount') => {
        setDiscountValue(val)
        setDiscountType(type)
        const numVal = parseFloat(val) || 0

        if (type === 'Percent') {
            setCalculatedDiscountAmt((subtotal * numVal) / 100)
        } else {
            setCalculatedDiscountAmt(numVal)
        }
    }

    // Auto-update amount if subtotal changes (keeping % fixed usually)
    useEffect(() => {
        if (discountType === 'Percent') {
            const pct = parseFloat(discountValue) || 0
            setCalculatedDiscountAmt((subtotal * pct) / 100)
        }
    }, [subtotal]) // Logic simplification: if subtotal changes, amount updates based on %

    const finalTotal = Math.max(0, subtotal - calculatedDiscountAmt)


    // --- 4. Checkout ---
    const handleCheckout = async () => {
        if (cart.length === 0) return alert('Cart is Empty')

        // COMPULSORY PATIENT SELECTION
        if (!selectedPatient && !isRegisterMode) {
            alert('Please select a Patient first (Press F1).')
            patientSearchRef.current?.focus()
            return
        }

        setLoading(true)

        // Validate Split
        let cash = 0, online = 0
        if (paymentMode === 'Split') {
            cash = parseFloat(splitCash) || 0
            online = parseFloat(splitOnline) || 0
            if (Math.abs((cash + online) - finalTotal) > 1) {
                alert(`Split amount mismatch! Total: ${finalTotal}, Entered: ${cash + online}`)
                setLoading(false)
                return
            }
        } else if (paymentMode === 'Cash') {
            cash = finalTotal
        } else {
            online = finalTotal
        }

        const payload = {
            p_customer_name: selectedPatient ? selectedPatient.name : 'Walk-in Customer',
            p_customer_phone: selectedPatient ? selectedPatient.number.toString() : null,
            p_patient_id: selectedPatient?.uhid || null,
            p_doctor_name: selectedDoctor,
            p_payment_mode: paymentMode,
            p_paid_cash: cash,
            p_paid_online: online,
            p_subtotal: subtotal,
            p_discount_amount: calculatedDiscountAmt,
            p_final_total: finalTotal,
            p_items: cart,
            p_notes: remark
        }

        try {
            const { data, error } = await supabase.rpc('save_sales_entry', payload)
            if (error) throw error

            // Redirect to Bill Page
            window.open(`/pharmacy/bill/${data.sale_id}`, '_blank')

            // Optional: Reload or Reset (Reloading is safer to ensure stock sync)
            window.location.reload()

        } catch (e: any) {
            console.error(e)
            alert('Billing Failed: ' + e.message + '. details: ' + e.details)
        } finally {
            setLoading(false)
        }
    }

    // --- Render Helpers ---
    const formatCurrency = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n)

    return (
        <div className="flex h-screen bg-gray-100/50 p-3 gap-3 overflow-hidden font-sans text-gray-800">
            {/* LEFT COLUMN: Operations (65%) */}
            <div className="flex-1 flex flex-col gap-3 h-full">

                {/* 1. Header & Patient */}
                <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border">
                    <div className="flex items-center gap-4 flex-1">
                        {selectedPatient ? (
                            <div className="flex items-center gap-3 bg-blue-50 px-4 py-2 rounded-md border border-blue-100 flex-1">
                                <div className="bg-blue-600 text-white rounded-full p-2"><User className="h-5 w-5" /></div>
                                <div>
                                    <div className="font-bold text-gray-900">{selectedPatient.name}</div>
                                    <div className="text-xs text-gray-500">{selectedPatient.uhid} | {selectedPatient.gender}/{selectedPatient.age} | {selectedPatient.number}</div>
                                </div>
                                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelectedPatient(null)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </div>
                        ) : (
                            isRegisterMode ? (
                                <div className="flex-1 bg-blue-50/50 p-2 rounded border border-blue-200 gap-2 flex items-end animate-in fade-in slide-in-from-left-4">
                                    <div className="w-[80px] space-y-1">
                                        <Label className="text-[10px] text-blue-700">Title</Label>
                                        <Select value={newPatient.title} onValueChange={v => setNewPatient({ ...newPatient, title: v })}>
                                            <SelectTrigger className="h-7 text-xs px-1 bg-white"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {[".", "MR", "MRS", "MAST", "BABA", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map(t => (
                                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-[10px] text-blue-700">Name</Label>
                                        <Input className="h-7 text-xs bg-white" value={newPatient.name} onChange={e => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="Full Name" />
                                    </div>
                                    <div className="w-[100px] space-y-1">
                                        <Label className="text-[10px] text-blue-700">Mobile</Label>
                                        <Input className="h-7 text-xs bg-white" value={newPatient.number} onChange={e => setNewPatient({ ...newPatient, number: e.target.value })} placeholder="98765..." />
                                    </div>
                                    <div className="w-[50px] space-y-1">
                                        <Label className="text-[10px] text-blue-700">Age</Label>
                                        <Input className="h-7 text-xs bg-white" value={newPatient.age} onChange={e => setNewPatient({ ...newPatient, age: e.target.value })} placeholder="YY" />
                                    </div>
                                    <div className="w-[70px] space-y-1">
                                        <Label className="text-[10px] text-blue-700">Gender</Label>
                                        <Select value={newPatient.gender} onValueChange={v => setNewPatient({ ...newPatient, gender: v })}>
                                            <SelectTrigger className="h-7 text-xs px-1 bg-white"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="male">M</SelectItem><SelectItem value="female">F</SelectItem></SelectContent>
                                        </Select>
                                    </div>
                                    <Button size="sm" className="h-7 bg-blue-600 hover:bg-blue-700" onClick={handleCreatePatient}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-red-400 hover:text-red-500 hover:bg-red-50" onClick={() => setIsRegisterMode(false)}>Cancel</Button>
                                </div>
                            ) : (
                                <div className="relative flex-1 max-w-md flex gap-2">
                                    <div className="relative flex-1">
                                        <Label className="text-[10px] text-gray-400 font-mono absolute top-[-6px] left-2 bg-white px-1">F1 Patient Search</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                            <Input
                                                ref={patientSearchRef}
                                                placeholder="Search by Name, Mobile or UHID..."
                                                className="pl-9 border-blue-200 focus:border-blue-500 bg-blue-50/30"
                                                value={patientSearch}
                                                onChange={e => setPatientSearch(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault()
                                                        setFocusedPatientIndex(prev => Math.min(prev + 1, patientHints.length - 1))
                                                    }
                                                    if (e.key === 'ArrowUp') {
                                                        e.preventDefault()
                                                        setFocusedPatientIndex(prev => Math.max(prev - 1, 0))
                                                    }
                                                    if (e.key === 'Enter' && focusedPatientIndex >= 0 && patientHints[focusedPatientIndex]) {
                                                        e.preventDefault()
                                                        selectPatient(patientHints[focusedPatientIndex])
                                                    }
                                                }}
                                            />
                                        </div>
                                        {isPatientSearchOpen && patientHints.length > 0 && (
                                            <div className="absolute top-full left-0 w-full bg-white shadow-xl border rounded-md z-50 mt-1 max-h-[300px] overflow-auto">
                                                {patientHints.map((p, idx) => (
                                                    <div
                                                        key={p.uhid}
                                                        className={cn("p-2 cursor-pointer border-b", idx === focusedPatientIndex ? "bg-blue-100" : "hover:bg-gray-50")}
                                                        onClick={() => selectPatient(p)}
                                                    >
                                                        <div className="font-medium text-sm text-gray-900">{p.name}</div>
                                                        <div className="text-xs text-gray-500 flex gap-2">
                                                            <span className="font-mono">{p.uhid}</span>
                                                            <span>•</span>
                                                            <span>{p.number}</span>
                                                            <span>•</span>
                                                            <span className="capitalize">{p.gender}/{p.age}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <Button size="icon" variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" title="New Patient" onClick={() => setIsRegisterMode(true)}>
                                        <UserPlus className="h-4 w-4" />
                                    </Button>
                                </div>
                            )
                        )}

                        <div className="text-right hidden xl:block">
                            <div className="text-2xl font-black text-gray-800 tracking-tight">{format(currentTime, 'h:mm:ss a')}</div>
                            <div className="text-xs text-gray-400 font-medium">{format(currentTime, 'dd MMMM yyyy, EEEE')}</div>
                        </div>
                    </div>
                </div>

                {/* 2. Item Entry - The "Industry" Panel */}
                <Card className="border-0 shadow-md bg-white overflow-visible z-40">
                    <CardHeader className="py-2 bg-gradient-to-r from-gray-50 to-white border-b px-4">
                        <CardTitle className="text-sm font-semibold flex gap-2 items-center text-gray-600">
                            <ShoppingCart className="h-4 w-4" /> Item Entry
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">

                        {/* Row 1: Search & Batch */}
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-6 relative">
                                <Label className="text-xs text-gray-500">Medicine Search (F2)</Label>
                                <Input
                                    ref={medSearchRef}
                                    placeholder="Type medicine name..."
                                    value={medSearch}
                                    onChange={e => { setMedSearch(e.target.value); setSelectedMed(null); }}
                                    className={cn("font-medium", selectedMed ? "border-green-500 bg-green-50" : "")}
                                    onKeyDown={e => {
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault()
                                            setFocusedMedIndex(prev => Math.min(prev + 1, filteredMeds.length - 1))
                                        }
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault()
                                            setFocusedMedIndex(prev => Math.max(prev - 1, 0))
                                        }
                                        if (e.key === 'Enter' && focusedMedIndex >= 0 && filteredMeds[focusedMedIndex]) {
                                            e.preventDefault()
                                            selectMedicine(filteredMeds[focusedMedIndex])
                                        }
                                    }}
                                />
                                {showMedSuggestions && filteredMeds.length > 0 && (
                                    <div className="absolute top-full left-0 w-full bg-white shadow-xl border rounded-md z-50 mt-1 max-h-[300px] overflow-auto">
                                        {filteredMeds.map((m, idx) => (
                                            <div
                                                key={m.id}
                                                className={cn("p-2 cursor-pointer border-b", idx === focusedMedIndex ? "bg-blue-100" : "hover:bg-blue-50")}
                                                onClick={() => selectMedicine(m)}
                                            >
                                                <div className="font-bold text-gray-800">{m.name}</div>
                                                <div className="text-xs text-gray-500">{m.pack_size_label}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="col-span-6">
                                <Label className="text-xs text-gray-500">Select Batch</Label>
                                <Select value={selectedBatch?.batch_number || ''} onValueChange={(val) => {
                                    const b = medBatches.find(x => x.batch_number === val)
                                    if (b) setSelectedBatch(b)
                                }} disabled={!selectedMed}>
                                    <SelectTrigger className="font-mono text-xs">
                                        <SelectValue placeholder={selectedMed ? "Select Batch" : "Waiting for item..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {medBatches.map(b => (
                                            <SelectItem key={b.batch_number} value={b.batch_number}>
                                                <div className="flex gap-4">
                                                    <span>{b.batch_number}</span>
                                                    <span className="text-muted-foreground">Exp: {b.expiry_date}</span>
                                                    <span className={cn("font-medium", b.remaining_units < 50 ? "text-red-500" : "text-green-600")}>
                                                        Stk: {b.remaining_units} units
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Row 2: Quantities & Pricing & Discount */}
                        <div className="grid grid-cols-12 gap-3 items-end bg-gray-50/50 p-3 rounded-md border border-dashed">
                            <div className="col-span-3">
                                <Label className="text-xs mb-1 block">Selling Mode</Label>
                                <div className="flex bg-white rounded-md border p-1">
                                    <button
                                        className={cn("flex-1 text-xs py-1 rounded transition-all", itemMode === 'Pack' ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100")}
                                        onClick={() => setItemMode('Pack')}
                                    >
                                        Pack
                                    </button>
                                    <button
                                        className={cn("flex-1 text-xs py-1 rounded transition-all", itemMode === 'Unit' ? "bg-orange-500 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100")}
                                        onClick={() => setItemMode('Unit')}
                                    >
                                        Loose
                                    </button>
                                </div>
                            </div>

                            <div className="col-span-2">
                                <Label className="text-xs">Quantity</Label>
                                <Input
                                    ref={qtyRef}
                                    type="number"
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="border-blue-300 focus:ring-blue-500 font-bold text-center"
                                    value={itemQty}
                                    onChange={e => setItemQty(e.target.value)}
                                // Removed Enter key here to force checking Discount/Price first or tabbing to them
                                />
                            </div>

                            <div className="col-span-2">
                                <Label className="text-xs">Unit Price (₹)</Label>
                                <Input
                                    type="number"
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="bg-gray-100 text-gray-500" // Styled as readonly but editable
                                    value={itemPrice}
                                    onChange={e => setItemPrice(e.target.value)}
                                />
                            </div>

                            <div className="col-span-2">
                                <Label className="text-xs">Discount (₹)</Label>
                                <Input
                                    type="number"
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="border-blue-200 text-center text-blue-700 font-medium"
                                    value={itemDiscount}
                                    onChange={e => setItemDiscount(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addItem()}
                                    placeholder="0"
                                />
                            </div>

                            <div className="col-span-3 text-right">
                                <div className="text-xs text-gray-500">Line Total</div>
                                <div className="text-xl font-bold text-blue-700">
                                    ₹{
                                        (
                                            ((parseFloat(itemQty) || 0) * (parseFloat(itemPrice) || 0)) -
                                            (parseFloat(itemDiscount) || 0)
                                        ).toFixed(2)
                                    }
                                </div>
                            </div>

                            <div className="col-span-12 pt-2">
                                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={addItem}>
                                    <Plus className="h-4 w-4 mr-1" /> Add Item to Bill
                                </Button>
                            </div>
                        </div>

                    </CardContent>
                </Card>

                {/* 3. Items List */}
                <Card className="flex-1 border-0 shadow-md overflow-hidden flex flex-col">
                    <div className="overflow-auto flex-1">
                        <Table>
                            <TableHeader className="bg-gray-50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-[40px]">#</TableHead>
                                    <TableHead>Medicine</TableHead>
                                    <TableHead>Batch / Exp</TableHead>
                                    <TableHead className="text-center">Mode</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">Disc(₹)</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cart.map((item, idx) => (
                                    <TableRow key={item.id} className="hover:bg-gray-50">
                                        <TableCell className="text-xs text-gray-400">{idx + 1}</TableCell>
                                        <TableCell className="font-medium text-gray-900">{item.medicine_name}</TableCell>
                                        <TableCell>
                                            <div className="text-xs font-mono">{item.batch_number}</div>
                                            <div className="text-[10px] text-gray-400">{item.expiry_date}</div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary" className={cn("text-[10px]", item.quantity_mode === 'Pack' ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-800")}>
                                                {item.quantity_mode}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{item.quantity}</TableCell>
                                        <TableCell className="text-right text-gray-600">₹{item.unit_price.toFixed(2)}</TableCell>
                                        <TableCell className="text-right text-red-500 text-xs">
                                            {item.discount_amount > 0 ? `-₹${item.discount_amount}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-blue-700">₹{item.total_price.toFixed(2)}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-700" onClick={() => setCart(cart.filter(x => x.id !== item.id))}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {cart.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-64 text-center text-gray-300">
                                            <div className="flex flex-col items-center justify-center">
                                                <ShoppingCart className="h-12 w-12 mb-2 opacity-20" />
                                                <p>No items in bill</p>
                                                <p className="text-xs">Press F2 to search medicines</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            </div>

            {/* RIGHT COLUMN: Summary (35%) */}
            <div className="w-[400px] flex flex-col gap-3 h-full">

                {/* DOCTOR & INFO */}
                <Card className="border-0 shadow-sm">
                    <CardHeader className="py-3 px-4 bg-purple-50 border-b">
                        <CardTitle className="text-sm text-purple-900 flex items-center gap-2">
                            <UserPlus className="h-4 w-4" /> Prescribed By
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Self">Self / Over Counter</SelectItem>
                                {doctorList.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* CALCULATIONS */}
                <Card className="flex-1 flex flex-col border-0 shadow-lg bg-gray-50">
                    <CardContent className="flex-1 p-6 space-y-6">
                        {/* Subtotal */}
                        <div className="flex justify-between items-center text-gray-600">
                            <span className="text-lg">Subtotal</span>
                            <span className="font-mono text-xl">₹{subtotal.toFixed(2)}</span>
                        </div>

                        {/* Discount */}
                        <div className="bg-white p-3 rounded-lg border shadow-sm space-y-3">
                            <div className="flex justify-between items-center mb-1">
                                <Label className="text-xs uppercase tracking-wider text-gray-500">Discount</Label>
                                <div className="flex gap-2 text-[10px]">
                                    <button onClick={() => updateDiscount('0', 'Percent')} className="text-blue-600 hover:underline">Reset</button>
                                </div>
                            </div>
                            <div className="flex gap-2 items-center">
                                <div className="relative flex-1">
                                    <Input
                                        ref={discountRef}
                                        type="number"
                                        onWheel={(e) => e.currentTarget.blur()}
                                        className={cn("pr-8 text-right font-bold", discountType === 'Percent' ? "border-blue-500 ring-1 ring-blue-200" : "")}
                                        value={discountType === 'Percent' ? discountValue : ''}
                                        onChange={e => updateDiscount(e.target.value, 'Percent')}
                                        placeholder="0"
                                    />
                                    <span className="absolute right-3 top-2 text-gray-400">%</span>
                                </div>
                                <RefreshCcw className="h-4 w-4 text-gray-300" />
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-2 text-gray-400">₹</span>
                                    <Input
                                        type="number"
                                        onWheel={(e) => e.currentTarget.blur()}
                                        className={cn("pl-6 text-right font-bold", discountType === 'Amount' ? "border-blue-500 ring-1 ring-blue-200" : "")}
                                        value={discountType === 'Amount' ? discountValue : calculatedDiscountAmt.toFixed(2)}
                                        onChange={e => updateDiscount(e.target.value, 'Amount')}
                                    />
                                </div>
                            </div>
                            {calculatedDiscountAmt > 0 && (
                                <div className="text-right text-xs text-green-600 font-medium">
                                    You save ₹{calculatedDiscountAmt.toFixed(2)}
                                </div>
                            )}
                        </div>

                        <Separator className="bg-gray-300" />

                        {/* Final Total */}
                        <div className="flex justify-between items-end">
                            <span className="text-xl font-bold text-gray-800">Net Payable</span>
                            <span className="text-4xl font-black text-gray-900 tracking-tighter">
                                <span className="text-2xl text-gray-400 font-normal mr-1">₹</span>
                                {formatCurrency(finalTotal).replace('₹', '')}
                            </span>
                        </div>

                        {/* Remark Input */}
                        <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Remarks / Notes</Label>
                            <Input
                                className="h-8 text-xs bg-white"
                                placeholder="Any notes (e.g. delivered to home)"
                                value={remark}
                                onChange={e => setRemark(e.target.value)}
                            />
                        </div>

                        {/* Payment Mode */}
                        <div className="space-y-3 mt-4">
                            <Label className="text-xs uppercase text-gray-500">Payment Mode (F4)</Label>
                            <Tabs value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)} className="w-full">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="Cash">Cash</TabsTrigger>
                                    <TabsTrigger value="Online">Online</TabsTrigger>
                                    <TabsTrigger value="Split">Split</TabsTrigger>
                                </TabsList>
                                <TabsContent value="Split" className="space-y-2 mt-2">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-[10px]">Cash</Label>
                                            <Input type="number" onWheel={(e) => e.currentTarget.blur()} value={splitCash} onChange={e => setSplitCash(e.target.value)} placeholder="0" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-[10px]">Online</Label>
                                            <Input type="number" onWheel={(e) => e.currentTarget.blur()} value={splitOnline} onChange={e => setSplitOnline(e.target.value)} placeholder="0" />
                                        </div>
                                    </div>
                                    <div className={cn("text-xs text-center font-medium", Math.abs((parseFloat(splitCash) || 0) + (parseFloat(splitOnline) || 0) - finalTotal) < 1 ? "text-green-600" : "text-red-500")}>
                                        Total: {(parseFloat(splitCash) || 0) + (parseFloat(splitOnline) || 0)} / {finalTotal}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </CardContent>

                    {/* Footer Actions */}
                    <div className="p-4 bg-white border-t space-y-3">
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setCart([])}>
                                Clear
                            </Button>
                            {/* Save Button */}
                            <Button
                                className="flex-[3] bg-green-600 hover:bg-green-700 h-12 text-lg shadow-lg shadow-green-200"
                                onClick={handleCheckout}
                                disabled={loading || cart.length === 0}
                            >
                                {loading ? (
                                    <span>Processing...</span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <CheckCircle2 className="h-6 w-6" /> Complete Sale
                                    </span>
                                )}
                            </Button>
                        </div>
                        <div className="text-center text-[10px] text-gray-400">
                            Hotkeys: F1 Patient | F2 Item | F3 Discount | Cmd+Enter Save
                        </div>
                    </div>
                </Card>
            </div>

        </div>
    )
}
