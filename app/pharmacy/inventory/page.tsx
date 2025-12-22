'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    Plus, Search, ArrowLeft, Trash2, Save, BatteryLow, Package, RefreshCw, Edit
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Types
interface InventoryItem {
    id: string
    name: string
    manufacturer_name: string
    pack_size_label: string
    current_stock: number
    low_stock_limit: number
    mrp: number
    cost_price: number
    batch_number: string
    expiry_date: string
    preferred_vendor_id?: string
}

interface MasterMedicine {
    id: number
    name: string
    manufacturer_name: string
    pack_size_label: string
    medicine_desc: string
    price: number // Base price from master
}

interface ConfigItem extends MasterMedicine {
    custom_mrp: number
    low_stock_limit: number
    vendor_price?: number // Optional
    vendor_id?: string
}

interface Vendor {
    id: string
    name: string
}

export default function InventoryPage() {
    const [view, setView] = useState<'list' | 'add'>('list')
    const [inventory, setInventory] = useState<InventoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Add Mode State
    const [masterSearch, setMasterSearch] = useState('')
    const [masterResults, setMasterResults] = useState<MasterMedicine[]>([])
    const [searchLoading, setSearchLoading] = useState(false)
    const [selectedItems, setSelectedItems] = useState<ConfigItem[]>([])
    const [vendors, setVendors] = useState<Vendor[]>([])

    // Bulk Config State
    const [bulkVendor, setBulkVendor] = useState<string>('')

    // Stock Update State
    const [stockUpdateItem, setStockUpdateItem] = useState<InventoryItem | null>(null)
    const [stockUpdateForm, setStockUpdateForm] = useState({
        quantity: '',
        purchase_date: new Date().toISOString().split('T')[0],
        vendor_id: '',
        unit_cost_price: '',
        batch_number: '',
        expiry_date: ''
    })

    // Price Update State
    const [editPriceItem, setEditPriceItem] = useState<InventoryItem | null>(null)
    const [newMrp, setNewMrp] = useState('')

    useEffect(() => {
        fetchInventory()
        fetchVendors()
    }, [])

    const fetchInventory = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('pharmacy_inventory')
                .select('*')
                .order('name')

            if (error) throw error
            setInventory(data || [])
        } catch (error) {
            console.error('Error loading inventory:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchVendors = async () => {
        const { data } = await supabase.from('pharmacy_vendors').select('id, name')
        setVendors(data || [])
    }

    const searchMaster = async () => {
        if (masterSearch.length < 3) return
        setSearchLoading(true)
        try {
            const { data, error } = await supabase
                .from('medicine')
                .select('*')
                .ilike('name', `%${masterSearch}%`)
                .limit(20)

            if (error) throw error
            setMasterResults(data || [])
        } catch (error) {
            console.error('Search failed:', error)
        } finally {
            setSearchLoading(false)
        }
    }

    const toggleSelect = (med: MasterMedicine) => {
        const exists = selectedItems.find(i => i.id === med.id)
        if (exists) {
            setSelectedItems(selectedItems.filter(i => i.id !== med.id))
        } else {
            // Add with defaults
            setSelectedItems([...selectedItems, {
                ...med,
                custom_mrp: med.price || 0,
                low_stock_limit: 3, // Default low stock
                vendor_id: bulkVendor || undefined
            }])
        }
    }

    const updateItemConfig = (id: number, field: keyof ConfigItem, value: any) => {
        setSelectedItems(selectedItems.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ))
    }

    const applyBulkVendor = (vendorId: string) => {
        setBulkVendor(vendorId)
        setSelectedItems(selectedItems.map(item => ({ ...item, vendor_id: vendorId })))
    }

    const handleSaveAll = async () => {
        if (selectedItems.length === 0) return

        try {
            const payload = selectedItems.map(item => ({
                medicine_id: item.id,
                name: item.name,
                manufacturer_name: item.manufacturer_name,
                pack_size_label: item.pack_size_label,
                description: item.medicine_desc,
                current_stock: 0, // Initial stock is 0 until purchased
                low_stock_limit: item.low_stock_limit,
                mrp: item.custom_mrp,
                cost_price: item.vendor_price || 0,
                preferred_vendor_id: item.vendor_id || null
            }))

            const { error } = await supabase
                .from('pharmacy_inventory')
                .insert(payload)

            if (error) throw error

            alert('Medicines added successfully!')
            setView('list')
            setSelectedItems([])
            setMasterSearch('')
            setMasterResults([])
            setBulkVendor('')
            fetchInventory()
        } catch (error) {
            console.error('Failed to add medicines:', error)
            alert('Failed to add medicines')
        }
    }

    // --- Stock Update Logic ---
    const openStockUpdate = (item: InventoryItem) => {
        setStockUpdateItem(item)
        setStockUpdateForm({
            quantity: '',
            purchase_date: new Date().toISOString().split('T')[0],
            vendor_id: item.preferred_vendor_id || '',
            unit_cost_price: item.cost_price?.toString() || '', // Should ideally help user by prefilling last known cost
            batch_number: '',
            expiry_date: ''
        })
    }

    const handleStockUpdateSubmit = async () => {
        if (!stockUpdateItem || !stockUpdateForm.quantity || !stockUpdateForm.purchase_date) {
            alert('Please fill Quantity and Date')
            return
        }

        const qty = parseInt(stockUpdateForm.quantity)
        if (qty <= 0) {
            alert('Quantity must be positive')
            return
        }

        try {
            // 1. Create Purchase Record
            // Even if vendor is unknown, we insert null or a placeholder if constraints allow.
            // My schema allows null vendor_id? Let's check schema. Yes, but good to have.
            const { data: purchase, error: pError } = await supabase
                .from('pharmacy_purchases')
                .insert({
                    vendor_id: stockUpdateForm.vendor_id || null,
                    purchase_date: stockUpdateForm.purchase_date,
                    total_amount: (parseFloat(stockUpdateForm.unit_cost_price) || 0) * qty,
                    status: 'completed',
                    notes: 'Quick Stock Update via Inventory'
                })
                .select()
                .single()

            if (pError) throw pError

            // 2. Create Purchase Item
            const { error: iError } = await supabase
                .from('pharmacy_purchase_items')
                .insert({
                    purchase_id: purchase.id,
                    inventory_id: stockUpdateItem.id,
                    quantity: qty,
                    unit_cost_price: parseFloat(stockUpdateForm.unit_cost_price) || 0,
                    batch_number: stockUpdateForm.batch_number,
                    expiry_date: stockUpdateForm.expiry_date || null
                })

            if (iError) throw iError

            // 3. Update Inventory Stock
            const newStock = stockUpdateItem.current_stock + qty
            await supabase
                .from('pharmacy_inventory')
                .update({
                    current_stock: newStock,
                    batch_number: stockUpdateForm.batch_number || stockUpdateItem.batch_number,
                    expiry_date: stockUpdateForm.expiry_date || stockUpdateItem.expiry_date
                })
                .eq('id', stockUpdateItem.id)

            alert('Stock Updated Successfully')
            setStockUpdateItem(null)
            fetchInventory()

        } catch (error) {
            console.error('Stock update failed:', error)
            alert('Failed to update stock')
        }
    }

    // --- Price Update Logic ---
    const openEditPrice = (item: InventoryItem) => {
        setEditPriceItem(item)
        setNewMrp(item.mrp.toString())
    }

    const handleUpdateMrp = async () => {
        if (!editPriceItem || !newMrp) return

        try {
            const { error } = await supabase
                .from('pharmacy_inventory')
                .update({ mrp: parseFloat(newMrp) })
                .eq('id', editPriceItem.id)

            if (error) throw error

            alert('MRP Updated Successfully')
            setEditPriceItem(null)
            fetchInventory()
        } catch (error) {
            console.error('Error updating MRP:', error)
            alert('Failed to update MRP')
        }
    }


    // Filter local inventory
    const filteredInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    if (view === 'add') {
        return (
            <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => setView('list')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add New Medicines</h1>
                            <p className="text-muted-foreground text-sm">Search master database & add to inventory.</p>
                        </div>
                    </div>
                    <Button onClick={handleSaveAll} disabled={selectedItems.length === 0} className="bg-green-600 hover:bg-green-700">
                        <Save className="mr-2 h-4 w-4" /> Save {selectedItems.length} Items
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Search & Select */}
                    <Card className="lg:col-span-1 h-fit">
                        <CardHeader>
                            <CardTitle className="text-base">1. Search Medicine</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Search (min 3 chars)..."
                                    value={masterSearch}
                                    onChange={e => setMasterSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchMaster()}
                                />
                                <Button size="icon" onClick={searchMaster} disabled={searchLoading}>
                                    {searchLoading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Search className="h-4 w-4" />}
                                </Button>
                            </div>

                            <div className="border rounded-md max-h-[500px] overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[40px]"></TableHead>
                                            <TableHead>Name</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {masterResults.map(med => {
                                            const isSelected = !!selectedItems.find(i => i.id === med.id)
                                            return (
                                                <TableRow key={med.id} className={isSelected ? 'bg-blue-50' : ''}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => toggleSelect(med)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-sm">{med.name}</div>
                                                        <div className="text-xs text-muted-foreground">{med.manufacturer_name} • {med.pack_size_label}</div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        {masterResults.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={2} className="h-24 text-center text-muted-foreground text-sm">
                                                    {searchLoading ? 'Searching...' : 'No results found'}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right: Configure Selected */}
                    <Card className="lg:col-span-2 h-fit">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-base">2. Review & Configure ({selectedItems.length})</CardTitle>

                            {/* Bulk Actions */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-600">Bulk Vendor:</span>
                                <Select value={bulkVendor} onValueChange={applyBulkVendor}>
                                    <SelectTrigger className="w-[180px] h-8 text-sm">
                                        <SelectValue placeholder="Assign Vendor..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {vendors.map(v => (
                                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Medicine</TableHead>
                                        <TableHead className="w-[120px]">Vendor</TableHead>
                                        <TableHead className="w-[100px]">MRP</TableHead>
                                        <TableHead className="w-[100px]">Low Lim.</TableHead>
                                        <TableHead className="w-[100px]">Vendor Price</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedItems.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="font-medium text-sm">{item.name}</div>
                                                <div className="text-xs text-muted-foreground">{item.pack_size_label}</div>
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    value={item.vendor_id || ''}
                                                    onValueChange={v => updateItemConfig(item.id, 'vendor_id', v)}
                                                >
                                                    <SelectTrigger className="h-8 text-xs w-full">
                                                        <SelectValue placeholder="Select" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {vendors.map(v => (
                                                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    className="h-8 text-xs"
                                                    value={item.custom_mrp}
                                                    onChange={e => updateItemConfig(item.id, 'custom_mrp', parseFloat(e.target.value))}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    className="h-8 text-xs"
                                                    value={item.low_stock_limit}
                                                    onChange={e => updateItemConfig(item.id, 'low_stock_limit', parseInt(e.target.value))}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    className="h-8 text-xs"
                                                    placeholder="Opt."
                                                    value={item.vendor_price || ''}
                                                    onChange={e => updateItemConfig(item.id, 'vendor_price', parseFloat(e.target.value))}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-red-500 hover:text-red-600"
                                                    onClick={() => toggleSelect(item as MasterMedicine)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {selectedItems.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                Select items from the left to configure them here.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    // Default List View
    return (
        <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Inventory Management</h1>
                    <p className="text-muted-foreground">Detailed view of your pharmacy stock.</p>
                </div>
                <Button onClick={() => setView('add')} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20">
                    <Plus className="mr-2 h-4 w-4" /> Add New Medicine
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-white shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Medicines</CardTitle>
                        <Package className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{inventory.length}</div>
                    </CardContent>
                </Card>
                <Card className="bg-white shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock Items</CardTitle>
                        <BatteryLow className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">
                            {inventory.filter(i => i.current_stock <= i.low_stock_limit).length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search inventory..."
                                className="pl-8 bg-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border bg-white">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50/50">
                                    <TableHead>Medicine Name</TableHead>
                                    <TableHead>Manufacturer</TableHead>
                                    <TableHead>Pack Size</TableHead>
                                    <TableHead className="text-right">Stock</TableHead>
                                    <TableHead className="text-right">MRP</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">Loading Inventory...</TableCell>
                                    </TableRow>
                                ) : filteredInventory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            No medicines in inventory. Add some to get started.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredInventory.map((item) => (
                                        <TableRow key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{item.name}</span>
                                                    {item.batch_number && (
                                                        <span className="text-xs text-gray-500">Batch: {item.batch_number}</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-gray-600">{item.manufacturer_name}</TableCell>
                                            <TableCell>{item.pack_size_label}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge
                                                    variant={item.current_stock <= item.low_stock_limit ? "destructive" : "secondary"}
                                                    className={item.current_stock <= item.low_stock_limit ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"}
                                                >
                                                    {item.current_stock}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">₹{item.mrp}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => openEditPrice(item)}
                                                        title="Update MRP"
                                                    >
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => openStockUpdate(item)}
                                                    >
                                                        <RefreshCw className="mr-2 h-3 w-3" /> Update Stock
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Stock Update Dialog */}
            <Dialog open={!!stockUpdateItem} onOpenChange={(open) => !open && setStockUpdateItem(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Update Stock & Repurchase History</DialogTitle>
                        <DialogDescription>
                            Adding stock for <strong>{stockUpdateItem?.name}</strong>. This will record a purchase history.
                        </DialogDescription>
                    </DialogHeader>
                    {stockUpdateItem && (
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Vendor</Label>
                                    <Select
                                        value={stockUpdateForm.vendor_id}
                                        onValueChange={v => setStockUpdateForm({ ...stockUpdateForm, vendor_id: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Vendor" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vendors.map(v => (
                                                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Purchase Date (Entry Date)</Label>
                                    <Input
                                        type="date"
                                        value={stockUpdateForm.purchase_date}
                                        onChange={e => setStockUpdateForm({ ...stockUpdateForm, purchase_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Add Quantity</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 100"
                                        className="font-bold border-blue-200"
                                        value={stockUpdateForm.quantity}
                                        onChange={e => setStockUpdateForm({ ...stockUpdateForm, quantity: e.target.value })}
                                    />
                                    <p className="text-xs text-muted-foreground">Current Stock: {stockUpdateItem.current_stock}</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Buying Price (Per Unit)</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 10.50"
                                        value={stockUpdateForm.unit_cost_price}
                                        onChange={e => setStockUpdateForm({ ...stockUpdateForm, unit_cost_price: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Batch Number</Label>
                                    <Input
                                        placeholder="Optional"
                                        value={stockUpdateForm.batch_number}
                                        onChange={e => setStockUpdateForm({ ...stockUpdateForm, batch_number: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Expiry Date</Label>
                                    <Input
                                        type="date"
                                        value={stockUpdateForm.expiry_date}
                                        onChange={e => setStockUpdateForm({ ...stockUpdateForm, expiry_date: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStockUpdateItem(null)}>Cancel</Button>
                        <Button onClick={handleStockUpdateSubmit} className="bg-blue-600 hover:bg-blue-700">Confirm Update</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* MRP Update Dialog */}
            <Dialog open={!!editPriceItem} onOpenChange={(open) => !open && setEditPriceItem(null)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Update MRP Price</DialogTitle>
                        <DialogDescription>
                            Update the selling price (MRP) for <strong>{editPriceItem?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    {editPriceItem && (
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>New MRP</Label>
                                <Input
                                    type="number"
                                    placeholder="Enter new MRP"
                                    value={newMrp}
                                    onChange={e => setNewMrp(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditPriceItem(null)}>Cancel</Button>
                        <Button onClick={handleUpdateMrp} className="bg-blue-600 hover:bg-blue-700">Update MRP</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
