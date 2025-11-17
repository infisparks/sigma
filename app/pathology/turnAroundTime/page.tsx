'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChartIcon as ChartBarIcon,
  MicroscopeIcon as MagnifyingGlassIcon,
  CalendarIcon,
  MoveHorizontalIcon as AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  UserIcon,
  CheckCircleIcon,
  XCircleIcon,
} from 'lucide-react'
import type { Registration } from '../dashboard/types/dashboard'
import { Badge } from '@/components/ui/badge'
import { isTestFullyEntered, isAllTestsComplete, getLatestReportedOnTime, calculateTurnAroundTime } from '../dashboard/lib/dashboard-utils'

// Helper to get YYYY-MM-DD date string
const getTodayDateString = (): string => new Date().toISOString().split('T')[0];

// 1. UPDATED: Add totalTurnAroundTime to the interface
interface TurnAroundTimeMetrics {
  totalRegistrations: number
  totalTurnAroundTime: number
}

// 2. NEW HELPER: Function to format total seconds into Hrs:Min:Sec format
const formatTotalSecondsToHrsMinSec = (totalSeconds: number): string => {
  if (totalSeconds === 0) return '0h 0m 0s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
};


export default function TurnAroundTimePage() {
  const router = useRouter()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [metrics, setMetrics] = useState<TurnAroundTimeMetrics>({
    totalRegistrations: 0,
    totalTurnAroundTime: 0, // Initialize new metric
  })
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [hospitalFilter, setHospitalFilter] = useState<string>('all')
  // --- FIXED: Default dates to today ---
  const [startDate, setStartDate] = useState<string>(getTodayDateString())
  const [endDate, setEndDate] = useState<string>(getTodayDateString())
  const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false)
  const [isFilterContentMounted, setIsFilterContentMounted] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const filterContentRef = useRef<HTMLDivElement>(null)

  // Filter content mount effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFilterContentMounted(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  // Fetch registrations
  const fetchRegistrations = useCallback(async (start: string, end: string) => {
    setIsLoading(true)
    try {
      // Create ISO time strings for start and end of day in UTC (PostgreSQL default timezone)
      // NOTE: If your DB is set to 'Asia/Kolkata', use '+05:30' offset here for accurate filtering
      const startOfDay = `${start}T00:00:00+00:00` 
      const endOfDay = `${end}T23:59:59+00:00`

      const { data, error } = await supabase
        .from('zregistration')
        .select(
          `
          *,
          tpa,
          patient_detail ( 
            patient_id, uhid, name, age, gender, number, address, age_unit, total_day, title
          )
        `,
        )
        .gte('registration_time', startOfDay) // Filter by start date
        .lte('registration_time', endOfDay)   // Filter by end date
        .order('registration_time', { ascending: false })

      if (error) {
        console.error('TurnAroundTime: Supabase fetch registrations error:', error)
        throw error
      }

      const mappedData: Registration[] = (data || []).map((registrationRow: any) => {
        // --- FIXED: Use patient_detail ---
        const patientDetail = registrationRow.patient_detail || {};

        return {
          id: registrationRow.id,
          bloodtest_detail: registrationRow.bloodtest_detail || {}, 
          registration_id: registrationRow.id,
          visitType: registrationRow.visit_type || '',
          createdAt: registrationRow.registration_time || registrationRow.created_at,
          discountAmount: registrationRow.discount_amount || 0,
          amountPaid: registrationRow.amount_paid || 0,
          doctor_name: registrationRow.doctor_name,
          bloodTests: registrationRow.bloodtest_data || [],
          bloodtest: registrationRow.bloodtest_detail || {},
          sampleCollectedAt: registrationRow.samplecollected_time,
          paymentHistory: registrationRow.amount_paid_history || null,
          hospitalName: registrationRow.hospital_name,
          // --- FIXED: Map columns to patient_detail schema ---
          patient_id: patientDetail.uhid || '', 
          name: patientDetail.name || 'Unknown',
          patientId: patientDetail.uhid || '', // Use UHID for display
          age: patientDetail.age || 0,
          gender: patientDetail.gender,
          contact: patientDetail.number,
          address: patientDetail.address,
          day_type: patientDetail.age_unit, // Use age_unit
          total_day: patientDetail.total_day,
          title: patientDetail.title,
          tpa: registrationRow.tpa === true,
        }
      })

      setRegistrations(mappedData)
    } catch (error: any) {
      console.error('TurnAroundTime: Error fetching registrations:', error.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load and re-fetch when dates change
  useEffect(() => {
    fetchRegistrations(startDate, endDate)
  }, [fetchRegistrations, startDate, endDate])

  // Filter registrations (app-side filtering for search/hospital after DB fetch)
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      const term = searchTerm.trim().toLowerCase()
      const matchesSearch =
        !term ||
        r.name.toLowerCase().includes(term) ||
        (r.contact ? r.contact.toString().includes(term) : false) ||
        r.patientId.toLowerCase().includes(term)
      if (!matchesSearch) return false

      // Hospital filter
      if (hospitalFilter !== 'all') {
        if (hospitalFilter === 'Other' && r.hospitalName && !['Cigma Clinic'].includes(r.hospitalName)) {
          return true
        }
        if (hospitalFilter !== 'Other' && r.hospitalName !== hospitalFilter) {
          return false
        }
      }

      return true
    })
  }, [registrations, searchTerm, hospitalFilter])

  // 2. UPDATED: Calculate metrics based on filtered data
  const calculatedMetrics = useMemo(() => {
    const totalRegistrations = filteredRegistrations.length

    const completedRegistrations = filteredRegistrations.filter(isAllTestsComplete);
    let totalTATinSeconds = 0;
    completedRegistrations.forEach(r => {
        const tatString = calculateTurnAroundTime(r);
        if (tatString !== '-') {
            const parts = tatString.match(/(\d+)h (\d+)m/);
            if (parts) {
                const hours = parseInt(parts[1]);
                const minutes = parseInt(parts[2]);
                totalTATinSeconds += (hours * 3600) + (minutes * 60);
            }
        }
    });

    return {
      totalRegistrations,
      totalTurnAroundTime: totalTATinSeconds,
    }
  }, [filteredRegistrations])

  // Update metrics when filtered data changes
  useEffect(() => {
    setMetrics(calculatedMetrics)
  }, [calculatedMetrics])

  const handleToggleFilters = useCallback(() => {
    if (!isFiltersExpanded && !isFilterContentMounted) {
      setIsFilterContentMounted(true)
      setTimeout(() => {
        setIsFiltersExpanded(true)
      }, 50)
    } else {
      setIsFiltersExpanded(!isFiltersExpanded)
    }
  }, [isFiltersExpanded, isFilterContentMounted])

  // Status logic same as dashboard
  const getStatus = (registration: Registration) => {
    const sampleCollected = !!registration.sampleCollectedAt
    const complete = isAllTestsComplete(registration)
    return !sampleCollected ? "Not Collected" : complete ? "Completed" : "Pending"
  }

  const getStatusBadge = (registration: Registration) => {
    const status = getStatus(registration)

    switch (status) {
      case "Not Collected":
        return (
          <span
            className="px-2.5 py-0.5 text-xs rounded-full data-[status=not-collected]:bg-red-50 data-[status=not-collected]:text-red-700 font-medium"
            data-status="not-collected"
          >
            Not Collected
          </span>
        )
      case "Pending":
        return (
          <span
            className="px-2.5 py-0.5 text-xs rounded-full data-[status=pending]:bg-amber-50 data-[status=pending]:text-amber-700 font-medium"
            data-status="pending"
          >
            Pending
          </span>
        )
      case "Completed":
        return (
          <span
            className="px-2.5 py-0.5 text-xs rounded-full data-[status=completed]:bg-green-50 data-[status=completed]:text-green-700 font-medium"
            data-status="completed"
          >
            Completed
          </span>
        )
      default:
        return (
          <span
            className="px-2.5 py-0.5 text-xs rounded-full bg-gray-50 text-gray-700 font-medium"
          >
            No Tests
          </span>
        )
    }
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '-'

    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')

    return `${day}/${month}/${year}, ${displayHours}:${displayMinutes} ${ampm}`
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Turn Around Time Dashboard</h1>
        </div>
        
        {/* --- */}

        {/* 3. UPDATED: Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[
            {
              icon: ChartBarIcon,
              label: "Total Registrations",
              val: metrics.totalRegistrations,
              color: "from-blue-500 to-blue-600",
              textColor: "text-blue-600",
            },
            {
              icon: ClockIcon,
              label: "Total Turn Around Time",
              val: formatTotalSecondsToHrsMinSec(metrics.totalTurnAroundTime),
              color: "from-purple-500 to-purple-600",
              textColor: "text-purple-600",
            },
          ].map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="flex items-center p-4">
                <div className={`p-3 rounded-lg bg-gradient-to-br ${m.color} mr-4`}>
                  {React.createElement(m.icon, { className: "h-5 w-5 text-white" })}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{m.label}</p>
                  <p className={`text-2xl font-bold ${m.textColor}`}>
                    {m.val}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        
        {/* --- */}

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mb-6"
        >
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div
              className="p-4 border-b border-gray-100 flex justify-between items-center cursor-pointer"
              onClick={handleToggleFilters}
            >
              <h2 className="text-base font-semibold flex items-center text-gray-800">
                <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2 text-teal-600" />
                Filters & Search
              </h2>
              {isFiltersExpanded ? (
                <ChevronUpIcon className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
              )}
            </div>

            <div
              ref={filterContentRef}
              className={`${isFiltersExpanded ? "block" : "hidden"} transition-all duration-300`}
            >
              {isFilterContentMounted && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search name or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CalendarIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CalendarIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <select
                    value={hospitalFilter}
                    onChange={(e) => setHospitalFilter(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Hospital</option>
                    <option value="Cigma Clinic">Cigma Clinic</option>
                   
                  </select>
                </div>
              )}
            </div>
          </div>
        </motion.div>
        
        {/* --- */}

        {/* Turn Around Time Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-base font-semibold flex items-center text-gray-900">
              <ClockIcon className="h-4 w-4 mr-2 text-stone-700" />
              Turn Around Time {isLoading && <span className="ml-2 text-sm text-gray-500">(Loading...)</span>}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Patient</th>
                  <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Tests</th>
                  <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">
                    Registration Date & Time
                  </th>
                  <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Status</th>
                  <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Reported On</th>
                  <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Turn Around Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.map((registration) => {
                  // --- SHOW y/m/d as per day_type ---
                  let ageUnit = "y"
                  if (registration.day_type === "month") ageUnit = "m"
                  else if (registration.day_type === "day") ageUnit = "d"

                  return (
                    <tr key={registration.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-900 text-base">{registration.name}</span>
                            <span
                              className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full
                                ${registration.visitType === "opd" ? "data-[visit-type=opd]:bg-blue-50 data-[visit-type=opd]:text-blue-700" : "data-[visit-type=ipd]:bg-green-50 data-[visit-type=ipd]:text-green-700"}
                              `}
                              data-visit-type={registration.visitType}
                            >
                              {registration.visitType?.toUpperCase()}
                            </span>
                            {registration.hospitalName && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                                {registration.hospitalName}
                              </span>
                            )}
                            {registration.tpa && (
                              <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-800 border-blue-200">TPA</Badge>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            {registration.age}
                            {ageUnit} • {registration.gender} • {registration.contact?.toString() || "No contact"} • Reg#{registration.id}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {registration.bloodTests?.length ? (
                          <div className="max-h-20 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                            <ul className="space-y-1">
                              {registration.bloodTests.map((test: any) => {
                                const done = test.testType?.toLowerCase() === "outsource" || isTestFullyEntered(registration, test)
                                return (
                                  <li key={test.testId} className="flex items-center text-xs">
                                    {done ? (
                                      <CheckCircleIcon className="h-3 w-3 text-green-600 mr-1 flex-shrink-0" />
                                    ) : (
                                      <XCircleIcon className="h-3 w-3 text-red-600 mr-1 flex-shrink-0" />
                                    )}
                                    <span className={done ? "text-green-800" : "text-red-800"}>{test.testName}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No tests</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatDateTime(registration.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(registration)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {getLatestReportedOnTime(registration)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {calculateTurnAroundTime(registration)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filteredRegistrations.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-500">
                <ClockIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No registrations found.</p>
                <p className="text-sm">Try adjusting your filters or search terms.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}