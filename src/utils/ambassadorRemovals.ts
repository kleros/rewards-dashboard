export interface AmbassadorRequest {
  requestType: string; // RegistrationRequested | ClearingRequested
  disputed: boolean;
  resolved: boolean;
  disputeOutcome: string; // None | Accept | Reject
  submissionTime: string;
  requester: string;
}

// A wallet that successfully removed accepted entries.
export interface AmbassadorRemover {
  wallet: string;
  removals: number;
}

interface SeasonWindow {
  seasonStart?: number;
  seasonEnd?: number;
}

interface RemovalProfile extends SeasonWindow {
  lists: readonly { address: string }[];
}

interface ItemHistory {
  registryAddress: string;
  requests: readonly AmbassadorRequest[];
}

export function inAmbassadorSeason(submittedAt: number, profile: SeasonWindow): boolean {
  if (profile.seasonStart !== undefined && submittedAt < profile.seasonStart) return false;
  if (profile.seasonEnd !== undefined && submittedAt >= profile.seasonEnd) return false;
  return true;
}

export function isSuccessfulRemoval(request: AmbassadorRequest): boolean {
  return (
    request.requestType === "ClearingRequested" &&
    request.resolved &&
    (!request.disputed || request.disputeOutcome === "Accept")
  );
}

// Removal credit belongs to completed requests, not the item's current status.
// Re-registering an item must not erase a previous remover's contribution. A
// removal qualifies for the season of the registration it actually removed,
// including removals that completed after that season ended.
export function collectAmbassadorRemovers(
  items: readonly ItemHistory[],
  profile: RemovalProfile
): AmbassadorRemover[] {
  const registries = new Set(profile.lists.map((list) => list.address.toLowerCase()).filter(Boolean));
  const byWallet = new Map<string, number>();

  for (const item of items) {
    if (!registries.has(item.registryAddress.toLowerCase())) continue;
    const requests = [...item.requests].sort((a, b) => Number(a.submissionTime) - Number(b.submissionTime));
    let registration: AmbassadorRequest | undefined;
    for (const request of requests) {
      if (request.requestType === "RegistrationRequested") {
        registration = request;
        continue;
      }
      if (
        !registration ||
        !isSuccessfulRemoval(request) ||
        !inAmbassadorSeason(Number(registration.submissionTime), profile)
      ) continue;
      const wallet = request.requester.toLowerCase();
      byWallet.set(wallet, (byWallet.get(wallet) ?? 0) + 1);
    }
  }

  return [...byWallet].map(([wallet, removals]) => ({ wallet, removals }));
}
