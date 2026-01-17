"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import {
    format,
    subDays,
    startOfDay,
    endOfDay,
    parseISO,
} from "date-fns"
import {
    Search,
    IndianRupee,
    Wallet,
    Globe,
    Calendar,
    ArrowUpRight,
    Users,
    RefreshCw,
    Download,
    TrendingUp,
    PieChart as PieChartIcon,
    ArrowDownRight
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from "recharts"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import Layout from "@/components/global/Layout"
import { cn } from "@/lib/utils"
import { useUserRole } from "@/components/userrole"
import { useRouter } from "next/navigation"

// --- Types ---

interface PaymentEntry {
    amount: number;
    paymentMode: 'online' | 'cash';
    time: string;
}

interface OPDRegistration {
    id: number;
    uhid: string;
    total_fees: number;
    discount_amount: number;
    amount_paid: number;
    payment_entries: PaymentEntry[];
    created_at: string;
    visit_type: string;
    visit_category: string;
    referring_doctor_name: string;
    patient_detail: {
        name: string;
        number: string;
        uhid: string;
        gender: string;
        age: number;
    } | null;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export default function OPDAdminPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<OPDRegistration[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
        start: format(subDays(new Date(), 7), "yyyy-MM-dd"),
        end: format(new Date(), "yyyy-MM-dd")
    });
    const [activeTab, setActiveTab] = useState<'all' | 'today' | 'yesterday' | 'custom'>('custom');

    const { role, loading: roleLoading } = useUserRole();
    const router = useRouter();

    useEffect(() => {
        if (!roleLoading && role !== 'admin') {
            router.replace('/pathology/dashboard');
        }
    }, [role, roleLoading, router]);

    // --- Data Fetching ---

    const fetchData = useCallback(async (start?: string, end?: string) => {
        setRefreshing(true);
        try {
            const startDate = start || dateRange.start;
            const endDate = end || dateRange.end;

            const { data: opdData, error } = await supabase
                .from("opd_registration")
                .select(`
                    *,
                    patient_detail:patient_detail (
                        name,
                        number,
                        uhid,
                        gender,
                        age
                    )
                `)
                .gte("created_at", startOfDay(parseISO(startDate)).toISOString())
                .lte("created_at", endOfDay(parseISO(endDate)).toISOString())
                .order("created_at", { ascending: false });

            if (error) throw error;
            setData(opdData || []);
        } catch (err: any) {
            console.error("Error fetching OPD data:", err);
            toast.error("Failed to load OPD registrations");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [dateRange]);

    useEffect(() => {
        // Fetch last 7 days on mount
        const start = format(subDays(new Date(), 7), "yyyy-MM-dd");
        const end = format(new Date(), "yyyy-MM-dd");
        fetchData(start, end);
    }, [fetchData]);

    // --- Shortcuts ---

    const setToday = () => {
        const today = format(new Date(), "yyyy-MM-dd");
        setDateRange({ start: today, end: today });
        setActiveTab('today');
        fetchData(today, today);
    };

    const setYesterday = () => {
        const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
        setDateRange({ start: yesterday, end: yesterday });
        setActiveTab('yesterday');
        fetchData(yesterday, yesterday);
    };

    const handleCustomFilter = () => {
        setActiveTab('custom');
        fetchData();
    };

    // --- Calculations ---

    const stats = useMemo(() => {
        let totalRevenue = 0;
        let totalCash = 0;
        let totalOnline = 0;
        let totalDiscount = 0;
        let totalFees = 0;

        data.forEach(reg => {
            totalRevenue += reg.amount_paid || 0;
            totalDiscount += reg.discount_amount || 0;
            totalFees += reg.total_fees || 0;

            if (reg.payment_entries && Array.isArray(reg.payment_entries)) {
                reg.payment_entries.forEach(p => {
                    if (p.paymentMode === 'cash') totalCash += p.amount;
                    if (p.paymentMode === 'online') totalOnline += p.amount;
                });
            } else if (reg.amount_paid > 0) {
                totalCash += reg.amount_paid;
            }
        });

        return {
            totalRevenue,
            totalCash,
            totalOnline,
            totalDiscount,
            totalFees,
            count: data.length
        };
    }, [data]);

    const filteredData = useMemo(() => {
        return data.filter(reg => {
            const name = reg.patient_detail?.name?.toLowerCase() || "";
            const uhid = reg.uhid?.toLowerCase() || "";
            const phone = String(reg.patient_detail?.number || "").toLowerCase();
            const search = searchTerm.toLowerCase();
            return name.includes(search) || uhid.includes(search) || phone.includes(search);
        });
    }, [data, searchTerm]);

    const chartData = useMemo(() => {
        const groups: Record<string, { date: string, amount: number }> = {};

        data.forEach(reg => {
            const day = format(parseISO(reg.created_at), "MMM dd");
            if (!groups[day]) groups[day] = { date: day, amount: 0 };
            groups[day].amount += reg.amount_paid;
        });

        return Object.values(groups).reverse();
    }, [data]);

    const pieData = [
        { name: 'Cash', value: stats.totalCash },
        { name: 'Online', value: stats.totalOnline },
    ];

    if (loading || roleLoading || (role !== 'admin' && !roleLoading)) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-center">
                    <RefreshCw className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-slate-600 font-medium">
                        {roleLoading ? "Checking permissions..." : "Preparing Dashboard..."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">OPD Admin Insights</h1>
                        <p className="text-slate-500 mt-1 font-medium">Real-time payment analytics and registration monitoring</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            className="bg-white shadow-sm border-slate-200"
                            onClick={() => fetchData()}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh Data
                        </Button>
                        <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200">
                            <Download className="h-4 w-4 mr-2" />
                            Export Report
                        </Button>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center gap-6">
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full lg:w-auto">
                        <button
                            onClick={setToday}
                            className={`flex-1 lg:px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'today' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Today
                        </button>
                        <button
                            onClick={setYesterday}
                            className={`flex-1 lg:px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'yesterday' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Yesterday
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={`flex-1 lg:px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'custom' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Custom
                        </button>
                    </div>

                    <div className="flex items-center gap-2 w-full lg:w-auto">
                        <div className="relative flex-1 lg:w-44">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                type="date"
                                className="pl-9 h-10 border-slate-200 focus:ring-blue-500"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                        </div>
                        <span className="text-slate-400 font-bold">to</span>
                        <div className="relative flex-1 lg:w-44">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                type="date"
                                className="pl-9 h-10 border-slate-200 focus:ring-blue-500"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            />
                        </div>
                        <Button
                            onClick={handleCustomFilter}
                            className="bg-slate-900 hover:bg-slate-800 h-10 px-6 shrink-0"
                        >
                            Apply
                        </Button>
                    </div>

                    <div className="relative w-full lg:flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Find any user (UHID, Name, Phone)..."
                            className="pl-10 h-10 border-slate-200 focus:ring-blue-500 bg-slate-50/50"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <Card className="border-none shadow-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white overflow-hidden relative">
                            <div className="absolute right-[-10%] top-[-20%] h-32 w-32 bg-white/10 rounded-full blur-2xl" />
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                                        <IndianRupee className="h-5 w-5" />
                                    </div>
                                    <Badge className="bg-white/20 hover:bg-white/30 text-white border-none backdrop-blur-md">Collection</Badge>
                                </div>
                                <CardDescription className="text-blue-100 font-medium">Total Collected</CardDescription>
                                <CardTitle className="text-3xl font-black tracking-tight">₹{stats.totalRevenue.toLocaleString()}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs font-bold text-blue-100">
                                    <TrendingUp className="h-3 w-3 mr-1" />
                                    <span>From ₹{stats.totalFees.toLocaleString()} Total Bill</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <Card className="border-none shadow-xl bg-white overflow-hidden group">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:scale-110 transition-transform">
                                        <Wallet className="h-5 w-5" />
                                    </div>
                                    <Badge variant="outline" className="text-emerald-600 border-emerald-100 bg-emerald-50">Cash</Badge>
                                </div>
                                <CardDescription className="text-slate-500 font-medium">Cash Total</CardDescription>
                                <CardTitle className="text-3xl font-black text-slate-900 tracking-tight">₹{stats.totalCash.toLocaleString()}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                                    <div
                                        className="bg-emerald-500 h-full rounded-full transition-all duration-1000"
                                        style={{ width: `${(stats.totalCash / (stats.totalRevenue || 1)) * 100}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider text-right">
                                    {Math.round((stats.totalCash / (stats.totalRevenue || 1)) * 100)}% OF TOTAL
                                </p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                        <Card className="border-none shadow-xl bg-white overflow-hidden group">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-110 transition-transform">
                                        <Globe className="h-5 w-5" />
                                    </div>
                                    <Badge variant="outline" className="text-blue-600 border-blue-100 bg-blue-50">Online</Badge>
                                </div>
                                <CardDescription className="text-slate-500 font-medium">Online Total</CardDescription>
                                <CardTitle className="text-3xl font-black text-slate-900 tracking-tight">₹{stats.totalOnline.toLocaleString()}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                                    <div
                                        className="bg-blue-500 h-full rounded-full transition-all duration-1000"
                                        style={{ width: `${(stats.totalOnline / (stats.totalRevenue || 1)) * 100}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider text-right">
                                    {Math.round((stats.totalOnline / (stats.totalRevenue || 1)) * 100)}% OF TOTAL
                                </p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                        <Card className="border-none shadow-xl bg-white overflow-hidden group">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-slate-50 text-slate-600 rounded-lg group-hover:scale-110 transition-transform">
                                        <TrendingUp className="h-5 w-5" />
                                    </div>
                                    <Badge variant="outline" className="text-slate-600 border-slate-200">Balance</Badge>
                                </div>
                                <CardDescription className="text-slate-500 font-medium">Outstanding Amount</CardDescription>
                                <CardTitle className="text-3xl font-black text-rose-600 tracking-tight">
                                    ₹{(stats.totalFees - stats.totalRevenue - stats.totalDiscount).toLocaleString()}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs font-bold text-slate-400">
                                    <Users className="h-3 w-3 mr-1 text-blue-500" />
                                    <span>From {stats.count} Total Patients</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Card className="lg:col-span-2 border-none shadow-xl bg-white">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                    <TrendingUp className="h-5 w-5 text-blue-600" />
                                    Revenue Progression
                                </CardTitle>
                                <CardDescription>Tracking collection peaks and lows</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                                        tickFormatter={(val) => `₹${val >= 1000 ? val / 1000 + 'k' : val}`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                        formatter={(val: number) => [`₹${val.toLocaleString()}`, 'Revenue']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="amount"
                                        stroke="#2563eb"
                                        strokeWidth={4}
                                        fillOpacity={1}
                                        fill="url(#colorAmount)"
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-xl bg-white">
                        <CardHeader>
                            <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <PieChartIcon className="h-5 w-5 text-emerald-600" />
                                Payment Segregation
                            </CardTitle>
                            <CardDescription>Visual breakdown by mode</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px] flex flex-col justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={85}
                                        outerRadius={115}
                                        paddingAngle={8}
                                        dataKey="value"
                                        animationDuration={1500}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Table Section */}
                <Card className="border-none shadow-xl bg-white overflow-hidden rounded-2xl">
                    <CardHeader className="border-b border-slate-100 bg-slate-50/30">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-xl font-bold text-slate-800">Registration History</CardTitle>
                                <CardDescription>Analyzing {filteredData.length} patient records</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50">
                                <tr>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Patient Detail</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Visit Info</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Payment Modes</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Discount</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Net Collection</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                <AnimatePresence>
                                    {filteredData.map((reg, idx) => (
                                        <motion.tr
                                            key={reg.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="hover:bg-blue-50/30 transition-all duration-200 group cursor-pointer"
                                        >
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                                                        {reg.patient_detail?.name || 'Anonymous User'}
                                                    </span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded tracking-tighter uppercase">UHID: {reg.uhid}</span>
                                                        {reg.patient_detail?.number && (
                                                            <span className="text-[10px] text-slate-400 font-medium italic">{reg.patient_detail.number}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <Badge variant="secondary" className="w-fit text-[10px] font-black uppercase tracking-tight py-0 bg-blue-50 text-blue-700 hover:bg-blue-100 border-none">
                                                        {reg.visit_type}
                                                    </Badge>
                                                    <span className="text-[10px] text-slate-400 mt-1 font-bold">{reg.visit_category}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {reg.payment_entries && reg.payment_entries.length > 0 ? (
                                                        reg.payment_entries.map((p, i) => (
                                                            <Badge
                                                                key={i}
                                                                className={cn(
                                                                    "text-[9px] font-black uppercase tracking-widest py-0 border-none",
                                                                    p.paymentMode === 'cash' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                                                                )}
                                                                variant="outline"
                                                            >
                                                                {p.paymentMode}
                                                            </Badge>
                                                        ))
                                                    ) : (
                                                        <Badge className="text-[9px] font-black uppercase tracking-widest py-0 bg-slate-50 text-slate-400 border-none">CASH</Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                {reg.discount_amount > 0 ? (
                                                    <span className="text-amber-500 font-black text-sm tabular-nums">₹{reg.discount_amount}</span>
                                                ) : (
                                                    <span className="text-slate-300 font-medium text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <span className="text-lg font-black text-slate-900 tabular-nums">₹{reg.amount_paid.toLocaleString()}</span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-600">{format(parseISO(reg.created_at), "MMM dd, yyyy")}</span>
                                                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{format(parseISO(reg.created_at), "hh:mm a")}</span>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                        {filteredData.length === 0 && (
                            <div className="py-24 text-center">
                                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                    <Search className="h-8 w-8 text-slate-300" />
                                </div>
                                <h3 className="text-slate-900 font-bold">No results found</h3>
                                <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or search terms</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
