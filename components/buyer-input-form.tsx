"use client";

import { useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import {
  CrossmintProtectedInput,
  type CrossmintProtectedInputRef,
} from "@crossmint/client-sdk-react-ui";
import type {
  BuyerInputField,
  ChoiceOption,
  FormAnswerValue,
  FormAnswers,
  FormInteraction,
  StandardField,
} from "@/lib/agent-checkout-types";

type Value = string | number | boolean | string[] | undefined;

const inputClass =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm text-[#00150d] placeholder:text-[#00150d]/30 outline-none transition-colors focus:border-[#05B959]/60";
const primaryButtonClass =
  "flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const secondaryButtonClass =
  "rounded-[8px] border border-[rgba(0,0,0,0.12)] px-4 py-2.5 text-sm font-medium text-[#00150d]/70 transition-colors hover:bg-black/[0.03] disabled:opacity-50";

/**
 * Renders a "form" input request's typed `fields` in order: standard fields
 * with plain controls, protected fields with Crossmint's own input (the app
 * only ever sees a `{ protectedInputId }` reference). Mount it keyed on the
 * `requestId` so a replacement request resets state.
 */
export function BuyerInputForm({
  interaction,
  jwt,
  submitting,
  onSubmit,
  onDecline,
}: {
  interaction: FormInteraction;
  jwt: string;
  submitting: boolean;
  onSubmit: (answers: FormAnswers) => void;
  onDecline: () => void;
}) {
  const fields = interaction.fields;
  const [values, setValues] = useState<Record<string, Value>>(() => initialValues(fields));
  // Optional protected fields sit behind an "Add …" checkbox and are omitted
  // from the answers unless the buyer opts in.
  const [included, setIncluded] = useState<ReadonlySet<string>>(() => requiredProtected(fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [collecting, setCollecting] = useState(false);
  const refs = useRef(new Map<string, CrossmintProtectedInputRef | null>());

  const busy = submitting || collecting;
  const update = (key: string, value: Value) => setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (busy) return;
    // Validate standard fields first; every problem is shown together.
    const fieldErrors: Record<string, string> = {};
    const answers: FormAnswers = {};
    for (const field of fields) {
      if (field.handling !== "standard") continue;
      const answer = standardAnswer(field, values[field.key]);
      if (answer.error) {
        fieldErrors[field.key] = answer.error;
      } else if (answer.provided) {
        answers[field.key] = answer.value;
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    // Then collect every rendered protected field — collect() validates and
    // registers the value with Crossmint before returning a reference.
    const protectedFields = fields.filter(
      (f): f is Extract<BuyerInputField, { handling: "protected" }> =>
        f.handling === "protected" && included.has(f.key),
    );
    if (protectedFields.length > 0) {
      setCollecting(true);
      setErrors({});
      try {
        const results = await Promise.all(
          protectedFields.map(async (f) => {
            const ref = refs.current.get(f.key);
            if (!ref) {
              return [
                f.key,
                { status: "unavailable" as const, message: "The secure field is still loading. Try again." },
              ] as const;
            }
            return [f.key, await ref.collect()] as const;
          }),
        );
        const failed: Record<string, string> = {};
        for (const [key, result] of results) {
          if (result.status === "collected") {
            answers[key] = result.input;
          } else if (result.status === "superseded") {
            failed[key] = "Re-enter this value.";
          } else {
            failed[key] = result.message;
          }
        }
        if (Object.keys(failed).length > 0) {
          setErrors(failed);
          return;
        }
      } catch {
        setErrors(
          Object.fromEntries(
            protectedFields.map((f) => [f.key, "The secure field is unavailable. Try again."]),
          ),
        );
        return;
      } finally {
        setCollecting(false);
      }
    }
    onSubmit(answers);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {fields.map((field) =>
        field.handling === "protected" ? (
          <ProtectedFieldRow
            key={field.key}
            field={field}
            jwt={jwt}
            included={included.has(field.key)}
            onInclude={(include) =>
              setIncluded((prev) => {
                const next = new Set(prev);
                if (include) next.add(field.key);
                else next.delete(field.key);
                return next;
              })
            }
            collectorRef={(ref) => {
              if (ref) refs.current.set(field.key, ref);
              else refs.current.delete(field.key);
            }}
            error={errors[field.key]}
            disabled={busy}
          />
        ) : (
          <StandardFieldRow
            key={field.key}
            field={field}
            value={values[field.key]}
            update={update}
            error={errors[field.key]}
            disabled={busy}
          />
        ),
      )}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {collecting ? "Securing…" : "Submit"}
        </button>
        <button type="button" disabled={busy} onClick={onDecline} className={secondaryButtonClass}>
          Decline
        </button>
      </div>
    </form>
  );
}

// ─── Standard fields ────────────────────────────────────────────────────────

function initialValues(fields: BuyerInputField[]): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const f of fields) {
    if (f.handling !== "standard") continue;
    if (f.input.kind === "boolean") out[f.key] = false;
    else if (f.input.kind === "choice") {
      const preselected = f.input.options.filter((o) => o.selected).map((o) => o.value);
      if (f.input.selection.kind === "one") out[f.key] = preselected[0];
      else out[f.key] = preselected;
    }
  }
  return out;
}

function requiredProtected(fields: BuyerInputField[]): ReadonlySet<string> {
  return new Set(
    fields.filter((f) => f.handling === "protected" && f.required).map((f) => f.key),
  );
}

/**
 * Turns a standard field's control value into an answer. `provided: false`
 * means the field is optional and unanswered — the key is left out of the
 * answers object entirely.
 */
function standardAnswer(
  field: StandardField,
  value: Value,
): { provided: boolean; value: FormAnswerValue; error?: string } {
  const missing = { provided: false, value: "" as FormAnswerValue };
  switch (field.input.kind) {
    case "boolean":
      // Required means an answer is present, not that it's true.
      return { provided: true, value: value === true };
    case "text": {
      const text = typeof value === "string" ? value : "";
      if (text === "") {
        return field.required
          ? { provided: false, value: "", error: `${field.label} is required.` }
          : missing;
      }
      return { provided: true, value: text };
    }
    case "number":
    case "integer": {
      if (value === undefined || value === "") {
        return field.required
          ? { provided: false, value: "", error: `${field.label} is required.` }
          : missing;
      }
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(num)) {
        return { provided: false, value: "", error: `${field.label} must be a number.` };
      }
      if (field.input.kind === "integer" && !Number.isSafeInteger(num)) {
        return { provided: false, value: "", error: `${field.label} must be a whole number.` };
      }
      return { provided: true, value: num };
    }
    case "choice": {
      if (field.input.selection.kind === "one") {
        const selected = typeof value === "string" ? value : "";
        const option = field.input.options.find((o) => o.value === selected);
        if (!option || option.placeholder) {
          return field.required
            ? { provided: false, value: "", error: `Choose a ${field.label}.` }
            : missing;
        }
        return { provided: true, value: selected };
      }
      const { min, max } = field.input.selection;
      const picked = Array.isArray(value) ? value : [];
      if (picked.length === 0 && !field.required && min === 0) return missing;
      if (picked.length < min) {
        return {
          provided: false,
          value: "",
          error: `Choose at least ${min} ${min === 1 ? "option" : "options"}.`,
        };
      }
      if (max !== undefined && picked.length > max) {
        return {
          provided: false,
          value: "",
          error: `Choose at most ${max} ${max === 1 ? "option" : "options"}.`,
        };
      }
      return { provided: true, value: picked };
    }
  }
}

function StandardFieldRow({
  field,
  value,
  update,
  error,
  disabled,
}: {
  field: StandardField;
  value: Value;
  update: (key: string, value: Value) => void;
  error?: string;
  disabled: boolean;
}) {
  const id = `bif-${field.key}`;
  const label = (
    <label htmlFor={id} className="text-sm font-medium text-[#00150d]">
      {field.label}
      {field.required && <span className="text-[#dc2626]"> *</span>}
    </label>
  );

  let control: React.ReactNode;
  switch (field.input.kind) {
    case "boolean":
      control = (
        <label className="flex items-start gap-2 text-sm text-[#00150d]/70">
          <input
            type="checkbox"
            id={id}
            className="mt-0.5 size-4 accent-[#05B959]"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => update(field.key, e.target.checked)}
          />
          <span>
            {field.label}
            {field.required && <span className="text-[#dc2626]"> *</span>}
          </span>
        </label>
      );
      return (
        <div className="flex flex-col gap-1">
          {control}
          {error && <p role="alert" className="text-xs text-[#dc2626]">{error}</p>}
        </div>
      );
    case "choice": {
      const input = field.input;
      if (input.selection.kind === "one") {
        const placeholderOption = input.options.find((o) => o.placeholder);
        control = (
          <select
            id={id}
            className={inputClass}
            disabled={disabled}
            value={typeof value === "string" ? value : (placeholderOption?.value ?? "")}
            onChange={(e) => {
              const option = input.options.find((o) => o.value === e.target.value);
              // Placeholder options are a prompt, never an answer.
              update(field.key, option && !option.placeholder ? option.value : undefined);
            }}
          >
            {input.options.map((o: ChoiceOption) => (
              <option key={o.value} value={o.value} disabled={o.disabled || o.placeholder}>
                {o.label}
              </option>
            ))}
          </select>
        );
      } else {
        const picked = Array.isArray(value) ? value : [];
        control = (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">{field.label}</legend>
            {input.options.map((o) => (
              <label
                key={o.value}
                className="flex items-start gap-2 text-sm text-[#00150d]/70"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[#05B959]"
                  checked={picked.includes(o.value)}
                  // Disabled options can't be toggled: unselected ones can't be
                  // picked, and preselected (locked) ones stay in the answer.
                  disabled={disabled || o.disabled}
                  onChange={(e) =>
                    update(
                      field.key,
                      e.target.checked
                        ? [...picked, o.value]
                        : picked.filter((v) => v !== o.value),
                    )
                  }
                />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
        );
      }
      break;
    }
    case "number":
    case "integer":
      control = (
        <input
          id={id}
          type="number"
          className={inputClass}
          inputMode={field.input.kind === "integer" ? "numeric" : "decimal"}
          step={field.input.kind === "integer" ? 1 : "any"}
          disabled={disabled}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) =>
            update(field.key, e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      );
      break;
    default: {
      const text = field.input;
      if (text.multiline) {
        control = (
          <textarea
            id={id}
            className={`${inputClass} min-h-20 resize-y`}
            disabled={disabled}
            placeholder={text.placeholder}
            autoComplete={text.autoComplete}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => update(field.key, e.target.value)}
          />
        );
      } else {
        control = (
          <input
            id={id}
            type={text.display === "masked" ? "password" : "text"}
            className={inputClass}
            disabled={disabled}
            placeholder={text.placeholder}
            autoComplete={text.autoComplete}
            inputMode={text.inputMode}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => update(field.key, e.target.value)}
          />
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {label}
      {control}
      {error && (
        <p role="alert" className="text-xs text-[#dc2626]">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Protected fields ───────────────────────────────────────────────────────

/**
 * One protected field: Crossmint's iframe input plus the app's label and error
 * text. Optional ones render only after the buyer ticks "Add …" — unticked
 * means the key is omitted from the answers entirely.
 */
function ProtectedFieldRow({
  field,
  jwt,
  included,
  onInclude,
  collectorRef,
  error,
  disabled,
}: {
  field: Extract<BuyerInputField, { handling: "protected" }>;
  jwt: string;
  included: boolean;
  onInclude: (include: boolean) => void;
  collectorRef: (ref: CrossmintProtectedInputRef | null) => void;
  error?: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {field.required ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-[#00150d]">
          <Lock className="size-3.5 text-[#00150d]/40" />
          {field.label}
          <span className="text-[#dc2626]"> *</span>
        </span>
      ) : (
        <label className="flex items-center gap-2 text-sm text-[#00150d]/70">
          <input
            type="checkbox"
            className="size-4 accent-[#05B959]"
            checked={included}
            disabled={disabled}
            onChange={(e) => onInclude(e.target.checked)}
          />
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-[#00150d]/40" /> Add {field.label}
          </span>
        </label>
      )}
      {included && (
        <CrossmintProtectedInput
          ref={collectorRef}
          jwt={jwt}
          field={field}
          disabled={disabled}
          invalid={error !== undefined && error !== ""}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-[#dc2626]">
          {error}
        </p>
      )}
    </div>
  );
}
