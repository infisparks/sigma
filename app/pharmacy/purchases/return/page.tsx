'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Badge } from '@/components/ui/badge'
import { Trash2, Plus, ShoppingCart, CheckCircle2, History, Keyboard, Search as SearchIcon, Undo2, AlertCircle, PlusCircle, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// Types
interface Vendor {
    id: string
    name: string
}

interface ClinicMedicine {
    id: number
    name: string
    pack_size_label: string
    pack_size_quantity: number
    gst_percentage: number
}

interface ReturnItem {
    id: string
    medicine_id: number
    medicine_name: string
    pack_size: string
    batch_number: string
    expiry_date: string
    quantity: number // Packs to return
    pack_size_quantity: number
    total_units: number
    mrp: number
    unit_price: number // Cost Price
    gst_percent: number
    gst_amount: number
    total: number
}

interface ExistingBatch {
    batch_number: string
    expiry_date: string
    mrp: number
    purchase_rate: number
    pack_size_quantity: number
    quantity: number // Available Packs
    remaining_units: number // Total Loose Units
}

export default function PurchaseReturnPage() {
    const router = useRouter()

    // --- Data Sources ---
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [medicineList, setMedicineList] = useState<ClinicMedicine[]>([])
    const [loadingResources, setLoadingResources] = useState(true)

    // --- Form State: Header ---
    const [headerData, setHeaderData] = useState({
        vendor_id: '',
        return_date: new Date().toISOString().split('T')[0],
        reason: ''
    })

    // --- Form State: Current Item ---
    const [currentItem, setCurrentItem] = useState({
        search: '',
        medicine_id: 0,
        medicine_name: '',
        pack_size: '',
        pack_size_quantity: 1,

        batch_number: '',
        expiry_date: '',
        quantity: '', // Packs to return
        mrp: '',
        unit_price: '',
        gst_percent: '12',
        available: 0 // Available packs in stock
    })

    // --- State: Search Logic ---
    const [filteredMeds, setFilteredMeds] = useState<ClinicMedicine[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [focusedIndex, setFocusedIndex] = useState(-1)

    // --- State: Existing Batches ---
    const [existingBatches, setExistingBatches] = useState<ExistingBatch[]>([])

    // --- Cart State ---
    const [cartItems, setCartItems] = useState<ReturnItem[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    // --- Refs for Focus Management ---
    const batchInputRef = useRef<HTMLInputElement>(null)
    const qtyInputRef = useRef<HTMLInputElement>(null)
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

    const fetchVendors = async () => {
        const { data } = await supabase.from('pharmacy_vendors').select('id, name')
        setVendors(data || [])
    }

    const fetchMedicines = async () => {
        const { data } = await supabase.from('clinic_medicine').select('id, name, pack_size_label, pack_size_quantity, gst_percentage').order('name')
        setMedicineList(data || [])
    }

    // --- Hotkeys ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F1') {
                e.preventDefault()
                vendorSelectRef.current?.focus()
            }
            if (e.key === 'F2') {
                e.preventDefault()
                searchInputRef.current?.focus()
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                handleSubmitReturn()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [cartItems, headerData])

    // --- Search Logic ---
    useEffect(() => {
        if (currentItem.medicine_id) {
            setShowSuggestions(false)
            setFocusedIndex(-1)
            return
        }

        if (currentItem.search.length > 1) {
            const lowerSearch = currentItem.search.toLowerCase()
            const matches = medicineList
                .filter(m => m.name.toLowerCase().includes(lowerSearch))
                .slice(0, 10)
            setFilteredMeds(matches)
            setShowSuggestions(true)
            setFocusedIndex(-1)
        } else {
            setFilteredMeds([])
            setShowSuggestions(false)
            setFocusedIndex(-1)
        }
    }, [currentItem.search, medicineList, currentItem.medicine_id])

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
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false)
        }
    }

    const selectMedicine = async (med: ClinicMedicine) => {
        setCurrentItem(prev => ({
            ...prev,
            medicine_id: med.id,
            medicine_name: med.name,
            pack_size: med.pack_size_label,
            pack_size_quantity: med.pack_size_quantity || 1,
            search: med.name,
            gst_percent: med.gst_percentage?.toString() || '12',
            batch_number: '',
            expiry_date: '',
            available: 0
        }))
        setShowSuggestions(false)

        const { data, error } = await supabase
            .rpc('pharmacy_get_current_stock', { p_medicine_id: med.id })

        if (error) {
            console.error('Error fetching stock:', error)
            setExistingBatches([])
        } else {
            console.log('Fetched batches:', data)
            setExistingBatches(data || [])
        }
    }

    const selectExistingBatch = (batch: ExistingBatch) => {
        setCurrentItem(prev => ({
            ...prev,
            batch_number: batch.batch_number,
            expiry_date: batch.expiry_date,
            mrp: batch.mrp.toString(),
            unit_price: batch.purchase_rate.toString(),
            available: batch.quantity,
            pack_size_quantity: batch.pack_size_quantity || prev.pack_size_quantity
        }))
        qtyInputRef.current?.focus()
    }

    const addToCart = () => {
        if (!currentItem.medicine_id) return alert("Select a medicine first")
        if (!currentItem.batch_number) return alert("Select Batch")
        if (!currentItem.quantity || parseInt(currentItem.quantity) <= 0) return alert("Enter valid quantity")

        const returnQty = parseInt(currentItem.quantity)
        if (returnQty > currentItem.available) {
            return alert(`Cannot return more than available stock (${currentItem.available} packs)`)
        }

        const rate = parseFloat(currentItem.unit_price)
        const gstPercent = parseFloat(currentItem.gst_percent) || 0

        const total = returnQty * rate
        const taxableAmountLine = total / (1 + (gstPercent / 100))
        const gstAmountLine = total - taxableAmountLine

        const newItem: ReturnItem = {
            id: Math.random().toString(36),
            medicine_id: currentItem.medicine_id,
            medicine_name: currentItem.medicine_name,
            pack_size: currentItem.pack_size,
            batch_number: currentItem.batch_number,
            expiry_date: currentItem.expiry_date,
            quantity: returnQty,
            pack_size_quantity: currentItem.pack_size_quantity,
            total_units: returnQty * currentItem.pack_size_quantity,
            mrp: parseFloat(currentItem.mrp),
            unit_price: rate,
            gst_percent: gstPercent,
            gst_amount: gstAmountLine,
            total: total
        }

        setCartItems([newItem, ...cartItems])

        setCurrentItem({
            search: '',
            medicine_id: 0,
            medicine_name: '',
            pack_size: '',
            pack_size_quantity: 1,
            batch_number: '',
            expiry_date: '',
            quantity: '',
            mrp: '',
            unit_price: '',
            gst_percent: '12',
            available: 0
        })
        setExistingBatches([])
        searchInputRef.current?.focus()
    }

    const removeCartItem = (id: string) => {
        setCartItems(cartItems.filter(i => i.id !== id))
    }

    const handleSubmitReturn = async () => {
        if (!headerData.vendor_id) return alert("Please select a vendor")
        if (!headerData.reason) return alert("Please provide a reason for return")
        if (cartItems.length === 0) return alert("Add items to return list")

        setIsSubmitting(true)
        const totalAmount = cartItems.reduce((sum, item) => sum + item.total, 0)

        const rpcPayload = {
            p_vendor_id: headerData.vendor_id,
            p_reason: headerData.reason,
            p_total_amount: totalAmount,
            p_items: cartItems.map(item => ({
                medicine_id: item.medicine_id,
                batch_number: item.batch_number,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                pack_size_quantity: item.pack_size_quantity,
                mrp: item.mrp,
                unit_price: item.unit_price,
                gst_percent: item.gst_percent,
                gst_amount: item.gst_amount,
                total_amount: item.total
            }))
        }

        try {
            const { data, error } = await supabase.rpc('pharmacy_save_purchase_return', rpcPayload)
            if (error) throw error

            alert("Return recorded successfully!")
            window.location.href = '/pharmacy/purchases'
        } catch (error: any) {
            console.error('Submission Error:', error)
            alert('Failed to save return: ' + error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const totalReturnValue = cartItems.reduce((sum, item) => sum + item.total, 0)

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-300">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                    <Undo2 className="h-8 w-8 text-red-600" />
                    New Purchase Return
                    <div className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground bg-white px-3 py-1 rounded-full border shadow-sm">
                        <Keyboard className="h-4 w-4" />
                        <span>Shortcuts:</span>
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded border font-mono text-gray-700">F1</span> Vendor
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded border font-mono text-gray-700">F2</span> Focus Search
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded border font-mono text-gray-700">⌘+Enter</span> Save
                    </div>
                </h1>
                <p className="text-muted-foreground mt-1">
                    Debit Note Generation • Rejecting stock and returning to vendor.
                </p>
            </div>

            {/* Header Form */}
            <Card className="border-none shadow-sm bg-white">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1 space-y-2">
                            <Label className="flex justify-between">
                                Select Vendor
                                <span className="text-[10px] text-gray-400 font-mono">F1</span>
                            </Label>
                            <Select
                                value={headerData.vendor_id}
                                onValueChange={v => setHeaderData(prev => ({ ...prev, vendor_id: v }))}
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
                        <div className="md:col-span-1 space-y-2">
                            <Label>Return Date</Label>
                            <Input
                                type="date"
                                value={headerData.return_date}
                                onChange={e => setHeaderData(prev => ({ ...prev, return_date: e.target.value }))}
                            />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                            <Label>Reason for Return</Label>
                            <Input
                                placeholder="e.g. Near expiry, Damaged, Excess stock..."
                                value={headerData.reason}
                                onChange={e => setHeaderData(prev => ({ ...prev, reason: e.target.value }))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Entry Row Card */}
            <Card className="border-red-200 border shadow-md bg-white overflow-visible z-10">
                <CardHeader className="py-4 bg-red-50/50 border-b flex flex-row justify-between items-center">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-red-600 flex items-center gap-2">
                        Reject Items from Stock
                        <span className="text-[10px] font-normal text-muted-foreground ml-2">(Press <kbd className="font-mono bg-gray-100 px-1 rounded">F2</kbd> to start)</span>
                    </CardTitle>

                    {/* Batch Selection - Enhanced Table View */}
                    {currentItem.medicine_id > 0 && (
                        <div className="animate-in slide-in-from-top-2 duration-300">
                            <Label className="text-xs font-bold uppercase text-red-600 mb-3 block flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Available Batches in Stock
                            </Label>

                            <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                                <Table>
                                    <TableHeader className="bg-gray-50">
                                        <TableRow className="h-10 hover:bg-transparent">
                                            <TableHead className="text-xs font-bold py-2">Batch Number</TableHead>
                                            <TableHead className="text-xs font-bold py-2">Expiry</TableHead>
                                            <TableHead className="text-xs font-bold py-2 text-right">Available Packs</TableHead>
                                            <TableHead className="text-xs font-bold py-2 text-right border-l bg-blue-50/30">Total Units</TableHead>
                                            <TableHead className="text-xs font-bold py-2 text-right">Cost Rate</TableHead>
                                            <TableHead className="text-xs font-bold py-2 text-center w-[100px]">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {existingBatches.length > 0 ? (
                                            existingBatches.map((b, i) => (
                                                <TableRow
                                                    key={i}
                                                    className={cn(
                                                        "h-12 transition-colors cursor-pointer",
                                                        currentItem.batch_number === b.batch_number ? "bg-red-50" : "hover:bg-gray-50/80"
                                                    )}
                                                    onClick={() => selectExistingBatch(b)}
                                                >
                                                    <TableCell className="py-2">
                                                        <div className="font-mono font-bold text-gray-900">{b.batch_number}</div>
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <Badge variant="outline" className="text-[10px] font-medium border-red-100 text-red-600">
                                                            {b.expiry_date}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-2 text-right font-medium">
                                                        {b.quantity} <span className="text-gray-400 text-[10px] ml-1 uppercase">Packs</span>
                                                    </TableCell>
                                                    <TableCell className="py-2 text-right font-bold text-blue-700 border-l bg-blue-50/30">
                                                        {b.remaining_units} <span className="text-blue-400 text-[10px] ml-1 uppercase">Units</span>
                                                    </TableCell>
                                                    <TableCell className="py-2 text-right font-mono text-xs">
                                                        ₹{b.purchase_rate.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="py-2 text-center">
                                                        <Button
                                                            size="sm"
                                                            variant={currentItem.batch_number === b.batch_number ? "default" : "outline"}
                                                            className={cn(
                                                                "h-7 text-[10px] px-3",
                                                                currentItem.batch_number === b.batch_number ? "bg-red-600 hover:bg-red-700" : "border-red-200 text-red-600 hover:bg-red-50"
                                                            )}
                                                        >
                                                            {currentItem.batch_number === b.batch_number ? "Selected" : "Select"}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic text-sm">
                                                    No stock available for this medicine in any batch.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent className="pt-6 overflow-visible">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        {/* Medicine Search */}
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
                                    onChange={e => setCurrentItem({ ...currentItem, search: e.target.value, medicine_id: 0, batch_number: '' })}
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
                                                idx === focusedIndex ? "bg-red-100" : "hover:bg-red-50"
                                            )}
                                            onClick={() => selectMedicine(med)}
                                        >
                                            <div className="font-medium text-gray-900">{med.name}</div>
                                            <div className="text-xs text-gray-500">{med.pack_size_label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="w-[140px] space-y-2">
                            <Label>Batch Number</Label>
                            <Input
                                ref={batchInputRef}
                                value={currentItem.batch_number}
                                readOnly
                                placeholder="Pick a batch"
                                className="bg-gray-50 font-mono text-sm"
                            />
                        </div>

                        <div className="w-[100px] space-y-2">
                            <Label>Available</Label>
                            <Input
                                readOnly
                                value={currentItem.available ? `${currentItem.available} Pk` : '-'}
                                className="bg-gray-100 text-center font-bold text-gray-600"
                            />
                        </div>

                        <div className="w-[100px] space-y-2">
                            <Label className="text-red-700 font-bold">Return Qty</Label>
                            <Input
                                ref={qtyInputRef}
                                type="number"
                                value={currentItem.quantity}
                                onChange={e => setCurrentItem(prev => ({ ...prev, quantity: e.target.value }))}
                                placeholder="0"
                                className="border-red-300 focus:ring-red-200"
                                onKeyDown={e => e.key === 'Enter' && addButtonRef.current?.focus()}
                            />
                        </div>

                        <div className="w-[100px] space-y-2">
                            <Label>Rate (Cost)</Label>
                            <Input
                                readOnly
                                value={currentItem.unit_price ? `₹${currentItem.unit_price}` : '-'}
                                className="bg-gray-50 font-mono text-xs text-right"
                            />
                        </div>

                        <Button
                            ref={addButtonRef}
                            onClick={addToCart}
                            className="bg-red-600 hover:bg-red-700 w-[120px]"
                        >
                            <Plus className="h-4 w-4 mr-1" /> Add to List
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Items Table */}
            <Card className="min-h-[300px] border-none shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50 border-b">
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Medicine Info</TableHead>
                            <TableHead className="w-[150px]">Batch Details</TableHead>
                            <TableHead className="w-[100px] text-right">Qty (Packs)</TableHead>
                            <TableHead className="w-[120px] text-right">Rate / Pack</TableHead>
                            <TableHead className="text-right w-[100px]">GST %</TableHead>
                            <TableHead className="w-[140px] text-right">Return Amount</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cartItems.map((item, idx) => (
                            <TableRow key={item.id} className="hover:bg-red-50/20">
                                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell>
                                    <div className="font-bold text-gray-800 uppercase text-xs">{item.medicine_name}</div>
                                    <div className="text-[10px] text-muted-foreground">{item.pack_size}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="font-mono text-xs text-blue-700">{item.batch_number}</div>
                                    <div className="text-[10px] text-gray-500">Exp: {item.expiry_date}</div>
                                </TableCell>
                                <TableCell className="text-right font-bold text-red-600">
                                    {item.quantity} Packs
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                    ₹{item.unit_price.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                    {item.gst_percent}%
                                </TableCell>
                                <TableCell className="text-right font-bold text-gray-900 bg-red-50/30">
                                    ₹{item.total.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeCartItem(item.id)}
                                        className="text-red-400 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {cartItems.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2 opacity-30">
                                        <Undo2 className="h-10 w-10" />
                                        <p>No items added for return. Search above.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* Sticky Footer */}
            <div className="flex justify-end pt-4 bg-white/50 backdrop-blur-sm sticky bottom-0 p-4 border-t border-gray-200 shadow-up">
                <div className="flex items-center gap-4">
                    <div className="text-right mr-4">
                        <div className="text-sm text-gray-500">Items to Return: {cartItems.length}</div>
                        <div className="text-2xl font-bold text-red-700">Total Credit: ₹{totalReturnValue.toFixed(2)}</div>
                    </div>
                    <Button
                        size="lg"
                        className="bg-red-600 hover:bg-red-700 text-white min-w-[200px] h-14 text-lg font-bold shadow-lg shadow-red-200"
                        disabled={isSubmitting || cartItems.length === 0}
                        onClick={handleSubmitReturn}
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-2">
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                                Submitting...
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-6 w-6" />
                                Confirm Return <span className="ml-1 text-[10px] opacity-70 font-normal">(Ctrl+Enter)</span>
                            </div>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
