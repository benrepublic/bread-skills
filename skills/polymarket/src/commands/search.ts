import { loadConfig } from "../config";
import { searchMarkets } from "../gamma";
import { emit, fail } from "../util/io";

export interface SearchCmdOptions {
  json?: boolean;
  limit?: number;
  minLiquidity?: number;
}

export async function searchCommand(
  query: string,
  opts: SearchCmdOptions,
): Promise<void> {
  const config = loadConfig();
  const jsonOutput = !!opts.json;
  if (!query || !query.trim()) {
    fail(jsonOutput, "search query is required");
  }
  let results;
  try {
    results = await searchMarkets(query, {
      host: config.gammaHost,
      limit: opts.limit ?? 5,
      minLiquidity: opts.minLiquidity ?? 0,
    });
  } catch (err) {
    fail(jsonOutput, "Gamma search failed", err instanceof Error ? err.message : err);
  }
  if (!results.length) {
    emit(jsonOutput, `No markets matched "${query}".`, []);
    return;
  }

  const lines = results.map((r, i) =>
    [
      `${i + 1}. ${r.question}`,
      `   conditionId:  ${r.conditionId}`,
      `   slug:         ${r.slug}  (https://polymarket.com/event/${r.slug})`,
      `   liquidity:    $${r.liquidityNum.toLocaleString()}`,
      `   volume:       $${r.volumeNum.toLocaleString()}`,
      `   end:          ${r.endDate}`,
      `   negRisk:      ${r.negRisk}`,
      `   matchScore:   ${r.matchScore.toFixed(3)}`,
    ].join("\n"),
  );
  emit(jsonOutput, lines.join("\n\n"), results);
}
