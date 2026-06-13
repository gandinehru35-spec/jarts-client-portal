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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
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

    let profileId: string | null = null;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile?.id) {
      profileId = existingProfile.id;

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId);

      if (profileUpdateError) {
        return bad(profileUpdateError.message, 500);
      }
    }

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

    return NextResponse.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return bad(message, 500);
  }
}