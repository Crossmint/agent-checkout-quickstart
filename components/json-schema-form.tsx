"use client";

import Form, { type FormProps, type IChangeEvent } from "@rjsf/core";
import {
  ariaDescribedByIds,
  type BaseInputTemplateProps,
  enumOptionSelectedValue,
  enumOptionValueDecoder,
  enumOptionValueEncoder,
  type FieldErrorProps,
  type FieldTemplateProps,
  getInputProps,
  getOptionValueFormat,
  type ObjectFieldTemplateProps,
  type RJSFSchema,
  type WidgetProps,
} from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import type { JsonSchema } from "@/lib/agent-checkout-types";
import { type ChangeEvent, type ReactElement, type ReactNode, useCallback, useMemo } from "react";

/**
 * Renders any pending-action `responseSchema` as an accessible form, backed by
 * RJSF (`@rjsf/core` + `@rjsf/validator-ajv8`) instead of a hand-written JSON
 * Schema interpreter. The wrapper only owns presentation (quickstart styling)
 * and the submit/decline chrome; RJSF + AJV handle field rendering and
 * interactive validation. The API stays the canonical validator for whatever
 * we submit.
 */
export type JsonSchemaFormProps = {
  schema: JsonSchema;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit(values: Record<string, unknown>): void;
  /** Optional secondary action (e.g. "Decline"); not validated before firing. */
  secondary?: { label: string; onClick(): void };
  /** Slot rendered above the inputs — typically the action message. */
  header?: ReactNode;
};

type FormValues = Record<string, unknown>;
type FormContext = Record<string, never>;
type QsFormProps = FormProps<FormValues, RJSFSchema, FormContext>;
type QsFieldTemplateProps = FieldTemplateProps<FormValues, RJSFSchema, FormContext>;
type QsObjectFieldTemplateProps = ObjectFieldTemplateProps<FormValues, RJSFSchema, FormContext>;
type QsFieldErrorProps = FieldErrorProps<FormValues, RJSFSchema, FormContext>;
type QsWidgetProps = WidgetProps<FormValues, RJSFSchema, FormContext>;
type QsBaseInputTemplateProps = BaseInputTemplateProps<FormValues, RJSFSchema, FormContext>;

const inputClass =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm text-[#00150d] placeholder:text-[#00150d]/30 outline-none transition-colors focus:border-[#05B959]/60";
const primaryButtonClass =
  "flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const secondaryButtonClass =
  "rounded-[8px] border border-[rgba(0,0,0,0.12)] px-4 py-2.5 text-sm font-medium text-[#00150d]/70 transition-colors hover:bg-black/[0.03] disabled:opacity-50";

const templates: NonNullable<QsFormProps["templates"]> = {
  BaseInputTemplate,
  ErrorListTemplate,
  FieldErrorTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
};

const widgets: NonNullable<QsFormProps["widgets"]> = {
  CheckboxWidget,
  SelectWidget,
  TextareaWidget,
};

export function JsonSchemaForm({
  schema,
  submitLabel,
  isSubmitting,
  onSubmit,
  secondary,
  header,
}: JsonSchemaFormProps) {
  // Remounting on schema change resets form state for the next action.
  const schemaKey = useMemo(() => JSON.stringify(schema), [schema]);
  const propertyCount = Object.keys(schema.properties ?? {}).length;

  return (
    <div className="flex flex-col gap-3">
      {header}
      {propertyCount === 0 ? (
        <p className="text-sm text-[#00150d]/50">
          This action has no fields — just confirm to continue.
        </p>
      ) : null}
      <Form<FormValues, RJSFSchema, FormContext>
        key={schemaKey}
        schema={schema as RJSFSchema}
        validator={validator}
        templates={templates}
        widgets={widgets}
        noHtml5Validate
        showErrorList={false}
        omitExtraData
        liveOmit
        onSubmit={(event: IChangeEvent<FormValues, RJSFSchema, FormContext>) => {
          onSubmit(valuesFromFormData(event.formData));
        }}
      >
        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? submitLabel + "…" : submitLabel}
          </button>
          {secondary === undefined ? null : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={secondary.onClick}
              className={secondaryButtonClass}
            >
              {secondary.label}
            </button>
          )}
        </div>
      </Form>
    </div>
  );
}

