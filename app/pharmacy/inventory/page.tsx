'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Search, Package, Calendar, TrendingUp, AlertCircle, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

// --- Types ---

// 1. Stock Types
interface BatchStock {
    batch_number: string
    expiry_date: string
    quantity: number
    remaining_units: number // NEW: Track granular units
    pack_size_quantity: number // NEW: Units/Pack definition
    mrp: number
    purchase_rate: number
}

interface MedicineStockAgg {
    medicine_id: number
    medicine_name: string
    pack_size: string
    total_quantity: number // Total Packs
    total_units: number // NEW: Total Loose Units
    total_value_cost: number
    total_value_mrp: number
    batches: BatchStock[]
    status: 'In Stock' | 'Low Stock' | 'Out of Stock'
}

// 2. Purchase Types
interface PurchaseItem {
    id: string
    medicine_name: string
    batch_number: string
    quantity: number
    quantity_billed: number
    quantity_free: number
    pack_size_quantity: number
    unit_price: number
    total_amount: number
}

interface PurchaseInvoice {
    id: string
    invoice_number: string
    invoice_date: string
    vendor_name: string
    total_amount: number
    status: string
    items: PurchaseItem[]
}


export default function InventoryMasterPage() {
    const [activeTab, setActiveTab] = useState('stock')
    const [loading, setLoading] = useState(true)

    // Stock State
    const [stockList, setStockList] = useState<MedicineStockAgg[]>([])
    const [expiringList, setExpiringList] = useState<MedicineStockAgg[]>([]) // NEW: Expiring State
    const [stockSearch, setStockSearch] = useState('')
    const [expandedMedicineId, setExpandedMedicineId] = useState<number | null>(null)

    // Purchase State
    const [purchaseList, setPurchaseList] = useState<PurchaseInvoice[]>([])
    const [purchaseDateFilter, setPurchaseDateFilter] = useState('')

    // --- initialization ---
    useEffect(() => {
        refreshData()
    }, [])

    const refreshData = async () => {
        setLoading(true)
        await Promise.all([fetchStock(), fetchPurchases()])
        setLoading(false)
    }

    // --- Fetch Stock Logic ---
    const fetchStock = async () => {
        try {
            // 1. Fetch Clinic Formularies
            const { data: meds, error: medError } = await supabase
                .from('clinic_medicine')
                .select('id, name, pack_size_label')

            if (medError) throw medError

            // 2. Fetch All Active Batches
            const { data: batches, error: batchError } = await supabase
                .rpc('pharmacy_get_current_stock')

            if (batchError) throw batchError

            // 3. Aggregate
            const medMap = new Map<number, MedicineStockAgg>()

            // Initialize Map
            meds?.forEach(m => {
                medMap.set(m.id, {
                    medicine_id: m.id,
                    medicine_name: m.name,
                    pack_size: m.pack_size_label,
                    total_quantity: 0,
                    total_units: 0,
                    total_value_cost: 0,
                    total_value_mrp: 0,
                    batches: [],
                    status: 'Out of Stock'
                })
            })

            // Fill Data
            batches?.forEach((b: any) => {
                const med = medMap.get(b.medicine_id)
                if (med) {
                    med.total_quantity += b.quantity
                    // Fallback to qty * 1 if remaining_units is null (backward compatibility)
                    const units = b.remaining_units !== undefined ? b.remaining_units : (b.quantity * (b.pack_size_quantity || 1));
                    med.total_units += units;

                    med.total_value_cost += (b.quantity * b.purchase_rate)
                    med.total_value_mrp += (b.quantity * b.mrp)
                    med.batches.push({
                        batch_number: b.batch_number,
                        expiry_date: b.expiry_date,
                        quantity: b.quantity,
                        remaining_units: units,
                        pack_size_quantity: b.pack_size_quantity || 1,
                        mrp: b.mrp,
                        purchase_rate: b.purchase_rate
                    })
                }
            })

            // Determine Status & Sort Batches by Expiry
            const computedList = Array.from(medMap.values()).map(m => {
                m.batches.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())

                if (m.total_quantity === 0) m.status = 'Out of Stock'
                else if (m.total_quantity < 50) m.status = 'Low Stock'
                else m.status = 'In Stock'

                return m
            })

            // Filter Expiring Items (Within 90 Days)
            const today = new Date()
            const alertDate = new Date()
            alertDate.setDate(today.getDate() + 90)

            const alerts = (batches as any[])?.filter((b: any) => {
                const exp = new Date(b.expiry_date)
                return exp <= alertDate
            }).map((b: any) => {
                // Map raw batch to aggregated structure for uniform display
                const m = medMap.get(b.medicine_id)
                return {
                    ...m!,
                    batches: [b], // Only the expiring batch
                    status: new Date(b.expiry_date) < today ? 'Out of Stock' : 'Low Stock' // Reusing status for Badge color logic
                } as MedicineStockAgg
            }) || []

            setStockList(computedList)
            setExpiringList(alerts)

        } catch (error) {
            console.error('Stock Load Failed', error)
        }
    }

    // --- Fetch History Logic ---
    // Fetch Purchase History from Ledger
    const fetchPurchases = async () => {
        try {
            let query = supabase
                .from('pharmacy_purchase_invoice')
                .select(`
                    id,
                    invoice_number,
                    invoice_date,
                    total_amount,
                    status,
                    vendor:pharmacy_vendors(name),
                    items:pharmacy_stock_ledger(
                        id,
                        quantity_billed,
                        quantity_free,
                        rate_per_unit,
                        total_amount,
                        batch_number,
                        medicine:clinic_medicine(name)
                    )
                `)
                .eq('items.transaction_type', 'PURCHASE')
                .order('created_at', { ascending: false })

            if (purchaseDateFilter) {
                query = query.eq('invoice_date', purchaseDateFilter)
            }

            const { data, error } = await query
            if (error) throw error

            const mapped = (data || []).map((p: any) => ({
                id: p.id,
                invoice_number: p.invoice_number,
                invoice_date: p.invoice_date,
                vendor_name: p.vendor?.name || 'Unknown',
                total_amount: p.total_amount,
                status: p.status,
                items: p.items?.map((i: any) => ({
                    id: i.id,
                    medicine_name: i.medicine?.name || 'Unknown',
                    batch_number: i.batch_number,
                    quantity: (i.quantity_billed || 0) + (i.quantity_free || 0),
                    quantity_billed: i.quantity_billed || 0,
                    quantity_free: i.quantity_free || 0,
                    pack_size_quantity: i.pack_size_quantity || 1,
                    unit_price: i.rate_per_unit,
                    total_amount: i.total_amount
                })) || []
            }))

            setPurchaseList(mapped)

        } catch (error) {
            console.error(error)
        }
    }

    // --- Actions ---
    const toggleExpand = (id: number) => {
        if (expandedMedicineId === id) {
            setExpandedMedicineId(null)
        } else {
            setExpandedMedicineId(id)
        }
    }

    // --- Derived Data ---
    const filteredStock = stockList.filter(s =>
        s.medicine_name.toLowerCase().includes(stockSearch.toLowerCase())
    )

    // Stats
    const totalInventoryValue = stockList.reduce((sum, i) => sum + i.total_value_cost, 0)
    const totalItems = stockList.reduce((sum, i) => sum + i.total_quantity, 0)

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Pharmacy Management</h1>
                    <p className="text-muted-foreground">Comprehensive overview of Inventory and Purchase Records.</p>
                </div>
                <div className="flex gap-4">
                    <Card className="p-3 bg-blue-600 text-white border-none shadow-lg shadow-blue-600/20">
                        <div className="text-xs font-semibold opacity-90">Total Stock Value (Cost)</div>
                        <div className="text-2xl font-bold">₹{totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                    </Card>
                    <Card className="p-3 bg-white shadow-sm border-blue-100">
                        <div className="text-xs font-semibold text-gray-500">Total Packs</div>
                        <div className="text-2xl font-bold text-blue-900">{totalItems}</div>
                    </Card>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-white border p-1 h-12">
                    <TabsTrigger value="stock" className="h-10 text-sm px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        Current Inventory ({filteredStock.length})
                    </TabsTrigger>
                    <TabsTrigger value="purchases" className="h-10 text-sm px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        Purchase History
                    </TabsTrigger>
                    <TabsTrigger value="expiry" className="h-10 text-sm px-6 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                        Expiry Alerts {expiringList.length > 0 && <Badge variant="destructive" className="ml-2 h-5 px-1.5">{expiringList.length}</Badge>}
                    </TabsTrigger>
                </TabsList>

                {/* --- TAB 1: STOCK --- */}
                <TabsContent value="stock" className="space-y-4">
                    <Card className="border-none shadow-sm bg-white">
                        <CardHeader className="pb-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search inventory by medicine name..."
                                    className="pl-10 h-10 bg-gray-50 border-gray-200"
                                    value={stockSearch}
                                    onChange={e => setStockSearch(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader className="bg-gray-50">
                                    <TableRow>
                                        <TableHead className="w-[40px]"></TableHead>
                                        <TableHead>Medicine Details</TableHead>
                                        <TableHead className="text-right">Total Stock</TableHead>
                                        <TableHead className="text-right">Est. Value (MRP / Cost)</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                        <TableHead className="w-[100px] text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStock.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                No stock found. Check your filters or add purchases.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredStock.map(item => {
                                            const isExpanded = expandedMedicineId === item.medicine_id;
                                            return (
                                                <React.Fragment key={item.medicine_id}>
                                                    {/* MAIN ROW */}
                                                    <TableRow
                                                        className={cn(
                                                            "cursor-pointer transition-colors border-b border-gray-100",
                                                            isExpanded ? "bg-blue-50/50 hover:bg-blue-50" : "hover:bg-gray-50"
                                                        )}
                                                        onClick={() => toggleExpand(item.medicine_id)}
                                                    >
                                                        <TableCell>
                                                            <div className={cn("transition-transform duration-200", isExpanded && "rotate-90")}>
                                                                <ChevronRight className="h-4 w-4 text-gray-400" />
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-semibold text-gray-900">{item.medicine_name}</div>
                                                            <div className="text-xs text-gray-500">{item.pack_size}</div>
                                                        </TableCell>

                                                        {/* STOCK DISPLAY WITH UNITS */}
                                                        <TableCell className="text-right">
                                                            <div className="font-mono font-medium text-gray-900">{item.total_quantity} Packs</div>
                                                            {item.total_units > 0 && (
                                                                <div className="text-xs text-blue-600 bg-blue-50 inline-block px-1.5 py-0.5 rounded mt-0.5">
                                                                    {item.total_units} Units Total
                                                                </div>
                                                            )}
                                                        </TableCell>

                                                        <TableCell className="text-right">
                                                            <div className="font-bold text-gray-900">₹{item.total_value_mrp.toLocaleString()} <span className="text-[10px] font-normal text-gray-400 ml-1">MRP</span></div>
                                                            <div className="text-xs text-gray-500">₹{item.total_value_cost.toLocaleString()} <span className="text-[10px] text-gray-400 ml-1">Cost</span></div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant={item.status === 'Out of Stock' ? 'destructive' : 'outline'}
                                                                className={item.status === 'In Stock' ? 'bg-green-50 text-green-700 border-green-200 whitespace-nowrap' : 'whitespace-nowrap'}>
                                                                {item.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={(e) => { e.stopPropagation(); toggleExpand(item.medicine_id); }}
                                                                className={cn("text-xs h-7", isExpanded ? "text-blue-700 bg-blue-100" : "text-blue-600 hover:text-blue-700")}
                                                            >
                                                                {isExpanded ? 'Hide Batches' : 'View Batches'}
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>

                                                    {/* EXPANDED DETAIL ROW */}
                                                    {isExpanded && (
                                                        <TableRow className="bg-gray-50/50 border-b-2 border-blue-100 animate-in fade-in duration-200">
                                                            <TableCell colSpan={6} className="p-0">
                                                                <div className="p-4 pl-12">
                                                                    <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                                                                        <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Batch Details</span>
                                                                            <span className="text-xs text-gray-400">Found {item.batches.length} active batches</span>
                                                                        </div>
                                                                        {item.batches.length > 0 ? (
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow className="h-8 hover:bg-transparent">
                                                                                        <TableHead className="h-8 text-xs font-semibold">Batch No</TableHead>
                                                                                        <TableHead className="h-8 text-xs font-semibold">Expiry</TableHead>
                                                                                        <TableHead className="h-8 text-xs font-semibold text-right">Start Packs</TableHead>
                                                                                        <TableHead className="h-8 text-xs font-semibold text-right">Remaining Packs</TableHead>
                                                                                        <TableHead className="h-8 text-xs font-semibold text-right">Loose Units</TableHead>
                                                                                        <TableHead className="h-8 text-xs font-semibold text-right">Rate (Cost)</TableHead>
                                                                                        <TableHead className="h-8 text-xs font-semibold text-right">MRP</TableHead>
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {item.batches.map((b, idx) => (
                                                                                        <TableRow key={idx} className="h-9 hover:bg-blue-50/30">
                                                                                            <TableCell className="font-mono text-xs font-medium text-gray-900">{b.batch_number}</TableCell>
                                                                                            <TableCell className="text-xs text-red-600">{b.expiry_date}</TableCell>
                                                                                            {/* Currently we don't track start packs separately in this view, so just show current Qty as placeholder or omit */}
                                                                                            <TableCell className="text-xs text-right text-gray-400">-</TableCell>
                                                                                            <TableCell className="text-xs text-right font-bold text-gray-900">{b.quantity}</TableCell>
                                                                                            <TableCell className="text-xs text-right">
                                                                                                <Badge variant="secondary" className="font-normal text-[10px] h-5 bg-blue-100 text-blue-700 hover:bg-blue-100">
                                                                                                    {b.remaining_units} ({b.pack_size_quantity}/pk)
                                                                                                </Badge>
                                                                                            </TableCell>
                                                                                            <TableCell className="text-xs text-right text-gray-500">₹{b.purchase_rate}</TableCell>
                                                                                            <TableCell className="text-xs text-right font-bold text-gray-900">₹{b.mrp}</TableCell>
                                                                                        </TableRow>
                                                                                    ))}
                                                                                </TableBody>
                                                                            </Table>
                                                                        ) : (
                                                                            <div className="p-8 text-center text-gray-400 text-sm italic">
                                                                                No active batches in stock for this medicine.
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </React.Fragment>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB 2: PURCHASES --- */}
                <TabsContent value="purchases" className="space-y-4">
                    <Card className="border-none shadow-sm bg-white">
                        <CardHeader className="pb-2">
                            <div className="flex gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search invoice no or vendor..."
                                        className="pl-10"
                                        disabled
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="date"
                                        value={purchaseDateFilter}
                                        onChange={e => { setPurchaseDateFilter(e.target.value); fetchPurchases(); }}
                                        className="w-40"
                                    />
                                    {purchaseDateFilter && (
                                        <Button variant="ghost" size="sm" onClick={() => { setPurchaseDateFilter(''); fetchPurchases(); }}>Clear</Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {purchaseList.map(invoice => (
                                    <Card key={invoice.id} className="border shadow-sm overflow-hidden transform transition-all hover:shadow-md">
                                        <div className="bg-gray-50/50 p-4 flex items-center justify-between border-b">
                                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                                                <div>
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Vendor</div>
                                                    <div className="font-semibold text-gray-900">{invoice.vendor_name}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Invoice #</div>
                                                    <div className="font-mono text-sm">{invoice.invoice_number}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Date</div>
                                                    <div className="text-sm">{invoice.invoice_date}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold text-gray-900">₹{invoice.total_amount.toLocaleString()}</div>
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                    {invoice.status.toUpperCase()}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="bg-white p-4">
                                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">Items Purchased</div>
                                            <div className="grid grid-cols-1 gap-y-2">
                                                {invoice.items.map(item => (
                                                    <div key={item.id} className="grid grid-cols-12 gap-2 text-sm py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 px-2 rounded items-center">
                                                        <div className="col-span-5">
                                                            <div className="font-medium text-gray-800">{item.medicine_name}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">
                                                                BATCH: {item.batch_number} | {item.pack_size_quantity} Units/Pack
                                                            </div>
                                                        </div>
                                                        <div className="col-span-4 text-center">
                                                            <div className="text-xs">
                                                                <span className="font-semibold">{item.quantity_billed}</span> Billed
                                                                {item.quantity_free > 0 && <span className="text-green-600 ml-1">+ {item.quantity_free} Free</span>}
                                                            </div>
                                                            <div className="text-[10px] text-gray-400">
                                                                Total: {(item.quantity_billed + item.quantity_free) * item.pack_size_quantity} Units
                                                            </div>
                                                        </div>
                                                        <div className="col-span-3 text-right">
                                                            <div className="font-semibold text-gray-900">₹{item.total_amount.toLocaleString()}</div>
                                                            <div className="text-[10px] text-gray-500">Rate: ₹{item.unit_price} / pack</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                                {purchaseList.length === 0 && (
                                    <div className="h-32 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                                        No Purchase Records Found
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB 3: EXPIRY ALERTS --- */}
                <TabsContent value="expiry" className="space-y-4">
                    <Card className="border-none shadow-sm bg-white">
                        <CardHeader>
                            <CardTitle className="text-red-600 flex items-center gap-2">
                                <AlertCircle className="h-5 w-5" /> Expiry Alerts
                            </CardTitle>
                            <CardDescription>Items expired or expiring within 90 days.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader className="bg-red-50">
                                    <TableRow>
                                        <TableHead>Medicine</TableHead>
                                        <TableHead>Batch No</TableHead>
                                        <TableHead>Expiry Date</TableHead>
                                        <TableHead className="text-right">Stock Left</TableHead>
                                        <TableHead className="text-right">Value Loss</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expiringList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center text-green-600 font-medium">
                                                <CheckCircle2 className="h-6 w-6 mx-auto mb-2" />
                                                No expiry alerts. Stock is healthy!
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        expiringList.map((item, idx) => {
                                            const batch = item.batches[0];
                                            const isExpired = new Date(batch.expiry_date) < new Date();
                                            return (
                                                <TableRow key={idx} className={isExpired ? "bg-red-50/50" : "bg-orange-50/30"}>
                                                    <TableCell className="font-bold text-gray-800">{item.medicine_name}</TableCell>
                                                    <TableCell className="font-mono">{batch.batch_number}</TableCell>
                                                    <TableCell>
                                                        <div className={cn("font-medium", isExpired ? "text-red-600" : "text-orange-600")}>
                                                            {batch.expiry_date}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500">
                                                            {isExpired ? "EXPIRED" : "Expiring Soon"}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold">{batch.quantity} Packs</TableCell>
                                                    <TableCell className="text-right text-gray-500">₹{(batch.quantity * batch.purchase_rate).toLocaleString()}</TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
