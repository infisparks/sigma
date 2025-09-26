'use client'

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
// Assuming '@/lib/supabase' and '@/components/global/Layout' exist
import { supabase } from "@/lib/supabase" 
import Layout from '@/components/global/Layout' 
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  FlaskConicalIcon, 
  UserIcon, 
  RefreshCcwIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  TestTubeIcon,
  TrendingUpIcon,
  InfoIcon
} from "lucide-react"

// --- Type Definitions (Extended for Comparison and Errors Fixes) ---

interface Subheading {
  is100: boolean;
  title: string;
  parameterNames: string[];
}

interface Test {
  testId: string | number
  testName: string
  price: number
  tpa_price?: number
}

interface Parameter {
  name: string;
  unit?: string;
  range?: string | Record<string, any>;
  value: string | number;
  valueType?: string;
  subparameters?: Parameter[];
}

interface BloodTestData {
  reportedOn: string;
  parameters: Parameter[];
  subheadings?: Subheading[];
}

interface PatientDetail {
  name: string
  age: number
  gender: string
  age_unit?: string 
  total_day?: number 
  uhid?: string
}

interface Registration {
  id: number
  registration_id: number
  visitType: string
  createdAt: string
  bloodTests: Test[]
  bloodtest_detail: Record<string, BloodTestData> 
  name: string
  age: number
  gender: string
  day_type?: string
  total_day?: number
  hospitalName?: string
  UHID?: string
  source_opd_id?: string | number
  reportDate: string
}

interface ComparisonColumnHeader {
  testKey: string;
  testDisplayName: string;
  reportedOn: string;
  dateKey: string;
  regId: number;
}

interface ComparisonRowData {
  testName: string; 
  testKey: string; 
  parameterName: string;
  unit: string;
  range: string;
  values: Record<string, string>;
  isOutOfRange: boolean;
  isTextType: boolean;
  indent: number;
}

interface ComparisonDisplayRow extends ComparisonRowData {
  subheadingTitle?: string;
}

interface TabData {
  testKey: string;
  testName: string;
  reportCount: number;
}

// --- Constants ---
const MAX_COMPARISON_COLUMNS = 30;

// --- Utility Functions ---

function isTestValueAdded(registration: Registration, test: Test): boolean {
  if (!registration.bloodtest_detail) return false
  
  const formatKey = (name: string) => name.toLowerCase().replace(/[\s-]/g, '_')
  const testKey = formatKey(test.testName);
  
  return testKey in registration.bloodtest_detail && registration.bloodtest_detail[testKey] !== null
}

function formatRegistrationDate(isoDateString: string, includeTime = true) {
  const d = new Date(isoDateString)
  if (isNaN(d.getTime())) return "Invalid Date"
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.hour12 = true;
  }

  return d.toLocaleDateString("en-IN", options)
}

function formatTestKey(name: string): string {
  return name.toLowerCase().replace(/[\s-]/g, '_')
}

function getPatientRangeString(patient: PatientDetail, param: Parameter): string {
  if (typeof param.range === "string") {
    return param.range;
  }
  
  const parseRangeKey = (key: string) => {
    key = key.trim()
    const suf = key.slice(-1)
    let mul = 1
    if (suf === "m") mul = 30
    else if (suf === "y") mul = 365
    const core = key.replace(/[dmy]$/, "")
    const [lo, hi] = core.split("-")
    return { lower: Number(lo) * mul || 0, upper: Number(hi) * mul || Number.POSITIVE_INFINITY }
  }

  const genderKey = patient.gender?.toLowerCase() ?? ""
  const age = patient.age ?? 0;
  const ageDays = patient.total_day && patient.age_unit ? Number(patient.total_day) : age * 365;
  let rangeStr = "";

  const rangeObj = param.range as Record<string, any[]>;
  const arr = rangeObj[genderKey] || [];

  for (const r of arr) {
    const { lower, upper } = parseRangeKey(r.rangeKey)
    if (ageDays >= lower && ageDays <= upper) {
      rangeStr = r.rangeValue
      break
    }
  }
  if (!rangeStr && arr.length) rangeStr = arr[arr.length - 1].rangeValue

  return rangeStr;
}