function FieldTemplate({
  children,
  displayLabel,
  errors,
  fieldPathId,
  hidden,
  id,
  label,
  rawDescription,
  required,
  schema,
}: QsFieldTemplateProps): ReactElement | null {
  if (hidden === true) {
    return <div className="hidden">{children}</div>;
  }
  if (fieldPathId.path.length === 0) {
    return children;
  }

  const shouldRenderLabel =
    displayLabel !== false && label.length > 0 && !schemaIncludesType(schema, "boolean");

  return (
    <div className="flex flex-col gap-1">
      {shouldRenderLabel ? (
        <label htmlFor={id} className="text-sm font-medium text-[#00150d]">
          {label}
          {required === true ? <span className="text-[#dc2626]"> *</span> : null}
        </label>
      ) : null}
      {children}
      {rawDescription === undefined || rawDescription.length === 0 ? null : (
        <p id={`${id}-description`} className="text-xs text-[#00150d]/45">
          {rawDescription}
        </p>
      )}
      {errors}
    </div>
  );
}

function ObjectFieldTemplate({
  description,
  fieldPathId,
  properties,
  title,
}: QsObjectFieldTemplateProps): ReactElement {
  const children = properties.map((property) => (
    <div key={property.name} className={property.hidden ? "hidden" : undefined}>
      {property.content}
    </div>
  ));

  if (fieldPathId.path.length === 0) {
    return <div className="flex flex-col gap-3">{children}</div>;
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-black/[0.015] p-3">
      {title.length === 0 ? null : (
        <legend className="px-1 text-sm font-medium text-[#00150d]">{title}</legend>
      )}
      {description === undefined || description === "" ? null : (
        <div className="text-xs text-[#00150d]/45">{description}</div>
      )}
      {children}
    </fieldset>
  );
}

