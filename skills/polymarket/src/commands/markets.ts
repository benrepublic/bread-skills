import { loadConfig } from "../config";
import { getMarket } from "../gamma";
import { emit, fail } from "../util/io";

export async function marketsCommand(
  conditionId: string,
  opts: { json?: boolean },
): Promise<void> {
  const config = loadConfig();
  const jsonOutput = !!opts.json;
  const market = await getMarket(config.gammaHost, conditionId);
  if (!market) {
    fail(jsonOutput, `Market ${conditionId} not found`);
  }
  const text = [
    `Question:      ${market.question}`,
    `Slug:          ${market.slug}`,
    `conditionId:   ${market.conditionId}`,
    `Outcomes:      ${market.outcomes.join(" / ")}`,
    `Token IDs:`,
    `  YES:         ${market.clobTokenIds.YES}`,
    `  NO:          ${market.clobTokenIds.NO}`,
    `Liquidity:     $${market.liquidityNum.toLocaleString()}`,
    `Volume:        $${market.volumeNum.toLocaleString()}`,
    `End:           ${market.endDate}`,
    `Neg-risk:      ${market.negRisk}`,
  ].join("\n");
  emit(jsonOutput, text, market);
}
