import { formatEuro } from "./types";
import type { EntitySummary, PeriodSummary, WarrantyAnalytics } from "./analytics";

export type WarrantyInsight = {
  id: string;
  title: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
};

export function buildWarrantyInsights(analytics: WarrantyAnalytics): WarrantyInsight[] {
  const insights: WarrantyInsight[] = [];

  if (analytics.totalCount === 0) {
    return [
      {
        id: "empty",
        title: "Noch keine Garantiefälle",
        detail: "Lege Fälle an oder importiere Partnerrechnungen, um Auswertungen zu sehen.",
        tone: "neutral",
      },
    ];
  }

  const bestPartner = analytics.byPartner[0];
  const worstPartner = [...analytics.byPartner].sort((a, b) => a.profit - b.profit)[0];
  const worstManufacturer = [...analytics.byManufacturer].sort((a, b) => a.profit - b.profit)[0];
  const latestPeriod = analytics.periods[analytics.periods.length - 1];
  const previousPeriod = analytics.periods[analytics.periods.length - 2];

  if (bestPartner) {
    insights.push({
      id: "best-partner",
      title: `Profitabelster Partner: ${bestPartner.name}`,
      detail: `${bestPartner.count} Fälle · Gewinn ${formatEuro(bestPartner.profit)} · Ø ${formatEuro(bestPartner.avgProfit)}`,
      tone: "positive",
    });
  }

  if (worstPartner && worstPartner.profit < 0) {
    insights.push({
      id: "worst-partner",
      title: `Partner mit Verlust: ${worstPartner.name}`,
      detail: `${worstPartner.count} Fälle · Verlust ${formatEuro(Math.abs(worstPartner.profit))}`,
      tone: "negative",
    });
  }

  if (worstManufacturer && worstManufacturer.profit < 0) {
    insights.push({
      id: "worst-manufacturer",
      title: `Hersteller mit negativem Saldo: ${worstManufacturer.name}`,
      detail: `${worstManufacturer.count} Fälle · Verlust ${formatEuro(Math.abs(worstManufacturer.profit))}`,
      tone: "negative",
    });
  }

  if (latestPeriod) {
    insights.push({
      id: "latest-period",
      title: `${latestPeriod.label}: ${latestPeriod.count} Fälle`,
      detail: `Einnahmen ${formatEuro(latestPeriod.income)} · Ausgaben ${formatEuro(latestPeriod.expense)} · Gewinn ${formatEuro(latestPeriod.profit)}`,
      tone: latestPeriod.profit >= 0 ? "positive" : "negative",
    });
  }

  if (latestPeriod && previousPeriod) {
    const delta = latestPeriod.profit - previousPeriod.profit;
    insights.push({
      id: "profit-trend",
      title: delta >= 0 ? "Gewinn steigt" : "Gewinn sinkt",
      detail: `${formatEuro(Math.abs(delta))} ${delta >= 0 ? "mehr" : "weniger"} als in ${previousPeriod.label}`,
      tone: delta >= 0 ? "positive" : "negative",
    });
  }

  return insights;
}

export function topEntities(list: EntitySummary[], limit = 5): EntitySummary[] {
  return list.slice(0, limit);
}

export function bottomEntities(list: EntitySummary[], limit = 5): EntitySummary[] {
  return [...list].sort((a, b) => a.profit - b.profit).slice(0, limit);
}

export function trendFromPeriods(periods: PeriodSummary[]): "up" | "down" | "flat" {
  if (periods.length < 2) return "flat";
  const last = periods[periods.length - 1]?.profit ?? 0;
  const prev = periods[periods.length - 2]?.profit ?? 0;
  if (last > prev) return "up";
  if (last < prev) return "down";
  return "flat";
}