const parseNumericRangeString = (str: string): { lower: number, upper: number } | null => {
  const up = /^\s*up\s*(?:to\s*)?([\d.]+)\s*$/i.exec(str)
  if (up) {
    const upper = Number.parseFloat(up[1])
    return isNaN(upper) ? null : { lower: 0, upper }
  }
  const m = /^\s*([\d.]+)\s*(?:-|to)\s*([\d.]+)\s*$/i.exec(str)
  if (!m) return null
  const lower = Number.parseFloat(m[1]), upper = Number.parseFloat(m[2])
  return isNaN(lower) || isNaN(upper) ? null : { lower, upper }
}

function extractParameters(
  testDisplayName: string, 
  testKey: string, 
  bloodTestData: BloodTestData,
  patientDetails: PatientDetail,
  dateKey: string,
): ComparisonRowData[] {
  if (!bloodTestData || !bloodTestData.parameters) return [];
  
  const rows: ComparisonRowData[] = [];

  const processParameter = (param: Parameter, indent: number) => {
    const rangeStr = getPatientRangeString(patientDetails, param);
    const numRange = parseNumericRangeString(rangeStr);
    const rawValue = String(param.value || '').trim();
    const numVal = Number.parseFloat(rawValue);
    
    let valueWithIndicator = rawValue;
    let isOutOfRange = false;
    let isTextType = param.valueType === 'text' || isNaN(numVal); 

    if (!isTextType && numRange && !isNaN(numVal)) {
      if (numVal < numRange.lower) {
        isOutOfRange = true;
        valueWithIndicator = `${rawValue} L`;
      } else if (numVal > numRange.upper) {
        isOutOfRange = true;
        valueWithIndicator = `${rawValue} H`;
      }
    }

    const values: Record<string, string> = { [dateKey]: valueWithIndicator || '-' };

    rows.push({
      testName: testDisplayName,
      testKey: testKey,
      parameterName: param.name,
      unit: param.unit || '',
      range: rangeStr,
      values,
      isOutOfRange,
      isTextType,
      indent,
    });

    if (param.subparameters) {
      param.subparameters.forEach(subParam => processParameter(subParam, indent + 2));
    }
  };

  const indent = 0;
  bloodTestData.parameters.forEach(param => processParameter(param, indent));

  return rows;
}

// -----------------------------
// Main Component
// -----------------------------

