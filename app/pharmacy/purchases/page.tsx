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
    Plus, Search, Calendar, User, FileText, ArrowLeft, Trash2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'

interface Vendor {
    id: string
    name: string
}

interface InventoryItem {
    id: string
    name: string
    pack_size_label: string
}

interface PurchaseItem {
    inventory_id: string
    name: string // Display only
    batch_number: string
    expiry_date: string
    quantity: number
    unit_cost_price: number
    mrp: number
}

interface Purchase {
    id: string
    vendor: { name: string }
    purchase_date: string
    invoice_number: string
    total_amount: number
    status: string
    pharmacy_purchase_items: {
        inventory: { name: string }
        quantity: number
    }[]
}

export default function PurchasesPage() {
    const [view, setView] = useState<'list' | 'create'>('list')
    const [purchases, setPurchases] = useState<Purchase[]>([])
    const [loading, setLoading] = useState(true)

    // Filters
    const [dateFilter, setDateFilter] = useState('')
    const [searchFilter, setSearchFilter] = useState('')

    // Create State
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [inventorySearch, setInventorySearch] = useState('')
    const [inventoryResults, setInventoryResults] = useState<InventoryItem[]>([])
    const [newItem, setNewItem] = useState<Partial<PurchaseItem>>({})
    const [cart, setCart] = useState<PurchaseItem[]>([])

    const [formData, setFormData] = useState({
        vendor_id: '',
        invoice_number: '',
        purchase_date: new Date().toISOString().split('T')[0]
    })

    useEffect(() => {
        fetchPurchases()
        fetchVendors()
    }, [dateFilter, searchFilter]) // Add dependencies

    const fetchPurchases = async () => {
        setLoading(true)
        let query = supabase
            .from('pharmacy_purchases')
            .select(`
                *, 
                vendor:pharmacy_vendors(name),
                pharmacy_purchase_items (
                    quantity,
                    inventory:pharmacy_inventory(name)
                )
            `)
            .order('purchase_date', { ascending: false })

        if (dateFilter) {
            query = query.eq('purchase_date', dateFilter)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching purchases:', error)
        }

        let fetchedData = data || [] as any

        // Client-side filtering for medicine name since deep filtering is complex in supabase simple queries
        if (searchFilter) {
            fetchedData = fetchedData.filter((p: any) =>
                p.pharmacy_purchase_items.some((item: any) =>
                    item.inventory?.name.toLowerCase().includes(searchFilter.toLowerCase())
                )
            )
        }

        setPurchases(fetchedData)
        setLoading(false)
    }

    const fetchVendors = async () => {
        const { data } = await supabase.from('pharmacy_vendors').select('id, name')
        setVendors(data || [])
    }

    const searchInventory = async (query: string) => {
        setInventorySearch(query)
        if (query.length < 2) {
            setInventoryResults([])
            return
        }
        const { data } = await supabase
            .from('pharmacy_inventory')
            .select('id, name, pack_size_label')
            .ilike('name', `%${query}%`)
            .limit(10)
        setInventoryResults(data || [])
    }

    const addItemToCart = () => {
        if (!newItem.inventory_id || !newItem.quantity || !newItem.unit_cost_price) {
            alert('Please fill all item details')
            return
        }
        setCart([...cart, newItem as PurchaseItem])
        setNewItem({})
        setInventorySearch('')
        setInventoryResults([])
    }

    const calculateTotal = () => {
        return cart.reduce((sum, item) => sum + (item.quantity * item.unit_cost_price), 0)
    }

    const handleSubmit = async () => {
        if (!formData.vendor_id || cart.length === 0) {
            alert('Select vendor and add items')
            return
        }

        try {
            // 1. Create Purchase Record
            const { data: purchase, error: pError } = await supabase
                .from('pharmacy_purchases')
                .insert({
                    vendor_id: formData.vendor_id,
                    invoice_number: formData.invoice_number,
                    purchase_date: formData.purchase_date,
                    total_amount: calculateTotal(),
                    status: 'completed'
                })
                .select()
                .single()

            if (pError) throw pError

            // 2. Create Purchase Items
            const itemsPayload = cart.map(item => ({
                purchase_id: purchase.id,
                inventory_id: item.inventory_id,
                batch_number: item.batch_number,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                unit_cost_price: item.unit_cost_price,
                mrp: item.mrp
            }))

            const { error: iError } = await supabase
                .from('pharmacy_purchase_items')
                .insert(itemsPayload)

            if (iError) throw iError

            // 3. Update Inventory Stock (Simple increment)
            for (const item of cart) {
                // Get current stock
                const { data: curr } = await supabase
                    .from('pharmacy_inventory')
                    .select('current_stock')
                    .eq('id', item.inventory_id)
                    .single()

                const newStock = (curr?.current_stock || 0) + item.quantity

                await supabase
                    .from('pharmacy_inventory')
                    .update({
                        current_stock: newStock,
                        batch_number: item.batch_number, // Update latest batch info
                        expiry_date: item.expiry_date,
                        cost_price: item.unit_cost_price, // Update latest prices
                        mrp: item.mrp
                    })
                    .eq('id', item.inventory_id)
            }

            alert('Purchase recorded successfully')
            setView('list')
            setCart([])
            setFormData({ vendor_id: '', invoice_number: '', purchase_date: new Date().toISOString().split('T')[0] })
            fetchPurchases()

        } catch (error) {
            console.error('Purchase failed:', error)
            alert('Failed to save purchase')
        }
    }

    if (view === 'create') {
        return (
            <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => setView('list')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-2xl font-bold">New Purchase Entry</h1>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    {/* Left: Form */}
                    <div className="col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Vendor & Invoice Details</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Select Vendor</Label>
                                    <Select
                                        value={formData.vendor_id}
                                        onValueChange={v => setFormData({ ...formData, vendor_id: v })}
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
                                    <Label>Invoice Number</Label>
                                    <Input
                                        value={formData.invoice_number}
                                        onChange={e => setFormData({ ...formData, invoice_number: e.target.value })}
                                        placeholder="INV-..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Date</Label>
                                    <Input
                                        type="date"
                                        value={formData.purchase_date}
                                        onChange={e => setFormData({ ...formData, purchase_date: e.target.value })}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Add Items</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="relative">
                                    <Label>Search Medicine</Label>
                                    <Input
                                        placeholder="Type to search inventory..."
                                        value={inventorySearch}
                                        onChange={e => searchInventory(e.target.value)}
                                    />
                                    {inventoryResults.length > 0 && (
                                        <div className="absolute w-full bg-white border rounded-md shadow-lg z-10 mt-1 max-h-40 overflow-auto">
                                            {inventoryResults.map(item => (
                                                <div
                                                    key={item.id}
                                                    className="p-2 hover:bg-gray-100 cursor-pointer"
                                                    onClick={() => {
                                                        setNewItem({ ...newItem, inventory_id: item.id, name: item.name })
                                                        setInventorySearch(item.name)
                                                        setInventoryResults([])
                                                    }}
                                                >
                                                    {item.name} <span className="text-gray-400 text-xs">({item.pack_size_label})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label>Batch No</Label>
                                        <Input
                                            value={newItem.batch_number || ''}
                                            onChange={e => setNewItem({ ...newItem, batch_number: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Expiry</Label>
                                        <Input
                                            type="date"
                                            value={newItem.expiry_date || ''}
                                            onChange={e => setNewItem({ ...newItem, expiry_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Quantity</Label>
                                        <Input
                                            type="number"
                                            value={newItem.quantity || ''}
                                            onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Unit Buying Price</Label>
                                        <Input
                                            type="number"
                                            value={newItem.unit_cost_price || ''}
                                            onChange={e => setNewItem({ ...newItem, unit_cost_price: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Sell MRP</Label>
                                        <Input
                                            type="number"
                                            value={newItem.mrp || ''}
                                            onChange={e => setNewItem({ ...newItem, mrp: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <Button className="w-full" onClick={addItemToCart}>Add to List</Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right: Summary */}
                    <div className="col-span-1">
                        <Card className="h-full flex flex-col">
                            <CardHeader>
                                <CardTitle>Purchase Summary</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col">
                                <div className="flex-1 overflow-auto space-y-2">
                                    {cart.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                                            <div>
                                                <div className="font-medium">{item.name}</div>
                                                <div className="text-gray-500 text-xs">Qty: {item.quantity} x ₹{item.unit_cost_price}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold">₹{item.quantity * item.unit_cost_price}</span>
                                                <Trash2
                                                    className="h-4 w-4 text-red-500 cursor-pointer"
                                                    onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {cart.length === 0 && <div className="text-center text-gray-400 py-10">No items added</div>}
                                </div>

                                <div className="border-t pt-4 mt-4 space-y-4">
                                    <div className="flex justify-between text-lg font-bold">
                                        <span>Total Amount</span>
                                        <span>₹{calculateTotal()}</span>
                                    </div>
                                    <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleSubmit}>
                                        Complete Purchase
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Purchases History</h1>
                    <p className="text-muted-foreground">Log of stock incoming from vendors.</p>
                </div>
                <Button onClick={() => setView('create')}>
                    <Plus className="mr-2 h-4 w-4" /> New Purchase
                </Button>
            </div>

            <div className="flex gap-4 items-center bg-white p-4 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <Input
                        type="date"
                        className="w-40"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 flex-1">
                    <Search className="h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Search by Medicine Name..."
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                    />
                </div>
                {(dateFilter || searchFilter) && (
                    <Button variant="ghost" onClick={() => { setDateFilter(''); setSearchFilter(''); }}>Clear</Button>
                )}
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Date</TableHead>
                                <TableHead className="w-[150px]">Vendor</TableHead>
                                <TableHead className="w-[100px]">Invoice #</TableHead>
                                <TableHead>Items (Medicine - Qty)</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
                            ) : purchases.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No purchase history found.</TableCell></TableRow>
                            ) : (
                                purchases.map(p => (
                                    <TableRow key={p.id} className="hover:bg-gray-50">
                                        <TableCell className="align-top font-medium">{format(new Date(p.purchase_date), 'dd MMM yyyy')}</TableCell>
                                        <TableCell className="align-top text-gray-600">{p.vendor?.name || 'Unknown'}</TableCell>
                                        <TableCell className="align-top">{p.invoice_number || '-'}</TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                {p.pharmacy_purchase_items?.map((item, idx) => (
                                                    <div key={idx} className="text-sm flex gap-2">
                                                        <span className="font-medium text-blue-800">• {item.inventory?.name}</span>
                                                        <span className="text-gray-500">x{item.quantity}</span>
                                                    </div>
                                                ))}
                                                {(!p.pharmacy_purchase_items || p.pharmacy_purchase_items.length === 0) && (
                                                    <span className="text-gray-400 italic">No items details</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top text-right font-bold">₹{p.total_amount}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
