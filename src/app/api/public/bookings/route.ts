import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type SelectedService = {
  service_code: string;
  service_name: string;
  unit_price: number;
  quantity?: number;
};

type BookingPayload = {
  fullName: string;
  email: string;
  phone?: string;
  propertyAddress?: string;
  notes?: string;
  packageSummary?: string;
  displayTotal?: number;
  selectedServices: SelectedService[];
  source?: string;
};

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://photography-repo.pages.dev';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Admin client — uses SERVICE_ROLE_KEY so it can create auth users + bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: CORS_HEADERS });
}

/**
 * Find or create a Supabase AUTH user for this email.
 * Returns the auth UID — which becomes the profile.id.
 * This is the key link: booking → profile → auth user → portal.
 */
async function findOrCreateAuthUser(email: string, fullName: string, phone: string | null): Promise<string> {
  // 1. Check if auth user already exists
  const { data: listData } = await supabase.auth.admin.listUsers();
  const existingUser = listData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    // Update profile with latest details
    await supabase.from('profiles').upsert({
      id: existingUser.id,
      email: email.toLowerCase(),
      full_name: fullName,
      phone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    return existingUser.id;
  }

  // 2. Create new auth user — sends magic link / invite email automatically
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: email.toLowerCase(),
    email_confirm: true, // mark email as confirmed so they can log in immediately
    user_metadata: { full_name: fullName },
  });

  if (createError || !newUser?.user) {
    throw new Error(`Failed to create auth user: ${createError?.message}`);
  }

  // 3. Create matching profile row with auth UID as primary key
  await supabase.from('profiles').upsert({
    id: newUser.user.id,
    email: email.toLowerCase(),
    full_name: fullName,
    phone,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  return newUser.user.id;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return bad('Missing SUPABASE_SERVICE_ROLE_KEY', 500);
    }

    const body = (await req.json()) as BookingPayload;
    const fullName = body.fullName?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const propertyAddress = body.propertyAddress?.trim() || null;
    const notes = body.notes?.trim() || null;
    const packageSummary = body.packageSummary?.trim() || null;
    const selectedServices = Array.isArray(body.selectedServices) ? body.selectedServices : [];
    const source = body.source?.trim() || 'marketing_site';

    if (!fullName) return bad('Full name is required');
    if (!email) return bad('Email is required');
    if (!selectedServices.length) return bad('Select at least one service');

    const total = selectedServices.reduce((sum, item) => {
      const qty = Number(item.quantity || 1);
      const price = Number(item.unit_price || 0);
      return sum + price * qty;
    }, 0);

    // KEY FIX: get the auth UID — this is what links bookings to the portal
    const profileId = await findOrCreateAuthUser(email, fullName, phone);

    const reference = `REQ-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const { data: bookingRequest, error: bookingRequestError } = await supabase
      .from('booking_requests')
      .insert({
        reference,
        source,
        profile_id: profileId,
        email,
        full_name: fullName,
        phone,
        property_address: propertyAddress,
        package_summary: packageSummary || selectedServices.map(s => s.service_name).join(', '),
        notes,
        display_total: Number(body.displayTotal || total || 0),
        status: 'pending_cal_confirmation',
      })
      .select('id, reference')
      .single();

    if (bookingRequestError || !bookingRequest) {
      return bad(bookingRequestError?.message || 'Failed to create booking request', 500);
    }

    const codes = selectedServices.map((s) => s.service_code);

    const { data: packageRows, error: packagesError } = await supabase
      .from('service_packages')
      .select('id, code, service_code, name, service_name, base_price')
      .in('code', codes);

    if (packagesError) {
      return bad(packagesError.message, 500);
    }

    const packageMap = new Map(
      (packageRows || []).map((row) => [row.code || row.service_code, row])
    );

    const lineItems = selectedServices.map((service) => {
      const pkg = packageMap.get(service.service_code);
      const quantity = Number(service.quantity || 1);
      const unitPrice = Number(service.unit_price || pkg?.base_price || 0);
      return {
        booking_request_id: bookingRequest.id,
        service_package_id: pkg?.id || null,
        service_code: service.service_code,
        service_name: service.service_name,
        unit_price: unitPrice,
        quantity,
        line_total: unitPrice * quantity,
      };
    });

    const { error: lineItemsError } = await supabase
      .from('booking_line_items')
      .insert(lineItems);

    if (lineItemsError) {
      return bad(lineItemsError.message, 500);
    }

    return NextResponse.json(
      {
        ok: true,
        reference: bookingRequest.reference,
        bookingRequestId: bookingRequest.id,
        displayTotal: Number(body.displayTotal || total || 0),
        calPayload: {
          reference: bookingRequest.reference,
          email,
          name: fullName,
          notes: [
            `Reference: ${bookingRequest.reference}`,
            propertyAddress ? `Property: ${propertyAddress}` : null,
            `Services: ${selectedServices.map((s) => `${s.service_name} ($${s.unit_price})`).join(', ')}`,
            notes ? `Notes: ${notes}` : null,
          ].filter(Boolean).join('\n'),
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return bad(message, 500);
  }
}
