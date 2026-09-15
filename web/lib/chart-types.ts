/**
 * What recharts hands a custom tooltip or label renderer. Recharts' own generics change shape
 * between versions and do not describe the payload entries the charts here read, so this is the
 * narrow contract the components rely on (soma#958).
 */
export interface ChartTooltipProps<T = Record<string, unknown>> {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{
    name?: string;
    dataKey?: string | number;
    value?: number | string;
    color?: string;
    payload?: T;
  }>;
}

/**
 * What recharts hands a `Tooltip` formatter as the datum's value: one number or string, an array
 * of them for a stacked series, or nothing when the point has no value. Recharts calls this
 * `ValueType`; naming it here keeps the charts off `any` without importing from the library's
 * internal type paths. The `undefined` matters: a formatter that forgets it does not typecheck.
 */
export type ChartValue = number | string | Array<number | string> | undefined;

/** The series name recharts hands a formatter, which is absent for an unnamed series. */
export type ChartName = string | undefined;

/** One entry in a tooltip payload, as a formatter's third argument. */
export interface ChartPayloadEntry<T = Record<string, unknown>> {
  name?: string;
  dataKey?: string | number;
  value?: ChartValue;
  color?: string;
  payload?: T;
}
