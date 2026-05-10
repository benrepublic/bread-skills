import { getBook, getTickSize, estimateSellFill } from "../clob";
import { loadAuthedContext, requireSellReady } from "../context";
import { getMarket } from "../gamma";
import { emit, fail } from "../util/io";

interface DataApiPosition {
  conditionId: string;
  asset: string;
  outcome: string;
  size: number;
  avgPrice: number;
}

export interface CloseOptions {
  json?: boolean;
  confirm?: boolean;
  type?: "FOK" | "FAK";
  side?: string; // "YES" | "NO" — optional filter
}

async function fetchPositionsForCondition(
  dataApiHost: string,
  user: string,
  conditionId: string,
): Promise<DataApiPosition[]> {
  const url = `${dataApiHost}/positions?user=${user}&sizeThreshold=0.000001`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`data-api ${res.status}: ${await res.text()}`);
  }
  const positions = (await res.json()) as DataApiPosition[];
  return positions.filter(
    (p) => p.conditionId.toLowerCase() === conditionId.toLowerCase() && p.size > 0,
  );
}

export async function closeCommand(
  conditionId: string,
  opts: CloseOptions,
): Promise<void> {
  const jsonOutput = !!opts.json;

  if (!opts.confirm) {
    fail(
      jsonOutput,
      "refusing to close without --confirm. Re-run with --confirm after the user approves.",
    );
  }

  const sideFilter = opts.side?.toUpperCase();
  if (sideFilter != null && sideFilter !== "YES" && sideFilter !== "NO") {
    fail(jsonOutput, `--side must be YES or NO if given, got ${opts.side}`);
  }

  const { config, clob, eoa } = loadAuthedContext(jsonOutput);
  await requireSellReady(jsonOutput, config, eoa);

  // Look up positions and the market metadata (for negRisk) in parallel.
  const [positions, market] = await Promise.all([
    fetchPositionsForCondition(config.dataApiHost, eoa, conditionId).catch((err) => {
      fail(jsonOutput, "Failed to fetch positions", err instanceof Error ? err.message : err);
    }),
    getMarket(config.gammaHost, conditionId),
  ]);

  if (!market) {
    fail(
      jsonOutput,
      `Market ${conditionId} not found, not active, or not binary YES/NO. Resolved markets must be redeemed, which this skill does not support.`,
    );
  }

  const targets = sideFilter
    ? positions.filter((p) => p.outcome.toUpperCase() === sideFilter)
    : positions;

  if (!targets.length) {
    fail(
      jsonOutput,
      sideFilter
        ? `No ${sideFilter} position found on ${conditionId}`
        : `No open position found on ${conditionId}`,
    );
  }

  const orderType = opts.type ?? "FOK";
  const fokType = orderType === "FAK" ? clob.OrderType.FAK : clob.OrderType.FOK;

  const results: Array<{
    outcome: string;
    asset: string;
    shares: number;
    preFlight: ReturnType<typeof estimateSellFill>;
    response: unknown;
  }> = [];

  for (const pos of targets) {
    const [book, tickSize] = await Promise.all([
      getBook(clob, pos.asset),
      getTickSize(clob, pos.asset),
    ]);
    const preFlight = estimateSellFill(book.bids, pos.size);
    let response: unknown;
    try {
      response = await clob.client.createAndPostMarketOrder(
        {
          tokenID: pos.asset,
          amount: pos.size,
          side: clob.Side.SELL,
          orderType: fokType,
        },
        { tickSize, negRisk: market.negRisk },
        fokType,
      );
    } catch (err) {
      response = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
    results.push({
      outcome: pos.outcome,
      asset: pos.asset,
      shares: pos.size,
      preFlight,
      response,
    });
  }

  const lines = results.map((r) =>
    [
      `${r.outcome} (${r.shares.toFixed(4)} shares)`,
      `  est. proceeds: $${r.preFlight.usdReceived.toFixed(2)} @ avg $${r.preFlight.averagePrice.toFixed(4)}`,
      `  response:      ${JSON.stringify(r.response)}`,
    ].join("\n"),
  );

  emit(
    jsonOutput,
    `Close attempted on ${results.length} position(s) on ${market.question}:\n${lines.join("\n\n")}`,
    {
      conditionId,
      question: market.question,
      negRisk: market.negRisk,
      results,
    },
  );
}
