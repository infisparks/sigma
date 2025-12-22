'use client'

import React from 'react'
import Layout from '@/components/global/Layout'

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
    return (
        <Layout>
            {children}
        </Layout>
    )
}
