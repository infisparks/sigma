"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    Search, User, Calendar, Filter,
    ArrowLeft, ArrowRight, FilePenLine,
    Activity, CreditCard, AlertCircle, Pill, X,
    Users, Trash2, CheckCircle
} from "lucide-react"
import { useUserRole } from "@/components/userrole"
import { useRouter } from "next/navigation"
import { format, subDays, startOfDay, endOfDay } from "date-fns" // Recommended for date logic, but I'll use native JS if you don't have date-fns

import OPDRecordEditModal from "./OPDRecordEditModal"

// --- Types & Constants ---
const TABLE = {
    OPD_REGISTRATION: "opd_registration",
    PATIENT: "patient_detail",
    CONFIG: "config_data",
} as const

type DateFilterType = 'today' | 'yesterday' | 'all' | 'custom';

interface OPDRecord {
    id: number;
    uhid: string;
    treating_doctor_id: number;
    total_fees: number;
    discount_amount: number;
    amount_paid: number;
    created_at: string;
    patient_name?: string;
    patient_number?: string;
    doctor_name?: string;
    referring_doctor_name: string;
    payment_entries?: { amount: number; paymentMode: string }[];
    is_finalized?: boolean;
}

interface DoctorFee {
    id: number;
    doctor_name: string;
    first_visit_fee: number;
    follow_up_fee: number;
}

// --- Helper Functions ---

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0
    }).format(amount);
}

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

// Native Date Helpers
const getTodayRange = () => {
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();
    return { start, end, label: now.toISOString().split('T')[0] };
}

const getYesterdayRange = () => {
    const now = new Date();
    const yesterday = new Date(now.setDate(now.getDate() - 1));
    const start = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();
    return { start, end, label: yesterday.toISOString().split('T')[0] };
}

