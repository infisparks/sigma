// @/app/opd/opd-dashboard/page.tsx
"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge" // Ensure you have this shadcn component or remove if not
import {
    Search, User, Calendar, Filter,
    ArrowLeft, ArrowRight, FilePenLine,
    Activity, CreditCard, Users, AlertCircle, Pill
} from "lucide-react"
import { useRouter } from "next/navigation"

import OPDRecordEditModal from "./OPDRecordEditModal"

// --- Types & Constants ---
const TABLE = {
    OPD_REGISTRATION: "opd_registration",
    PATIENT: "patient_detail",
    CONFIG: "config_data",
} as const

interface OPDRecord {
    id: number;
    uhid: string;
    treating_doctor_id: number;
    total_fees: number;
    amount_paid: number;
    created_at: string;
    patient_name?: string;
    doctor_name?: string;
    referring_doctor_name: string;
}

interface DoctorFee {
    id: number;
    doctor_name: string;
    first_visit_fee: number;
    follow_up_fee: number;
}

// Helper: Format Currency
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0
    }).format(amount);
}

// Helper: Format Date
function formatDate(isoString: string | null | undefined): string {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return '-';
    }
}

const defaultEndDate = new Date().toISOString().split('T')[0];
const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// --- Main Component ---
export default function OPDDashboard() {
    const router = useRouter();

    // Data State
    const [records, setRecords] = useState<OPDRecord[]>([]);
    const [doctorList, setDoctorList] = useState<DoctorFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

    // Filter State
    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(0);
    const pageSize = 10;

    // Fetch Logic
    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Fetch Doctor List
            const { data: doctorConfig } = await supabase.from(TABLE.CONFIG)
                .select('data')
                .eq('data_heading', 'opd_doctor_data')
                .single();
            const fetchedDoctors = (doctorConfig?.data as DoctorFee[]) ?? [];
            setDoctorList(fetchedDoctors);

            // 2. Build Query
            let query = supabase
                .from(TABLE.OPD_REGISTRATION)
                .select(`
                    id, uhid, treating_doctor_id, total_fees, amount_paid, created_at, referring_doctor_name,
                    ${TABLE.PATIENT} (name)
                `)
                .gte('created_at', `${startDate}T00:00:00.000Z`)
                .lte('created_at', `${endDate}T23:59:59.999Z`)
                .order('created_at', { ascending: false })
                .limit(pageSize)
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (selectedDoctorId && selectedDoctorId !== '0') {
                query = query.eq('treating_doctor_id', Number(selectedDoctorId));
            }

            const { data: opdRecords, error: opdError } = await query;
            if (opdError) throw opdError;

            // 3. Map Data
            const mappedRecords: OPDRecord[] = (opdRecords ?? []).map((r: any) => ({
                id: r.id,
                uhid: r.uhid,
                treating_doctor_id: r.treating_doctor_id,
                total_fees: r.total_fees,
                amount_paid: r.amount_paid,
                created_at: r.created_at,
                referring_doctor_name: r.referring_doctor_name,
                patient_name: r[TABLE.PATIENT]?.name || 'Unknown Patient',
                doctor_name: fetchedDoctors.find(d => d.id === r.treating_doctor_id)?.doctor_name || 'Unknown Doctor',
            }));

            setRecords(mappedRecords);
        } catch (err: any) {
            console.error("Fetch Error:", err);
            setError(err.message || "Failed to load data.");
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedDoctorId, page]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // Client-side Search & Stats Calculation
    const filteredRecords = useMemo(() => {
        if (!searchTerm) return records;
        const lower = searchTerm.toLowerCase();
        return records.filter(r =>
            r.uhid.toLowerCase().includes(lower) ||
            r.patient_name?.toLowerCase().includes(lower) ||
            r.doctor_name?.toLowerCase().includes(lower)
        );
    }, [records, searchTerm]);

    // Calculate Summary Stats (Based on current view/page)
    const stats = useMemo(() => {
        const totalPatients = filteredRecords.length;
        const totalRevenue = filteredRecords.reduce((acc, curr) => acc + curr.amount_paid, 0);
        const totalDue = filteredRecords.reduce((acc, curr) => acc + (curr.total_fees - curr.amount_paid), 0);
        return { totalPatients, totalRevenue, totalDue };
    }, [filteredRecords]);

    const doctorOptions = useMemo(() => {
        return [{ id: 0, doctor_name: "All Doctors", first_visit_fee: 0, follow_up_fee: 0 }, ...doctorList]
    }, [doctorList]);

    // Handlers
    const handleEditClick = (id: number) => {
        setSelectedRecordId(id);
        setIsModalOpen(true);
    };

    const handleCloseModal = (shouldRefresh: boolean) => {
        setIsModalOpen(false);
        setSelectedRecordId(null);
        if (shouldRefresh) fetchDashboardData();
    };

    return (
        <div className="min-h-screen bg-gray-50/50 p-4 md:p-8 space-y-6">

            {/* --- Header Section --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">OPD Dashboard</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage patient registrations, finances, and doctor assignments.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="bg-white text-slate-700 shadow-sm" onClick={() => fetchDashboardData()}>
                        <Activity className="w-4 h-4 mr-2 text-slate-500" /> Refresh Data
                    </Button>
                </div>
            </div>

            {/* --- Quick Stats Cards --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-none shadow-sm bg-white ring-1 ring-slate-200/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Total Visits (Page)</CardTitle>
                        <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{stats.totalPatients}</div>
                        <p className="text-xs text-slate-500 mt-1">Patients listed in current view</p>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white ring-1 ring-slate-200/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Collected Revenue</CardTitle>
                        <CreditCard className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalRevenue)}</div>
                        <p className="text-xs text-emerald-600 mt-1">+12% from yesterday</p>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white ring-1 ring-slate-200/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Pending Dues</CardTitle>
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalDue)}</div>
                        <p className="text-xs text-amber-600 mt-1">Requires attention</p>
                    </CardContent>
                </Card>
            </div>

            {/* --- Filters & Main Content --- */}
            <Card className="border shadow-sm bg-white overflow-hidden">
                <div className="p-5 border-b bg-white flex flex-col lg:flex-row gap-4 items-end lg:items-center justify-between sticky top-0 z-10">

                    {/* Left: Filters */}
                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From</label>
                                <Input
                                    type="date"
                                    className="h-9 w-full sm:w-36 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                                    value={startDate}
                                    onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To</label>
                                <Input
                                    type="date"
                                    className="h-9 w-full sm:w-36 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                                    value={endDate}
                                    onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5 w-full sm:w-48">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Doctor</label>
                            <Select
                                value={selectedDoctorId}
                                onValueChange={(v) => { setSelectedDoctorId(v); setPage(0); }}
                            >
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-200 focus:bg-white"><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                                <SelectContent>
                                    {doctorOptions.map((d) => (
                                        <SelectItem key={d.id} value={String(d.id)}>{d.doctor_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Right: Search */}
                    <div className="relative w-full lg:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            type="text"
                            placeholder="Search by UHID, Name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                    </div>
                </div>

                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Activity className="h-10 w-10 animate-pulse mb-4 text-blue-200" />
                            <p>Loading records...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-20 text-red-500 bg-red-50 m-4 rounded-lg border border-red-100">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                            {error}
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="text-center py-20 text-slate-500">
                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <User className="h-8 w-8 text-slate-300" />
                            </div>
                            <p className="text-lg font-medium text-slate-700">No records found</p>
                            <p className="text-sm text-slate-400">Adjust filters or try a different date range.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50/80 backdrop-blur sticky top-0">
                                    <TableRow className="hover:bg-transparent border-slate-200">
                                        <TableHead className="w-[100px] font-semibold text-slate-600">UHID</TableHead>
                                        <TableHead className="min-w-[150px] font-semibold text-slate-600">Patient Info</TableHead>
                                        <TableHead className="font-semibold text-slate-600">Doctor</TableHead>
                                        <TableHead className="font-semibold text-slate-600">Date</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-600">Total</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-600">Status</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRecords.map((r) => {
                                        const dueAmount = r.total_fees - r.amount_paid;
                                        const isPaid = dueAmount <= 0;

                                        return (
                                            <TableRow key={r.id} className="group hover:bg-slate-50/80 transition-colors cursor-default">
                                                <TableCell className="font-medium text-slate-700">
                                                    <div className="flex flex-col">
                                                        <span>{r.uhid}</span>
                                                        <span className="text-[10px] text-slate-400">ID: #{r.id}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-slate-900">{r.patient_name}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                                                            DR
                                                        </div>
                                                        <span className="text-slate-600 text-sm">{r.doctor_name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-slate-500 text-sm">
                                                    {formatDate(r.created_at)}
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-slate-700">
                                                    {formatCurrency(r.total_fees)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isPaid ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                            Paid
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                            Due: {formatCurrency(dueAmount)}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => router.push(`/pathology/opd/${r.id}/prescription`)}
                                                        className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 mr-1"
                                                        title="Add Prescription"
                                                    >
                                                        <Pill className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleEditClick(r.id)}
                                                        className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                                    >
                                                        <FilePenLine className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>

                {/* Pagination Footer */}
                <div className="border-t bg-slate-50/50 p-4 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                        Showing page {page + 1}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0 || loading}
                            variant="outline"
                            className="h-8 bg-white"
                        >
                            <ArrowLeft className="h-3 w-3 mr-1" /> Prev
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={filteredRecords.length < pageSize || loading}
                            variant="outline"
                            className="h-8 bg-white"
                        >
                            Next <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Edit Modal */}
            {isModalOpen && selectedRecordId !== null && (
                <OPDRecordEditModal
                    opdId={selectedRecordId}
                    doctorList={doctorList}
                    onClose={handleCloseModal}
                />
            )}
        </div>
    );
}