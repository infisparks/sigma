'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { CalendarIcon, Trash2, Plus, Save, ShoppingCart, CheckCircle2, AlertCircle, Package, History, PlusCircle, Keyboard, Search as SearchIcon } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// Types matching our Schema
interface Vendor {
    id: string
    name: string
}

interface ClinicMedicine {
    id: number
    name: string
    pack_size_label: string
    pack_size_quantity: number // NEW: Units per pack
}

interface PurchaseItem {
    id: string // Temp ID for React key
    medicine_id: number
    medicine_name: string
    pack_size: string

    batch_number: string
    expiry_date: string

    quantity: number // Packs
    free_quantity: number // Free Packs
    pack_size_quantity: number // Units per pack
    total_units: number // Derived ((qty + free) * pack_size_quantity)

    mrp: number
    unit_price: number // Cost Price
    total: number
}

// NEW: Type for fetched previous batches
interface ExistingBatch {
    batch_number: string
    expiry_date: string
    mrp: number
    purchase_rate: number
    pack_size_quantity: number
}

export default function PurchaseEntryPage() {
    // --- Data Sources ---
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [medicineList, setMedicineList] = useState<ClinicMedicine[]>([])
    const [loadingResources, setLoadingResources] = useState(true)

    // --- Form State: Header ---
    const [invoiceData, setInvoiceData] = useState({
        vendor_id: '',
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0]
    })

    // --- Form State: Current Item ---
    const [currentItem, setCurrentItem] = useState({
        search: '',
        medicine_id: 0,
        medicine_name: '',
        pack_size: '',
        pack_size_quantity: 1, // Default Unit

        batch_number: '',
        expiry_date: '',
        quantity: '',
        free_quantity: '0',
        mrp: '',
        unit_price: ''
    })

    // --- State: Search Logic ---
    const [filteredMeds, setFilteredMeds] = useState<ClinicMedicine[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // --- State: Existing Batches ---
    const [existingBatches, setExistingBatches] = useState<ExistingBatch[]>([])

    // --- Cart State ---
    const [cartItems, setCartItems] = useState<PurchaseItem[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAddingNewMed, setIsAddingNewMed] = useState(false)

    // --- Refs for Focus Management ---
    const batchInputRef = useRef<HTMLInputElement>(null)
    const unitInputRef = useRef<HTMLInputElement>(null)
    const qtyInputRef = useRef<HTMLInputElement>(null)
    const freeQtyInputRef = useRef<HTMLInputElement>(null)
    const mrpInputRef = useRef<HTMLInputElement>(null)
    const rateInputRef = useRef<HTMLInputElement>(null)
    const expiryInputRef = useRef<HTMLInputElement>(null)
    const addButtonRef = useRef<HTMLButtonElement>(null)
    const vendorSelectRef = useRef<HTMLButtonElement>(null)

    // --- Initialization ---
    useEffect(() => {
        const loadData = async () => {
            setLoadingResources(true)
            await Promise.all([fetchVendors(), fetchMedicines()])
            setLoadingResources(false)
        }
        loadData()
    }, [])

    // --- Global Hotkeys ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // F1: Focus Vendor Select
            if (e.key === 'F1') {
                e.preventDefault()
                vendorSelectRef.current?.focus()
            }
            // F2: Focus Medicine Search
            if (e.key === 'F2') {
                e.preventDefault()
                searchInputRef.current?.focus()
            }
            // Ctrl+Enter or Cmd+Enter: Save Purchase
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                handleSubmitPurchase()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [cartItems, invoiceData]) // Depend on state to ensure latest closures if needed, though mostly for triggering

    const fetchVendors = async () => {
        const { data } = await supabase.from('pharmacy_vendors').select('id, name')
        setVendors(data || [])
    }

    const fetchMedicines = async () => {
        // Fetch only Local Clinic Medicines with their UNITS configuration
        const { data } = await supabase.from('clinic_medicine').select('id, name, pack_size_label, pack_size_quantity').order('name')
        setMedicineList(data || [])
    }

    // --- Search Logic ---
    // --- Search Logic with Keyboard ---
    const [focusedIndex, setFocusedIndex] = useState(-1) // NEW: Track keyboard selection

    useEffect(() => {
        // If an item is selected, hide suggestions
        if (currentItem.medicine_id) {
            setShowSuggestions(false)
            setFocusedIndex(-1)
            return
        }

        if (currentItem.search.length > 1) {
            const lowerSearch = currentItem.search.toLowerCase()
            const matches = medicineList
                .filter(m => m.name.toLowerCase().includes(lowerSearch))
                .slice(0, 10) // Limit to 10 suggestions
            setFilteredMeds(matches)
            setShowSuggestions(true)
            setFocusedIndex(-1) // Reset selection on new search
        } else {
            setFilteredMeds([])
            setShowSuggestions(false)
            setFocusedIndex(-1)
        }
    }, [currentItem.search, medicineList, currentItem.medicine_id])

    // Handle Keyboard Navigation in Dropdown
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions) return

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setFocusedIndex(prev => (prev < filteredMeds.length - 1 ? prev + 1 : prev))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (focusedIndex >= 0 && focusedIndex < filteredMeds.length) {
                selectMedicine(filteredMeds[focusedIndex])
            } else if (filteredMeds.length === 0) {
                // If enter pressed and no matches, trigger quick add
                handleQuickAddMedicine()
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false)
        }
    }

    // --- Actions ---
    const selectMedicine = async (med: ClinicMedicine) => {
        setCurrentItem(prev => ({
            ...prev,
            medicine_id: med.id,
            medicine_name: med.name,
            pack_size: med.pack_size_label,
            pack_size_quantity: med.pack_size_quantity || 1, // Auto-fill Unit from DB
            search: med.name,
            // Reset others
            batch_number: '',
            expiry_date: '',
        }))
        setShowSuggestions(false)

        // Fetch existing batches via RPC
        const { data } = await supabase
            .rpc('get_current_stock', { p_medicine_id: med.id })

        setExistingBatches(data || [])

        // Focus Flow: Medicine -> Batch -> Units -> Qty...
        batchInputRef.current?.focus()
    }

    const selectExistingBatch = (batch: ExistingBatch) => {
        setCurrentItem(prev => ({
            ...prev,
            batch_number: batch.batch_number,
            expiry_date: batch.expiry_date,
            mrp: batch.mrp.toString(),
            unit_price: batch.purchase_rate.toString(),
            pack_size_quantity: batch.pack_size_quantity || prev.pack_size_quantity // Use batch's unit def if available
        }))
        // Focus Qty directly since batch info is filled
        qtyInputRef.current?.focus()
    }

    // NEW: Handle Quick Add Medicine
    const handleQuickAddMedicine = async () => {
        const newName = currentItem.search.trim()
        if (!newName) return

        setIsAddingNewMed(true)

        const newMedPayload = {
            name: newName,
            pack_size_label: '1 Pack', // Default
            pack_size_quantity: 1, // Default
            hsn_code: '3004', // Default generic HSN
            original_medicine_id: null // Manual entry
        }

        try {
            const { data, error } = await supabase
                .from('clinic_medicine')
                .insert(newMedPayload)
                .select('id, name, pack_size_label, pack_size_quantity')
                .single()

            if (error) throw error

            // Update local state and select it
            setMedicineList(prev => [...prev, data])
            selectMedicine(data)

        } catch (e: any) {
            console.error(e)
            alert('Failed to add medicine: ' + e.message)
        } finally {
            setIsAddingNewMed(false)
        }
    }


    const addToCart = () => {
        // Validation
        if (!currentItem.medicine_id) return alert("Select a medicine first")
        if (!currentItem.batch_number) return alert("Enter Batch Number")
        if (!currentItem.quantity) return alert("Enter Quantity")
        if (!currentItem.pack_size_quantity) return alert("Enter Units per Pack")
        if (!currentItem.mrp) return alert("Enter MRP")
        if (!currentItem.unit_price) return alert("Enter Purchase Rate")
        if (!currentItem.expiry_date) return alert("Enter Expiry Date")

        const qty = parseInt(currentItem.quantity)
        const free = parseInt(currentItem.free_quantity) || 0
        const units = currentItem.pack_size_quantity
        const rate = parseFloat(currentItem.unit_price) // Cost per pack
        const total = qty * rate

        const newItem: PurchaseItem = {
            id: Math.random().toString(36),
            medicine_id: currentItem.medicine_id,
            medicine_name: currentItem.medicine_name,
            pack_size: currentItem.pack_size,

            batch_number: currentItem.batch_number,
            expiry_date: currentItem.expiry_date,

            quantity: qty,
            free_quantity: free,
            pack_size_quantity: units, // Save this!
            total_units: (qty + free) * units, // Calculated with FREE quantity

            mrp: parseFloat(currentItem.mrp),
            unit_price: rate,
            total: total
        }

        setCartItems([newItem, ...cartItems])

        // Reset Item Form & Focus back to search
        setCurrentItem({
            search: '',
            medicine_id: 0,
            medicine_name: '',
            pack_size: '',
            pack_size_quantity: 1,
            batch_number: '',
            expiry_date: '',
            quantity: '',
            free_quantity: '0',
            mrp: '',
            unit_price: ''
        })
        setExistingBatches([]) // Clear batch suggestions
        searchInputRef.current?.focus()
    }

    const removeCartItem = (id: string) => {
        setCartItems(cartItems.filter(i => i.id !== id))
    }

    const handleSubmitPurchase = async () => {
        if (!invoiceData.vendor_id) return alert("Please select a vendor")
        if (!invoiceData.invoice_number) return alert("Please enter invoice number")
        if (cartItems.length === 0) return alert("Add items to the purchase list first")

        setIsSubmitting(true)

        const totalAmount = cartItems.reduce((sum, item) => sum + item.total, 0)

        // Prepare payload for NEW RPC
        const rpcPayload = {
            p_vendor_id: invoiceData.vendor_id,
            p_invoice_number: invoiceData.invoice_number,
            p_invoice_date: invoiceData.invoice_date,
            p_total_amount: totalAmount,
            p_items: cartItems.map(item => ({
                medicine_id: item.medicine_id,
                batch_number: item.batch_number,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                free_quantity: item.free_quantity, // PASS FREE QTY
                pack_size_quantity: item.pack_size_quantity, // PASS UNIT INFO
                mrp: item.mrp,
                unit_price: item.unit_price,
                total_amount: item.total
            }))
        }

        try {
            const { data, error } = await supabase.rpc('save_purchase_entry', rpcPayload)

            if (error) throw error

            // Redirect to Bill Page
            window.open(`/pharmacy/purchase_bill/${data}`, '_blank')

            // Reload page to reset state and stock
            window.location.reload()
        } catch (error: any) {
            console.error('Submission Error:', error)
            alert('Failed to save purchase: ' + error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const totalInvoiceValue = cartItems.reduce((sum, item) => sum + item.total, 0)

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-300">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                    <ShoppingCart className="h-8 w-8 text-blue-600" />
                    New Purchase Entry
                    <div className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground bg-white px-3 py-1 rounded-full border shadow-sm">
                        <Keyboard className="h-4 w-4" />
                        <span>Shortcuts:</span>
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded border font-mono text-gray-700">F1</span> Vendor
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded border font-mono text-gray-700">F2</span> Focus Search
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded border font-mono text-gray-700">Enter</span> Next Field
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded border font-mono text-gray-700">⌘+Enter</span> Save
                    </div>
                </h1>
                <p className="text-muted-foreground mt-1">
                    Record new stock. We now track <strong>total loose units</strong> for granular inventory control.
                </p>
            </div>

            {/* Invoice Header Form */}
            <Card className="border-none shadow-sm bg-white">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="space-y-2">
                            <Label className="flex justify-between">
                                Select Vendor
                                <span className="text-[10px] text-gray-400 font-mono">F1</span>
                            </Label>
                            <Select
                                value={invoiceData.vendor_id}
                                onValueChange={v => setInvoiceData(prev => ({ ...prev, vendor_id: v }))}
                            >
                                <SelectTrigger ref={vendorSelectRef}>
                                    <SelectValue placeholder="Identify Supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                    {vendors.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Invoice Number</Label>
                            <Input
                                placeholder="e.g. INV-2024-001"
                                value={invoiceData.invoice_number}
                                onChange={e => setInvoiceData(prev => ({ ...prev, invoice_number: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Invoice Date</Label>
                            <Input
                                type="date"
                                value={invoiceData.invoice_date}
                                onChange={e => setInvoiceData(prev => ({ ...prev, invoice_date: e.target.value }))}
                            />
                        </div>
                        <div className="flex flex-col justify-end">
                            <div className="bg-blue-50 text-blue-900 px-4 py-2 rounded-md border border-blue-100 flex justify-between items-center">
                                <span className="text-sm font-medium">Invoice Total</span>
                                <span className="text-xl font-bold">₹{totalInvoiceValue.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Entry Row */}
            <Card className="border-blue-200 border shadow-md bg-white overflow-visible z-10">
                <CardHeader className="py-4 bg-gray-50/80 border-b flex flex-row justify-between items-center">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-2">
                        Add Items to Stock
                        <span className="text-[10px] font-normal text-muted-foreground ml-2">(Press <kbd className="font-mono bg-gray-100 px-1 rounded">F2</kbd> to start)</span>
                    </CardTitle>

                    {/* NEW: Existing Batches Quick Select */}
                    {currentItem.medicine_id > 0 && existingBatches.length > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4">
                            <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                                <History className="h-3 w-3" /> Recent Batches:
                            </span>
                            <div className="flex gap-2">
                                {existingBatches.map((batch, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => selectExistingBatch(batch)}
                                        className="text-[10px] bg-blue-100/50 hover:bg-blue-100 border border-blue-200 text-blue-800 px-2 py-1 rounded-full transition-colors font-mono"
                                        title={`Exp: ${batch.expiry_date} | MRP: ₹${batch.mrp}`}
                                    >
                                        {batch.batch_number}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent className="pt-6 overflow-visible">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        {/* 1. Medicine Search */}
                        <div className="flex-1 space-y-2 relative min-w-[250px] z-50">
                            <Label className="flex justify-between">
                                Medicine Name
                                <span className="text-[10px] text-gray-400 font-mono">F2</span>
                            </Label>
                            <div className="relative">
                                <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                    ref={searchInputRef}
                                    value={currentItem.search}
                                    onChange={e => setCurrentItem({ ...currentItem, search: e.target.value, medicine_id: 0 })}
                                    placeholder="Type to search..."
                                    onKeyDown={handleSearchKeyDown}
                                    className={cn("pl-9", currentItem.medicine_id ? "border-green-500 bg-green-50" : "")}
                                />
                            </div>
                            {showSuggestions && (
                                <div className="absolute top-full left-0 w-full mt-1 bg-white border rounded-md shadow-xl z-[100] max-h-[300px] overflow-auto">
                                    {filteredMeds.map((med, idx) => (
                                        <div
                                            key={med.id}
                                            className={cn(
                                                "px-4 py-2 cursor-pointer border-b last:border-0",
                                                idx === focusedIndex ? "bg-blue-100" : "hover:bg-blue-50"
                                            )}
                                            onClick={() => selectMedicine(med)}
                                        >
                                            <div className="font-medium text-gray-900">{med.name}</div>
                                            <div className="text-xs text-gray-500">{med.pack_size_label}</div>
                                        </div>
                                    ))}
                                    {filteredMeds.length === 0 && (
                                        <div
                                            className="p-3 text-center cursor-pointer hover:bg-blue-50 transition-colors group"
                                            onClick={handleQuickAddMedicine}
                                        >
                                            <div className="text-xs text-gray-500">Medicine not found?</div>
                                            <div className="text-sm font-semibold text-blue-600 flex items-center justify-center gap-2 mt-1">
                                                {isAddingNewMed ? (
                                                    <span>Adding...</span>
                                                ) : (
                                                    <>
                                                        <PlusCircle className="h-4 w-4" />
                                                        Add "{currentItem.search}" to Database
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. Batch */}
                        <div className="w-[120px] space-y-2">
                            <Label>Batch No.</Label>
                            <Input
                                ref={batchInputRef}
                                value={currentItem.batch_number}
                                onChange={e => setCurrentItem(prev => ({ ...prev, batch_number: e.target.value }))}
                                placeholder="BATCH123"
                                className="uppercase font-mono"
                                onKeyDown={e => e.key === 'Enter' && unitInputRef.current?.focus()}
                            />
                        </div>

                        {/* NEW: Units Per Pack */}
                        <div className="w-[90px] space-y-2">
                            <Label className="text-blue-700">Unit/Pack</Label>
                            <Input
                                ref={unitInputRef}
                                type="number"
                                value={currentItem.pack_size_quantity}
                                onWheel={(e) => e.currentTarget.blur()}
                                onChange={e => setCurrentItem(prev => ({ ...prev, pack_size_quantity: parseInt(e.target.value) || 1 }))}
                                className="bg-blue-50 border-blue-200"
                                title="How many tablets in this strip?"
                                onKeyDown={e => e.key === 'Enter' && qtyInputRef.current?.focus()}
                            />
                        </div>

                        {/* 3. Quantity */}
                        <div className="w-[90px] space-y-2">
                            <Label>Qty (Packs)</Label>
                            <Input
                                ref={qtyInputRef}
                                type="number"
                                value={currentItem.quantity}
                                onChange={e => setCurrentItem(prev => ({ ...prev, quantity: e.target.value }))}
                                placeholder="0"
                                onKeyDown={e => e.key === 'Enter' && freeQtyInputRef.current?.focus()}
                            />
                        </div>

                        {/* 3.1 Free Quantity - NEW */}
                        <div className="w-[90px] space-y-2">
                            <Label className="text-green-600">Free Qty</Label>
                            <Input
                                ref={freeQtyInputRef}
                                type="number"
                                value={currentItem.free_quantity}
                                onChange={e => setCurrentItem(prev => ({ ...prev, free_quantity: e.target.value }))}
                                placeholder="0"
                                className="bg-green-50 border-green-200"
                                onKeyDown={e => e.key === 'Enter' && mrpInputRef.current?.focus()}
                            />
                        </div>

                        {/* 4. MRP */}
                        <div className="w-[90px] space-y-2">
                            <Label>MRP</Label>
                            <Input
                                ref={mrpInputRef}
                                type="number"
                                step="0.01"
                                value={currentItem.mrp}
                                onChange={e => setCurrentItem(prev => ({ ...prev, mrp: e.target.value }))}
                                placeholder="0.00"
                                onKeyDown={e => e.key === 'Enter' && rateInputRef.current?.focus()}
                            />
                        </div>

                        {/* 5. Purchase Rate */}
                        <div className="w-[90px] space-y-2">
                            <Label>Rate (Cost)</Label>
                            <Input
                                ref={rateInputRef}
                                type="number"
                                step="0.01"
                                value={currentItem.unit_price}
                                onChange={e => setCurrentItem(prev => ({ ...prev, unit_price: e.target.value }))}
                                placeholder="0.00"
                                onKeyDown={e => e.key === 'Enter' && expiryInputRef.current?.focus()}
                            />
                        </div>

                        {/* 6. Expiry */}
                        <div className="w-[140px] space-y-2">
                            <Label>Expiry Date</Label>
                            <Input
                                ref={expiryInputRef}
                                type="date"
                                value={currentItem.expiry_date}
                                onChange={e => setCurrentItem(prev => ({ ...prev, expiry_date: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && addButtonRef.current?.focus()}
                            />
                        </div>

                        {/* 7. Add Button */}
                        <Button
                            ref={addButtonRef}
                            onClick={addToCart}
                            className="bg-blue-600 hover:bg-blue-700 w-[100px]"
                        >
                            <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Items Table */}
            <Card className="min-h-[300px]">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50">
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Medicine Info</TableHead>
                            <TableHead className="w-[120px]">Batch</TableHead>
                            <TableHead className="w-[80px] text-right">Pack Info</TableHead>
                            <TableHead className="w-[80px] text-right">Qty + Free</TableHead>
                            <TableHead className="w-[80px] text-right">Total Units</TableHead>
                            <TableHead className="text-right w-[100px]">Rate</TableHead>
                            <TableHead className="text-right w-[120px]">Purchase Amount</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cartItems.map((item, idx) => (
                            <TableRow key={item.id}>
                                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell>
                                    <div className="font-medium">{item.medicine_name}</div>
                                    <div className="text-xs text-muted-foreground">{item.pack_size}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="font-mono text-xs">{item.batch_number}</div>
                                    <div className="text-xs text-gray-500">Exp: {item.expiry_date}</div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="text-xs text-gray-500">x {item.pack_size_quantity} units/pack</div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="font-medium text-gray-900">{item.quantity} + <span className="text-green-600">{item.free_quantity}</span></div>
                                </TableCell>
                                <TableCell className="text-right font-medium text-blue-700 bg-blue-50/50">
                                    {item.total_units} units
                                </TableCell>
                                <TableCell className="text-right text-gray-500">
                                    <div>₹{item.unit_price.toFixed(2)}</div>
                                    <div className="text-[10px]">MRP: ₹{item.mrp}</div>
                                </TableCell>
                                <TableCell className="text-right font-bold text-gray-900">₹{item.total.toFixed(2)}</TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 h-8 w-8" onClick={() => removeCartItem(item.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {cartItems.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                    No items added yet. Search and add medicines above.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>


            {/* Footer Actions */}
            <div className="flex justify-end pt-4 bg-white/50 backdrop-blur-sm sticky bottom-0 p-4 border-t border-gray-200 shadow-up">
                <div className="flex items-center gap-4">
                    <div className="text-right mr-4">
                        <div className="text-sm text-gray-500">Total Items: {cartItems.length}</div>
                        <div className="text-2xl font-bold text-blue-900">Total: ₹{totalInvoiceValue.toFixed(2)}</div>
                    </div>
                    <Button
                        size="lg"
                        className="bg-green-600 hover:bg-green-700 text-white min-w-[200px]"
                        disabled={isSubmitting || cartItems.length === 0}
                        onClick={handleSubmitPurchase}
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                Saving...
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5" />
                                Save Purchase <span className="ml-1 text-xs opacity-80">(Ctrl+Enter)</span>
                            </div>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
