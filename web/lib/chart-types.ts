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
