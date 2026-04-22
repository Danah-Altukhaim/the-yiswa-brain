import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: "Helvetica" },
  h1: { fontSize: 20, marginBottom: 6 },
  h2: { fontSize: 14, marginTop: 14, marginBottom: 6, color: "#4338ca" },
  row: { flexDirection: "row", justifyContent: "space-between", marginVertical: 2 },
  pill: { backgroundColor: "#eef2ff", color: "#4338ca", padding: 3, borderRadius: 4 },
  muted: { color: "#64748b" },
});

export type WeeklyReportData = {
  tenantName: string;
  weekStart: string;
  weekEnd: string;
  totals: { entries: number; newThisWeek: number; updatedThisWeek: number; expiredThisWeek: number };
  topServed: Array<{ name: string; count: number }>;
  suggestions: Array<{ type: string; description: string }>;
  activityHighlights: Array<{ when: string; summary: string }>;
  health: { freshPct: number; translatedPct: number; withMediaPct: number };
};

export function WeeklyReport(props: WeeklyReportData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>The Brain: Weekly Report</Text>
        <Text style={styles.muted}>
          {props.tenantName} · {props.weekStart} → {props.weekEnd}
        </Text>

        <Text style={styles.h2}>Knowledge Base</Text>
        <View style={styles.row}><Text>Total entries</Text><Text>{props.totals.entries}</Text></View>
        <View style={styles.row}><Text>Added this week</Text><Text>{props.totals.newThisWeek}</Text></View>
        <View style={styles.row}><Text>Updated this week</Text><Text>{props.totals.updatedThisWeek}</Text></View>
        <View style={styles.row}><Text>Expired this week</Text><Text>{props.totals.expiredThisWeek}</Text></View>

        <Text style={styles.h2}>Content Health</Text>
        <View style={styles.row}><Text>Fresh (≤30d)</Text><Text>{props.health.freshPct}%</Text></View>
        <View style={styles.row}><Text>Translated</Text><Text>{props.health.translatedPct}%</Text></View>
        <View style={styles.row}><Text>With media</Text><Text>{props.health.withMediaPct}%</Text></View>

        <Text style={styles.h2}>Top Served Entries</Text>
        {props.topServed.map((t, i) => (
          <View key={i} style={styles.row}>
            <Text>{i + 1}. {t.name}</Text>
            <Text>{t.count}</Text>
          </View>
        ))}

        <Text style={styles.h2}>AI Gap Suggestions</Text>
        {props.suggestions.map((s, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.pill}>{s.type}</Text>
            <Text style={{ flex: 1, marginLeft: 8 }}>{s.description}</Text>
          </View>
        ))}

        <Text style={styles.h2}>Activity Highlights</Text>
        {props.activityHighlights.map((a, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.muted}>{a.when}</Text>
            <Text style={{ flex: 1, marginLeft: 8 }}>{a.summary}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderWeeklyReportPdf(data: WeeklyReportData): Promise<Buffer> {
  const element = React.createElement(WeeklyReport, data) as any;
  return renderToBuffer(element);
}
