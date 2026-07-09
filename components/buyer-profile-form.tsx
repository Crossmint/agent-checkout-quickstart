"use client";

import { useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import type { BuyerProfile, CreateBuyerProfileInput } from "@/lib/agentic-checkout-types";

export function BuyerProfileForm({
  initialProfile,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  // When set, the form edits this profile: fields pre-fill and the submit label
  // switches to "Save changes". When omitted, it creates a new profile.
  initialProfile?: BuyerProfile;
  onSubmit: (input: CreateBuyerProfileInput) => void;
  onCancel: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const editing = initialProfile !== undefined;

  const [label, setLabel] = useState(initialProfile?.label ?? "Home");
  const [firstName, setFirstName] = useState(initialProfile?.name?.first ?? "Ada");
  const [lastName, setLastName] = useState(initialProfile?.name?.last ?? "Lovelace");
  const [email, setEmail] = useState(initialProfile?.contact?.email ?? "ada@example.com");
  const [phone, setPhone] = useState(initialProfile?.contact?.phone ?? "+14155550123");
  // One address line per row.
  const [addressLines, setAddressLines] = useState(
    (initialProfile?.shipping.addressLines ?? ["1 Market St", "Suite 400"]).join("\n"),
  );
  const [locality, setLocality] = useState(initialProfile?.shipping.locality ?? "San Francisco");
  const [administrativeAreaCode, setAdministrativeAreaCode] = useState(
    initialProfile?.shipping.administrativeAreaCode ?? "US-CA",
  );
  const [postalCode, setPostalCode] = useState(initialProfile?.shipping.postalCode ?? "94105");
  const [countryCode, setCountryCode] = useState(initialProfile?.shipping.countryCode ?? "US");

  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const lines = addressLines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setLocalError("Add at least one address line.");
      return;
    }
    const country = countryCode.trim().toUpperCase();
    if (country.length !== 2) {
      setLocalError("Country code must be a 2-letter ISO 3166-1 code (e.g. US).");
      return;
    }
    // administrativeAreaCode is optional and accepts either a code or a full
    // name. Normalize the code forms to the API's prefixed ISO 3166-2 shape
    // ("US-CA"), but pass a plain name ("Florida") through untouched.
    let adminArea: string | null = administrativeAreaCode.trim() || null;
    if (adminArea) {
      if (/^[a-z]{1,3}$/i.test(adminArea)) {
        // Bare subdivision code, e.g. "CA" or "FL" → prefix with the country.
        adminArea = `${country}-${adminArea.toUpperCase()}`;
      } else if (/^[a-z]{2}-[a-z0-9]{1,3}$/i.test(adminArea)) {
        // Already prefixed, e.g. "us-ca" → normalize case.
        adminArea = adminArea.toUpperCase();
      }
      // Otherwise it's a full name like "Florida" — leave it as typed.
    }

    onSubmit({
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(firstName.trim() || lastName.trim()
        ? {
            name: {
              ...(firstName.trim() ? { first: firstName.trim() } : {}),
              ...(lastName.trim() ? { last: lastName.trim() } : {}),
            },
          }
        : {}),
      ...(email.trim() || phone.trim()
        ? {
            contact: {
              ...(email.trim() ? { email: email.trim() } : {}),
              ...(phone.trim() ? { phone: phone.trim() } : {}),
            },
          }
        : {}),
      shipping: {
        addressLines: lines,
        locality: locality.trim(),
        administrativeAreaCode: adminArea || null,
        postalCode: postalCode.trim() || null,
        countryCode: country,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Label" hint="Optional name for this profile, e.g. Home or Office.">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder="Home"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" hint="Optional.">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
            placeholder="Ada"
            className={inputClass}
          />
        </Field>
        <Field label="Last name" hint="Optional.">
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
            placeholder="Lovelace"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" hint="Optional.">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            placeholder="ada@example.com"
            className={inputClass}
          />
        </Field>
        <Field label="Phone" hint="Optional.">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            placeholder="+14155550123"
            className={inputClass}
          />
        </Field>
      </div>

      {/* Shipping ---------------------------------------------------------- */}
      <div className="space-y-3 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[#FAFAFA] p-3">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-[#00150d]/40">
          Shipping
        </span>

        <Field label="Address lines" hint="One per line. At least one required.">
          <textarea
            required
            value={addressLines}
            onChange={(e) => setAddressLines(e.target.value)}
            rows={2}
            placeholder={"1 Market St\nSuite 400"}
            className={`${inputClass} resize-none`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City" hint="Locality. Required.">
            <input
              type="text"
              required
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              maxLength={120}
              placeholder="San Francisco"
              className={inputClass}
            />
          </Field>
          <Field label="State / region" hint={`Name or code — Florida, FL, or ${countryCode || "US"}-FL. Optional.`}>
            <input
              type="text"
              value={administrativeAreaCode}
              onChange={(e) => setAdministrativeAreaCode(e.target.value)}
              placeholder="Florida or US-FL"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Postal code" hint="Optional.">
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              maxLength={40}
              placeholder="94105"
              className={inputClass}
            />
          </Field>
          <Field label="Country" hint="ISO 3166-1 alpha-2. Required.">
            <input
              type="text"
              required
              maxLength={2}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              placeholder="US"
              className={`${inputClass} uppercase`}
            />
          </Field>
        </div>
      </div>

      {(localError || error) && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{localError ?? error}</div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving profile…
            </>
          ) : (
            <>
              <UserRound className="size-4" /> {editing ? "Save changes" : "Save profile"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[8px] border border-[rgba(0,0,0,0.12)] px-4 py-2.5 text-sm text-[#00150d]/70 transition-colors hover:bg-black/[0.03]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm text-[#00150d] placeholder:text-[#00150d]/30 outline-none transition-colors focus:border-[#05B959]/60";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#00150d]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#00150d]/45">{hint}</span>}
    </label>
  );
}
