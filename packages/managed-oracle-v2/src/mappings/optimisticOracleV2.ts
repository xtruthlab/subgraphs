import {
  DisputePrice,
  ProposePrice,
  RequestPrice,
  SetBondCall,
  SetCustomLivenessCall,
  SetEventBasedCall,
  Settle,
} from "../../generated/ManagedOracleV2/ManagedOracleV2";
import { createOptimisticPriceRequestId, getManagedRequestId, getOrCreateOptimisticPriceRequest } from "../utils/helpers";
import { CustomBond, CustomLiveness } from "../../generated/schema";

import { Address, Bytes, log } from "@graphprotocol/graph-ts";
import { createCustomBondId } from "../utils/helpers/managedOracleV2";

/**
 * Retrieves a custom bond entity if one exists for the given parameters.
 *
 * IMPORTANT: Custom bonds are stored with a unique ID that includes the currency.
 * This means we can only find custom bonds that match the EXACT currency used in the request.
 * If a custom bond was set for a different currency, it will NOT be found here.
 *
 * This ensures that custom bonds are only applied when the currency matches,
 * preventing incorrect bond amounts from being applied to requests with different currencies.
 */
function getCustomBond(
  requester: Address,
  identifier: Bytes,
  ancillaryData: Bytes,
  currency: Bytes
): CustomBond | null {
  const id = createCustomBondId(requester, identifier, ancillaryData, currency);
  let customBondEntity = CustomBond.load(id);
  return customBondEntity ? customBondEntity : null;
}

function getCustomLiveness(requester: Address, identifier: Bytes, ancillaryData: Bytes): CustomLiveness | null {
  const managedRequestId = getManagedRequestId(requester, identifier, ancillaryData).toHexString();
  let customLivenessEntity = CustomLiveness.load(managedRequestId);
  return customLivenessEntity ? customLivenessEntity : null;
}

// NOTE: This subgraph is EVENT-ONLY. The X Layer RPC rejects historical
// eth_call with `{"code":-32000,"message":"not supported"}` (no archive
// state), and graph-node executes every mapping contract call against the
// block being indexed. Any `.bind(...).getX()` / `try_getX()` therefore fails
// (it's an RPC transport error, NOT a revert, so `try_` does NOT save you) and
// freezes the subgraph at the first event's block. So we derive request state
// from the event semantics and never call getState()/getRequest().

// - event: RequestPrice(indexed address,bytes32,uint256,bytes,address,uint256,uint256)
//   handler: handleOptimisticRequestPrice
// - event RequestPrice(
//     address indexed requester,
//     bytes32 identifier,
//     uint256 timestamp,
//     bytes ancillaryData,
//     address currency,
//     uint256 reward,
//     uint256 finalFee
//   );

export function handleOptimisticRequestPrice(event: RequestPrice): void {
  log.warning(`(ancillary) OOV2 PriceRequest params: {},{},{}`, [
    event.params.timestamp.toString(),
    event.params.identifier.toString(),
    event.params.ancillaryData.toHex(),
  ]);
  let requestId = createOptimisticPriceRequestId(
    event.params.identifier,
    event.params.timestamp,
    event.params.ancillaryData
  );

  let request = getOrCreateOptimisticPriceRequest(requestId);

  request.identifier = event.params.identifier.toString();
  request.time = event.params.timestamp;
  request.ancillaryData = event.params.ancillaryData.toHex();
  request.requester = event.params.requester;
  request.currency = event.params.currency;
  request.reward = event.params.reward;
  request.finalFee = event.params.finalFee;
  request.requestTimestamp = event.block.timestamp;
  request.requestBlockNumber = event.block.number;
  request.requestLogIndex = event.logIndex;
  request.requestHash = event.transaction.hash;

  // Event-only (see note on the removed getState helper). At request time the
  // contract sets bond = finalFee, so use the event's finalFee as the default
  // proposer/disputer bond. A manager custom bond/liveness (looked up from
  // indexed CustomBondSet/CustomLivenessSet events below) overrides this.
  request.state = "Requested";
  request.bond = event.params.finalFee;
  request.eventBased = false;

  // Look up custom bond and liveness values that may have been set before the request
  // Custom bonds are stored with a unique ID that includes the currency, so we only find
  // custom bonds that match the exact currency used in this request
  let customBond = getCustomBond(
    event.params.requester,
    event.params.identifier,
    event.params.ancillaryData,
    event.params.currency
  );
  if (customBond !== null) {
    const bond = customBond.customBond;
    const currency = customBond.currency;
    log.debug("custom bond of {} of currency {} was set for request Id: {}", [
      bond.toString(),
      currency.toHexString(),
      requestId,
    ]);
    // Apply the custom bond amount - the currency is guaranteed to match since
    // the custom bond ID includes the currency and we looked it up using the request's currency
    request.bond = bond;
  }

  let customLiveness = getCustomLiveness(event.params.requester, event.params.identifier, event.params.ancillaryData);
  if (customLiveness !== null) {
    const liveness = customLiveness.customLiveness;
    log.debug("custom liveness of {} was set for request Id: {}", [liveness.toString(), requestId]);
    request.customLiveness = customLiveness.customLiveness;
  }

  request.save();
}

