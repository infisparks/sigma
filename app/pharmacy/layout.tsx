'use client'

import React from 'react'
import Layout from '@/components/global/Layout'

import { usePathname } from 'next/navigation'

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const isBillPage = pathname?.includes('/pharmacy/bill/')

    if (isBillPage) {
        return <>{children}</>
    }

    return (
        <Layout>
            {children}
        </Layout>
    )
}