export default function IpdBloodTestPage() {
  const params = useParams()
  const ipdId = params.id as string

  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [historicalData, setHistoricalData] = useState<Registration[]>([]) 
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showComparisonModal, setShowComparisonModal] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('')

  const patientDetails: PatientDetail | null = useMemo(() => {
    const reg = registrations.length > 0 ? registrations[0] : null;
    if (!reg) return null;
    return {
      name: reg.name,
      age: reg.age,
      gender: reg.gender,
      age_unit: reg.day_type,
      total_day: reg.total_day,
      uhid: reg.UHID,
    }
  }, [registrations]);
  
  const currentIpdRegIds = useMemo(() => {
    return new Set(registrations.map(reg => reg.id));
  }, [registrations]);

  const { availableTabs, allUniqueDateColumns } = useMemo(() => {
    const testMap = new Map<string, { testKey: string, testName: string, reportCount: number }>();
    const dateColumns: ComparisonColumnHeader[] = [];

    historicalData.forEach(reg => {
      if (reg.bloodtest_detail) {
        Object.entries(reg.bloodtest_detail).forEach(([testKey, testData]) => {
          if (testData?.reportedOn && currentIpdRegIds.has(reg.id)) {
            const testDisplayName = reg.bloodTests.find(t => formatTestKey(t.testName) === testKey)?.testName || testKey.replace(/_/g, ' ').toUpperCase();
            
            if (!testMap.has(testKey)) {
              testMap.set(testKey, { testKey, testName: testDisplayName, reportCount: 0 });
            }
            testMap.get(testKey)!.reportCount++;
            
            const dateKey = `${testKey}@${testData.reportedOn}`;
            dateColumns.push({
              testKey,
              testDisplayName,
              reportedOn: testData.reportedOn,
              dateKey,
              regId: reg.id,
            });
          }
        });
      }
    });
    
    const sortedDateColumns = dateColumns.sort((a, b) => new Date(b.reportedOn).getTime() - new Date(a.reportedOn).getTime());
    
    return {
      availableTabs: Array.from(testMap.values()).sort((a, b) => a.testName.localeCompare(b.testName)),
      allUniqueDateColumns: sortedDateColumns,
    };
  }, [historicalData, currentIpdRegIds]);
  
  const fetchHistoricalData = useCallback(async (uhid: string) => {
    if (!uhid) return;

    try {
      const { data, error } = await supabase
        .from("zregistration")
        .select(
          `
          id, registration_time, bloodtest_detail, 
          UHID, bloodtest_data, source_opd_id,
          patient_detail ( uhid )
          `,
        )
        .eq('UHID', uhid)
        .not('bloodtest_detail', 'is', null)
        .order("registration_time", { ascending: false })

      if (error) throw error;
      
      const mappedData: Registration[] = (data || []).map((row: any) => {
        const latestReportedOnForReg = Object.values(row.bloodtest_detail || {}).reduce((latest: string, testData: any) => {
          const reportedOn = testData?.reportedOn as string | undefined; 
          return (reportedOn && reportedOn > latest) ? reportedOn : latest;
        }, row.registration_time as string); 
        
        return {
          id: row.id,
          registration_id: row.id,
          visitType: '',
          createdAt: row.registration_time,
          bloodTests: (row.bloodtest_data || []).map((test: any) => ({
            ...test,
            testName: String(test.testName || ""),
          })),
          bloodtest_detail: row.bloodtest_detail || {},
          name: '', age: 0, gender: '',
          reportDate: latestReportedOnForReg,
          tpa: false,
          source_opd_id: row.source_opd_id,
        };
      });
      
      setHistoricalData(mappedData);
    } catch (e: any) {
      console.error("Error fetching historical data (by UHID):", e.message);
    }
  }, []);
  
  const fetchRegistrationsByIpdId = useCallback(async (id: string) => {
    if (!id) {
      setError("No IPD ID provided.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("zregistration")
        .select(
          `
          *,
          tpa,
          bill_no,
          UHID,
          source_opd_id,
          hospital_name,
          patient_detail ( 
            patient_id, name, age, gender, number, address, age_unit, total_day, title, uhid 
          )
          `,
        )
        .eq('source_opd_id', id)
        .order("registration_time", { ascending: false })

      if (error) throw error;
      if (!data || data.length === 0) {
        setError(`No registrations found associated with IPD ID: ${id}.`);
        setRegistrations([]);
        return;
      }

      const mappedData: Registration[] = data.map((registrationRow: any) => {
        const patientDetail: PatientDetail = registrationRow.patient_detail || {}
        
        const latestReportedOnForReg = Object.values(registrationRow.bloodtest_detail || {}).reduce((latest: string, testData: any) => {
          const reportedOn = testData?.reportedOn as string | undefined; 
          return (reportedOn && reportedOn > latest) ? reportedOn : latest;
        }, registrationRow.registration_time as string); 

        return {
          id: registrationRow.id,
          registration_id: registrationRow.id,
          visitType: registrationRow.visit_type || "",
          createdAt: registrationRow.registration_time || registrationRow.created_at,
          bloodTests: (registrationRow.bloodtest_data || []).map((test: any) => ({
            ...test,
            testName: String(test.testName || ""),
          })),
          bloodtest_detail: registrationRow.bloodtest_detail || {},
          name: patientDetail?.name ?? "Unknown",
          age: patientDetail?.age ?? 0,
          gender: patientDetail.gender,
          day_type: patientDetail.age_unit,
          total_day: patientDetail.total_day,
          UHID: registrationRow.UHID,
          source_opd_id: registrationRow.source_opd_id,
          tpa: registrationRow.tpa === true,
          hospitalName: registrationRow.hospital_name,
          reportDate: latestReportedOnForReg,
        }
      });

      setRegistrations(mappedData);
      
      if (mappedData[0]?.UHID) {
        fetchHistoricalData(mappedData[0].UHID);
      }

    } catch (e: any) {
      console.error("Error fetching registrations:", e.message);
      setError(`Failed to load registrations: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [fetchHistoricalData]);

  useEffect(() => {
    if (ipdId) {
      fetchRegistrationsByIpdId(ipdId)
    } else {
      setIsLoading(false)
      setError("No IPD ID provided in the URL.")
    }
  }, [ipdId, fetchRegistrationsByIpdId])

  // Set active tab when tabs become available
  useEffect(() => {
    if (availableTabs.length > 0 && !activeTab) {
      setActiveTab(availableTabs[0].testKey);
    }
  }, [availableTabs, activeTab]);
  
  const handleOpenComparison = useCallback(() => {
    setShowComparisonModal(true);
  }, []); 

  const singleTestComparisonData = useMemo(() => {
    if (!patientDetails || !activeTab) {
      return { selectedColumns: [], tableRows: [] as ComparisonDisplayRow[] };
    }
    
    const currentIpdHistoricalData = historicalData.filter(reg => currentIpdRegIds.has(reg.id));
    
    // Filter columns for the active test tab only
    const selectedColumns = allUniqueDateColumns
      .filter(col => col.testKey === activeTab && currentIpdRegIds.has(col.regId))
      .sort((a, b) => new Date(a.reportedOn).getTime() - new Date(b.reportedOn).getTime())
      .slice(-MAX_COMPARISON_COLUMNS);

    if (selectedColumns.length === 0) {
      return { selectedColumns: [], tableRows: [] as ComparisonDisplayRow[] };
    }
    
    // --- 1. Aggregate Data from all selected columns (reports) ---
    const groupedData: Record<string, ComparisonRowData> = {};

    currentIpdHistoricalData.forEach(reg => {
      const testData = reg.bloodtest_detail[activeTab];
      if (!testData?.reportedOn) return;

      const dateKey = `${activeTab}@${testData.reportedOn}`;
      const columnHeader = selectedColumns.find(col => col.dateKey === dateKey);

      if (!columnHeader) return;

      const testDisplayName = reg.bloodTests.find(t => formatTestKey(t.testName) === activeTab)?.testName || activeTab.replace(/_/g, ' ').toUpperCase();

      const newRows = extractParameters(
        testDisplayName,
        activeTab,
        testData,
        patientDetails,
        dateKey
      );

      newRows.forEach(row => {
        // Use parameterName as the unique key for grouping
        const uniqueKey = row.parameterName; 
        if (!groupedData[uniqueKey]) {
          groupedData[uniqueKey] = row;
        } else {
          // Add value for the current dateKey to the existing row
          groupedData[uniqueKey].values[dateKey] = row.values[dateKey];
        }
      });
    });

    // --- 2. Determine Ordering and Structure for Display ---
    const finalTableData: ComparisonDisplayRow[] = [];
    const addedParameters = new Set<string>();
    
    // Get the latest test detail to maintain parameter ordering and subheadings
    const latestTestDetail = currentIpdHistoricalData
      .map(reg => reg.bloodtest_detail[activeTab])
      .filter(detail => detail && detail.parameters && detail.parameters.length > 0)
      .sort((a, b) => new Date(b.reportedOn).getTime() - new Date(a.reportedOn).getTime())[0];
      
    const orderedParams = latestTestDetail?.parameters || [];
    const subheadings = latestTestDetail?.subheadings || [];
    
    // Helper to add a parameter row and all its subparameters
    const addParameterRow = (param: Parameter, indent: number, currentSubheadingTitle?: string) => {
      // Check if the parameter exists in the aggregated data
      const row = groupedData[param.name];
      // Only add if we have data AND it hasn't been added already (important for the two-pass approach)
      if (row && !addedParameters.has(param.name)) {
        // Ensure the values object is complete with '-' for missing reports
        const finalValues: Record<string, string> = {};
        selectedColumns.forEach(col => {
          finalValues[col.dateKey] = row.values[col.dateKey] || '-';
        });

        finalTableData.push({ 
          ...row, 
          indent, 
          values: finalValues,
          subheadingTitle: currentSubheadingTitle
        });
        addedParameters.add(param.name);
      }
      // Recursively add subparameters
      param.subparameters?.forEach(sp => addParameterRow(sp, indent + 2, currentSubheadingTitle));
    };
    
    // --- Determine Parameters in Subheadings (to find the "others") ---
    const subheadedParamNames = new Set<string>();
    subheadings.forEach(sh => {
      sh.parameterNames.forEach(name => subheadedParamNames.add(name));
    });
    
    // Helper to traverse and find all subparameters under a given parameter
    const getAllParameterNamesRecursive = (param: Parameter): string[] => {
      let names = [param.name];
      param.subparameters?.forEach(sp => {
        names = names.concat(getAllParameterNamesRecursive(sp));
      });
      return names;
    };
    
    // Populate the set with all parameters, including subparameters, that are part of a subheading structure
    orderedParams.forEach(p => {
        if (subheadedParamNames.has(p.name)) {
            getAllParameterNamesRecursive(p).forEach(name => subheadedParamNames.add(name));
        }
    });

    // --- 3. FIRST PASS: Process "Other" (Non-Subheaded) Parameters ---
    orderedParams.forEach(p => {
      // Check if the top-level parameter (and implicitly its subparameters) is NOT part of a subheading structure
      if (!subheadedParamNames.has(p.name)) {
        // Add with indent 0 and no subheading title
        addParameterRow(p, 0); 
      }
    });
    
    // --- 4. SECOND PASS: Process Subheadings and their Parameters ---
    subheadings.forEach(sh => {
      // Add the Subheading Row
      finalTableData.push({ 
        testName: activeTab.replace(/_/g, ' ').toUpperCase(), 
        testKey: activeTab, 
        parameterName: sh.title,
        unit: 'SUBHEADING', // Special unit to mark as a subheading row
        range: '',
        values: {},
        isOutOfRange: false,
        isTextType: true,
        indent: 0,
      });
      
      // Add parameters explicitly listed under the subheading
      sh.parameterNames.forEach(paramName => {
        // Find the top-level parameter object for the name
        const param = orderedParams.find(p => p.name === paramName);
        if (param) {
          // Add the parameter and its subparameters
          addParameterRow(param, 0, sh.title);
        }
      });
    });
    
    return {
      selectedColumns,
      tableRows: finalTableData
    };

  }, [historicalData, activeTab, patientDetails, allUniqueDateColumns, currentIpdRegIds]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-xl text-stone-700 font-medium">Loading Patient Data...</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 p-4 sm:p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-2xl p-8">
            <div className="text-center">
              <XCircleIcon className="h-16 w-16 text-red-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Data</h1>
              <p className="text-gray-700 mb-6">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  const primaryRegistration = registrations[0];
  let ageUnit = "Y";
  if (primaryRegistration.day_type === "month") ageUnit = "M";
  else if (primaryRegistration.day_type === "day") ageUnit = "D";

  const ComparisonModal = (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${showComparisonModal ? '' : 'hidden'}`}>
      <div className="flex items-center justify-center min-h-screen p-2 sm:p-4 text-center">
        <div className="fixed inset-0 bg-black opacity-75" onClick={() => setShowComparisonModal(false)}></div>
        
        <div className="inline-block w-full max-w-7xl mx-2 sm:mx-4 p-4 sm:p-8 my-4 sm:my-8 text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl relative">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-6 space-y-3 sm:space-y-0">
            <div className="flex items-center">
              <TrendingUpIcon className="h-6 w-6 mr-2 text-blue-600" />
              <h3 className="text-lg sm:text-2xl font-bold text-stone-700">
                Test Comparison - {patientDetails?.name}
              </h3>
            </div>
            <button
              className="text-gray-400 hover:text-gray-600 self-end sm:self-auto"
              onClick={() => setShowComparisonModal(false)}
            >
              <XCircleIcon className="w-6 h-6" />
            </button>
          </div>
          
          {/* Info Alert */}
          <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
            <div className="flex items-start">
              <InfoIcon className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Professional Test Analysis Dashboard</p>
                <p>Click on any test tab below to view detailed parameter comparisons across multiple reports within this IPD visit.</p>
              </div>
            </div>
          </div>

          {/* Test Tabs */}
          {availableTabs.length > 0 ? (
            <>
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <TestTubeIcon className="h-5 w-5 mr-2 text-green-600" />
                  Select Test for Detailed Analysis
                </h4>
                <div className="flex flex-wrap gap-2">
                  {availableTabs.map((tab) => (
                    <button
                      key={tab.testKey}
                      onClick={() => setActiveTab(tab.testKey)}
                      className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 border ${
                        activeTab === tab.testKey
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex flex-col items-center">
                        <span className="font-semibold">{tab.testName}</span>
                        <span className="text-xs opacity-75">
                          {tab.reportCount} report{tab.reportCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Single Test Comparison Table */}
              {activeTab && singleTestComparisonData.selectedColumns.length > 0 ? (
                <div>
                  <h4 className="text-xl font-bold text-blue-700 mb-4 flex items-center">
                    <FlaskConicalIcon className="h-5 w-5 mr-2" />
                    {availableTabs.find(t => t.testKey === activeTab)?.testName} - Detailed Analysis
                  </h4>
                  
                  <div className="overflow-x-auto border rounded-lg shadow-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-blue-600 to-blue-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 sm:px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider sticky left-0 bg-blue-600 z-20 min-w-[180px] sm:min-w-[220px]">
                            Parameter
                          </th>
                          <th className="px-2 sm:px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider w-16 sm:w-20">
                            Unit
                          </th>
                          <th className="px-2 sm:px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider min-w-[100px] sm:min-w-[120px]">
                            Range
                          </th>
                          {singleTestComparisonData.selectedColumns.map((col) => (
                            <th key={col.dateKey} className="px-2 sm:px-3 py-3 text-center text-xs font-bold text-white uppercase tracking-wider min-w-[80px] sm:min-w-[100px] border-l border-blue-500">
                              <div className="flex flex-col items-center space-y-1">
                                <CalendarIcon className="h-3 w-3" />
                                <span className="text-[10px] sm:text-xs">
                                  {new Date(col.reportedOn).toLocaleDateString("en-IN", {
                                    day: "2-digit", 
                                    month: "short",
                                    year: "2-digit"
                                  })}
                                </span>
                                <span className="text-[8px] sm:text-[10px] opacity-75">
                                  {new Date(col.reportedOn).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {singleTestComparisonData.tableRows.map((row, index) => {
                          const isSubheading = row.unit === 'SUBHEADING';
                          
                          return (
                            <tr 
                              key={`${row.testKey}-${row.parameterName}-${index}`}
                              className={`group hover:bg-gray-50 ${isSubheading ? 'bg-gray-100' : ''}`}
                            >
                              {isSubheading ? (
                                <td 
                                  colSpan={singleTestComparisonData.selectedColumns.length + 3} 
                                  className="px-2 sm:px-4 py-2 text-sm font-bold text-gray-800 bg-gray-100 sticky left-0 z-10 border-t-2 border-gray-300"
                                >
                                  <div className="flex items-center">
                                    <div className="h-2 w-2 bg-blue-500 rounded-full mr-2"></div>
                                    {row.parameterName.toUpperCase()}
                                  </div>
                                </td>
                              ) : (
                                <>
                                  <td 
                                    className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-900 sticky left-0 bg-white group-hover:bg-gray-50 z-10"
                                    style={{ paddingLeft: `${12 + row.indent * 8}px` }}
                                  >
                                    <div className="flex items-center">
                                      {row.indent > 0 && <div className="h-1 w-3 bg-gray-300 mr-2"></div>}
                                      <span className="truncate">{row.parameterName}</span>
                                    </div>
                                  </td>
                                  <td className="px-2 sm:px-3 py-2 text-xs text-gray-600 font-medium">
                                    {row.unit}
                                  </td>
                                  <td className="px-2 sm:px-3 py-2 text-xs text-gray-600">
                                    <div className="truncate" title={row.range}>
                                      {row.range}
                                    </div>
                                  </td>
                                  {singleTestComparisonData.selectedColumns.map((col) => (
                                    <td key={col.dateKey} className="px-2 sm:px-3 py-2 text-center border-l border-gray-200">
                                      <span 
                                        className={`inline-block px-2 py-1 rounded text-xs sm:text-sm font-bold ${
                                          row.isTextType 
                                            ? 'text-gray-700 bg-gray-100' 
                                            : row.values[col.dateKey]?.includes('L') 
                                              ? 'text-red-700 bg-red-100' 
                                              : row.values[col.dateKey]?.includes('H') 
                                                ? 'text-red-700 bg-red-100' 
                                                : 'text-green-700 bg-green-100'
                                        }`}
                                      >
                                        {row.values[col.dateKey] || '-'}
                                      </span>
                                    </td>
                                  ))}
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-gray-100 rounded-lg">
                  <RefreshCcwIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">No Reports Selected</p>
                  <p className="text-sm">Reports for the selected test are either not found or were not generated for the registrations in this IPD visit.</p>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-gray-500 bg-gray-100 rounded-lg">
              <TestTubeIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2">No Test Data Available</p>
              <p className="text-sm">No blood test reports found for comparison within this IPD visit.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-2 sm:p-4 lg:p-8">
        {ComparisonModal}
        
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                  <FlaskConicalIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">
                    Blood Test Dashboard
                  </h1>
                  <p className="text-blue-100 text-sm sm:text-base">
                    IPD ID: <span className="font-semibold">{ipdId}</span>
                  </p>
                </div>
              </div>
              
              {availableTabs.length > 0 && (
                <button
                  onClick={handleOpenComparison}
                  className="inline-flex items-center px-4 py-2 sm:px-6 sm:py-3 bg-white bg-opacity-20 text-white rounded-lg text-sm sm:text-base font-medium hover:bg-opacity-30 transition-all duration-200 backdrop-blur-sm border border-white border-opacity-30"
                >
                  <TrendingUpIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  <span className="hidden sm:inline">Advanced </span>Analysis
                </button>
              )}
            </div>
          </div>

          {/* Patient Information Card */}
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center">
                <UserIcon className="h-5 w-5 mr-2 text-blue-600" />
                Patient Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm">
                  <p className="text-xs sm:text-sm text-gray-500 mb-1">Full Name</p>
                  <p className="font-bold text-sm sm:text-lg text-blue-800 truncate">
                    {primaryRegistration.name}
                  </p>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm">
                  <p className="text-xs sm:text-sm text-gray-500 mb-1">UHID</p>
                  <p className="font-bold text-sm sm:text-base text-gray-800">
                    {primaryRegistration.UHID || 'N/A'}
                  </p>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm">
                  <p className="text-xs sm:text-sm text-gray-500 mb-1">Age / Gender</p>
                  <p className="font-bold text-sm sm:text-base text-gray-800">
                    {primaryRegistration.age} {ageUnit} / {primaryRegistration.gender}
                  </p>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm">
                  <p className="text-xs sm:text-sm text-gray-500 mb-1">Hospital</p>
                  <p className="font-bold text-sm sm:text-base text-gray-800 truncate">
                    {primaryRegistration.hospitalName || 'Not Specified'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Registrations Section */}
            <div className="space-y-4 sm:space-y-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center">
                <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 mr-2 text-green-600" />
                Registration History
                <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                  {registrations.length} record{registrations.length !== 1 ? 's' : ''}
                </span>
              </h2>
              
              {registrations.map((reg) => (
                <div key={reg.id} className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                  {/* Registration Header */}
                  <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-4 sm:p-6 border-b">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-3">
                            ID: {reg.id}
                          </span>
                          Registration Details
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                          <CalendarIcon className="h-4 w-4 inline mr-1" />
                          {formatRegistrationDate(reg.createdAt, true)}
                          {reg.hospitalName && (
                            <>
                              <span className="mx-2">•</span>
                              <span className="font-medium">{reg.hospitalName}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          reg.visitType === 'ipd' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {reg.visitType?.toUpperCase() || 'OPD'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tests List */}
                  <div className="p-4 sm:p-6">
                    {reg.bloodTests.length > 0 ? (
                      <div className="grid gap-3 sm:gap-4">
                        <h4 className="text-sm sm:text-base font-semibold text-gray-700 mb-2 flex items-center">
                          <TestTubeIcon className="h-4 w-4 mr-2 text-purple-600" />
                          Blood Tests ({reg.bloodTests.length})
                        </h4>
                        <div className="grid gap-2 sm:gap-3">
                          {reg.bloodTests.map((test) => {
                            const isAdded = isTestValueAdded(reg, test)
                            return (
                              <div
                                key={`${reg.id}-${test.testId}`}
                                className={`flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg transition-all duration-200 space-y-2 sm:space-y-0 ${
                                  isAdded 
                                    ? 'bg-green-50 border border-green-200 hover:bg-green-100' 
                                    : 'bg-red-50 border border-red-200 hover:bg-red-100'
                                }`}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={`p-2 rounded-full ${
                                    isAdded ? 'bg-green-100' : 'bg-red-100'
                                  }`}>
                                    <FlaskConicalIcon className={`h-4 w-4 ${
                                      isAdded ? 'text-green-600' : 'text-red-600'
                                    }`} />
                                  </div>
                                  <span className={`text-sm sm:text-base font-medium ${
                                    isAdded ? 'text-green-800' : 'text-red-800'
                                  }`}>
                                    {test.testName}
                                  </span>
                                </div>
                                
                                <div className="flex items-center justify-between sm:justify-end space-x-3">
                                  <span className="text-xs sm:text-sm text-gray-600 font-medium">
                                    ₹{test.price}
                                  </span>
                                  <span className={`inline-flex items-center px-2 sm:px-3 py-1 text-xs font-semibold rounded-full ${
                                    isAdded
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {isAdded ? (
                                      <>
                                        <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                        Completed
                                      </>
                                    ) : (
                                      <>
                                        <XCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                        Pending
                                      </>
                                    )}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <TestTubeIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                        <p className="text-gray-500 text-sm sm:text-base">
                          No blood tests associated with this registration
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Stats */}
            {availableTabs.length > 0 && (
              <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <TrendingUpIcon className="h-5 w-5 mr-2 text-blue-600" />
                  Available Test Analysis
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {availableTabs.map((tab) => (
                    <div key={tab.testKey} className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-800 text-sm truncate">
                          {tab.testName}
                        </h4>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                          {tab.reportCount}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        {tab.reportCount} report{tab.reportCount !== 1 ? 's' : ''} available
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}