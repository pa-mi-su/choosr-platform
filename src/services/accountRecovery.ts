import type { User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { withRequestTimeout } from './requestTimeout';

const AUTH_TIMEOUT_MS = 12_000;

export type AccountIdentity = {
  isAnonymous: boolean;
  maskedPhone?: string;
};

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const normalized = `+${trimmed.replace(/\D/g, '')}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('invalid_phone');
  }
  return normalized;
}

function maskPhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const suffix = phone.slice(-4);
  return `••• ••• ${suffix}`;
}

function toIdentity(user: User): AccountIdentity {
  return {
    isAnonymous: user.is_anonymous === true,
    maskedPhone: maskPhone(user.phone),
  };
}

export async function loadAccountIdentity(): Promise<AccountIdentity> {
  const { data, error } = await withRequestTimeout(
    supabase.auth.getUser(),
    AUTH_TIMEOUT_MS,
    'Account identity lookup',
  );
  if (error || !data.user) throw error ?? new Error('authentication_required');
  return toIdentity(data.user);
}

export async function requestPhoneProtection(phone: string): Promise<string> {
  const normalized = normalizePhone(phone);
  const { data: current, error: currentError } = await withRequestTimeout(
    supabase.auth.getUser(),
    AUTH_TIMEOUT_MS,
    'Account identity lookup',
  );
  if (currentError || !current.user) {
    throw currentError ?? new Error('authentication_required');
  }
  if (!current.user.is_anonymous) throw new Error('account_already_protected');

  const { error } = await withRequestTimeout(
    supabase.auth.updateUser({ phone: normalized }),
    AUTH_TIMEOUT_MS,
    'Phone verification request',
  );
  if (error) throw error;
  return normalized;
}

export async function verifyPhoneProtection(
  phone: string,
  token: string,
): Promise<AccountIdentity> {
  const normalized = normalizePhone(phone);
  if (!/^\d{6}$/.test(token.trim())) throw new Error('invalid_otp');
  const { data, error } = await withRequestTimeout(
    supabase.auth.verifyOtp({
      phone: normalized,
      token: token.trim(),
      type: 'phone_change',
    }),
    AUTH_TIMEOUT_MS,
    'Phone verification',
  );
  if (error || !data.user) throw error ?? new Error('verification_failed');
  if (data.user.is_anonymous) throw new Error('verification_incomplete');
  return toIdentity(data.user);
}

export async function requestAccountRecovery(phone: string): Promise<string> {
  const normalized = normalizePhone(phone);
  const { error } = await withRequestTimeout(
    supabase.auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: false },
    }),
    AUTH_TIMEOUT_MS,
    'Account recovery request',
  );
  if (error) throw error;
  return normalized;
}

export async function verifyAccountRecovery(
  phone: string,
  token: string,
): Promise<AccountIdentity> {
  const normalized = normalizePhone(phone);
  if (!/^\d{6}$/.test(token.trim())) throw new Error('invalid_otp');
  const { data, error } = await withRequestTimeout(
    supabase.auth.verifyOtp({
      phone: normalized,
      token: token.trim(),
      type: 'sms',
    }),
    AUTH_TIMEOUT_MS,
    'Account recovery verification',
  );
  if (error || !data.user || !data.session) {
    throw error ?? new Error('verification_failed');
  }
  return toIdentity(data.user);
}

export function accountRecoveryErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (/invalid_phone/i.test(message)) {
    return 'Enter a complete phone number with country code, like +1 555 123 4567.';
  }
  if (/invalid_otp|token.*invalid|expired/i.test(message)) {
    return 'That code is invalid or expired. Request a new code and try again.';
  }
  if (/already.*registered|already.*exists|phone.*taken/i.test(message)) {
    return 'That number already protects a Choosr. Choose “Recover my Choosr” instead.';
  }
  if (/rate|too many/i.test(message)) {
    return 'Too many attempts. Wait a few minutes before requesting another code.';
  }
  if (/account_already_protected/i.test(message)) {
    return 'This Choosr is already protected.';
  }
  return 'Choosr could not verify that number. Check your connection and try again.';
}