// - event: ProposePrice(indexed address,indexed address,bytes32,uint256,bytes,int256,uint256,address)
//   handler: handleOptimisticProposePrice
// - event ProposePrice(
//     address indexed requester,
//     address indexed proposer,
//     bytes32 identifier,
//     uint256 timestamp,
//     bytes ancillaryData,
//     int256 proposedPrice,
//     uint256 expirationTimestamp,
//     address currency
// );

export function handleOptimisticProposePrice(event: ProposePrice): void {
  log.warning(`(ancillary) OOV2 PriceProposed params: {},{},{}`, [
    event.params.timestamp.toString(),
    event.params.identifier.toString(),
    event.params.ancillaryData.toHex(),
  ]);
  let requestId = createOptimisticPriceRequestId(
    event.params.identifier,
    event.params.timestamp,
    event.params.ancillaryData
  );

  let request = getOrCreateOptimisticPriceRequest(requestId);

  request.proposer = event.params.proposer;
  request.proposedPrice = event.params.proposedPrice;
  request.proposalExpirationTimestamp = event.params.expirationTimestamp;

  request.proposalTimestamp = event.block.timestamp;
  request.proposalBlockNumber = event.block.number;
  request.proposalLogIndex = event.logIndex;
  request.proposalHash = event.transaction.hash;

  request.state = "Proposed"; // event-only

  // Look up custom bond and liveness values that may have been set before the request
  // Custom bonds are stored with a unique ID that includes the currency, so we only find
  // custom bonds that match the exact currency used in this request
  let customBond = getCustomBond(
    event.params.requester,
    event.params.identifier,
    event.params.ancillaryData,
    event.params.currency
  );
  if (customBond !== null) {
    const bond = customBond.customBond;
    const currency = customBond.currency;
    log.debug("custom bond of {} of currency {} was set for request Id: {}", [
      bond.toString(),
      currency.toHexString(),
      requestId,
    ]);
    // Apply the custom bond amount - the currency is guaranteed to match since
    // the custom bond ID includes the currency and we looked it up using the request's currency
    request.bond = bond;
  }

  let customLiveness = getCustomLiveness(event.params.requester, event.params.identifier, event.params.ancillaryData);
  if (customLiveness !== null) {
    const liveness = customLiveness.customLiveness;
    log.debug("custom liveness of {} was set for request Id: {}", [liveness.toString(), requestId]);
    request.customLiveness = customLiveness.customLiveness;
  }

  request.save();
}

// - event: DisputePrice(indexed address,indexed address,indexed address,bytes32,uint256,bytes,int256)
//   handler: handleOptimisticDisputePrice
// - event DisputePrice(
//     address indexed requester,
//     address indexed proposer,
//     address indexed disputer,
//     bytes32 identifier,
//     uint256 timestamp,
//     bytes ancillaryData,
//     int256 proposedPrice
//   );

