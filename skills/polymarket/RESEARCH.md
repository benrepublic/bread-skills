# Polymarket API Research — Reference for Bread Polymarket Skill

> Source-backed reference compiled before any code is written. Every concrete
> claim has an inline link or footnote. Cutoff: docs as of May 2026.
>
> **Critical context up front:** Polymarket shipped a breaking protocol upgrade
> ("CLOB V2") on **April 28, 2026**. The signed EIP-712 Order struct changed,
> the Exchange contract address moved, the EIP-712 domain `version` is now
> `"2"`, and the collateral token migrated from `USDC.e` to a wrapper called
> `pUSD`. Old V1-signed orders no longer settle, and the legacy
> `clob-client` / `py-clob-client` packages do not work against production.
> This document is V2-first; V1 is documented only for contrast.[^v2-migration]

[^v2-migration]: <https://docs.polymarket.com/v2-migration> — "Polymarket
deployed CLOB V2 on April 28, 2026… Legacy V1 SDKs and V1-signed orders are no
longer supported on production… There is no backward compatibility — integrators
must upgrade before production deployment."

---

## 0. Source map

The Polymarket docs index is published as a single file at
<https://docs.polymarket.com/llms.txt>. Concrete pages used in this research:

| Topic | URL |
| --- | --- |
| API reference root | <https://docs.polymarket.com/api-reference/introduction> |
| Authentication | <https://docs.polymarket.com/api-reference/authentication> |
| L1 client methods | <https://docs.polymarket.com/trading/clients/l1> |
| Public client methods | <https://docs.polymarket.com/trading/clients/public> |
| Quickstart | <https://docs.polymarket.com/quickstart> |
| Endpoints reference | <https://docs.polymarket.com/quickstart/reference/endpoints> |
| Markets / events concepts | <https://docs.polymarket.com/concepts/markets-events> |
| CTF / positions | <https://docs.polymarket.com/concepts/positions-tokens> |
| pUSD | <https://docs.polymarket.com/concepts/pusd> |
| Contracts | <https://docs.polymarket.com/resources/contracts> |
| Orders overview | <https://docs.polymarket.com/trading/orders/overview> |
| Order create guide | <https://docs.polymarket.com/trading/orders/create> |
| Fees | <https://docs.polymarket.com/trading/fees> |
| Neg-risk | <https://docs.polymarket.com/advanced/neg-risk> |
| Proxy wallet | <https://docs.polymarket.com/developers/proxy-wallet> |
| V2 migration | <https://docs.polymarket.com/v2-migration> |
| POST /order | <https://docs.polymarket.com/api-reference/trade/post-a-new-order> |
| GET /book | <https://docs.polymarket.com/api-reference/market-data/get-order-book> |
| GET /price | <https://docs.polymarket.com/api-reference/market-data/get-market-price> |
| GET /tick-size | <https://docs.polymarket.com/api-reference/market-data/get-tick-size> |
| GET /fee-rate | <https://docs.polymarket.com/api-reference/market-data/get-fee-rate> |
| GET /clob-markets/{id} | <https://docs.polymarket.com/api-reference/markets/get-clob-market-info> |
| Gamma list-markets | <https://docs.polymarket.com/api-reference/markets/list-markets> |
| Gamma list-events | <https://docs.polymarket.com/api-reference/events/list-events> |
| Gamma market-by-slug | <https://docs.polymarket.com/api-reference/markets/get-market-by-slug> |
| Gamma search | <https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles> |
| Polymarket V2 cheatsheet (third-party, useful) | <https://github.com/cengizmandros/polymarket-cheatsheet> |
| TypeScript SDK (V2) | <https://github.com/Polymarket/clob-client-v2> |
| Python SDK (V2) | <https://github.com/Polymarket/py-clob-client-v2> |
| Rust SDK (V2) | <https://github.com/Polymarket/rs-clob-client-v2> |
| CTF Exchange V2 contracts | <https://github.com/Polymarket/ctf-exchange-v2> |
| Auth troubleshooting (third-party) | <https://agentbets.ai/guides/polymarket-auth-troubleshooting/> |

---

## 1. Wallet model

### 1.1 Chain — Polygon mainnet

