"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Search, FileText, Calendar as CalendarIcon, FilterX,
    ArrowUpRight, CreditCard, Banknote, TrendingUp, History,
    Eye, Printer, Trash2
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
// import { DateRange } from "react-day-picker"

interface SaleItem {
    id: string
    medicine_name: string
    batch_number: string
    item_discount_amount: number | null
    discount_amount?: number // Added for compatibility
    quantity: number
    quantity_mode: string
    unit_price: number
    total_price: number
}

interface Sale {
    id: string
    customer_name: string
    customer_phone: string
    doctor_name: string
    payment_mode: string
    paid_amount_cash: number
    paid_amount_online: number
    subtotal: number
    discount_amount: number
    curr_total: number
    created_at: string
    status: string
    // items: SaleItem[] // We might fetch this separately or via join
}

export default function SalesDashboardPage() {
    const [sales, setSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Filters
    const [dateRange, setDateRange] = useState<{ from: Date, to: Date } | undefined>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date())
    })

    // Summary Metrics
    const [metrics, setMetrics] = useState({
        totalSales: 0,
        totalAmount: 0,
        totalCash: 0,
        totalOnline: 0
    })

    // Detail View
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
    const [saleItems, setSaleItems] = useState<SaleItem[]>([])
    const [detailsLoading, setDetailsLoading] = useState(false)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)

    useEffect(() => {
        fetchSales()
    }, [dateRange]) // Fetch when date range changes

    const fetchSales = async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('pharmacy_sales')
                .select('*')
                .order('created_at', { ascending: false })

            if (dateRange?.from && dateRange?.to) {
                // Ensure the 'to' date includes the full day
                const toDate = new Date(dateRange.to)
                toDate.setHours(23, 59, 59, 999)

                query = query
                    .gte('created_at', dateRange.from.toISOString())
                    .lte('created_at', toDate.toISOString())
            }

            const { data, error } = await query

            if (error) throw error

            setSales(data || [])
            calculateMetrics(data || [])

        } catch (e) {
            console.error('Error:', e)
        } finally {
            setLoading(false)
        }
    }

    const calculateMetrics = (data: Sale[]) => {
        let totalVal = 0
        let totalCash = 0
        let totalOnline = 0

        data.forEach(s => {
            totalVal += s.curr_total || 0

            if (s.payment_mode === 'Cash') {
                totalCash += s.curr_total || 0
            } else if (s.payment_mode === 'Online') {
                totalOnline += s.curr_total || 0
            } else if (s.payment_mode === 'Split') {
                totalCash += s.paid_amount_cash || 0
                totalOnline += s.paid_amount_online || 0
            }
        })

        setMetrics({
            totalSales: data.length,
            totalAmount: totalVal,
            totalCash: totalCash,
            totalOnline: totalOnline
        })
    }

    const handleDeleteSale = async (id: string) => {
        if (!confirm('Are you sure you want to DELETE this sale? Stock will be restored.')) return

        setLoading(true)
        try {
            const { error } = await supabase.rpc('delete_pharmacy_sale', { p_sale_id: id })
            if (error) throw error

            alert('Sale Deleted & Stock Restored.')
            setIsDetailsOpen(false)
            fetchSales() // Refresh list
        } catch (e: any) {
            console.error(e)
            alert('Delete Failed: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchSaleDetails = async (sale: Sale) => {
        setSelectedSale(sale)
        setIsDetailsOpen(true)
        setDetailsLoading(true)
        try {
            // 1. Get Items
            const { data: items, error } = await supabase
                .from('pharmacy_sale_items')
                .select('*')
                .eq('sale_id', sale.id)

            if (error) throw error
            if (!items || items.length === 0) {
                setSaleItems([])
                return
            }

            // 2. Get Medicine Names (Manual Join)
            const medIds = Array.from(new Set(items.map((i: any) => i.medicine_id)))
            const { data: meds } = await supabase
                .from('clinic_medicine')
                .select('id, name')
                .in('id', medIds)

            const medMap = new Map()
            meds?.forEach((m: any) => medMap.set(m.id, m.name))

            // 3. Merge
            const formattedData = items.map((item: any) => ({
                ...item,
                medicine_name: medMap.get(item.medicine_id) || 'Unknown Medicine'
            }))

            setSaleItems(formattedData)
        } catch (e) {
            console.error(e)
        } finally {
            setDetailsLoading(false)
        }
    }

    // Quick Date Filters
    const setToday = () => setDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) })
    const setThisWeek = () => setDateRange({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) })
    const setThisMonth = () => setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })

    const filteredSales = sales.filter(s =>
        s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.customer_phone?.includes(searchQuery)
    )

    return (
        <div className="flex flex-col h-screen bg-gray-50/50 p-6 overflow-hidden">

            {/* 1. Header & Filters */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-blue-600" />
                        Sales Dashboard
                    </h1>
                    <p className="text-sm text-gray-500">Overview of pharmacy billing & collections</p>
                </div>

                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border shadow-sm">
                    <Button variant="ghost" size="sm" onClick={setToday} className={cn("text-xs", dateRange?.from.getDate() === new Date().getDate() && "bg-blue-50 text-blue-700 font-bold")}>Today</Button>
                    <div className="h-4 w-px bg-gray-200" />
                    <Button variant="ghost" size="sm" onClick={setThisWeek} className="text-xs">This Week</Button>
                    <div className="h-4 w-px bg-gray-200" />
                    <Button variant="ghost" size="sm" onClick={setThisMonth} className="text-xs">This Month</Button>
                    <div className="h-4 w-px bg-gray-200" />

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 border-none bg-transparent hover:bg-gray-100 text-xs text-gray-600">
                                <CalendarIcon className="h-3 w-3 mr-2" />
                                Custom Range
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-4" align="end">
                            <div className="flex gap-2 mb-4">
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">Start Date</label>
                                    <Calendar
                                        mode="single"
                                        selected={dateRange?.from}
                                        onSelect={(d) => d && setDateRange(prev => ({ ...prev!, from: d }))}
                                        className="rounded-md border shadow"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">End Date</label>
                                    <Calendar
                                        mode="single"
                                        selected={dateRange?.to}
                                        onSelect={(d) => d && setDateRange(prev => ({ ...prev!, to: d }))}
                                        className="rounded-md border shadow"
                                    />
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* 2. Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="border-none shadow-sm bg-gradient-to-br from-blue-600 to-blue-700 text-white relative overflow-hidden">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium opacity-90 flex justify-between">
                            Total Revenue
                            <div className="bg-white/20 p-1.5 rounded-full"><TrendingUp className="h-4 w-4 text-white" /></div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                        <div className="text-2xl font-bold tracking-tight">₹{(metrics.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                        <p className="text-xs opacity-70 mt-1">{metrics.totalSales} Transactions</p>
                    </CardContent>
                    <div className="absolute -bottom-4 -right-4 bg-white/10 w-24 h-24 rounded-full blur-xl" />
                </Card>

                <Card className="border-none shadow-sm bg-white">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 flex justify-between">
                            Cash Collection
                            <div className="bg-green-100 p-1.5 rounded-full"><Banknote className="h-4 w-4 text-green-600" /></div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                        <div className="text-2xl font-bold text-gray-800">₹{(metrics.totalCash || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                        <p className="text-xs text-green-600 mt-1 font-medium">Physical Cash</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 flex justify-between">
                            Online Collection
                            <div className="bg-purple-100 p-1.5 rounded-full"><CreditCard className="h-4 w-4 text-purple-600" /></div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                        <div className="text-2xl font-bold text-gray-800">₹{(metrics.totalOnline || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                        <p className="text-xs text-purple-600 mt-1 font-medium">Digital/UPI</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white flex flex-col justify-center items-center text-center p-6">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Current Filter</p>
                    <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                        {dateRange ? `${format(dateRange.from, 'dd MMM')} - ${format(dateRange.to, 'dd MMM')}` : 'All Time'}
                    </div>
                </Card>
            </div>

            {/* 3. Detailed List */}
            <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50/50">
                    <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                        <History className="h-4 w-4 text-gray-400" />
                        Transaction History
                    </h2>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                        <Input
                            placeholder="Search patient..."
                            className="pl-9 h-9 text-sm bg-white border-gray-200"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                <TableHead className="w-[140px]">Date & Time</TableHead>
                                <TableHead>Patient</TableHead>
                                <TableHead>Doctor</TableHead>
                                <TableHead className="text-center">Mode</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                                <TableHead className="text-right w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><div className="h-4 bg-gray-100 rounded w-24 animate-pulse" /></TableCell>
                                        <TableCell><div className="h-4 bg-gray-100 rounded w-32 animate-pulse" /></TableCell>
                                        <TableCell><div className="h-4 bg-gray-100 rounded w-20 animate-pulse" /></TableCell>
                                        <TableCell><div className="h-4 bg-gray-100 rounded w-16 mx-auto animate-pulse" /></TableCell>
                                        <TableCell><div className="h-4 bg-gray-100 rounded w-20 ml-auto animate-pulse" /></TableCell>
                                        <TableCell><div className="h-6 bg-gray-100 rounded w-8 ml-auto animate-pulse" /></TableCell>
                                    </TableRow>
                                ))
                            ) : filteredSales.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-gray-400">
                                        No sales found for the selected period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSales.map(sale => (
                                    <TableRow key={sale.id} className="hover:bg-blue-50/20 group">
                                        <TableCell className="text-xs text-gray-500">
                                            <div className="font-medium text-gray-800">{format(new Date(sale.created_at), 'dd MMM yyyy')}</div>
                                            <div>{format(new Date(sale.created_at), 'hh:mm a')}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium text-sm text-gray-900">{sale.customer_name}</div>
                                            <div className="text-[10px] text-gray-400">{sale.customer_phone || 'N/A'}</div>
                                        </TableCell>
                                        <TableCell className="text-xs text-gray-600">
                                            {sale.doctor_name || 'Self'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={cn(
                                                "text-[10px] px-2 py-1 rounded-full font-medium border",
                                                sale.payment_mode === 'Cash' ? "bg-green-50 text-green-700 border-green-100" :
                                                    sale.payment_mode === 'Online' ? "bg-purple-50 text-purple-700 border-purple-100" :
                                                        "bg-orange-50 text-orange-700 border-orange-100"
                                            )}>
                                                {sale.payment_mode}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-gray-900">
                                            ₹{(sale.curr_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => fetchSaleDetails(sale)}>
                                                <Eye className="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 flex justify-between">
                    <span>Showing {filteredSales.length} records</span>
                    <span>Values in INR (₹)</span>
                </div>
            </div>

            {/* Detail View Modal */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex justify-between items-center pr-8">
                            <span>Sale Details</span>
                            {selectedSale && <span className="text-sm font-normal text-gray-500 px-3 py-1 bg-gray-100 rounded-full">#{String(selectedSale.id).slice(0, 8)}</span>}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedSale && (
                        <div className="space-y-6">
                            {/* Summary Stats */}
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <div className="grid grid-cols-2 gap-4 mb-4 border-b pb-4">
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Patient Name</div>
                                        <div className="font-semibold text-lg">{selectedSale.customer_name}</div>
                                        <div className="text-xs text-gray-500 mt-1">{selectedSale.customer_phone || 'No Phone'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Payment Mode</div>
                                        <div className="font-medium text-lg text-blue-700">{selectedSale.payment_mode}</div>
                                        <div className="text-xs text-gray-500 mt-1">{format(new Date(selectedSale.created_at), 'dd MMM yyyy, hh:mm a')}</div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-8 text-sm">
                                    {selectedSale.discount_amount > 0 && (
                                        <>
                                            <div className="text-right">
                                                <div className="text-gray-500">Subtotal</div>
                                                <div className="font-medium">₹{(selectedSale.subtotal || 0).toLocaleString('en-IN')}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-gray-500">Discount</div>
                                                <div className="font-medium text-green-600">- ₹{(selectedSale.discount_amount || 0).toLocaleString('en-IN')}</div>
                                            </div>
                                        </>
                                    )}
                                    <div className="text-right">
                                        <div className="text-gray-500 font-bold">Total Payable</div>
                                        <div className="font-bold text-xl text-gray-900">₹{(selectedSale.curr_total || 0).toLocaleString('en-IN')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div>
                                <h3 className="text-sm font-semibold mb-2">Items Purchased</h3>
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-gray-50">
                                            <TableRow>
                                                <TableHead>Medicine</TableHead>
                                                <TableHead>Batch</TableHead>
                                                <TableHead className="text-right">Qty</TableHead>
                                                <TableHead className="text-right">Price</TableHead>
                                                <TableHead className="text-right text-green-600">Disc</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {detailsLoading ? (
                                                <TableRow><TableCell colSpan={6} className="text-center py-8">Loading items...</TableCell></TableRow>
                                            ) : (
                                                saleItems.map(item => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">{item.medicine_name}</TableCell>
                                                        <TableCell className="text-xs text-gray-500">{item.batch_number}</TableCell>
                                                        <TableCell className="text-right">
                                                            {item.quantity}
                                                            <span className="text-[10px] ml-1 text-gray-400">{item.quantity_mode}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs">₹{item.unit_price}</TableCell>
                                                        <TableCell className="text-right text-xs text-green-600 font-medium">
                                                            {item.item_discount_amount || item['discount_amount'] ?
                                                                `-₹${Number(item.item_discount_amount || item['discount_amount'] || 0).toFixed(2)}`
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">₹{item.total_price}</TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Close</Button>
                                {/* Future: Add Print Bill functionality here */}
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700"
                                    onClick={() => window.open(`/pharmacy/bill/${selectedSale.id}`, '_blank')}
                                >
                                    <Printer className="h-4 w-4 mr-2" /> Print Bill
                                </Button>
                                <Button
                                    className="bg-orange-600 hover:bg-orange-700 text-white ml-2"
                                    onClick={() => window.location.href = `/pharmacy/billing?id=${selectedSale.id}`}
                                >
                                    <FileText className="h-4 w-4 mr-2" /> Edit / Return
                                </Button>
                                <Button
                                    className="bg-red-600 hover:bg-red-700 text-white ml-2"
                                    onClick={() => handleDeleteSale(selectedSale.id)}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    )
}