export function handleOptimisticDisputePrice(event: DisputePrice): void {
  log.warning(`(ancillary) OOV2 PriceDisputed params: {},{},{}`, [
    event.params.timestamp.toString(),
    event.params.identifier.toString(),
    event.params.ancillaryData.toHex(),
  ]);
  let requestId = createOptimisticPriceRequestId(
    event.params.identifier,
    event.params.timestamp,
    event.params.ancillaryData
  );

  let request = getOrCreateOptimisticPriceRequest(requestId);

  request.disputer = event.params.disputer;

  request.disputeTimestamp = event.block.timestamp;
  request.disputeBlockNumber = event.block.number;
  request.disputeLogIndex = event.logIndex;
  request.disputeHash = event.transaction.hash;

  request.state = "Disputed"; // event-only

  request.save();
}

// - event: Settle(indexed address,indexed address,indexed address,bytes32,uint256,bytes,int256,uint256)
//   handler: handleOptimisticSettle
//  - event Settle(
//     address indexed requester,
//     address indexed proposer,
//     address indexed disputer,
//     bytes32 identifier,
//     uint256 timestamp,
//     bytes ancillaryData,
//     int256 price,
//     uint256 payout
// );

export function handleOptimisticSettle(event: Settle): void {
  log.warning(`(ancillary) OOV2 Settled params: {},{},{}`, [
    event.params.timestamp.toString(),
    event.params.identifier.toString(),
    event.params.ancillaryData.toHex(),
  ]);
  let requestId = createOptimisticPriceRequestId(
    event.params.identifier,
    event.params.timestamp,
    event.params.ancillaryData
  );

  let request = getOrCreateOptimisticPriceRequest(requestId);

  request.settlementPrice = event.params.price;
  request.settlementPayout = event.params.payout;

  if (!request.disputer || request.proposedPrice!.equals(event.params.price)) {
    request.settlementRecipient = request.proposer;
  } else {
    request.settlementRecipient = request.disputer;
  }

  request.settlementTimestamp = event.block.timestamp;
  request.settlementBlockNumber = event.block.number;
  request.settlementLogIndex = event.logIndex;
  request.settlementHash = event.transaction.hash;

  request.state = "Settled"; // event-only

  request.save();
}

export function handleSetCustomLiveness(call: SetCustomLivenessCall): void {
  log.warning(`OOV2 set custom liveness inputs: {},{},{},{}`, [
    call.inputs.timestamp.toString(),
    call.inputs.identifier.toString(),
    call.inputs.ancillaryData.toHex(),
    call.inputs.customLiveness.toString(),
  ]);
  let requestId = createOptimisticPriceRequestId(
    call.inputs.identifier,
    call.inputs.timestamp,
    call.inputs.ancillaryData
  );

  let request = getOrCreateOptimisticPriceRequest(requestId);
  request.customLiveness = call.inputs.customLiveness;

  request.save();
}

export function handleSetBond(call: SetBondCall): void {
  log.warning(`OOV2 set bond inputs: {},{},{},{}`, [
    call.inputs.timestamp.toString(),
    call.inputs.identifier.toString(),
    call.inputs.ancillaryData.toHex(),
    call.inputs.bond.toString(),
  ]);
  let requestId = createOptimisticPriceRequestId(
    call.inputs.identifier,
    call.inputs.timestamp,
    call.inputs.ancillaryData
  );

  let request = getOrCreateOptimisticPriceRequest(requestId);
  request.bond = call.inputs.bond;

  request.save();
}

export function handleSetEventBased(call: SetEventBasedCall): void {
  log.warning(`OOV2 set event based inputs: {},{},{}`, [
    call.inputs.timestamp.toString(),
    call.inputs.identifier.toString(),
    call.inputs.ancillaryData.toHex(),
  ]);
  let requestId = createOptimisticPriceRequestId(
    call.inputs.identifier,
    call.inputs.timestamp,
    call.inputs.ancillaryData
  );

  let request = getOrCreateOptimisticPriceRequest(requestId);
  request.eventBased = true;

  request.save();
}
