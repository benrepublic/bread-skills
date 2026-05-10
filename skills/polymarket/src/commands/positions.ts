import { loadConfig } from "../config";
import { readEoaWithoutDecrypting } from "../creds";
import { emit, fail } from "../util/io";

interface DataApiPosition {
  conditionId: string;
  asset: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  realizedPnl?: number;
  endDate?: string;
  title?: string;
  slug?: string;
}

export async function positionsCommand(opts: { json?: boolean }): Promise<void> {
  const config = loadConfig();
  const jsonOutput = !!opts.json;
  const eoa = readEoaWithoutDecrypting(config.credsPath);
  if (!eoa) {
    fail(jsonOutput, `No creds at ${config.credsPath}. Run \`poly login\` first.`);
  }
  const url = `${config.dataApiHost}/positions?user=${eoa}&sizeThreshold=0.01`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    fail(jsonOutput, "Failed to reach data-api", err instanceof Error ? err.message : err);
  }
  if (!res.ok) {
    fail(jsonOutput, `data-api ${res.status}`, await res.text());
  }
  const positions = (await res.json()) as DataApiPosition[];
  if (!positions.length) {
    emit(jsonOutput, "No open positions.", []);
    return;
  }
  const lines = positions.map((p) =>
    [
      `${p.title ?? p.conditionId}`,
      `  outcome:    ${p.outcome}`,
      `  size:       ${p.size.toFixed(2)} shares @ avg $${p.avgPrice.toFixed(4)}`,
      `  current:    $${p.currentValue.toFixed(2)}`,
      `  PnL:        $${p.cashPnl.toFixed(2)} (${p.percentPnl.toFixed(2)}%)`,
      p.endDate ? `  ends:       ${p.endDate}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  emit(jsonOutput, lines.join("\n\n"), positions);
}