Polymarket runs entirely on **Polygon mainnet, chainId `137`**. Confirmed by
the contracts page header ("Chain ID: 137 (Polygon mainnet)") and the
quickstart, which initialises `chain_id = 137`
([contracts](https://docs.polymarket.com/resources/contracts);
[quickstart](https://docs.polymarket.com/quickstart) — "Chain ID: 137 (Polygon
mainnet)").

The amoy test chain (`80002`) is used in the SDK examples
([example](https://github.com/Polymarket/py-clob-client-v2/blob/main/examples/keys/create_api_key.py) — `chain_id = int(os.environ.get("CHAIN_ID", 80002))`).

### 1.2 Three signature/wallet modes

The protocol supports three distinct settlement wallets, encoded in the
`signatureType` field of every Order. The values are consistent across docs and
the on-chain `OrderStructs.sol`
([cheatsheet](https://github.com/cengizmandros/polymarket-cheatsheet);
[order-create docs](https://docs.polymarket.com/trading/orders/create) —
"Signature types (`0` = EOA, `1` = POLY_PROXY, `2` = GNOSIS_SAFE)"):

| `signatureType` | Symbol | Used by | `signer` field | `maker` (a.k.a. funder) field | Where pUSD must sit |
| :-: | --- | --- | --- | --- | --- |
| `0` | `EOA` | External wallets (MetaMask, mnemonic-derived EOA, hardware) | EOA address | **Same EOA address** | The EOA itself |
| `1` | `POLY_PROXY` | Magic Link email signups | EOA created by Magic | Polymarket-deployed proxy contract address | The proxy contract |
| `2` | `POLY_GNOSIS_SAFE` | Polymarket-web users that signed up with a browser wallet | EOA (e.g. MetaMask address) | 1-of-1 Gnosis Safe deployed by Polymarket | The Safe |

Source quotes:

- [proxy-wallet docs](https://docs.polymarket.com/developers/proxy-wallet) —
  "These proxy wallets are automatically deployed for the user on their first
  login to Polymarket.com… The wallet address displayed to the user on
  Polymarket.com is the proxy wallet and should be used as the funder."
- [agentbets troubleshooting](https://agentbets.ai/guides/polymarket-auth-troubleshooting/)
  — "Type 0 (EOA): Signs directly with private key… your signing address and
  your funder address are the **same address**." And: "For Type 1
  (POLY_PROXY): Your Magic Link signing key is different from the proxy
  address that holds funds. For Type 2 (GNOSIS_SAFE): Your MetaMask signing
  key is different from the Gnosis Safe proxy address that holds funds."
- [agentbets](https://agentbets.ai/guides/polymarket-auth-troubleshooting/) —
  "You do not need to pass a separate `funder` parameter [for type 0] because
  there is no proxy wallet — the wallet that signs is the wallet that holds
  your funds."

### 1.3 What this means for our skill (mnemonic → external EOA)

We are deriving an EOA from a BIP-39 mnemonic ourselves. We are **not** using
Magic Link or Polymarket's website. Therefore:

- **Use `signatureType = 0` (EOA).**
- Both `maker` and `signer` in the Order are set to the **same EOA address** —
  the address derived from the mnemonic.
- `funderAddress` in the SDK is the EOA address (or omitted; the V2 builder
  defaults `funder` to the signer for type 0
  — [createOrder.ts](https://github.com/Polymarket/clob-client-v2/blob/main/src/order-builder/helpers/createOrder.ts):
  "Uses the provided `funderAddress` if supplied; otherwise defaults to the
  signer address").
- The EOA must hold **pUSD** (for buying outcome tokens) and **POL** (for gas)
  — [quickstart](https://docs.polymarket.com/quickstart): "your funder address
  needs **pUSD** (for buying outcome tokens) and **POL** (for gas, if using
  EOA type 0)".
- No proxy contract needs to be deployed for the user. Trades settle directly
  from/to the EOA on the CTF Exchange.

> **Risk note.** Most existing Polymarket users have type 2 (Gnosis Safe). If
> our user has previously transacted on polymarket.com with the SAME mnemonic
> (e.g. by importing a "rainbow wallet" address), they may already have a
> Gnosis Safe proxy holding their funds. The Polymarket UI will still show the
> *Safe* address, not the EOA. For our skill, the EOA-mode pUSD balance is
> what matters — funds in a Safe will not be reachable via type 0 orders. See
> the open question in §6.

### 1.4 Collateral token: pUSD (formerly USDC.e)

Polymarket previously used **USDC.e** (the bridged variant of USDC on Polygon,
contract `0x2791…`). On April 28, 2026, the protocol migrated to **pUSD**
("Polymarket USD") as the canonical collateral.[^pusd-migration]

[^pusd-migration]: [v2-migration](https://docs.polymarket.com/v2-migration) —
"Migration from USDC.e to pUSD (Polymarket USD), described as 'a standard
ERC-20 on Polygon backed by USDC, with backing enforced onchain by the smart
contract.'"

- **pUSD is an ERC-20 wrapper over USDC.** [pUSD
  concept](https://docs.polymarket.com/concepts/pusd): "pUSD is a standard
  ERC-20 wrapper that represents a USDC claim… The protocol settles all
  trading activity in native USDC."
- **The Exchange contract only accepts pUSD as the quote asset.** Orders are
  denominated in pUSD with 6 decimals (same as USDC).
- Wrapping is via a `CollateralOnramp` contract; unwrapping via
  `CollateralOfframp`
  ([pUSD](https://docs.polymarket.com/concepts/pusd) — "The wrapping is
  enforced through smart contracts called `CollateralOnramp` (for wrapping)
  and `CollateralOfframp` (for unwrapping).").
- The web UI auto-wraps for users; **API-only / external EOA users must wrap
  manually**:
  [v2-migration](https://docs.polymarket.com/v2-migration) — "Web users
  benefit from automatic wrapping. For 'API-only traders,' manual wrapping
  occurs via the Collateral Onramp's `wrap()` function, accepting USDC.e as
  input and minting pUSD output."

> **For the skill:** if the user's mnemonic-derived EOA holds USDC or USDC.e,
> we must (a) detect that, (b) call `CollateralOnramp.wrap(amount)` to mint
> pUSD before any first order. We should also accept that some users may
> already hold pUSD directly.

### 1.5 Required ERC-20 / CTF allowances

Before placing the first BUY (sell of pUSD → outcome tokens) the EOA must
approve the CTF Exchange. Before SELLing outcome tokens, it must approve the
ERC1155 conditional-tokens contract. Both are one-time transactions per
exchange.

- **Buying:** `pUSD.approve(ctfExchange, MAX_UINT256)`
  ([order-create](https://docs.polymarket.com/trading/orders/create) — "BUY:
  pUSD allowance ≥ spending amount").
- **Selling:**
  `ConditionalTokens.setApprovalForAll(ctfExchange, true)`
  ([order-create](https://docs.polymarket.com/trading/orders/create) — "SELL:
  conditional token allowance ≥ shares being sold"; ERC1155 doesn't have
  per-amount allowances, only `setApprovalForAll`).
- **Neg-risk markets** require the same two approvals against the
  *neg-risk* CTF Exchange address (different contract, different `approve`
  target) — see §1.6.

### 1.6 Contract addresses (Polygon, V2)

All from the official [contracts page](https://docs.polymarket.com/resources/contracts):

```
Chain ID                       137                                                           (Polygon mainnet)
Conditional Tokens (CTF)       0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
CTF Exchange (V2)              0xE111180000d2663C0091e4f400237545B87B996B
Neg Risk CTF Exchange (V2)     0xe2222d279d744050d28e00520010520000310F59
Neg Risk Adapter               0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296
pUSD (proxy)                   0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB
CollateralOnramp               0x93070a847efEf7F70739046A929D47a521F5B8ee
CollateralOfframp              0x2957922Eb93258b93368531d39fAcCA3B4dC5854
Polymarket Proxy Factory       0xaB45c5A4B0c941a2F231C04C3f49182e1A254052
Gnosis Safe Factory            0xaacfeea03eb1561c4e67d661e40682bd20e3541b
```

Legacy V1 addresses (for reference; do **not** sign V1 orders):
```
CTF Exchange (V1, deprecated)         0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
Neg Risk CTF Exchange (V1, deprecated) 0xC5d563A36AE78145C45a50134d48A1215220f80a
USDC.e (Polygon, used as input to wrap into pUSD) 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
```
([cheatsheet](https://github.com/cengizmandros/polymarket-cheatsheet) — V1
addresses + USDC.e is the well-known Polygon address; *not* on the official
contracts page itself.)

> The official contracts page does **not** publish a USDC.e address; we'll
> hard-code the canonical Polygon USDC.e address (`0x2791…`) in the skill but
> note this is a known external token, not a Polymarket-controlled contract.

---

## 2. Auth — API key derivation

Polymarket uses two layers of authentication on the CLOB:

- **L1 — wallet signature.** EIP-712 over a `ClobAuth` struct, signed with the
  EOA private key. Used to *create* or *derive* L2 API credentials.
- **L2 — HMAC.** HMAC-SHA256 over `timestamp + method + path + body` using
  the secret returned at L1. Used on every authenticated request thereafter
  (place/cancel orders, balances, etc.).

Source: [authentication](https://docs.polymarket.com/api-reference/authentication)
— "The CLOB uses two levels of authentication: L1 (Private Key) and L2 (API
Key)… L1 authentication uses the wallet's private key to sign an EIP-712
message used in the request header. L2 uses API credentials (apiKey, secret,
passphrase) generated from L1 authentication."

### 2.1 L1 — `ClobAuth` EIP-712 struct

**Domain** ([clob-client-v2/src/signing/eip712.ts](https://github.com/Polymarket/clob-client-v2/blob/main/src/signing/eip712.ts);
[py-clob-client-v2/eip712.py](https://github.com/Polymarket/py-clob-client-v2/blob/main/py_clob_client_v2/signing/eip712.py)):

```json
{
  "name":    "ClobAuthDomain",
  "version": "1",
  "chainId": 137
}
```

> Note the version stays at `"1"` even after V2; only the *Exchange* domain
> bumped to `"2"`. ([v2-migration](https://docs.polymarket.com/v2-migration):
> "only the Exchange domain changes. The `ClobAuthDomain` used for L1 API
> authentication stays at version `\"1\"`".)

**Types:**

```ts
ClobAuth: [
  { name: "address",   type: "address" },
  { name: "timestamp", type: "string" },   // unix seconds, decimal string
  { name: "nonce",     type: "uint256" },  // typically 0
  { name: "message",   type: "string" }
]
```

**Message value:**

```js
{
  address:   <EOA address>,
  timestamp: "<unix-seconds-as-string>",
  nonce:     0,            // default; derive_api_key takes a nonce param
  message:   "This message attests that I control the given wallet"
}
```

(Constants verified verbatim in the SDK:
[eip712.py constants](https://github.com/Polymarket/py-clob-client-v2/blob/main/py_clob_client_v2/signing/eip712.py)
— "MSG_TO_SIGN = 'This message attests that I control the given wallet'".)

The EOA signs the EIP-712 hash; the resulting signature goes in `POLY_SIGNATURE`.

### 2.2 L1 endpoints

Both endpoints take **L1 headers only** and return the same `ApiCreds` shape.

| Method | Path | Behaviour |
| --- | --- | --- |
| `POST` | `/auth/api-key` | Creates a *new* API key. Each EOA can only have one active key per `nonce`. |
| `GET`  | `/auth/derive-api-key` | Idempotent: derives the key for `(address, nonce)`. Same nonce → same creds. |

Source: [L1 methods](https://docs.polymarket.com/trading/clients/l1):
- `createApiKey` — "Creates a new API key (L2 credentials) for the wallet
  signer. Each wallet can only have one active API key at a time".
- `deriveApiKey` — "Derives an existing API key using a specific nonce. If
  you've already created credentials with a particular nonce, this returns
  the same credentials."
- `createOrDeriveApiKey` — "Convenience method that attempts to derive an API
  key with the default nonce, or creates a new one if it doesn't exist.
  **Recommended for initial setup.**"

**Required L1 headers** (all string-valued):

```
POLY_ADDRESS    <0x… EOA address>
POLY_SIGNATURE  <0x… 65-byte EIP-712 signature>
POLY_TIMESTAMP  <unix seconds, decimal string>      ← must equal the timestamp signed in the struct
POLY_NONCE      <decimal string, default "0">       ← must equal the nonce signed in the struct
```

(Source: [authentication](https://docs.polymarket.com/api-reference/authentication)
— L1 header list.)

**Response body** ([authentication](https://docs.polymarket.com/api-reference/authentication)):

```json
{
  "apiKey":     "550e8400-e29b-41d4-a716-446655440000",
  "secret":     "base64EncodedSecretString",
  "passphrase": "randomPassphraseString"
}
```

The `secret` is **URL-safe base64-encoded raw bytes** — not hex, not standard
base64. See §2.4.

### 2.3 L2 — HMAC scheme

Required L2 headers ([authentication](https://docs.polymarket.com/api-reference/authentication)):

```
POLY_ADDRESS    <0x… EOA address>
POLY_SIGNATURE  <url-safe base64 HMAC>
POLY_TIMESTAMP  <unix seconds, decimal string>
POLY_API_KEY    <UUID from /auth/api-key>
POLY_PASSPHRASE <passphrase from /auth/api-key>
```

(Note: there is **no** `POLY_NONCE` on L2 requests, despite the docs initially
listing it. The actual SDK only emits the five headers above for L2.)

### 2.4 HMAC algorithm — verbatim from the SDK

Reference: [py-clob-client-v2/signing/hmac.py](https://github.com/Polymarket/py-clob-client-v2/blob/main/py_clob_client_v2/signing/hmac.py).

1. **Decode the secret** with URL-safe base64 (NOT standard base64, NOT hex):
   `key = base64.urlsafe_b64decode(secret)`
2. **Build the canonical message string** by string concatenation, in this
   exact order:
   ```
   message = str(timestamp) + str(method) + str(requestPath) + bodyStr
   ```
   where `bodyStr` is `""` if there's no body, otherwise the JSON body
   string-cast to Python's `str(...)` representation **with single quotes
   replaced by double quotes** (so it matches Go/TypeScript json.Marshal
   output). The SDK note says verbatim: "Necessary to replace single quotes
   with double quotes to generate the same hmac message as go and typescript".
3. **HMAC-SHA256** the UTF-8-encoded message with the decoded key:
   `digest = hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()`
4. **URL-safe base64-encode** the raw 32-byte digest. The result is the value
   of `POLY_SIGNATURE`.

Important: `requestPath` is the path portion only, e.g. `/order` or
`/auth/api-key`, **not** the full URL.

### 2.5 Worked example — derive API key

Pseudocode (closely tracking `py-clob-client-v2`):

```python
from eth_account import Account
from eth_account.messages import encode_typed_data
import requests, time

CLOB = "https://clob.polymarket.com"
acct = Account.from_mnemonic(MNEMONIC)         # mnemonic → EOA
ts   = str(int(time.time()))
nonce = 0

typed = {
  "domain": {"name":"ClobAuthDomain","version":"1","chainId":137},
  "primaryType": "ClobAuth",
  "types": {
    "EIP712Domain": [
      {"name":"name","type":"string"},
      {"name":"version","type":"string"},
      {"name":"chainId","type":"uint256"},
    ],
    "ClobAuth": [
      {"name":"address",  "type":"address"},
      {"name":"timestamp","type":"string"},
      {"name":"nonce",    "type":"uint256"},
      {"name":"message",  "type":"string"},
    ],
  },
  "message": {
    "address":   acct.address,
    "timestamp": ts,
    "nonce":     nonce,
    "message":   "This message attests that I control the given wallet",
  },
}
sig = acct.sign_message(encode_typed_data(full_message=typed)).signature.hex()

resp = requests.get(f"{CLOB}/auth/derive-api-key", headers={
  "POLY_ADDRESS":   acct.address,
  "POLY_SIGNATURE": "0x" + sig,
  "POLY_TIMESTAMP": ts,
  "POLY_NONCE":     str(nonce),
}).json()

# resp = { "apiKey": "...", "secret": "...", "passphrase": "..." }
```

### 2.6 Worked example — sign an L2 request

```python
import base64, hmac, hashlib, json, time

def l2_headers(secret_b64, api_key, passphrase, address, method, path, body=None):
    ts   = str(int(time.time()))
    body_str = ""
    if body is not None:
        body_str = json.dumps(body, separators=(",", ":")).replace("'", '"')
    msg  = ts + method.upper() + path + body_str
    key  = base64.urlsafe_b64decode(secret_b64)
    digest = hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()
    sig  = base64.urlsafe_b64encode(digest).decode("utf-8")
    return {
        "POLY_ADDRESS":    address,
        "POLY_SIGNATURE":  sig,
        "POLY_TIMESTAMP":  ts,
        "POLY_API_KEY":    api_key,
        "POLY_PASSPHRASE": passphrase,
    }
```

### 2.7 Which endpoints need L1 vs L2?

- **L1 only:** `POST /auth/api-key`, `GET /auth/derive-api-key`,
  `DELETE /auth/api-key` (revoke).
- **L2 + signed order body:** `POST /order` (the body itself contains the
  EIP-712 *Order* signature, separate from the L2 HMAC header).
- **L2 only:** `DELETE /order`, `GET /orders`, `GET /trades`, balance/allowance
  endpoints.
- **No auth:** the entire market-data surface — `/book`, `/price`, `/midpoint`,
  `/spread`, `/tick-size`, `/fee-rate`, `/clob-markets/{id}`, plus all of
  Gamma and the public Data API.

(Cross-checked against the
[public client](https://docs.polymarket.com/trading/clients/public) page —
"public/no-auth methods for reading market data without requiring credentials
or a signer".)

---

## 3. Gamma API — market discovery

**Base URL:** `https://gamma-api.polymarket.com`
([endpoints](https://docs.polymarket.com/quickstart/reference/endpoints) —
"Gamma API: 'https://gamma-api.polymarket.com' — Markets, events, tags,
series, comments, sports, search, and public profiles").

Gamma is **public, no-auth**. It is the right surface for "find the
highest-liquidity market matching this NL query".

### 3.1 Endpoints we'll actually use

| Purpose | Method + path |
| --- | --- |
| Free-text search across markets+events+profiles | `GET /public-search?q=…` |
| List markets with filters | `GET /markets?…` |
| Get one market by slug | `GET /markets/slug/{slug}` |
| Get one market by id | `GET /markets/{id}` |
| List events (a "market group") | `GET /events?…` |
| Get one event by slug | `GET /events/slug/{slug}` |

Sources:
- [list-markets](https://docs.polymarket.com/api-reference/markets/list-markets)
- [list-events](https://docs.polymarket.com/api-reference/events/list-events)
- [search](https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles)
- [market-by-slug](https://docs.polymarket.com/api-reference/markets/get-market-by-slug)

### 3.2 Free-text search

```
GET https://gamma-api.polymarket.com/public-search
    ?q=trump+2028
    &limit_per_type=10
    &events_status=active
```

Returns three arrays:

```json
{
  "events":   [ /* Event objects with embedded markets */ ],
  "tags":     [ /* SearchTag objects */ ],
  "profiles": [ /* Profile objects */ ],
  "pagination": { "hasMore": false, "totalResults": 42 }
}
```

([search](https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles)
— quoted response shape.)

### 3.3 Market objects — fields that matter for us

From [list-markets](https://docs.polymarket.com/api-reference/markets/list-markets):

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Gamma's internal id |
| `conditionId` | `0x…` (32 bytes) | The CTF condition id; key for `/clob-markets/{id}` |
| `slug` | string | URL slug, e.g. `who-will-win-2028` |
| `question` | string | Natural-language question — primary user-facing string |
| `description` | string | Long-form |
| `outcomes` | `string[]` | Usually `["Yes","No"]` for binary; multi-outcome for some |
| `outcomePrices` | `string[]` | Last-trade prices, parallel to `outcomes` |
| `clobTokenIds` | `string[]` | **The token ids you trade on.** Index 0 = YES, index 1 = NO |
| `volume`, `liquidity` | string (USD) | Stringified decimals |
| `volumeNum`, `liquidityNum` | number | Numeric; use these for ranking |
| `volume24hr`, `volume1wk`, `volume1mo`, `volume1yr` | numbers | rolling windows |
| `endDate` | ISO timestamp | When the market closes for trading |
| `closed` | bool | Filter out true |
| `active` | bool | Should be true for tradable |
| `acceptingOrders` | bool | Even an active market can pause orders |
| `negRisk` | bool | If true, sign against the *neg-risk* exchange (see §4.3) |
| `marketType`, `formatType`, `ammType` | string | Mostly informational |

[concepts/markets-events](https://docs.polymarket.com/concepts/markets-events) —
"clobTokenIds (YES/NO tokens): 'ERC1155 token IDs used for trading on the
CLOB — one for Yes, one for No.'"

> **Gotcha — multi-outcome events.** A "market" in Gamma is *binary by
> design*. For a presidential-election-style event, each candidate is
> represented as its own binary market under one parent `Event`. Always rank
> per-market, not per-event, when looking for the most liquid bookable
> contract. ([concepts/markets-events](https://docs.polymarket.com/concepts/markets-events)
> — "Markets are the tradable units — each represents 'a single binary
> question with Yes/No outcomes.' Events are containers… 'multi-market events'
> enable 'mutually exclusive multi-outcome predictions.'")

### 3.4 Filter / sort to rank by liquidity

Querystring on `GET /markets`:

```
?closed=false
&active=true
&liquidity_num_min=1000              # de-noise: drop tiny markets
&order=liquidityNum                  # field to sort by
&ascending=false
&limit=20
```

(Parameter names per
[list-markets](https://docs.polymarket.com/api-reference/markets/list-markets):
`closed`, `active`, `liquidity_num_min`, `liquidity_num_max`, `volume_num_min`,
`volume_num_max`, `start_date_min/max`, `end_date_min/max`, `order`,
`ascending`, `limit`, `offset`.)

For events the equivalent params are unprefixed (`liquidity_min`,
`volume_min`) per [list-events](https://docs.polymarket.com/api-reference/events/list-events).

### 3.5 Worked example — match user prompt → best bookable market

Pseudocode:

```python
import requests
GAMMA = "https://gamma-api.polymarket.com"

def find_best_market(query: str):
    # Step 1: free-text search to get candidate events
    events = requests.get(f"{GAMMA}/public-search", params={
        "q": query,
        "limit_per_type": 20,
        "events_status": "active",
    }).json().get("events", [])

    # Step 2: flatten to markets, drop closed / non-orderbook
    markets = []
    for e in events:
        for m in e.get("markets", []):
            if m.get("closed") or not m.get("active"):
                continue
            if not m.get("acceptingOrders", True):
                continue
            if not m.get("clobTokenIds"):
                continue
            markets.append(m)

    # Step 3: rank by numeric liquidity
    markets.sort(key=lambda m: float(m.get("liquidityNum") or 0), reverse=True)

    if not markets:
        # Fallback: hit /markets directly with a sort by liquidityNum
        markets = requests.get(f"{GAMMA}/markets", params={
            "active": True, "closed": False,
            "order": "liquidityNum", "ascending": False, "limit": 20,
        }).json()
        # And then in-memory re-rank by string-similarity of m["question"] to query

    return markets[0] if markets else None
```

### 3.6 NEG_RISK markets — the gotcha

Negative-risk markets enable capital-efficient multi-outcome trading: a `No`
share in any sub-market is convertible into 1 `Yes` share in every *other*
sub-market via the **NegRiskAdapter** contract.[^neg-risk]

[^neg-risk]: <https://docs.polymarket.com/advanced/neg-risk> — "A No share in
any market can be converted into 1 Yes share in every other market… This
conversion happens through the Neg Risk Adapter contract."

When a Gamma market has `negRisk: true`:

- Its CTF token ids resolve to the **neg-risk CTF Exchange**, not the standard
  one.
- Orders must be **EIP-712 signed against `verifyingContract = 0xe2222d2…`**
  instead of `0xE111180…`. The domain `name` likewise becomes
  `"Polymarket Neg Risk CTF Exchange"`.
  ([cheatsheet](https://github.com/cengizmandros/polymarket-cheatsheet) —
  "NegRisk variant: Same structure with name 'Polymarket Neg Risk CTF
  Exchange' and different contract address.")
- The `POST /order` body should set `"negRisk": true` (or you must use the
  neg-risk-specific endpoint route the SDK chooses for you).
  ([advanced/neg-risk](https://docs.polymarket.com/advanced/neg-risk) — "You
  must include `negRisk: true` when 'placing orders on neg risk markets.'")
- pUSD allowance must be granted to the *neg-risk* exchange separately.

> **For the skill:** read `negRisk` off the matched Gamma market and propagate
> it through to (a) the EIP-712 domain choice and (b) the order POST body. We
> may need to grant a second `pUSD.approve` if the user has only ever traded
> standard markets.

---

## 4. CLOB API — orders + book

**Base URL:** `https://clob.polymarket.com`
([endpoints](https://docs.polymarket.com/quickstart/reference/endpoints)).
Staging is at `https://clob-staging.polymarket.com`.

### 4.1 Order book — `GET /book`

```
GET https://clob.polymarket.com/book?token_id=<clobTokenId>
```

Response ([get-order-book](https://docs.polymarket.com/api-reference/market-data/get-order-book)):

```json
{
  "market":          "0x1234…",                  // conditionId
  "asset_id":        "<clobTokenId>",
  "timestamp":       "1234567890",
  "hash":            "a1b2c3…",
  "bids":            [ {"price":"0.45","size":"100"}, … ],   // descending
  "asks":            [ {"price":"0.46","size":"150"}, … ],   // ascending
  "min_order_size":  "1",
  "tick_size":       "0.01",
  "neg_risk":        false,
  "last_trade_price":"0.45"
}
```

Note `tick_size` and `min_order_size` are returned right here — handy.

### 4.2 Price helpers

| Endpoint | Purpose |
| --- | --- |
| `GET /price?token_id=…&side=BUY\|SELL` | Best bid (BUY) or best ask (SELL). Single number response: `{"price": 0.45}`. ([get-market-price](https://docs.polymarket.com/api-reference/market-data/get-market-price)) |
| `GET /midpoint?token_id=…` | Midpoint of bid/ask. |
| `GET /spread?token_id=…` | ask − bid. |
| `GET /tick-size?token_id=…` | `{"minimum_tick_size": 0.01}` ([get-tick-size](https://docs.polymarket.com/api-reference/market-data/get-tick-size)). Allowed values: 0.1, 0.01, 0.001, 0.0001. |
| `GET /fee-rate?token_id=…` | `{"base_fee": 30}` (basis points) ([get-fee-rate](https://docs.polymarket.com/api-reference/market-data/get-fee-rate)). |
| `GET /clob-markets/{conditionId}` | One-shot bundle: tokens, tick size, fees, neg-risk status, rewards. ([get-clob-market-info](https://docs.polymarket.com/api-reference/markets/get-clob-market-info)) |

The bundled endpoint is best for our use: it returns
`{ t: [{t,o},…], mts, mos, mbf, tbf, fd, … }` so we can look up the YES/NO
token ids, tick size, min order size and fees in one call without scraping
Gamma.

### 4.3 EIP-712 Order struct (V2)

This is the most "easy to get wrong" thing. Every detail below is verbatim
from the on-chain V2 contract and the V2 SDKs.

**Domain — standard markets:**

```json
{
  "name":             "Polymarket CTF Exchange",
  "version":          "2",
  "chainId":          137,
  "verifyingContract":"0xE111180000d2663C0091e4f400237545B87B996B"
}
```

**Domain — neg-risk markets:**

```json
{
  "name":             "Polymarket Neg Risk CTF Exchange",
  "version":          "2",
  "chainId":          137,
  "verifyingContract":"0xe2222d279d744050d28e00520010520000310F59"
}
```

(Source: [v2-migration](https://docs.polymarket.com/v2-migration);
[cheatsheet](https://github.com/cengizmandros/polymarket-cheatsheet);
SDK [exchangeOrderBuilderV2.ts](https://github.com/Polymarket/clob-client-v2/blob/main/src/order-utils/exchangeOrderBuilderV2.ts) — "Name: 'Polymarket CTF Exchange', Version: '2'".)

**Order types — V2 signed struct (verbatim type-string, all 11 fields):**

```
Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)
```

(Source: [exchangeOrderBuilderV2.ts](https://github.com/Polymarket/clob-client-v2/blob/main/src/order-utils/exchangeOrderBuilderV2.ts) — quoted verbatim.)

In structured form:

```ts
const ORDER_TYPES = {
  Order: [
    { name: "salt",          type: "uint256" },
    { name: "maker",         type: "address" },
    { name: "signer",        type: "address" },
    { name: "tokenId",       type: "uint256" },
    { name: "makerAmount",   type: "uint256" },
    { name: "takerAmount",   type: "uint256" },
    { name: "side",          type: "uint8"   },
    { name: "signatureType", type: "uint8"   },
    { name: "timestamp",     type: "uint256" },
    { name: "metadata",      type: "bytes32" },
    { name: "builder",       type: "bytes32" },
  ],
};
```

> **V1 → V2 changes (do not re-introduce these fields in the signature!):**
> Removed from the signed struct: `taker`, `expiration`, `nonce`,
> `feeRateBps`. Added: `timestamp` (ms), `metadata`, `builder`.
> ([v2-migration](https://docs.polymarket.com/v2-migration) — "Removed fields:
> taker, expiration (from signed struct; still present in wire body for GTD
> handling), nonce, feeRateBps. Added fields: uint256 timestamp — order
> creation time in milliseconds, replaces nonce for uniqueness; bytes32
> metadata; bytes32 builder.")

**Field semantics:**

| Field | Source | Notes |
| --- | --- | --- |
| `salt` | random 256-bit | Unique per order; SDK uses crypto-random uint256 |
| `maker` | EOA address (type 0) | Funder |
| `signer` | EOA address (type 0) | Same as `maker` for type 0 |
| `tokenId` | from `clobTokenIds[YES_OR_NO]` | The ERC1155 outcome token to receive (BUY) or spend (SELL) |
| `makerAmount` | uint256, **6-decimal fixed-point** | Pre-fee. See §4.4 |
| `takerAmount` | uint256, 6-decimal | See §4.4 |
| `side` | 0 = BUY, 1 = SELL | Per `OrderStructs.sol` Side enum |
| `signatureType` | 0 / 1 / 2 | EOA / POLY_PROXY / POLY_GNOSIS_SAFE. We always use 0 for our skill |
| `timestamp` | `Date.now()` in ms, decimal string | Replaces V1 nonce; ensures uniqueness |
| `metadata` | bytes32 | App-defined; default `0x0000…0000` |
| `builder` | bytes32 | "Builder code" for attribution; default `0x0000…0000` |

(Source: [v2-migration](https://docs.polymarket.com/v2-migration);
[buildOrderCreationArgs.ts](https://github.com/Polymarket/clob-client-v2/blob/main/src/order-builder/helpers/buildOrderCreationArgs.ts) — "timestamp: Date.now().toString()".)

> Note: The V2 contract's `Side` enum on-chain may declare values; the SDKs and
> the Polymarket cheatsheet both list **BUY = 0, SELL = 1**
> ([cheatsheet](https://github.com/cengizmandros/polymarket-cheatsheet);
> py-order-utils — "`side == 0` converts to 'BUY', otherwise 'SELL' (implying
> SELL = 1)"). The wire format on `POST /order` accepts the **string** values
> `"BUY"` and `"SELL"` rather than 0/1.

### 4.4 BUY vs SELL — `makerAmount` / `takerAmount`

The protocol is symmetric: the *maker* is whoever signs the order; whatever
`makerAmount` they offer in *their* funding asset is exchanged for
`takerAmount` of the counter-asset. The mapping for binary-prediction trades
on Polymarket is:

- **BUY YES** = "I, holder of pUSD, want to buy `size` YES-tokens at `price`":
  - `tokenId` = the YES `clobTokenId`.
  - `side` = `BUY` (`0`).
  - `makerAmount` = pUSD I'm spending = `size * price` (in 6-dec units).
  - `takerAmount` = YES tokens I expect = `size` (in 6-dec units).
- **SELL YES** = "I, holder of YES tokens, want to sell `size` of them at `price`":
  - `tokenId` = the YES `clobTokenId`.
  - `side` = `SELL` (`1`).
  - `makerAmount` = YES tokens I'm spending = `size`.
  - `takerAmount` = pUSD I expect = `size * price`.

To **buy NO**, do the same as BUY YES but pass the *NO* `clobTokenId`.
To **sell NO**, same as SELL YES but with the NO token id.
There is no separate "side: NO". Polymarket's outcome token model (ERC1155
on the CTF) treats YES and NO as two independent ERC1155 ids; you just trade
the one you want.

(Source: [getOrderRawAmounts.ts](https://github.com/Polymarket/clob-client-v2/blob/main/src/order-builder/helpers/getOrderRawAmounts.ts):
*BUY: rawTakerAmt = round_down(size); rawMakerAmt = rawTakerAmt × rawPrice.*
*SELL: rawMakerAmt = round_down(size); rawTakerAmt = rawMakerAmt × rawPrice.*)

#### Worked example — "$100 of YES at price 0.05"

`size` here is the **number of YES tokens** the user receives, NOT the dollar
amount. The dollar amount the user spends is `size × price`. So $100 ÷ 0.05 =
**2 000 tokens**.

```js
// Inputs:
// price       = 0.05   (USD per YES token)
// usdToSpend  = 100    (USD)
// size_tokens = 100 / 0.05 = 2000

const order = {
  salt:          randomUint256(),
  maker:         eoaAddress,
  signer:        eoaAddress,
  tokenId:       yesClobTokenId,                     // from clobTokenIds[0]
  makerAmount:   "100000000",                        //   100 USD * 1e6 = 100_000_000
  takerAmount:   "2000000000",                       // 2 000 tokens * 1e6 = 2_000_000_000
  side:          0,                                  // BUY
  signatureType: 0,                                  // EOA
  timestamp:     String(Date.now()),                 // ms
  metadata:      "0x" + "00".repeat(32),
  builder:       "0x" + "00".repeat(32),
};
```

> **Common pitfall.** The SDK's `OrderArgs.size` field is **tokens, not
> dollars**. We MUST translate the user's "bet $100" intent into
> `size = usd / price` in our agent code, before handing off to the SDK or
> manual signer. The SDK's market-order helper (`createAndPostMarketOrder`)
> takes `amount` in *USD* for BUY and *tokens* for SELL — but the limit-order
> helper (`createAndPostOrder`) takes `size` in *tokens* in both directions.
> Read the SDK source carefully if mixing the two.

(Confirmation: [order-create](https://docs.polymarket.com/trading/orders/create)
— "size: 2000, // \$100 ÷ \$0.05 = 2,000 shares".)

### 4.5 `POST /order` wire shape

```
POST https://clob.polymarket.com/order
Headers: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_API_KEY, POLY_PASSPHRASE
Content-Type: application/json
```

Body ([post-a-new-order](https://docs.polymarket.com/api-reference/trade/post-a-new-order)):

```json
{
  "order": {
    "salt":          12345,
    "maker":         "0x…",
    "signer":        "0x…",
    "tokenId":       "12345…",                                      // string
    "makerAmount":   "100000000",
    "takerAmount":   "2000000000",
    "side":          "BUY",                                         // string "BUY"|"SELL"
    "signatureType": 0,
    "timestamp":     "1714400000000",                               // ms, signed
    "expiration":    "1714403600",                                  // s, wire-only (NOT signed)
    "metadata":      "0x0000…0000",
    "builder":       "0x0000…0000",
    "signature":     "0x…65 bytes EIP-712 sig over the V2 Order"
  },
  "owner":     "<api-key UUID>",
  "orderType": "GTC",                                              // GTC | GTD | FOK | FAK
  "deferExec": false
}
```

Response on success:

```json
{
  "success":           true,
  "orderID":           "0x…",                  // order hash
  "status":            "live" | "matched" | "delayed",
  "makingAmount":      "100000000",
  "takingAmount":      "2000000000",
  "transactionsHashes": ["0x…", …],            // present when status=matched
  "tradeIDs":          ["…", …],
  "errorMsg":          ""
}
```

Status `live` = resting on the book; `matched` = fully or partially filled
already; `delayed` = held by the matcher's risk checks.

### 4.6 Order types

([orders/overview](https://docs.polymarket.com/trading/orders/overview)):

| `orderType` | Behaviour |
| --- | --- |
| `GTC` | Good-til-cancelled — rests on the book |
| `GTD` | Good-til-date — needs `expiration` (unix seconds) on the wire body (NOT in the signed struct) |
| `FOK` | Fill-or-kill — must fully fill at submit, else cancel |
| `FAK` | Fill-and-kill — fill what you can, kill the remainder (a.k.a. IOC) |

Plus the boolean `postOnly` flag rejects the order if it would cross the book.

### 4.7 Tick size and min order size — discovery

Per-market values; query at runtime:

- `GET /clob-markets/{conditionId}` returns `mts` (min tick size) and `mos`
  (min order size) inline. Prefer this over the per-token endpoints.
- Else `GET /tick-size?token_id=…` and look at `min_order_size` on the
  `/book` response.

Allowed tick-size values are `0.1`, `0.01`, `0.001`, `0.0001`
([orders/overview](https://docs.polymarket.com/trading/orders/overview) —
"Tick sizes define minimum price increments: 0.1, 0.01, 0.001, or 0.0001.
Your order price must conform to the market's tick size, or the order will be
rejected."). Min order size on most markets is 5 tokens or so (the doc shows
`5` as the example value).

### 4.8 Fees

V2 fee curve:

```
fee_pUSD = C × feeRate × p × (1 − p)
```

Where `C` is shares traded, `p` is execution price, `feeRate` is a per-market
parameter exposed via `GET /fee-rate` or `mbf`/`tbf` on `/clob-markets/{id}`.
**Makers pay no fees; only takers.**
([fees](https://docs.polymarket.com/trading/fees) — "Makers are never charged
fees. Only takers pay fees.")

Default taker fee rates by category:

```
Crypto                                        7%
Sports                                        3%
Finance / Politics / Tech / Mentions          4%
Economics / Culture / Weather / Other         5%
Geopolitics                                   0% (fee-free)
```

Fees are applied automatically at match time by the protocol — **we do NOT
include fees in the signed order** ([fees](https://docs.polymarket.com/trading/fees)
— "Fees are calculated in USDC at match time — you don't need to include them
in orders").

> **For the skill:** when the user says "bet $100", we should warn that the
> realised cost may be slightly more than $100 due to slippage but not due to
> fees (fees come out of the pUSD they hand over, so they get fewer tokens —
> doesn't increase their spend).

---

## 5. Existing client libraries

### 5.1 Repo map (verified May 2026)

| Lang | Package / repo | Latest release seen | Notes |
| --- | --- | --- | --- |
| Python | [`Polymarket/py-clob-client-v2`](https://github.com/Polymarket/py-clob-client-v2) | `1.0.1rc1` | The V2 client. Use this. |
| TypeScript | [`Polymarket/clob-client-v2`](https://github.com/Polymarket/clob-client-v2) | tracks main; `@polymarket/clob-client-v2` on npm | The V2 client. Use this. |
| Rust | [`Polymarket/rs-clob-client-v2`](https://github.com/Polymarket/rs-clob-client-v2) | crates.io: `polymarket_client_sdk_v2` | The V2 client. |
| Python (V1, deprecated) | [`Polymarket/py-clob-client`](https://github.com/Polymarket/py-clob-client) | `0.34.6` Feb 2026 | **Do not use against production.** No V2 protocol support shipped. |
| TypeScript (V1, deprecated) | [`Polymarket/clob-client`](https://github.com/Polymarket/clob-client) | `5.8.2` Apr 14 2026 | Last tagged release pre-cutover; no V2 support. |
| Order utils (Python, V1) | [`Polymarket/python-order-utils`](https://github.com/Polymarket/python-order-utils) | low-level EIP-712 helpers | Usable for V1-style structs only. |

(Sources for the V1 status: [v2-migration](https://docs.polymarket.com/v2-migration)
— "Legacy V1 SDKs and V1-signed orders are no longer supported on production.
There is no backward compatibility — integrators must upgrade before
production deployment.")

### 5.2 Where ground truth for our skill lives

For an EOA-only signer the cleanest reference paths are:

- **HMAC** — [`py-clob-client-v2/signing/hmac.py`](https://github.com/Polymarket/py-clob-client-v2/blob/main/py_clob_client_v2/signing/hmac.py)
  (and the TS twin at `clob-client-v2/src/signing/hmac.ts`).
- **L1 EIP-712** — [`py-clob-client-v2/signing/eip712.py`](https://github.com/Polymarket/py-clob-client-v2/blob/main/py_clob_client_v2/signing/eip712.py)
  / `clob-client-v2/src/signing/eip712.ts`.
- **V2 Order EIP-712 + amount math** — `clob-client-v2/src/order-utils/exchangeOrderBuilderV2.ts`
  and `clob-client-v2/src/order-builder/helpers/{getOrderRawAmounts,buildOrderCreationArgs,createOrder}.ts`.

### 5.3 Recommendation: wrap, don't reimplement

We are an **agent skill running in TypeScript** (the rest of `Bread-Aurora` is
TS/RN). The pragmatic choice is to wrap **`@polymarket/clob-client-v2`** with
a viem `WalletClient` over a mnemonic-derived account. That lets us avoid
reimplementing the V2 EIP-712 typed data, the salt/timestamp logic, the rounding
config, and the HMAC signer — each of which has documented sharp edges. We
only need to (a) construct the `walletClient` from the mnemonic, (b) ensure
pUSD allowance to the right exchange, (c) call
`createAndPostOrder({tokenID, price, size, side}, {tickSize, negRisk}, OrderType.GTC)`,
and (d) surface errors.

> **One-sentence reason:** the SDK encodes too much load-bearing detail
> (signed-vs-wire field separation, neg-risk domain switching, V2 field set,
> rounding under each tick size) for hand-rolled wire code to be a sensible
> first deliverable.

---

## 6. Open questions / risks

These should be resolved with the user before we write code.

1. **Signature type for an "external wallet" the user previously used on
   polymarket.com.** If the user has *ever* logged into polymarket.com with
   the same EOA (e.g. via WalletConnect on a wallet derived from this
   mnemonic), Polymarket auto-deployed a Gnosis Safe (`signatureType=2`) and
   their pUSD lives in the Safe, not the EOA. Type-0 orders signed from our
   skill will appear to have a $0 balance. Need to ask:
   - Should we *detect* an existing Safe (via the proxy factory) and refuse?
   - Or fall through to type-2 mode, which requires the much hairier
     1271/Safe signing flow?

2. **pUSD vs USDC.e wrapping UX.** Most consumer USDC bridges still produce
   USDC.e on Polygon. If the EOA has only USDC.e, we must wrap to pUSD via
   `CollateralOnramp.wrap()`. Is the skill allowed to perform on-chain TX
   beyond the order itself (allowance approves, wrap, possibly unwrap on
   withdraw), or do we want to limit the agent strictly to off-chain CLOB
   actions? The latter forces the user to wrap manually first.

3. **Native USDC vs USDC.e.** The Polygon ecosystem now has *three* USDC
   contracts: native `USDC` (Circle, `0x3c499c…`), bridged `USDC.e`
   (`0x2791…`), and `pUSD`. The official docs only mention USDC.e and pUSD.
   The `CollateralOnramp.wrap()` doc text says it accepts "USDC.e as input".
   Need to confirm whether native Circle USDC also works as `wrap` input
   today, or only USDC.e.

4. **Allowance amounts.** Should we approve `MAX_UINT256` (clean UX, broader
   risk surface) or "exact-spend" amounts per order (more transactions, higher
   gas, but tighter attack surface)? Bread's threat model so far has favored
   max approvals for stablecoins.

5. **Nonce/timestamp uniqueness under burst.** V2 uses `timestamp` (ms) as
   uniqueness. If the user fires two orders <1ms apart, do we collide? In
   practice the SDK monotonically increments, but for our skill (single user,
   single confirmation per bet) this is unlikely to matter.

6. **Geo-blocking.** The CLOB has geo-block enforcement at `POST /order`
   ([api-reference/geoblock](https://docs.polymarket.com/api-reference/geoblock.md)).
   US users are blocked. Bread should respect this (and we may need to fail
   gracefully).

7. **"YES" vs "NO" inference from natural language.** Polymarket markets are
   phrased "Will X happen?". The user saying "bet $50 on Trump 2028" likely
   maps to YES of the "Will Trump win 2028?" market — but consider edge cases
   like "bet $50 *against* X" → NO. We need an explicit confirmation step
   (which we have) that surfaces both the matched question text *and* the
   chosen outcome (`YES`/`NO` plus implied direction in plain English) before
   signing.

8. **Slippage / market order vs limit order.** A bare "bet $X" with no price
   reference is a market order. Polymarket implements market orders as
   `FOK`/`FAK` over the limit book at a marketable price. We need a max-slippage
   guard (e.g. cap at 5% above mid) so a thinly-traded market doesn't fill
   the user at $0.99 when mid is $0.20. The SDK supports
   `createAndPostMarketOrder` but the price discipline is on us.

9. **Builder attribution / `builderCode`.** We *could* register Bread as a
   builder and embed our `bytes32 builderCode` into every order, which would
   surface volume in Polymarket's builder analytics and (if applicable)
   provide builder rebates. This is post-MVP but cheap to support: just plumb
   a `builderCode` constant through the order construction.

10. **V2 contract churn.** V2 went live April 28, 2026, less than two weeks
    before this writing. If Polymarket pushes a hot-fix that changes type
    encodings, our skill's hard-coded EIP-712 type-strings will break
    silently. Wrapping the SDK (§5.3) is our best defence — we get fixes for
    free on `npm update`.

---

## Appendix A — End-to-end happy-path the skill should implement

```
User: "bet $100 on Trump winning 2028 on Polymarket"

1. Recover EOA from BIP-39 mnemonic.                                         [no IO]
2. Gamma:    GET /public-search?q="Trump winning 2028"
             → choose event with active sub-markets
3. Gamma:    rank candidate sub-markets by liquidityNum
             → pick "Will Donald Trump win the 2028 presidential election?" (binary)
4. CLOB:     GET /clob-markets/{conditionId}
             → get YES tokenId, tick size, fee, neg_risk flag
5. CLOB:     GET /price?token_id=YES&side=BUY                               [for confirmation UI]
6. CLOB:     GET /book?token_id=YES                                         [for slippage check]
7. UI:       Show user → "Buy $100 worth of YES at ~$0.34 (slip ≤ 5%)?"
8. CLOB:     GET /auth/derive-api-key      (with L1 headers)                 [first time only]
9. On-chain: pUSD.approve(ctfExchange, MAX_UINT256)                          [first time only]
10. Build V2 Order: {salt, maker=eoa, signer=eoa, tokenId=YES,
                     makerAmount=100*1e6, takerAmount=size*1e6,
                     side=0, signatureType=0, timestamp=Date.now(),
                     metadata=0x0…0, builder=BREAD_BUILDER_CODE}
11. EIP-712 sign Order against verifyingContract = (negRisk ? 0xe2222… : 0xE111…)
12. CLOB:     POST /order with L2 headers and the signed Order body
13. Response handling: live | matched | delayed; surface tx hashes if any
14. Optional: poll GET /orders or GET /trades for fill status
```

## Appendix B — Quick-reference tables

### B.1 Headers cheatsheet

| Header | Where set | Value |
| --- | --- | --- |
| `POLY_ADDRESS` | L1 + L2 | EOA address (lowercased or checksum, both accepted) |
| `POLY_SIGNATURE` | L1 | EIP-712 sig over `ClobAuth` |
| `POLY_SIGNATURE` | L2 | URL-safe base64 HMAC over `ts + method + path + body` |
| `POLY_TIMESTAMP` | L1 + L2 | Unix seconds, decimal string. **Must equal** the timestamp signed in the L1 struct |
| `POLY_NONCE` | L1 only | Decimal string, default `"0"`. Must equal nonce signed in struct |
| `POLY_API_KEY` | L2 | UUID from `/auth/derive-api-key` |
| `POLY_PASSPHRASE` | L2 | Plaintext passphrase from `/auth/derive-api-key` |

### B.2 V2 Order field defaults for our skill (signatureType=0)

| Field | Default value |
| --- | --- |
| `salt` | `randomUint256()` |
| `maker` | EOA address (mnemonic-derived) |
| `signer` | same EOA address |
| `tokenId` | from `clobTokenIds[0]` (YES) or `[1]` (NO) |
| `makerAmount` | per §4.4 |
| `takerAmount` | per §4.4 |
| `side` | `0` (BUY) or `1` (SELL); wire = `"BUY"`/`"SELL"` |
| `signatureType` | `0` |
| `timestamp` | `String(Date.now())` (ms) |
| `metadata` | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| `builder` | Bread's bytes32 builder code if registered, else zero |

### B.3 Domain selection by market

```ts
const domain = market.negRisk
  ? {
      name:    "Polymarket Neg Risk CTF Exchange",
      version: "2",
      chainId: 137,
      verifyingContract: "0xe2222d279d744050d28e00520010520000310F59",
    }
  : {
      name:    "Polymarket CTF Exchange",
      version: "2",
      chainId: 137,
      verifyingContract: "0xE111180000d2663C0091e4f400237545B87B996B",
    };
```

### B.4 Useful sanity-check calls (no auth)

```bash
# Server time — sanity-check our clock
curl https://clob.polymarket.com/time

# Find market by slug (Gamma)
curl 'https://gamma-api.polymarket.com/markets/slug/will-trump-win-2028'

# Get the YES/NO token ids and tick size
curl 'https://clob.polymarket.com/clob-markets/0x<conditionId>'

# Order book
curl 'https://clob.polymarket.com/book?token_id=<yes-clob-token-id>'

# Quoted ask price for buying YES
curl 'https://clob.polymarket.com/price?token_id=<yes-clob-token-id>&side=BUY'
```

---

*Last reviewed: May 2026. Re-verify the V2 contract addresses and EIP-712
type-string against the SDK on each release update — Polymarket has stated V2
is the long-term target but the spec is <2 weeks old at the time of writing.*
