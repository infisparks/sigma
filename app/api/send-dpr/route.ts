import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const pdfFile = formData.get('pdfFile') as Blob | null;
    const caption = formData.get('caption') as string | null;
    const filename = formData.get('filename') as string | null;

    if (!pdfFile || !caption || !filename) {
      return NextResponse.json({ message: 'Missing required fields.' }, { status: 400 });
    }

    // 1. Convert Blob to Buffer for Supabase upload
    const decodedPdf = Buffer.from(await pdfFile.arrayBuffer());

    // 2. Upload to Supabase bucket
    const { data, error: uploadError } = await supabase.storage
      .from('dpr-documents')
      .upload(`dpr/${filename}`, decodedPdf, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json({ message: `Failed to upload PDF: ${uploadError.message}` }, { status: 500 });
    }

    // 3. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('dpr-documents')
      .getPublicUrl(data.path);

    const imageUrl = publicUrlData.publicUrl; // This is the public URL to the PDF

    if (!imageUrl) {
      return NextResponse.json({ message: 'Failed to get public URL for PDF.' }, { status: 500 });
    }

    // 4. Send to new WhatsApp Document API
    const whatsappApiUrl = 'https://evo.infispark.in/message/sendMedia/sigma';
    
    // Use a server-side environment variable (NOT NEXT_PUBLIC_)
    const apiKey = process.env.WHATSAPP_API_KEY || ''; 
    const recipientNumber = '919958399157'; // Your provided number

    if (!apiKey) {
      console.error('WhatsApp API Key is missing on the server.');
      return NextResponse.json({ message: 'WhatsApp API Key is not configured.' }, { status: 500 });
    }

    // Construct the new payload for sending a document
    const payload = {
      number: recipientNumber,
      mediatype: "document",
      mimetype: "application/pdf",
      caption: caption,
      media: imageUrl, // The public Supabase URL
      fileName: filename,
    };

    const whatsappRes = await fetch(whatsappApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey, // Use the 'apikey' header
      },
      body: JSON.stringify(payload), // Send the new payload
    });

    if (whatsappRes.ok) {
      const whatsappResult = await whatsappRes.json();
      return NextResponse.json({ message: 'DPR sent successfully to owner!', whatsappResult }, { status: 200 });
    } else {
      const errorData = await whatsappRes.json();
      console.error('WhatsApp API error:', errorData);
      return NextResponse.json({ message: `Failed to send WhatsApp message: ${errorData.message}` }, { status: whatsappRes.status });
    }
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}