// --- Main Component ---
export default function OPDDashboard() {
    const router = useRouter();
    const { role } = useUserRole();

    // --- State ---
    const [records, setRecords] = useState<OPDRecord[]>([]);
    const [doctorList, setDoctorList] = useState<DoctorFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter States
    const [filterType, setFilterType] = useState<DateFilterType>('today');
    const [customStartDate, setCustomStartDate] = useState(getTodayRange().label);
    const [customEndDate, setCustomEndDate] = useState(getTodayRange().label);

    // Search States
    const [searchInput, setSearchInput] = useState(''); // What user types
    const [appliedSearch, setAppliedSearch] = useState(''); // What we actually search (for 'All' mode)
    const [searchField, setSearchField] = useState<'uhid' | 'name' | 'number' | 'doctor'>('name');
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>('0');

    // Pagination
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 20;

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

    // --- Fetch Logic ---
    const fetchDashboardData = useCallback(async (searchOverride?: string) => {
        const currentSearch = typeof searchOverride === 'string' ? searchOverride : appliedSearch;
        setLoading(true);
        setError(null);
        try {
            // 1. Fetch Config (Doctors) if empty
            let fetchedDoctors = doctorList;
            if (doctorList.length === 0) {
                const { data: doctorConfig } = await supabase.from(TABLE.CONFIG)
                    .select('data')
                    .eq('data_heading', 'opd_doctor_data')
                    .single();
                fetchedDoctors = (doctorConfig?.data as DoctorFee[]) ?? [];
                setDoctorList(fetchedDoctors);
            }

            // 2. Determine Date Range
            let start: string | null = null;
            let end: string | null = null;

            if (filterType === 'today') {
                const r = getTodayRange();
                start = r.start;
                end = r.end;
            } else if (filterType === 'yesterday') {
                const r = getYesterdayRange();
                start = r.start;
                end = r.end;
            } else if (filterType === 'custom') {
                start = `${customStartDate}T00:00:00.000Z`;
                end = `${customEndDate}T23:59:59.999Z`;
            }
            // If filterType === 'all', start/end remain null (fetch everything)

            // 3. Build Query
            let query = supabase
                .from(TABLE.OPD_REGISTRATION)
                .select(`
                    id, uhid, treating_doctor_id, total_fees, discount_amount, amount_paid, created_at, referring_doctor_name, payment_entries, is_finalized,
                    ${TABLE.PATIENT}!inner (name, number)
                `);

            // Apply Date Filters (Skip if 'all' and NOT searching specific record)
            if (start && end) {
                query = query.gte('created_at', start).lte('created_at', end);
            }

            // Apply Doctor Filter
            if (selectedDoctorId && selectedDoctorId !== '0') {
                query = query.eq('treating_doctor_id', Number(selectedDoctorId));
            }

            // Apply Server-Side Search (Specifically for 'All' mode or explicit search)
            // Note: For 'Today'/'Yesterday', we usually fetch all and client-filter, 
            // but if 'All' is selected, we MUST filter server-side.
            // Apply Server-Side Search (Specifically for 'All' mode or explicit search)
            if (filterType === 'all' && currentSearch.length >= 1) { // Allow search with fewer chars if explicit field
                if (searchField === 'uhid') {
                    query = query.ilike('uhid', `%${currentSearch}%`);
                } else if (searchField === 'name') {
                    query = query.ilike('patient_detail.name', `%${currentSearch}%`);
                } else if (searchField === 'number') {
                    // Start of number logic or exact match might be better, but partial is flexible
                    query = query.ilike('patient_detail.number', `%${currentSearch}%`);
                    // Note: 'number' column is BigInt, Supabase PostgREST casts automatically for ilike often, 
                    // or requires casting. Safest is usually equality for numbers, or text search if column is text.
                    // If it fails on ILIKE with bigint, we might need equality unless we cast in SQL View.
                    // Trying text cast via filter:
                    query = query.filter('patient_detail.number', 'cs', `{"${currentSearch}"}`); // hacky for joined?
                    // Reverting to basic ilike, if implicit cast fails, we might need eq for number or text cast.
                    // However, standard PostgREST ilike on joined number often works if cast is handled by PG.
                    // Let's assume text search on name/uhid is primary. For number, let's try strict equality for safety first,
                    // or use a text cast hint if we could. 
                    // Safer approach for BigInt partial search: logic is complex without SQL functions.
                    // Let's rely on simple filter for now, assuming number search is exact or largely sufficient.
                    // CHANGED: Use simple equality for numbers to avoid casting issues in simple queries, 
                    // OR if user wants partial, use 'text' column logic if feasible.
                    // Better yet, for this tool, let's assume 'ilike' works if we don't have explicit type info blocking it,
                    // but since Schema says bigint, `ilike` is invalid.
                    // We will use `.eq` if it looks like a number, else ignore.
                    if (/^\d+$/.test(currentSearch)) {
                        query = query.filter('patient_detail.number', 'eq', currentSearch);
                    }
                } else if (searchField === 'doctor') {
                    // Filter client side doctor list to find IDs, then search by those IDs
                    // This mimics "Search by Doctor Name"
                    const matchingDocs = fetchedDoctors.filter(d => d.doctor_name.toLowerCase().includes(currentSearch.toLowerCase()));
                    if (matchingDocs.length > 0) {
                        const ids = matchingDocs.map(d => d.id);
                        query = query.in('treating_doctor_id', ids);
                    } else {
                        // No matches, ensure no results
                        query = query.eq('id', -1);
                    }
                }
            } else if (filterType === 'all' && !currentSearch) {
                // If All and No Search -> Pagination logic applies heavily
                query = query.order('created_at', { ascending: false })
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                // Fetch Count as well
                const { count } = await supabase
                    .from(TABLE.OPD_REGISTRATION)
                    .select('*', { count: 'exact', head: true });
                if (count !== null) setTotalCount(count);
            } else {
                // For Today/Yesterday/Custom, we order by date
                query = query.order('created_at', { ascending: false });
                // If it's today/yesterday, we generally want ALL records to allow client filtering
                // so we don't limit unless the dataset is huge (e.g. > 500/day)
                if (filterType === 'all') {
                    query = query.limit(pageSize);
                }
            }

            const { data: opdRecords, error: opdError } = await query;
            if (opdError) throw opdError;

            // 4. Map Data
            const mappedRecords: OPDRecord[] = (opdRecords ?? []).map((r: any) => ({
                id: r.id,
                uhid: r.uhid,
                treating_doctor_id: r.treating_doctor_id,
                total_fees: r.total_fees,
                discount_amount: r.discount_amount || 0,
                amount_paid: r.amount_paid,
                created_at: r.created_at,
                referring_doctor_name: r.referring_doctor_name,
                payment_entries: Array.isArray(r.payment_entries) ? r.payment_entries : [],

                patient_name: r[TABLE.PATIENT]?.name || 'Unknown Patient',
                patient_number: r[TABLE.PATIENT]?.number || '',
                doctor_name: fetchedDoctors.find(d => d.id === r.treating_doctor_id)?.doctor_name || 'Unknown Doctor',
                is_finalized: r.is_finalized,
            }));

            setRecords(mappedRecords);

        } catch (err: any) {
            console.error("Fetch Error:", err);
            setError(err.message || "Failed to load data.");
        } finally {
            setLoading(false);
        }
    }, [doctorList, filterType, customStartDate, customEndDate, selectedDoctorId, appliedSearch, page]);

    // --- Effects ---

    // Initial Load & Filter Changes
    // Initial Load & Filter Changes
    useEffect(() => {
        // If switching to 'All', clear search result unless user types again
        fetchDashboardData();
    }, [filterType, customStartDate, customEndDate, selectedDoctorId, page]);

    // specific effect for search trigger in All mode is handled by the button
    // specific effect for doctor change triggers fetch via dependency above

    // --- Client-Side Filtering (For Today/Yesterday) ---
    const displayedRecords = useMemo(() => {
        // Logic: 
        // 1. If 'All' mode: The records in state ARE the search results (Server filtered).
        // 2. If 'Today'/'Yesterday': Records are ALL records for that day. We filter Client-side.

        if (filterType === 'all') {
            return records; // Server side handled
        }

        // Client Side Filter for Today/Yesterday
        if (!searchInput) return records;

        const lower = searchInput.toLowerCase();
        return records.filter(r =>
            r.uhid.toLowerCase().includes(lower) ||
            r.patient_name?.toLowerCase().includes(lower) ||
            r.doctor_name?.toLowerCase().includes(lower)
        );
    }, [records, searchInput, filterType]);

    // Stats Calculation
    const stats = useMemo(() => {
        const totalPatients = displayedRecords.length;
        const totalRevenue = displayedRecords.reduce((acc, curr) => acc + curr.amount_paid, 0);
        const totalDue = displayedRecords.reduce((acc, curr) => acc + (curr.total_fees - (curr.discount_amount || 0) - curr.amount_paid), 0);

        // Revenue Breakdown
        let cashRevenue = 0;
        let onlineRevenue = 0;

        displayedRecords.forEach(r => {
            if (r.payment_entries && r.payment_entries.length > 0) {
                r.payment_entries.forEach(p => {
                    const mode = (p.paymentMode || "").toLowerCase();
                    if (mode === 'cash') cashRevenue += (p.amount || 0);
                    else onlineRevenue += (p.amount || 0);
                });
            } else {
                // Fallback for legacy records or missing entries: assume Cash if amount_paid > 0
                cashRevenue += r.amount_paid;
            }
        });

        return { totalPatients, totalRevenue, totalDue, cashRevenue, onlineRevenue };
    }, [displayedRecords]);

    // --- Handlers ---

    const handleSearchClick = () => {
        if (filterType !== 'all') return; // Should not happen via UI
        if (searchInput.length < 1) { // Relaxed validaton
            alert("Please enter a search term.");
            return;
        }
        setAppliedSearch(searchInput); // Keep state in sync
        fetchDashboardData(searchInput); // Force search immediately with current input
    };

    const handleClearSearch = () => {
        setSearchInput('');
        setAppliedSearch('');
        if (filterType === 'all') fetchDashboardData();
    };

    const handleFilterChange = (val: string) => {
        setFilterType(val as DateFilterType);
        setSearchInput('');
        setAppliedSearch('');
        setPage(0); // Reset page
    };

    const handleDeleteRecord = async (r: OPDRecord) => {
        if (!confirm(`Are you sure you want to delete the OPD record for ${r.patient_name}? This will archive the record.`)) return;

        try {
            // 1. Fetch full record details to archive
            const { data: fullRecord, error: fetchError } = await supabase
                .from(TABLE.OPD_REGISTRATION)
                .select('*')
                .eq('id', r.id)
                .single();

            if (fetchError) throw fetchError;
            if (!fullRecord) throw new Error("Record not found for deletion");

            // 2. Archive to dopd_registration
            const archivedData = {
                ...fullRecord,
                deleted: true,
                deleted_time: new Date().toISOString()
            };

            const { error: archiveError } = await supabase
                .from('dopd_registration')
                .insert(archivedData);

            if (archiveError) throw new Error(`Archive failed: ${archiveError.message}`);

            // 3. Delete from actual table
            const { error: deleteError } = await supabase
                .from(TABLE.OPD_REGISTRATION)
                .delete()
                .eq('id', r.id);

            if (deleteError) throw deleteError;

            // 4. Update UI
            setRecords(prev => prev.filter(rec => rec.id !== r.id));
            alert("Record deleted and archived successfully.");

        } catch (err: any) {
            console.error("Delete Error:", err);
            alert(err.message || "Failed to delete record.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50/50 p-4 md:p-8 space-y-6">

            {/* --- Header Section --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">OPD Dashboard</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage patient registrations and financials.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="bg-white border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => router.push('/pathology/pharmacy')}>
                        <Pill className="w-4 h-4 mr-2" /> Pharmacy
                    </Button>
                    <Button variant="outline" className="bg-white" onClick={() => fetchDashboardData()}>
                        <Activity className="w-4 h-4 mr-2 text-slate-500" /> Refresh
                    </Button>
                </div>
            </div>

            {/* --- Quick Stats --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-none shadow-sm bg-white ring-1 ring-slate-200/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">
                            {filterType === 'all' ? 'Filtered Patients' : 'Total Patients'}
                        </CardTitle>
                        <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{stats.totalPatients}</div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white ring-1 ring-slate-200/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Revenue</CardTitle>
                        <CreditCard className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalRevenue)}</div>
                        <div className="flex gap-3 mt-1.5 pt-1.5 border-t border-slate-100/50">
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Cash:</span>
                                <span className="text-[11px] font-black text-slate-600">{formatCurrency(stats.cashRevenue)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Online:</span>
                                <span className="text-[11px] font-black text-blue-600">{formatCurrency(stats.onlineRevenue)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white ring-1 ring-slate-200/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Pending Dues</CardTitle>
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalDue)}</div>
                    </CardContent>
                </Card>
            </div>

            {/* --- Advanced Filters & Search --- */}
            <Card className="border shadow-sm bg-white overflow-hidden">
                <div className="p-4 border-b bg-white flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center sticky top-0 z-10">

                    {/* 1. Date Toggle Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                        <div className="bg-slate-100 p-1 rounded-lg flex items-center shrink-0">
                            <button
                                onClick={() => handleFilterChange('today')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filterType === 'today' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Today
                            </button>
                            <button
                                onClick={() => handleFilterChange('yesterday')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filterType === 'yesterday' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Yesterday
                            </button>
                            <button
                                onClick={() => handleFilterChange('all')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filterType === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                All Time
                            </button>
                            <button
                                onClick={() => handleFilterChange('custom')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filterType === 'custom' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Custom
                            </button>
                        </div>

                        {/* Custom Date Inputs (Only visible if Custom) */}
                        {filterType === 'custom' && (
                            <div className="flex gap-2 animate-in fade-in slide-in-from-left-2">
                                <Input type="date" className="w-36 h-9" value={customStartDate} onChange={e => { setCustomStartDate(e.target.value); setPage(0); }} />
                                <Input type="date" className="w-36 h-9" value={customEndDate} onChange={e => { setCustomEndDate(e.target.value); setPage(0); }} />
                            </div>
                        )}

                        {/* Doctor Filter */}
                        <Select value={selectedDoctorId} onValueChange={(val) => { setSelectedDoctorId(val); setPage(0); }}>
                            <SelectTrigger className="w-[180px] h-9 bg-slate-50">
                                <SelectValue placeholder="All Doctors" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">All Doctors</SelectItem>
                                {doctorList.map(d => (
                                    <SelectItem key={d.id} value={String(d.id)}>{d.doctor_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 2. Intelligent Search Bar */}
                    <div className="flex gap-2 w-full xl:w-auto items-center">
                        {/* Search Field Selector (Visible only in All) */}
                        {filterType === 'all' && (
                            <Select value={searchField} onValueChange={(v: any) => setSearchField(v)}>
                                <SelectTrigger className="w-[110px] h-10 bg-slate-50 border-r-0 rounded-r-none focus:ring-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="name">Name</SelectItem>
                                    <SelectItem value="uhid">UHID</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="doctor">Doctor</SelectItem>
                                </SelectContent>
                            </Select>
                        )}

                        <div className="relative w-full xl:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                type="text"
                                placeholder={filterType === 'all' ? `Search by ${searchField}...` : "Filter current list..."}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && filterType === 'all') handleSearchClick();
                                }}
                                className={`pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white ${filterType === 'all' ? 'rounded-l-none border-l-0' : ''}`}
                            />
                            {searchInput && (
                                <button
                                    onClick={handleClearSearch}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* Search Button: Only for 'All' view */}
                        {filterType === 'all' && (
                            <Button
                                onClick={handleSearchClick}
                                disabled={searchInput.length < 4 || loading}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {loading ? '...' : 'Search'}
                            </Button>
                        )}
                    </div>
                </div>

                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Activity className="h-10 w-10 animate-pulse mb-4 text-blue-200" />
                            <p>Loading records...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-20 text-red-500 bg-red-50 m-4 rounded-lg">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                            {error}
                        </div>
                    ) : displayedRecords.length === 0 ? (
                        <div className="text-center py-20 text-slate-500">
                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search className="h-8 w-8 text-slate-300" />
                            </div>
                            <p className="text-lg font-medium text-slate-700">No records found</p>
                            {filterType === 'all' && !appliedSearch && (
                                <p className="text-sm text-slate-400 mt-1">Use the search bar to find older records (Min 4 chars).</p>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50/80 sticky top-0">
                                    <TableRow>
                                        <TableHead className="w-[120px]">UHID</TableHead>
                                        <TableHead>Patient Info</TableHead>
                                        <TableHead>Doctor</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-center">Report</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Status</TableHead>
                                        <TableHead className="w-[80px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayedRecords.map((r) => {
                                        const due = r.total_fees - (r.discount_amount || 0) - r.amount_paid;
                                        const netTotal = r.total_fees - (r.discount_amount || 0);
                                        return (
                                            <TableRow
                                                key={r.id}
                                                className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                                                onClick={() => router.push(`/pathology/opd/${r.id}/prescription`)}
                                            >
                                                <TableCell className="font-medium">
                                                    <span className="text-slate-700">{r.uhid}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-slate-900">{r.patient_name}</div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {r.patient_number ? `+91 ${r.patient_number}` : 'No Number'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="secondary" className="text-[10px] px-1 h-5">DR</Badge>
                                                        <span className="text-slate-600 text-sm truncate max-w-[150px]">{r.doctor_name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-slate-500 text-sm">
                                                    {formatDate(r.created_at)}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {r.is_finalized ? (
                                                        <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-100 flex items-center gap-1 mx-auto w-fit">
                                                            <CheckCircle className="w-3 h-3" /> Finalized
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-slate-400 font-normal mx-auto w-fit border-slate-200">
                                                            Draft
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {r.discount_amount > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-slate-900">{formatCurrency(netTotal)}</span>
                                                            <span className="text-[10px] text-slate-400 line-through">{formatCurrency(r.total_fees)}</span>
                                                        </div>
                                                    ) : (
                                                        formatCurrency(r.total_fees)
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {due <= 0 ? (
                                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">Paid</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                            Due: {formatCurrency(due)}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1 justify-end">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-emerald-600" onClick={(e) => { e.stopPropagation(); router.push(`/pathology/opd/${r.id}/prescription`); }}>
                                                            <Pill className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); setSelectedRecordId(r.id); setIsModalOpen(true); }}>
                                                            <FilePenLine className="h-4 w-4" />
                                                        </Button>
                                                        {role === 'admin' && (
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(r); }}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>

                {/* Pagination (Only show if 'All' view and not searching specific matches, or if list is long) */}
                <div className="border-t bg-slate-50/50 p-4 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                        {filterType === 'all' && !appliedSearch ?
                            `Page ${page + 1} of ${Math.ceil(totalCount / pageSize)}` :
                            appliedSearch ? `Search results for "${appliedSearch}"` : ''
                        }
                    </div>

                    {/* Only show pagination controls if we are NOT in a specific search result view that returns everything, OR if we want to paginate search results too. 
                        For this specific 'All' logic: Pagination is primarily for the browsing mode. */}
                    {filterType === 'all' && !appliedSearch && (
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading} className="h-8 bg-white">
                                <ArrowLeft className="h-3 w-3 mr-1" /> Prev
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount || loading} className="h-8 bg-white">
                                Next <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                        </div>
                    )}
                </div>
            </Card>

            {/* Edit Modal */}
            {isModalOpen && selectedRecordId !== null && (
                <OPDRecordEditModal
                    opdId={selectedRecordId}
                    doctorList={doctorList}
                    onClose={(refresh) => {
                        setIsModalOpen(false);
                        setSelectedRecordId(null);
                        if (refresh) fetchDashboardData();
                    }}
                />
            )}
        </div>
    );
}