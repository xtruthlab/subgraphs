import { Collateral } from "../../../generated/schema";
import { Address } from "@graphprotocol/graph-ts";
import { DEFAULT_DECIMALS } from "../decimals";

// Hardcoded metadata for known X Layer testnet bond currencies.
//
// We deliberately do NOT eth_call ERC20.decimals/name/symbol here. graph-node
// must make that call at the *historical* block of the whitelist event; if the
// configured RPC can't serve historical state (non-archive) the call errors
// (not reverts) and graph-node backoff-loops forever, stalling the WHOLE
// subgraph — even though the call is `try_`-wrapped. The oov3 subgraph never
// stalls precisely because it makes no eth_calls. Keeping this handler pure
// (event-only) lets votingV2 index without an archive RPC. Add new tokens
// to `knownToken` as they're whitelisted.
class TokenMeta {
  decimals: i32;
  name: string;
  symbol: string;
  constructor(d: i32, n: string, s: string) {
    this.decimals = d;
    this.name = n;
    this.symbol = s;
  }
}

function knownToken(addr: string): TokenMeta | null {
  let a = addr.toLowerCase();
  // WOKB (wrapped native OKB, Optimism-style predeploy)
  if (a == "0x4200000000000000000000000000000000000006") return new TokenMeta(18, "Wrapped OKB", "WOKB");
  // USDC_TEST
  if (a == "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d") return new TokenMeta(6, "USDC (test)", "USDC_TEST");
  return null;
}

export function getOrCreateCollateral(tokenAddress: Address, setOnWhitelist: boolean = false): Collateral {
  let addressString = tokenAddress.toHexString();

  let token = Collateral.load(addressString);

  if (token == null) {
    token = new Collateral(addressString);

    let meta = knownToken(addressString);
    if (meta != null) {
      token.decimals = meta.decimals;
      token.name = meta.name;
      token.symbol = meta.symbol;
    } else {
      // Unknown token: fall back to defaults rather than eth_call (see above).
      token.decimals = DEFAULT_DECIMALS;
      token.name = "";
      token.symbol = "";
    }
    token.isOnWhitelist = false;

    if (setOnWhitelist) {
      token.isOnWhitelist = true;
    }

    token.save();
  }

  if (setOnWhitelist && !token.isOnWhitelist) {
    token.isOnWhitelist = true;
    token.save();
  }

  return token as Collateral;
}
