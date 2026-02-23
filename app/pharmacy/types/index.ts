export interface PharmacyProduct {
    id: number;
    name: string;
    generic_name?: string;
    manufacturer?: string;
    pack_size_label: string;
    pack_size_quantity: number; // Units per pack
    hsn_code?: string;
    rack_location?: string;
    min_stock_alert?: number;
    max_stock_limit?: number;
    category?: string;
    gst_percentage: number; // TAX percentage (5, 12, 18, etc.)
    description?: string;
    image_url?: string;
    is_active?: boolean;
    vendor_id?: string;
    updated_at?: string;
}

export interface StockLedgerItem {
    id: string;
    medicine_id: number;
    batch_number: string;
    expiry_date: string;
    transaction_type: 'PURCHASE' | 'SALE' | 'PURCHASE_RETURN' | 'SALES_RETURN' | 'ADJUSTMENT';
    stock_flow: number; // Positive or Negative Units
    total_units_flow: number; // Standardized units
    quantity: number; // Billed Packs/Units
    quantity_free: number;
    pack_size_quantity: number;
    unit_cost: number;
    unit_mrp: number;
    gst_percent: number;
    gst_amount: number;
    total_amount: number;
    purchase_invoice_id?: string;
    sale_invoice_id?: string;
    created_at: string;
}

export interface PurchaseInvoice {
    id: string;
    vendor_id: string;
    vendor_name?: string;
    invoice_number: string;
    invoice_date: string;
    subtotal: number;
    total_gst_amount: number;
    total_amount: number;
    status: string;
    created_at: string;
}

export interface SaleInvoice {
    id: string;
    customer_name: string;
    customer_phone?: string;
    doctor_name?: string;
    payment_mode: string;
    subtotal: number;
    total_gst_amount: number;
    discount_amount: number;
    curr_total: number;
    status: string;
    created_at: string;
}

export interface Vendor {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    gst_number?: string;
}
