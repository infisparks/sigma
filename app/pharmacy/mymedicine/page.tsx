'use client'

import React, { useState, useEffect, useCallback } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Plus, Search, Save, Pill, Building2, Trash2, Check, ExternalLink, RefreshCw, X, Settings2, PenLine } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
interface GlobalMedicine {
    id: number
    name: string
    manufacturer_name: string
    pack_size_label: string
}

interface SelectedImportMedicine extends GlobalMedicine {
    items_per_pack: number
    hsn: string
    is_manual?: boolean // NEW: Check for manual entry
}

interface ClinicMedicine {
    id: number
    name: string
    pack_size_label: string
    pack_size_quantity: number
    hsn_code: string
    vendor_id?: string
    original_medicine_id?: number
    // New Fields
    manufacturer?: string
    generic_name?: string
    rack_location?: string
    min_stock_alert?: number
    category?: string
    gst_percentage?: number
    description?: string
    max_stock_limit?: number
}

interface Vendor {
    id: string
    name: string
}

export default function MyMedicinePage() {
    // --- State ---
    const [clinicMedicines, setClinicMedicines] = useState<ClinicMedicine[]>([])
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // View State: 'list' | 'add'
    const [view, setView] = useState<'list' | 'add'>('list')

    // Add/Import State
    const [importSearch, setImportSearch] = useState('')
    const [importResults, setImportResults] = useState<GlobalMedicine[]>([])
    const [importLoading, setImportLoading] = useState(false)
    const [selectedGlobalMeds, setSelectedGlobalMeds] = useState<SelectedImportMedicine[]>([])
    const [bulkVendor, setBulkVendor] = useState<string>('')

    // Edit Mode State
    const [editingProduct, setEditingProduct] = useState<ClinicMedicine | null>(null)
    const [isEditOpen, setIsEditOpen] = useState(false)


    // --- Effects ---
    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        await Promise.all([fetchClinicMedicines(), fetchVendors()])
        setLoading(false)
    }

    const fetchClinicMedicines = async () => {
        const { data, error } = await supabase
            .from('clinic_medicine')
            .select('*')
            .order('id', { ascending: true })

        if (error) {
            console.error('Error fetching clinic medicines:', error)
        } else {
            setClinicMedicines(data || [])
        }
    }

    const fetchVendors = async () => {
        const { data } = await supabase.from('pharmacy_vendors').select('id, name')
        setVendors(data || [])
    }

    // --- Actions: Import ---
    const searchGlobal = async () => {
        if (importSearch.length < 3) return // Lowered to 3 for better UX
        setImportLoading(true)
        try {
            const { data, error } = await supabase
                .from('medicine')
                .select('id, name, manufacturer_name, pack_size_label')
                .ilike('name', `${importSearch}%`)
                .limit(50)

            if (error) throw error

            // Sort by length to show most relevant matches first
            const sorted = (data || []).sort((a: GlobalMedicine, b: GlobalMedicine) => a.name.length - b.name.length)
            setImportResults(sorted)
        } catch (error) {
            console.error(error)
        } finally {
            setImportLoading(false)
        }
    }

    // Auto-trigger search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (importSearch.length >= 3) {
                searchGlobal()
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [importSearch])

    const toggleSelection = (med: GlobalMedicine) => {
        if (selectedGlobalMeds.find(m => m.id === med.id)) {
            setSelectedGlobalMeds(selectedGlobalMeds.filter(m => m.id !== med.id))
        } else {
            // Add with defaults
            const newEntry: SelectedImportMedicine = {
                ...med,
                items_per_pack: 1,
                hsn: '3004'
            }
            setSelectedGlobalMeds([...selectedGlobalMeds, newEntry])
        }
    }

    // NEW: Add Custom Medicine logic
    const addManualMedicine = () => {
        if (!importSearch.trim()) return

        const manualId = -Date.now() // Negative ID to prevent collision with DB IDs
        const newManual: SelectedImportMedicine = {
            id: manualId,
            name: importSearch, // Use current search term as name
            manufacturer_name: 'Manual Entry',
            pack_size_label: '1 Pack', // Default
            items_per_pack: 1,
            hsn: '3004',
            is_manual: true
        }

        setSelectedGlobalMeds([newManual, ...selectedGlobalMeds])
        setImportSearch('') // Clear search
        setImportResults([]) // Clear results
    }

    const updateSelectedMed = (id: number, field: keyof SelectedImportMedicine, value: any) => {
        setSelectedGlobalMeds(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    const handleImportSubmit = async () => {
        if (selectedGlobalMeds.length === 0) return

        try {
            const payload = selectedGlobalMeds.map(med => ({
                name: med.name,
                pack_size_label: med.pack_size_label,
                pack_size_quantity: med.items_per_pack,
                hsn_code: med.hsn,
                gst_percentage: 12, // Default
                vendor_id: bulkVendor || null,
                original_medicine_id: med.is_manual ? null : med.id
            }))

            const { error } = await supabase
                .from('clinic_medicine')
                .insert(payload)

            if (error) throw error

            alert(`Successfully imported ${selectedGlobalMeds.length} medicines!`)
            setView('list') // Switch back to list view
            setImportSearch('')
            setImportResults([])
            setSelectedGlobalMeds([])
            setBulkVendor('')
            fetchClinicMedicines()
        } catch (error) {
            console.error('Import failed:', error)
            alert('Failed to import medicines.')
        }
    }

    // --- Actions: Update ---
    const updateMedicine = async (id: number, field: keyof ClinicMedicine, value: any) => {
        // Optimistic update
        setClinicMedicines(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))

        try {
            const { error } = await supabase
                .from('clinic_medicine')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('id', id)

            if (error) throw error
        } catch (error) {
            console.error('Update failed:', error)
            alert('Failed to update medicine')
            fetchClinicMedicines() // Revert on error
        }
    }

    const openEditModal = (med: ClinicMedicine) => {
        setEditingProduct(med)
        setIsEditOpen(true)
    }

    const handleSaveProduct = async () => {
        if (!editingProduct) return

        try {
            const { error } = await supabase
                .from('clinic_medicine')
                .update({
                    name: editingProduct.name,
                    manufacturer: editingProduct.manufacturer,
                    generic_name: editingProduct.generic_name,
                    pack_size_label: editingProduct.pack_size_label,
                    pack_size_quantity: editingProduct.pack_size_quantity,
                    hsn_code: editingProduct.hsn_code,
                    rack_location: editingProduct.rack_location,
                    min_stock_alert: editingProduct.min_stock_alert,
                    category: editingProduct.category,
                    gst_percentage: editingProduct.gst_percentage,
                    description: editingProduct.description,
                    updated_at: new Date().toISOString()
                })
                .eq('id', editingProduct.id)

            if (error) throw error

            // Update local state
            setClinicMedicines(prev => prev.map(m => m.id === editingProduct.id ? editingProduct : m))
            setIsEditOpen(false)
            setEditingProduct(null)

        } catch (e: any) {
            console.error("Error saving product:", e)
            alert("Failed to save product details: " + e.message)
        }
    }


    // --- Filtering ---
    const filteredMedicines = clinicMedicines.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.hsn_code && m.hsn_code.includes(searchTerm))
    )

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <Pill className="h-8 w-8 text-blue-600" />
                        My Clinic Medicines
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your clinic's formularies, Units per pack, HSN codes, and vendor associations.
                    </p>
                </div>
                <div>
                    {view === 'list' ? (
                        <Button
                            size="lg"
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
                            onClick={() => setView('add')}
                        >
                            <Plus className="mr-2 h-5 w-5" /> Import Medicines
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="lg"
                            className="text-gray-700 border-gray-300 hover:bg-gray-100"
                            onClick={() => setView('list')}
                        >
                            <X className="mr-2 h-5 w-5" /> Cancel / Back to List
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats (Only in List View) */}
            {view === 'list' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-white shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clinic Medicines</CardTitle>
                            <Pill className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{clinicMedicines.length}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Vendors Mapped</CardTitle>
                            <Building2 className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {new Set(clinicMedicines.map(m => m.vendor_id).filter(Boolean)).size}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* VIEW: ADD MEDICINE */}
            {view === 'add' && (
                <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-200px)]">
                    {/* Left: Search & Results */}
                    <Card className="flex-1 flex flex-col shadow-md overflow-hidden border-blue-100">
                        <CardHeader className="pb-3 bg-blue-50/50 border-b border-blue-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg text-blue-900">1. Search Global Database</CardTitle>
                                    <CardDescription className="text-blue-700/70">Type 3+ characters to search 3 lakh+ medicines</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
                            <div className="p-4 border-b bg-white space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                                    {importLoading && (
                                        <div className="absolute right-3 top-3 animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                                    )}
                                    <Input
                                        placeholder="Start typing medicine name (e.g., 'para', 'azith')..."
                                        value={importSearch}
                                        onChange={e => setImportSearch(e.target.value)}
                                        className="pl-10 h-11 text-lg"
                                        autoFocus
                                    />
                                </div>
                                <div className="text-xs text-muted-foreground px-1">
                                    Can't find it?
                                    <button
                                        className="ml-1 text-blue-600 font-medium hover:underline focus:outline-none"
                                        onClick={addManualMedicine}
                                    >
                                        + Add "{importSearch || 'New Medicine'}" Manually
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto bg-gray-50/50">
                                <Table>
                                    <TableHeader className="bg-gray-100 sticky top-0 shadow-sm z-10">
                                        <TableRow>
                                            <TableHead className="w-[50px] bg-gray-100"></TableHead>
                                            <TableHead className="bg-gray-100">Medicine Name</TableHead>
                                            <TableHead className="bg-gray-100">Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importResults.map(med => {
                                            const isSelected = !!selectedGlobalMeds.find(m => m.id === med.id)
                                            return (
                                                <TableRow
                                                    key={med.id}
                                                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-100'} bg-white border-b`}
                                                    onClick={() => toggleSelection(med)}
                                                >
                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => toggleSelection(med)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium text-gray-900">
                                                        {med.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col text-xs text-muted-foreground">
                                                            <span className="font-medium text-gray-700">{med.manufacturer_name}</span>
                                                            <span>{med.pack_size_label}</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        {importResults.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="h-48 text-center text-muted-foreground">
                                                    {importLoading ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                                                            Searching...
                                                        </span>
                                                    ) : importSearch.length < 3 ? (
                                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                                            <Search className="h-8 w-8" />
                                                            <span>Type at least 3 characters to begin searching...</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center gap-4 py-8">
                                                            <span className="text-sm">No matches found for "{importSearch}"</span>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={addManualMedicine}
                                                                className="border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                                                            >
                                                                <Plus className="mr-2 h-4 w-4" /> Add "{importSearch}" Manually
                                                            </Button>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right: Selected Cart */}
                    <Card className="w-full md:w-[450px] flex flex-col shadow-md border-green-100 h-full">
                        <CardHeader className="pb-3 bg-green-50/50 border-b border-green-100">
                            <CardTitle className="text-lg text-green-900 flex justify-between items-center">
                                <span className="flex items-center gap-2">
                                    <Settings2 className="h-5 w-5" />
                                    2. Configure & Add
                                </span>
                                <Badge variant="secondary" className="bg-green-200 text-green-800 hover:bg-green-200">
                                    {selectedGlobalMeds.length}
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-4 flex flex-col gap-4 overflow-hidden bg-white">
                            <div className="space-y-1.5 flex-shrink-0">
                                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Default Vendor (Pro Tip)</Label>
                                <Select value={bulkVendor} onValueChange={setBulkVendor}>
                                    <SelectTrigger className="w-full bg-gray-50 border-gray-200">
                                        <SelectValue placeholder="Select Vendor for all items..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {vendors.map(v => (
                                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Separator />

                            <div className="flex-1 overflow-auto space-y-2 pr-2">
                                {selectedGlobalMeds.map(med => (
                                    <div key={med.id} className="group relative flex flex-col gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-white hover:shadow-sm transition-all animate-in zoom-in-95 duration-200">

                                        {/* Header: Name and Trash */}
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex-1 min-w-0">
                                                {/* If MANUAL, allow editing Name */}
                                                {med.is_manual ? (
                                                    <div className="mb-1">
                                                        <Input
                                                            className="h-7 text-sm font-semibold text-blue-900 border-blue-200 bg-blue-50/50 focus:bg-white"
                                                            value={med.name}
                                                            onChange={e => updateSelectedMed(med.id, 'name', e.target.value)}
                                                            placeholder="Enter Medicine Name"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="font-medium text-sm text-gray-900 leading-tight">{med.name}</div>
                                                )}

                                                {/* If MANUAL, allow editing Pack Size Label */}
                                                {med.is_manual ? (
                                                    <Input
                                                        className="h-6 text-xs text-gray-500 border-gray-200 mt-1"
                                                        value={med.pack_size_label}
                                                        onChange={e => updateSelectedMed(med.id, 'pack_size_label', e.target.value)}
                                                        placeholder="e.g. 1 Strip, 1 Bottle"
                                                    />
                                                ) : (
                                                    <div className="text-xs text-gray-500 mt-0.5">{med.pack_size_label}</div>
                                                )}

                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-gray-400 hover:text-red-500 -mt-1 -mr-1"
                                                onClick={() => toggleSelection(med)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        {/* Configuration Row */}
                                        <div className="flex items-center gap-3 mt-1">
                                            <div className="flex-1 space-y-0.5">
                                                <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Units / Pack</Label>
                                                <Input
                                                    type="number"
                                                    className="h-7 text-xs bg-white border-gray-300 focus:border-green-500"
                                                    value={med.items_per_pack}
                                                    onWheel={(e) => e.currentTarget.blur()}
                                                    onChange={(e) => updateSelectedMed(med.id, 'items_per_pack', parseInt(e.target.value) || 1)}
                                                />
                                            </div>
                                            <div className="flex-1 space-y-0.5">
                                                <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">HSN Code</Label>
                                                <Input
                                                    className="h-7 text-xs bg-white border-gray-300 focus:border-green-500"
                                                    value={med.hsn}
                                                    onChange={(e) => updateSelectedMed(med.id, 'hsn', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Manual Entry Badge */}
                                        {med.is_manual && (
                                            <div className="absolute top-2 right-8">
                                                <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200 px-1 py-0 h-4">
                                                    Manual
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {selectedGlobalMeds.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground opacity-60">
                                        <Check className="h-10 w-10 mb-2 stroke-1" />
                                        <p className="text-sm">No medicines selected yet.</p>
                                        <p className="text-xs mt-1">Select items to add them.</p>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 mt-auto">
                                <Button
                                    className="w-full h-12 text-base font-semibold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                                    disabled={selectedGlobalMeds.length === 0}
                                    onClick={handleImportSubmit}
                                >
                                    <Save className="mr-2 h-5 w-5" />
                                    Import {selectedGlobalMeds.length} Medicines
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* VIEW: LIST (MAIN) */}
            {view === 'list' && (
                <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Filter by name, HSN or Generic..."
                                    className="pl-8 bg-white"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={fetchData}
                                disabled={loading}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader className="bg-gray-50">
                                    <TableRow>
                                        <TableHead className="w-[50px]">ID</TableHead>
                                        <TableHead>Medicine Info</TableHead>
                                        <TableHead className="w-[120px]">Units/Pack</TableHead>
                                        <TableHead className="w-[100px]">Stock Limits</TableHead>
                                        <TableHead className="w-[150px]">Rack / Location</TableHead>
                                        <TableHead className="w-[200px]">Vendor</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                Loading your medicines...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredMedicines.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                No medicines found. Click "Import Medicines" to add some!
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredMedicines.map((med) => (
                                            <TableRow key={med.id} className="hover:bg-blue-50/30 transition-colors group">
                                                <TableCell className="font-mono text-xs text-muted-foreground">#{med.id}</TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-gray-900">{med.name}</div>
                                                    <div className="text-xs text-gray-500">{med.pack_size_label} {med.manufacturer && `• ${med.manufacturer}`}</div>
                                                    {med.generic_name && <div className="text-[10px] text-blue-600 italic">{med.generic_name}</div>}
                                                </TableCell>
                                                {/* UNITS PER PACK EDIT */}
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            type="number"
                                                            className="h-7 w-16 text-right font-mono text-xs"
                                                            value={med.pack_size_quantity || 1}
                                                            onWheel={(e) => e.currentTarget.blur()}
                                                            onChange={e => updateMedicine(med.id, 'pack_size_quantity', parseInt(e.target.value))}
                                                        />
                                                        <span className="text-[10px] text-gray-400">units</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs">
                                                        <span className="text-red-500 font-medium" title="Min Alert">{med.min_stock_alert || 0}</span>
                                                        <span className="text-gray-300 mx-1">/</span>
                                                        <span className="text-green-600" title="Max Limit">{med.max_stock_limit || '-'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        className="h-7 w-full text-xs border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent transition-all"
                                                        value={med.rack_location || ''}
                                                        onChange={e => updateMedicine(med.id, 'rack_location', e.target.value)}
                                                        placeholder="e.g. A1-R2"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={med.vendor_id || 'none'}
                                                        onValueChange={v => updateMedicine(med.id, 'vendor_id', v === 'none' ? null : v)}
                                                    >
                                                        <SelectTrigger className="h-7 text-xs border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent">
                                                            <SelectValue placeholder="Select Vendor" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- None --</SelectItem>
                                                            {vendors.map(v => (
                                                                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEditModal(med)}>
                                                        <PenLine className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* EDIT DIALOG */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Product Profile</DialogTitle>
                        <DialogDescription>
                            Update details for {editingProduct?.name}
                        </DialogDescription>
                    </DialogHeader>

                    {editingProduct && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Product Name</Label>
                                <Input
                                    value={editingProduct.name}
                                    onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Generic Name (Composition)</Label>
                                <Input
                                    value={editingProduct.generic_name || ''}
                                    onChange={e => setEditingProduct({ ...editingProduct, generic_name: e.target.value })}
                                    placeholder="e.g. Paracetamol 500mg"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Manufacturer</Label>
                                <Input
                                    value={editingProduct.manufacturer || ''}
                                    onChange={e => setEditingProduct({ ...editingProduct, manufacturer: e.target.value })}
                                    placeholder="e.g. GSK, Sun Pharma"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select
                                    value={editingProduct.category || "Allopathic"}
                                    onValueChange={v => setEditingProduct({ ...editingProduct, category: v })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Allopathic">Allopathic</SelectItem>
                                        <SelectItem value="Ayurvedic">Ayurvedic</SelectItem>
                                        <SelectItem value="Surgical">Surgical</SelectItem>
                                        <SelectItem value="General">General</SelectItem>
                                        <SelectItem value="Cosmetic">Cosmetic</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Rack / Shelf Location</Label>
                                <Input
                                    value={editingProduct.rack_location || ''}
                                    onChange={e => setEditingProduct({ ...editingProduct, rack_location: e.target.value })}
                                    placeholder="e.g. Row 1, Shelf B"
                                />
                            </div>

                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 col-span-2 grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-blue-700">Packing Label</Label>
                                    <Input
                                        value={editingProduct.pack_size_label}
                                        onChange={e => setEditingProduct({ ...editingProduct, pack_size_label: e.target.value })}
                                        className="bg-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-blue-700">Units per Pack</Label>
                                    <Input
                                        type="number"
                                        value={editingProduct.pack_size_quantity}
                                        onChange={e => setEditingProduct({ ...editingProduct, pack_size_quantity: parseInt(e.target.value) || 1 })}
                                        className="bg-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-blue-700">HSN Code</Label>
                                    <Input
                                        value={editingProduct.hsn_code || ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, hsn_code: e.target.value })}
                                        className="bg-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-blue-700">GST %</Label>
                                    <Input
                                        type="number"
                                        value={editingProduct.gst_percentage || 12}
                                        onChange={e => setEditingProduct({ ...editingProduct, gst_percentage: parseInt(e.target.value) || 0 })}
                                        className="bg-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Min Stock Alert</Label>
                                <Input
                                    type="number"
                                    value={editingProduct.min_stock_alert || 10}
                                    onChange={e => setEditingProduct({ ...editingProduct, min_stock_alert: parseInt(e.target.value) || 0 })}
                                />
                            </div>



                            <div className="col-span-2 space-y-2">
                                <Label>Description</Label>
                                <Textarea
                                    value={editingProduct.description || ''}
                                    onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                                    placeholder="Additional product details..."
                                    className="h-20"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveProduct} className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
