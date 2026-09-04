/**
 * Shared controls for the test harness: collapsible sections, chips, text fields, the result box
 * and the on-screen event log. Example code only.
 *
 * @format
 */
import React, {useCallback, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {
  VaultCardFormChange,
  VaultFieldChange,
  VaultTokenizeResult,
} from '@juspay-tech/react-native-hyperswitch-vault';

export const BRAND = '#0B5FBF';

/* ── Tri-state values: "unset" means the prop is not passed at all ─────────── */

export type Tri<T extends string> = T | 'unset';
export const triValue = <T extends string>(v: Tri<T>): T | undefined => (v === 'unset' ? undefined : v);
export const triBool = (v: Tri<'true' | 'false'>): boolean | undefined =>
  v === 'unset' ? undefined : v === 'true';
export const orUndefined = (text: string): string | undefined =>
  text.trim().length > 0 ? text : undefined;
/* An object with only undefined members is not passed at all. */
export const compact = <T extends object>(o: T): T | undefined =>
  Object.values(o).some(v => v !== undefined) ? o : undefined;

/* ── Layout ────────────────────────────────────────────────────────────────── */

export function Section({
  title,
  hint,
  open: initiallyOpen = false,
  badge,
  children,
}: {
  title: string;
  hint?: string;
  open?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={ui.section}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(v => !v)} style={ui.sectionHeader}>
        <Text style={ui.sectionTitle}>
          {open ? '▾' : '▸'} {title}
        </Text>
        {badge ? <Text style={ui.badge}>{badge}</Text> : null}
      </Pressable>
      {open ? (
        <View style={ui.sectionBody}>
          {hint ? <Text style={ui.hint}>{hint}</Text> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function Row({children}: {children: React.ReactNode}) {
  return <View style={ui.row}>{children}</View>;
}

export function Label({text}: {text: string}) {
  return <Text style={ui.label}>{text}</Text>;
}

export function Hint({text}: {text: string}) {
  return <Text style={ui.hint}>{text}</Text>;
}

/* ── Inputs ────────────────────────────────────────────────────────────────── */

export function Chip({on, label, onPress}: {on: boolean; label: string; onPress: () => void}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[ui.chip, on && ui.chipOn]}>
      <Text style={[ui.chipLabel, on && ui.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

/* Single choice. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: string;
  onChange: (v: T) => void;
}) {
  return (
    <View style={ui.chips}>
      {options.map(option => (
        <Chip key={option} on={option === value} label={option} onPress={() => onChange(option)} />
      ))}
    </View>
  );
}

/* Several choices. */
export function MultiChips({
  options,
  value,
  onToggle,
}: {
  options: readonly string[];
  value: readonly string[];
  onToggle: (v: string) => void;
}) {
  return (
    <View style={ui.chips}>
      {options.map(option => (
        <Chip key={option} on={value.includes(option)} label={option} onPress={() => onToggle(option)} />
      ))}
    </View>
  );
}

export function Toggle({on, label, onPress}: {on: boolean; label: string; onPress: () => void}) {
  return <Chip on={on} label={`${label}: ${on ? 'on' : 'off'}`} onPress={onPress} />;
}

export function Field({
  value,
  onChange,
  placeholder,
  autoCapitalize = 'sentences',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      style={ui.input}
    />
  );
}

export function Button({
  label,
  onPress,
  primary = false,
  dim = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  dim?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({pressed}) => [
        primary ? ui.cta : ui.secondary,
        pressed && ui.pressed,
        dim && ui.dim,
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? '#FFFFFF' : BRAND} />
      ) : (
        <Text style={primary ? ui.ctaLabel : ui.secondaryLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

/* ── Results ───────────────────────────────────────────────────────────────── */

export type Outcome = 'idle' | 'unmounted' | VaultTokenizeResult;

export const describeOutcome = (o: Outcome): string =>
  o === 'idle'
    ? 'idle'
    : o === 'unmounted'
      ? 'the form was not mounted'
      : o.status === 'success'
        ? 'success'
        : `${o.status} / ${o.error.code} — ${o.error.message}`;

export function ResultBox({outcome, note}: {outcome: Outcome; note?: string}) {
  if (outcome === 'idle') {return null;}
  if (outcome !== 'unmounted' && outcome.status === 'success') {
    return (
      <View style={ui.resultOk}>
        <Text style={ui.resultTitle}>success · token (demo only — never render this in a real app)</Text>
        <Text style={ui.token} selectable>
          {outcome.token}
        </Text>
        {note ? <Text style={ui.hint}>{note}</Text> : null}
      </View>
    );
  }
  return (
    <View style={ui.resultBad}>
      <Text style={ui.resultTitle}>{outcome === 'unmounted' ? 'not mounted' : `${outcome.status} / ${outcome.error.code}`}</Text>
      {outcome !== 'unmounted' ? <Text style={ui.error}>{outcome.error.message}</Text> : null}
    </View>
  );
}

/* ── Event log ─────────────────────────────────────────────────────────────── */

export const useEventLog = (limit = 16) => {
  const [lines, setLines] = useState<string[]>([]);
  const append = useCallback(
    (line: string) => setLines(previous => [line, ...previous].slice(0, limit)),
    [limit],
  );
  const clear = useCallback(() => setLines([]), []);
  return {lines, append, clear};
};

export const formLine = (e: VaultCardFormChange) =>
  `${e.eventName} · session=${e.sessionStatus} fieldsReady=${e.fieldsReady} complete=${e.complete} valid=${e.valid}` +
  ` submitting=${e.submitting} canSubmit=${e.canSubmit} brand=${e.payload.brand ?? '-'}` +
  ` bin=${e.payload.bin ?? '-'} last4=${e.payload.last4 ?? '-'}` +
  (e.isCoBadged ? ' coBadged' : '') +
  (e.networkError ? ` networkError=${e.networkError.code}` : '') +
  (e.fields.cardholderName ? ' +name' : '');

export const fieldLine = (e: VaultFieldChange) =>
  `change ${e.elementType} · empty=${e.empty} complete=${e.complete} valid=${e.valid} touched=${e.touched}` +
  (e.brand ? ` brand=${e.brand}` : '') +
  (e.isCoBadged ? ' coBadged' : '') +
  (e.error ? ` error=${e.errorCode}: ${e.error}` : '');

export function LogBox({lines, onClear, title = 'Events (newest first) · also in Metro'}: {lines: string[]; onClear: () => void; title?: string}) {
  return (
    <View style={ui.logBox}>
      <View style={ui.logHeader}>
        <Text style={ui.logTitle}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={onClear}>
          <Text style={ui.logClear}>clear</Text>
        </Pressable>
      </View>
      {lines.length === 0 ? (
        <Text style={ui.logEmpty}>Nothing yet.</Text>
      ) : (
        lines.map((line, index) => (
          <Text key={`${index}-${line}`} style={ui.logLine} numberOfLines={2}>
            {line}
          </Text>
        ))
      )}
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────────── */

export const ui = StyleSheet.create({
  title: {fontSize: 22, fontWeight: '700', color: '#0B1220'},
  subtitle: {fontSize: 13, color: '#64748B'},
  hint: {fontSize: 12, color: '#64748B', lineHeight: 17},
  label: {fontSize: 11, color: '#475569', fontWeight: '700', marginTop: 2, fontFamily: 'Courier'},
  badge: {fontSize: 11, color: BRAND, fontWeight: '700'},

  section: {borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0'},
  sectionHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12},
  sectionTitle: {fontSize: 14, fontWeight: '700', color: '#0B1220'},
  sectionBody: {paddingHorizontal: 12, paddingBottom: 12, gap: 8},

  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF'},
  chipOn: {borderColor: BRAND, backgroundColor: '#E8F1FF'},
  chipLabel: {fontSize: 12, color: '#64748B', fontWeight: '600'},
  chipLabelOn: {color: BRAND},

  input: {height: 40, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, fontSize: 14, color: '#0B1220', backgroundColor: '#F8FAFC'},

  cta: {height: 50, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', flexGrow: 1},
  ctaLabel: {color: '#FFFFFF', fontSize: 15, fontWeight: '700'},
  secondary: {height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, flexGrow: 1},
  secondaryLabel: {color: '#0B1220', fontSize: 13, fontWeight: '600'},
  pressed: {opacity: 0.8},
  dim: {opacity: 0.5},

  resultOk: {backgroundColor: '#ECFDF5', borderRadius: 12, padding: 12, gap: 4},
  resultBad: {backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, gap: 4},
  resultTitle: {fontSize: 13, fontWeight: '700', color: '#0B1220'},
  token: {fontSize: 12, color: '#065F46', fontFamily: 'Courier'},
  error: {fontSize: 13, color: '#B91C1C'},

  logBox: {backgroundColor: '#0B1220', borderRadius: 12, padding: 12, gap: 3},
  logHeader: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
  logTitle: {color: '#94A3B8', fontSize: 11, fontWeight: '700'},
  logClear: {color: '#93C5FD', fontSize: 11, fontWeight: '700'},
  logEmpty: {color: '#64748B', fontSize: 11, fontFamily: 'Courier'},
  logLine: {color: '#A7F3D0', fontSize: 11, fontFamily: 'Courier'},

  status: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  statusPill: {paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#F1F5F9'},
  statusPillOn: {backgroundColor: '#DCFCE7'},
  statusText: {fontSize: 11, fontFamily: 'Courier', color: '#334155'},
});