function FieldErrorTemplate({ errors }: QsFieldErrorProps): ReactElement | null {
  if (errors === undefined || errors.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-[#dc2626]" role="alert">
      {errors.map((error, index) => (
        <p key={errorKey(error, index)}>{error}</p>
      ))}
    </div>
  );
}

function ErrorListTemplate(): null {
  return null;
}

function BaseInputTemplate(props: QsBaseInputTemplateProps): ReactElement {
  const {
    id,
    htmlName,
    value,
    readonly,
    disabled,
    onBlur,
    onFocus,
    onChange,
    onChangeOverride,
    options,
    schema,
    rawErrors,
    type,
    required,
    placeholder,
  } = props;
  const inputProps = getInputProps(schema, type, options);
  const inputValue =
    inputProps.type === "number" || inputProps.type === "integer"
      ? value || value === 0
        ? value
        : ""
      : value == null
        ? ""
        : value;
  const handleChange = useCallback(
    ({ target }: ChangeEvent<HTMLInputElement>) => {
      onChange(target.value === "" ? options.emptyValue : target.value);
    },
    [onChange, options.emptyValue],
  );
  const handleBlur = useCallback(
    ({ target }: ChangeEvent<HTMLInputElement>) => {
      onBlur(id, target.value);
    },
    [id, onBlur],
  );
  const handleFocus = useCallback(
    ({ target }: ChangeEvent<HTMLInputElement>) => {
      onFocus(id, target.value);
    },
    [id, onFocus],
  );

  return (
    <input
      id={id}
      name={htmlName || id}
      className={inputClass}
      readOnly={readonly}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      value={inputValue}
      {...inputProps}
      onChange={onChangeOverride ?? handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      aria-invalid={rawErrors === undefined || rawErrors.length === 0 ? undefined : true}
      aria-describedby={ariaDescribedByIds(id)}
    />
  );
}

function TextareaWidget({
  id,
  htmlName,
  value,
  readonly,
  disabled,
  onBlur,
  onFocus,
  onChange,
  options,
  placeholder,
  rawErrors,
  required,
}: QsWidgetProps): ReactElement {
  const stringValue = value == null ? "" : String(value);
  return (
    <textarea
      id={id}
      name={htmlName || id}
      className={`${inputClass} min-h-20 resize-y`}
      value={stringValue}
      readOnly={readonly}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      onChange={(event) =>
        onChange(event.target.value === "" ? options.emptyValue : event.target.value)
      }
      onBlur={(event) => onBlur(id, event.target.value)}
      onFocus={(event) => onFocus(id, event.target.value)}
      aria-invalid={rawErrors === undefined || rawErrors.length === 0 ? undefined : true}
      aria-describedby={ariaDescribedByIds(id)}
    />
  );
}

function CheckboxWidget({
  id,
  htmlName,
  value,
  disabled,
  readonly,
  onBlur,
  onFocus,
  onChange,
  label,
  hideLabel,
  rawErrors,
}: QsWidgetProps): ReactElement {
  const checked = value === true;
  return (
    <label className="flex items-start gap-2 text-sm text-[#00150d]/70">
      <input
        type="checkbox"
        id={id}
        name={htmlName || id}
        className="mt-0.5 size-4 accent-[#05B959]"
        checked={checked}
        disabled={disabled || readonly}
        onChange={(event) => onChange(event.target.checked)}
        onBlur={(event) => onBlur(id, event.target.checked)}
        onFocus={(event) => onFocus(id, event.target.checked)}
        aria-invalid={rawErrors === undefined || rawErrors.length === 0 ? undefined : true}
        aria-describedby={ariaDescribedByIds(id)}
      />
      {hideLabel === true ? null : <span>{label}</span>}
    </label>
  );
}

function SelectWidget({
  schema,
  id,
  htmlName,
  value,
  required,
  disabled,
  readonly,
  multiple = false,
  onChange,
  onBlur,
  onFocus,
  options,
  placeholder,
  rawErrors,
}: QsWidgetProps): ReactElement {
  const { enumOptions, enumDisabled, emptyValue: optionEmptyValue } = options;
  const optionValueFormat = getOptionValueFormat(options);
  const emptyValue = multiple ? [] : "";
  const selectValue = enumOptionSelectedValue(
    value,
    enumOptions,
    multiple,
    optionValueFormat,
    emptyValue,
  );
  const disabledOptions = Array.isArray(enumDisabled) ? enumDisabled : [];
  const showPlaceholderOption = !multiple && schema.default === undefined;

  return (
    <select
      id={id}
      name={htmlName || id}
      multiple={multiple}
      className={inputClass}
      value={selectValue}
      required={required}
      disabled={disabled || readonly}
      onChange={(event) => {
        const nextValue = selectEventValue(event, multiple);
        onChange(
          enumOptionValueDecoder(nextValue, enumOptions, optionValueFormat, optionEmptyValue),
        );
      }}
      onBlur={(event) => {
        const nextValue = selectEventValue(event, multiple);
        onBlur(
          id,
          enumOptionValueDecoder(nextValue, enumOptions, optionValueFormat, optionEmptyValue),
        );
      }}
      onFocus={(event) => {
        const nextValue = selectEventValue(event, multiple);
        onFocus(
          id,
          enumOptionValueDecoder(nextValue, enumOptions, optionValueFormat, optionEmptyValue),
        );
      }}
      aria-invalid={rawErrors === undefined || rawErrors.length === 0 ? undefined : true}
      aria-describedby={ariaDescribedByIds(id)}
    >
      {showPlaceholderOption ? (
        <option value="" disabled>
          {placeholder || "Select…"}
        </option>
      ) : null}
      {Array.isArray(enumOptions)
        ? enumOptions.map((option, index) => (
            <option
              key={String(option.value)}
              value={enumOptionValueEncoder(option.value, index, optionValueFormat)}
              disabled={disabledOptions.includes(option.value)}
            >
              {option.label}
            </option>
          ))
        : null}
    </select>
  );
}

function selectEventValue(
  event: ChangeEvent<HTMLSelectElement>,
  multiple: boolean,
): string | string[] {
  if (!multiple) {
    return event.target.value;
  }
  return Array.from(event.target.options)
    .filter((option) => option.selected)
    .map((option) => option.value);
}

function valuesFromFormData(formData: unknown): Record<string, unknown> {
  if (!isRecord(formData)) {
    return {};
  }
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    if (value !== undefined) {
      values[key] = value;
    }
  }
  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaIncludesType(
  schema: RJSFSchema,
  expected: "array" | "boolean" | "integer" | "null" | "number" | "object" | "string",
): boolean {
  const type = schema.type;
  return Array.isArray(type) ? type.includes(expected) : type === expected;
}

function errorKey(error: string | ReactElement, index: number): string {
  if (typeof error === "string") {
    return `${index}-${error}`;
  }
  if (error.key !== null) {
    return String(error.key);
  }
  return `error-${index}`;
}
