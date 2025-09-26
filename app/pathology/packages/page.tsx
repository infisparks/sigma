'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Edit, Trash2, Package } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger, DialogClose } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useForm } from 'react-hook-form'

interface TestPackage {
  discountamount: number
  id: number
  package_name: string
  discount: number
  tests: any[]
  created_at: string
}

interface BloodTestRow {
  id: number
  test_name: string
  price: number
  outsource: boolean
}

interface PackageFormState {
  id?: number
  package_name: string
  discountamount: number
  tests: BloodTestRow[]
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<TestPackage[]>([])
  const [filteredPackages, setFilteredPackages] = useState<TestPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPackage, setEditingPackage] = useState<PackageFormState | null>(null)
  const [bloodTests, setBloodTests] = useState<BloodTestRow[]>([])
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    fetchPackages()
  }, [])

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = packages.filter(pkg =>
        pkg.package_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredPackages(filtered)
    } else {
      setFilteredPackages(packages)
    }
  }, [searchTerm, packages])

  // Fetch blood tests for selection
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('zblood_test')
        .select('id, test_name, price, outsource')
        .order('test_name')
      if (!error) setBloodTests(data || [])
    })()
  }, [])

  const fetchPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('zpackages')
        .select('*')
        .order('package_name')

      if (error) throw error
      setPackages(data || [])
      setFilteredPackages(data || [])
    } catch (error) {
      console.error('Error fetching packages:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculatePackageValue = (tests: any[]) => {
    if (!Array.isArray(tests)) return 0
    return tests.reduce((total, test) => total + (test.price || 0), 0)
  }

  // Add/Edit form logic
  const {
    register: formRegister,
    handleSubmit: formHandleSubmit,
    setValue: formSetValue,
    watch: formWatch,
    reset: formReset,
  } = useForm<PackageFormState>({
    defaultValues: {
      package_name: '',
      discountamount: 0,
      tests: [],
    },
  })

  // Watch selected tests
  const selectedTests = formWatch('tests') || []
  const discountAmount = Number(formWatch('discountamount')) || 0
  const totalValue = selectedTests.reduce((sum, t) => sum + (t.price || 0), 0)
  const finalPrice = Math.max(totalValue - discountAmount, 0)

  // Open form for add/edit
  function openForm(pkg?: TestPackage) {
    if (pkg) {
      // Editing
      setEditingPackage({
        id: pkg.id,
        package_name: pkg.package_name,
        discountamount: pkg.discount,
        tests: Array.isArray(pkg.tests) ? pkg.tests : [],
      })
      formReset({
        package_name: pkg.package_name,
        discountamount: pkg.discount,
        tests: Array.isArray(pkg.tests) ? pkg.tests : [],
      })
    } else {
      setEditingPackage(null)
      formReset({ package_name: '', discountamount: 0, tests: [] })
    }
    setShowForm(true)
  }

  // Save package (add or edit)
  async function onSubmitPackage(data: PackageFormState) {
    setFormLoading(true)
    try {
      const testJson = data.tests.map(t => ({
        testId: t.id,
        testName: t.test_name,
        price: t.price,
        testType: t.outsource ? 'outsource' : 'inhospital',
      }))
      if (editingPackage && editingPackage.id) {
        // Update
        const { error } = await supabase
          .from('zpackages')
          .update({
            package_name: data.package_name,
            discountamount: data.discountamount,
            tests: testJson,
          })
          .eq('id', editingPackage.id)
        if (error) throw error
      } else {
        // Insert
        const { error } = await supabase
          .from('zpackages')
          .insert({
            package_name: data.package_name,
            discountamount: data.discountamount,
            tests: testJson,
          })
        if (error) throw error
      }
      setShowForm(false)
      fetchPackages()
    } catch (err) {
      alert('Error saving package')
    } finally {
      setFormLoading(false)
    }
  }

  // Delete package
  async function deletePackage(id: number) {
    if (!window.confirm('Delete this package?')) return
    await supabase.from('zpackages').delete().eq('id', id)
    fetchPackages()
  }

  // Toggle test selection
  function toggleTest(test: BloodTestRow) {
    const current = formWatch('tests') || []
    if (current.some(t => t.id === test.id)) {
      formSetValue('tests', current.filter(t => t.id !== test.id))
    } else {
      formSetValue('tests', [...current, test])
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
       
        <div className="flex-1 p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Test Packages</h1>
            <p className="text-gray-600 mt-2">
              Manage test packages and bundle offers
            </p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Package Database</CardTitle>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search packages..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Badge variant="outline">
                    {filteredPackages.length} packages
                  </Badge>
                  <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => openForm()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Package
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package Name</TableHead>
                      <TableHead>Tests Included</TableHead>
                      <TableHead>Total Value</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Final Price</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPackages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          {searchTerm ? 'No packages found matching your search.' : 'No packages available.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPackages.map((pkg) => {
                        const totalValue = Array.isArray(pkg.tests) ? pkg.tests.reduce((total, test) => total + (test.price || 0), 0) : 0
                        const discountAmount = pkg.discountamount || 0
                        const finalPrice = Math.max(totalValue - discountAmount, 0)
                        return (
                          <TableRow key={pkg.id}>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Package className="h-4 w-4 text-blue-600" />
                                <span className="font-medium">{pkg.package_name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {Array.isArray(pkg.tests) ? (
                                  <div>
                                    <span className="font-medium">{pkg.tests.length} tests</span>
                                    <div className="text-xs text-gray-500 mt-1">
                                      {pkg.tests.slice(0, 2).map((test, index) => (
                                        <div key={index}>{test.testName}</div>
                                      ))}
                                      {pkg.tests.length > 2 && (
                                        <div>+{pkg.tests.length - 2} more...</div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">No tests</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">₹{totalValue}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                ₹{discountAmount} OFF
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="font-medium text-green-600">₹{finalPrice}</span>
                                {discountAmount > 0 && (
                                  <div className="text-xs text-gray-500">
                                    Save ₹{discountAmount}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-600">
                                {new Date(pkg.created_at).toLocaleDateString('en-IN')}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Button variant="ghost" size="sm" onClick={() => openForm(pkg)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deletePackage(pkg.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Add/Edit Package Modal */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingPackage ? 'Edit Package' : 'Add Package'}</DialogTitle>
                <DialogDescription>
                  {editingPackage ? 'Update the package details.' : 'Create a new test package.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={formHandleSubmit(onSubmitPackage)}>
                <div className="space-y-4">
                  <div>
                    <Label>Package Name</Label>
                    <Input {...formRegister('package_name', { required: true })} placeholder="Enter package name" />
                  </div>
                  <div>
                    <Label>Discount Amount (₹)</Label>
                    <Input type="number" min={0} {...formRegister('discountamount', { valueAsNumber: true })} placeholder="0" />
                  </div>
                  <div>
                    <Label>Tests Included</Label>
                    <div className="max-h-48 overflow-y-auto border rounded p-2 bg-gray-50">
                      {bloodTests.map(test => (
                        <div key={test.id} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={!!selectedTests.find(t => t.id === test.id)}
                            onCheckedChange={() => toggleTest(test)}
                            id={`test-${test.id}`}
                          />
                          <Label htmlFor={`test-${test.id}`} className="flex-1 cursor-pointer">
                            {test.test_name} <span className="text-xs text-gray-500">(₹{test.price})</span>
                          </Label>
                        </div>
                      ))}
                      {bloodTests.length === 0 && <div className="text-xs text-gray-400">No tests available</div>}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span>Total Value: <span className="font-medium">₹{totalValue}</span></span>
                    <span>Final Price: <span className="font-medium text-green-600">₹{finalPrice}</span></span>
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="submit" disabled={formLoading} className="bg-blue-600 hover:bg-blue-700">
                    {formLoading ? 'Saving...' : (editingPackage ? 'Update Package' : 'Create Package')}
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}