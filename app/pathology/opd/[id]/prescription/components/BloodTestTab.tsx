"use client"

import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from "@/lib/supabase"
import { Loader2, AlertCircle, FileText, FlaskConical } from 'lucide-react'
import { cn } from "@/lib/utils"
import { format } from 'date-fns'

interface BloodTestTabProps {
    patientUhid: string
}

interface TestData {
    id: number
    created_at: string
    bloodtest_detail: any
    doctor_name: string
}

export default function BloodTestTab({ patientUhid }: BloodTestTabProps) {
    const [loading, setLoading] = useState(true)
    const [records, setRecords] = useState<TestData[]>([])
    const [error, setError] = useState<string | null>(null)
    const [selectedTest, setSelectedTest] = useState<string | null>(null)

    useEffect(() => {
        const fetchBloodTests = async () => {
            if (!patientUhid) return
            try {
                setLoading(true)
                const { data, error } = await supabase
                    .from('zregistration')
                    .select('id, created_at, bloodtest_detail, doctor_name')
                    .eq('UHID', patientUhid)
                    .order('created_at', { ascending: false })

                if (error) throw error
                setRecords(data || [])
            } catch (err: any) {
                console.error("Error fetching blood tests:", err)
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        fetchBloodTests()
    }, [patientUhid])

    // Derive available tests and normalized data
    const { availableTests, comparisonData } = useMemo(() => {
        const testsSet = new Set<string>()
        const allParameters = new Set<string>()
        const dateColumns: { date: string, id: number, doctor: string }[] = []
        const paramValues: Record<string, Record<number, string>> = {}

        records.forEach(record => {
            let detail = record.bloodtest_detail
            if (typeof detail === 'string') {
                try { detail = JSON.parse(detail) } catch { detail = {} }
            }
            if (!detail) return

            dateColumns.push({
                date: record.created_at,
                id: record.id,
                doctor: record.doctor_name || 'Generic'
            })

            // Iterate tests in detail
            Object.entries(detail).forEach(([testKey, testData]: [string, any]) => {
                // Use test name if available, otherwise format key
                // We'll use the key for selection to be safe
                testsSet.add(testKey)

                // Only process parameters if this is the selected test (or if none selected yet, effectively hidden logic handled in render? No, filter here is better)
                // But we need to know all available tests first.
                // So let's collect data structure fully, then filter in render or derived state.

                if (testData.parameters && Array.isArray(testData.parameters)) {
                    testData.parameters.forEach((param: any) => {
                        // We store values keyed by "TestKey:ParamName" to avoid collisions if different tests have same param name?
                        // Or purely ParamName? Usually ParamName is unique enough within a test.
                        // User wants to see "that particular patient all the blood test... click that test then show that test comparison".
                        // So we should associate params with test keys.

                        const uniqueParamKey = `${testKey}:::${param.name}`

                        if (!paramValues[uniqueParamKey]) paramValues[uniqueParamKey] = {}
                        paramValues[uniqueParamKey][record.id] = `${param.value} ${param.unit || ''}`.trim()
                    })
                }
            })
        })

        return {
            availableTests: Array.from(testsSet).sort(),
            comparisonData: {
                columns: dateColumns,
                values: paramValues
            }
        }
    }, [records])

    // Auto-select first test if none selected
    useEffect(() => {
        if (!selectedTest && availableTests.length > 0) {
            setSelectedTest(availableTests[0])
        }
    }, [availableTests, selectedTest])

    // Filter parameters for selected test
    const filteredParameters = useMemo(() => {
        if (!selectedTest) return []
        const params = Object.keys(comparisonData.values)
            .filter(k => k.startsWith(`${selectedTest}:::`))
            .map(k => k.split(':::')[1])
            .sort()
        return params
    }, [selectedTest, comparisonData])

    // Helper to get formatted test name
    const formatTestName = (key: string) => key.replace(/_/g, ' ').toUpperCase()

    if (loading) return <div className="flex items-center justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
    if (error) return <div className="flex items-center justify-center p-10 text-red-500"><AlertCircle className="w-5 h-5 mr-2" /> {error}</div>
    if (records.length === 0) return <div className="flex flex-col items-center justify-center p-10 text-slate-400"><FileText className="w-10 h-10 mb-2" /><p>No blood test records found.</p></div>

    return (
        <div className="h-full flex flex-col bg-white overflow-hidden">
            {/* Top Bar: Test Selection Tabs */}
            <div className="bg-slate-50 border-b p-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {availableTests.map(testKey => (
                        <button
                            key={testKey}
                            onClick={() => setSelectedTest(testKey)}
                            className={cn(
                                "text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all border",
                                selectedTest === testKey
                                    ? "bg-blue-600 text-white border-blue-600 shadow-md"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                            )}
                        >
                            {formatTestName(testKey)}
                        </button>
                    ))}
                    {availableTests.length === 0 && <span className="text-xs text-slate-400 italic p-1">No tests found in records</span>}
                </div>
            </div>

            {/* Comparison Table */}
            <div className="flex-1 overflow-auto p-2">
                {selectedTest && filteredParameters.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden border-slate-200">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-2 border-b border-r bg-slate-100 text-left font-semibold text-slate-600 w-[200px] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                        Parameter
                                    </th>
                                    {comparisonData.columns.map(col => (
                                        <th key={col.id} className="p-2 border-b border-r min-w-[120px] bg-slate-50 text-left">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800">{format(new Date(col.date), 'dd MMM yyyy')}</span>
                                                <span className="text-[10px] text-slate-400 font-normal truncate max-w-[110px]">{col.doctor}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredParameters.map((param, idx) => (
                                    <tr key={param} className={cn("hover:bg-blue-50/50 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                                        <td className="p-2 border-b border-r border-slate-100 font-medium text-slate-700 bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            {param}
                                        </td>
                                        {comparisonData.columns.map(col => {
                                            const val = comparisonData.values[`${selectedTest}:::${param}`]?.[col.id] || '-'
                                            return (
                                                <td key={`${param}-${col.id}`} className="p-2 border-b border-r border-slate-100 text-slate-600">
                                                    {val !== '-' ? (
                                                        <span className="font-semibold text-slate-800">{val}</span>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                        Select a test to view comparison
                    </div>
                )}
            </div>
            {/* Legend */}
            <div className="p-2 bg-slate-50 border-t text-[10px] text-slate-500 flex items-center justify-between">
                <span>Showing history for: <span className="font-bold text-slate-700">{selectedTest ? formatTestName(selectedTest) : '-'}</span></span>
                <span>{records.length} Records</span>
            </div>
        </div>
    )
}
