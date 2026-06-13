import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type CalWebhookBody = {
  triggerEvent?: string;
  createdAt?: string;
  payload?: {
    bookingId?: number | string;
    uid?: string;
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    eventTypeId?: number | string;
    eventTypeSlug?: string;
    metadata?: Record<string, any>;
    responses?: Record<string, any>;
    attendees?: Array<{
      name?: string;
      email?: string;
      timeZone?: string;
      phoneNumber?: string;
    }>;
  };
};

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifySignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signatureHeader.replace(/^sha256=/, '').trim();
  return safeEqual(expected, provided);
}

async function findOrCreateProfile({
  email,
  fullName,
  phone
}: {
  email: string;
  fullName?: string;
  phone?: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (existingProfile) {
    const updatePayload: Record<string, any> = {};
    if (fullName && !existingProfile.full_name) updatePayload.full_name = fullName;
    if (phone && !existingProfile.phone) updatePayload.phone = phone;

    if (Object.keys(updatePayload).length) {
      await supabase.from('profiles').update(updatePayload).eq('id', existingProfile.id);
    }

    return existingProfile.id;
  }

  const { data: createdProfile, error } = await supabase
    .from('profiles')
    .insert({
      email: normalizedEmail,
      full_name: fullName || null,
      phone: phone || null
    })
    .select('id')
    .single();

  if (error) throw error;
  return createdProfile.id;
}

async function syncConfirmedBooking(body: CalWebhookBody) {
  const payload = body.payload || {};
  const metadata = payload.metadata || {};
  const attendee = payload.attendees?.[0] || {};
  const attendeeEmail = String(attendee.email || metadata.client_email || '').trim().toLowerCase();
  const attendeeName = String(attendee.name || metadata.full_name || '').trim();
  const attendeePhone = String(attendee.phoneNumber || metadata.phone || '').trim();

  if (!attendeeEmail) {
    throw new Error('Missing attendee email in Cal webhook payload');
  }

  const profileId = await findOrCreateProfile({
    email: attendeeEmail,
    fullName: attendeeName,
    phone: attendeePhone
  });

  const externalBookingId = String(payload.bookingId || payload.uid || '');
  const reference = String(metadata.reference || metadata.booking_reference || '').trim();
  const packageSummary = String(metadata.package_summary || metadata.packageSummary || payload.title || '').trim();
  const displayTotal = Number(metadata.display_total || metadata.displayTotal || 0);
  const propertyAddress = String(metadata.property_address || metadata.propertyAddress || '').trim();
  const notes = String(
    metadata.notes ||
    metadata.client_notes ||
    payload.description ||
    ''
  ).trim();

  let bookingRequest: any = null;

  if (reference) {
    const { data } = await supabase
      .from('booking_requests')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();
    bookingRequest = data;
  }

  if (!bookingRequest && externalBookingId) {
    const { data } = await supabase
      .from('booking_requests')
      .select('*')
      .eq('external_booking_id', externalBookingId)
      .maybeSingle();
    bookingRequest = data;
  }

  if (bookingRequest) {
    await supabase
      .from('booking_requests')
      .update({
        profile_id: profileId,
        status: 'confirmed',
        external_booking_id: externalBookingId || bookingRequest.external_booking_id || null,
        external_source: 'cal.com',
        scheduled_start: payload.startTime || null,
        scheduled_end: payload.endTime || null,
        cal_event_type: payload.eventTypeSlug || String(payload.eventTypeId || ''),
        attendee_email: attendeeEmail,
        attendee_name: attendeeName || bookingRequest.full_name || null,
        attendee_phone: attendeePhone || bookingRequest.phone || null,
        property_address: propertyAddress || bookingRequest.property_address || null,
        package_summary: packageSummary || bookingRequest.package_summary || null,
        display_total: displayTotal || bookingRequest.display_total || 0,
        notes: notes || bookingRequest.notes || null,
        confirmed_at: new Date().toISOString()
      })
      .eq('id', bookingRequest.id);
  } else {
    const { data: insertedRequest, error: insertRequestError } = await supabase
      .from('booking_requests')
      .insert({
        profile_id: profileId,
        full_name: attendeeName || null,
        email: attendeeEmail,
        phone: attendeePhone || null,
        property_address: propertyAddress || null,
        notes: notes || null,
        package_summary: packageSummary || null,
        display_total: displayTotal || 0,
        status: 'confirmed',
        source: 'marketing_site',
        external_source: 'cal.com',
        external_booking_id: externalBookingId || null,
        scheduled_start: payload.startTime || null,
        scheduled_end: payload.endTime || null,
        cal_event_type: payload.eventTypeSlug || String(payload.eventTypeId || ''),
        confirmed_at: new Date().toISOString(),
        reference: reference || `CAL-${externalBookingId || Date.now()}`
      })
      .select('*')
      .single();

    if (insertRequestError) throw insertRequestError;
    bookingRequest = insertedRequest;
  }

  const bookingUpsertPayload = {
    profile_id: profileId,
    booking_request_id: bookingRequest.id,
    external_booking_id: externalBookingId || null,
    external_source: 'cal.com',
    client_email: attendeeEmail,
    package_name: packageSummary || null,
    package_price: displayTotal || 0,
    booking_notes: notes || null,
    property_address: propertyAddress || null,
    scheduled_start: payload.startTime || null,
    scheduled_end: payload.endTime || null,
    cal_event_type: payload.eventTypeSlug || String(payload.eventTypeId || ''),
    status: 'confirmed'
  };

  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('external_booking_id', externalBookingId)
    .maybeSingle();

  let bookingId: string | null = null;

  if (existingBooking?.id) {
    await supabase
      .from('bookings')
      .update(bookingUpsertPayload)
      .eq('id', existingBooking.id);
    bookingId = existingBooking.id;
  } else {
    const { data: insertedBooking, error: insertBookingError } = await supabase
      .from('bookings')
      .insert(bookingUpsertPayload)
      .select('id')
      .single();

    if (insertBookingError) throw insertBookingError;
    bookingId = insertedBooking.id;
  }

  const orderPayload = {
    profile_id: profileId,
    booking_id: bookingId,
    booking_request_id: bookingRequest.id,
    amount: displayTotal || 0,
    currency: 'CAD',
    status: 'pending',
    description: packageSummary || payload.title || 'Booking order',
    external_source: 'cal.com'
  };

  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (existingOrder?.id) {
    await supabase.from('orders').update(orderPayload).eq('id', existingOrder.id);
  } else {
    await supabase.from('orders').insert(orderPayload);
  }

  return {
    profileId,
    bookingRequestId: bookingRequest.id,
    bookingId,
    externalBookingId,
    attendeeEmail
  };
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-cal-signature-256') || req.headers.get('x-cal-signature');

    if (!verifySignature(rawBody, signatureHeader)) {
      return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as CalWebhookBody;
    const triggerEvent = body.triggerEvent || '';

    if (triggerEvent === 'BOOKING_CANCELLED') {
      const externalBookingId = String(body.payload?.bookingId || body.payload?.uid || '');
      if (externalBookingId) {
        await supabase.from('booking_requests').update({ status: 'cancelled' }).eq('external_booking_id', externalBookingId);
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('external_booking_id', externalBookingId);
      }
      return Response.json({ ok: true, handled: 'cancelled' });
    }

    if (triggerEvent !== 'BOOKING_CREATED' && triggerEvent !== 'BOOKING_RESCHEDULED') {
      return Response.json({ ok: true, ignored: triggerEvent || 'unknown' });
    }

    const result = await syncConfirmedBooking(body);
    return Response.json({ ok: true, result });
  } catch (error: any) {
    console.error('Cal webhook error:', error);
    return Response.json(
      { error: error?.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}