'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { ShoppingCart, Package, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function PharmacyDashboard() {
    const [stats, setStats] = useState({
        totalItems: 0,
        lowStock: 0,
        salesToday: 0,
        revenueToday: 0
    })
    const [recentSales, setRecentSales] = useState<any[]>([])

    useEffect(() => {
        fetchStats()
    }, [])

    const fetchStats = async () => {
        // 1. Inventory Stats
        const { data: inventory } = await supabase.from('pharmacy_inventory').select('current_stock, low_stock_limit')
        const totalItems = inventory?.length || 0
        const lowStock = inventory?.filter(i => i.current_stock <= i.low_stock_limit).length || 0

        // 2. Sales Today
        const today = new Date().toISOString().split('T')[0]
        const { data: sales } = await supabase
            .from('pharmacy_sales')
            .select('curr_total')
            .gte('created_at', today)

        const salesToday = sales?.length || 0
        const revenueToday = sales?.reduce((acc, curr) => acc + curr.curr_total, 0) || 0

        // 3. Recent Sales
        const { data: recent } = await supabase
            .from('pharmacy_sales')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5)

        setStats({ totalItems, lowStock, salesToday, revenueToday })
        setRecentSales(recent || [])
    }

    return (
        <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pharmacy Dashboard</h1>
                <div className="flex gap-2">
                    <Link href="/pharmacy/billing">
                        <Button className="bg-blue-600 hover:bg-blue-700">New Sale</Button>
                    </Link>
                    <Link href="/pharmacy/purchases">
                        <Button variant="outline">Add Stock</Button>
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue (Today)</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₹{stats.revenueToday.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">{stats.salesToday} transactions today</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.lowStock}</div>
                        <p className="text-xs text-muted-foreground">Medicines below limit</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Inventory</CardTitle>
                        <Package className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalItems}</div>
                        <p className="text-xs text-muted-foreground">Unique medicines</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-gray-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">-</div>
                        <p className="text-xs text-muted-foreground">Asset valuation</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Recent Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentSales.map(sale => (
                                <div key={sale.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                                    <div className="flex items-center gap-4">
                                        <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                                            <ShoppingCart className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium leading-none">{sale.customer_name}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {new Date(sale.created_at).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="font-bold">₹{sale.curr_total}</div>
                                </div>
                            ))}
                            {recentSales.length === 0 && <div className="text-center text-gray-500">No recent sales</div>}
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <Link href="/pharmacy/inventory" className="p-3 border rounded hover:bg-gray-50 flex justify-between items-center bg-white">
                            <span>Manage Inventory</span>
                            <Package className="h-4 w-4 text-gray-400" />
                        </Link>
                        <Link href="/pharmacy/vendors" className="p-3 border rounded hover:bg-gray-50 flex justify-between items-center bg-white">
                            <span>Vendor Directory</span>
                            <Package className="h-4 w-4 text-gray-400" />
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
