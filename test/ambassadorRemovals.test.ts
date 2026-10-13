import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAmbassadorRemovers,
  type AmbassadorRequest,
} from "../src/utils/ambassadorRemovals.ts";

const profile = {
  lists: [{ address: "0xregistry" }],
  seasonStart: 100,
  seasonEnd: 200,
};

const request = (
  requestType: AmbassadorRequest["requestType"],
  submissionTime: number,
  requester: string,
  overrides: Partial<AmbassadorRequest> = {}
): AmbassadorRequest => ({
  requestType,
  submissionTime: String(submissionTime),
  requester,
  disputed: false,
  resolved: true,
  disputeOutcome: "None",
  ...overrides,
});

const registration = (time: number, overrides: Partial<AmbassadorRequest> = {}) =>
  request("RegistrationRequested", time, "0xagent", overrides);
const removal = (time: number, wallet = "0xremover", overrides: Partial<AmbassadorRequest> = {}) =>
  request("ClearingRequested", time, wallet, overrides);
const item = (...requests: AmbassadorRequest[]) => ({ registryAddress: "0xregistry", requests });

test("preserves removal credit after pending, rejected, or successful re-registration", () => {
  for (const laterRegistration of [
    registration(130, { resolved: false }),
    registration(130, { disputed: true, disputeOutcome: "Reject" }),
    registration(130),
  ]) {
    assert.deepEqual(
      collectAmbassadorRemovers([item(registration(110), removal(120), laterRegistration)], profile),
      [{ wallet: "0xremover", removals: 1 }]
    );
  }
});

test("credits resolved uncontested and accepted disputed removals only", () => {
  const histories = [
    item(registration(110), removal(120, "0xuncontested")),
    item(registration(110), removal(120, "0xwinner", { disputed: true, disputeOutcome: "Accept" })),
    item(registration(110), removal(120, "0xpending", { resolved: false })),
    item(registration(110), removal(120, "0xdisputed", { resolved: false, disputed: true })),
    item(registration(110), removal(120, "0xloser", { disputed: true, disputeOutcome: "Reject" })),
    item(registration(110), removal(120, "0xnobody", { disputed: true, disputeOutcome: "None" })),
    item(registration(110, { disputed: true, disputeOutcome: "Accept" })),
  ];

  assert.deepEqual(collectAmbassadorRemovers(histories, profile), [
    { wallet: "0xuncontested", removals: 1 },
    { wallet: "0xwinner", removals: 1 },
  ]);
});

test("retains all successful removers when a later removal fails", () => {
  const history = item(
    registration(105),
    removal(110, "0xfirst"),
    registration(120),
    removal(130, "0xsecond"),
    registration(140),
    removal(150, "0xloser", { disputed: true, disputeOutcome: "Reject" })
  );

  assert.deepEqual(collectAmbassadorRemovers([history], profile), [
    { wallet: "0xfirst", removals: 1 },
    { wallet: "0xsecond", removals: 1 },
  ]);
});

test("uses the removed registration's season, including removals after the season ends", () => {
  const histories = [
    item(registration(100), removal(210, "0xstart"), registration(220, { resolved: false })),
    item(registration(99), removal(150, "0xbefore"), registration(160)),
    item(registration(199), removal(210, "0xlast")),
    item(registration(200), removal(210, "0xend")),
  ];

  assert.deepEqual(collectAmbassadorRemovers(histories, profile), [
    { wallet: "0xstart", removals: 1 },
    { wallet: "0xlast", removals: 1 },
  ]);
});

test("associates each removal with its preceding registration even when history is unordered", () => {
  const history = item(
    registration(220),
    removal(230, "0xoutside"),
    removal(210, "0xeligible"),
    registration(110),
    removal(50, "0xmissingregistration")
  );

  assert.deepEqual(collectAmbassadorRemovers([history], profile), [{ wallet: "0xeligible", removals: 1 }]);
});

test("combines a remover's contributions across configured registries and wallet casing", () => {
  const histories = [
    item(registration(110), removal(120, "0xRemover")),
    { registryAddress: "0xOtherList", requests: [registration(110), removal(120, "0xREMOVER")] },
    { registryAddress: "0xunconfigured", requests: [registration(110), removal(120, "0xstranger")] },
  ];

  assert.deepEqual(
    collectAmbassadorRemovers(histories, { ...profile, lists: [...profile.lists, { address: "0xotherlist" }] }),
    [{ wallet: "0xremover", removals: 2 }]
  );
});

test("supports profiles without a season window", () => {
  assert.deepEqual(
    collectAmbassadorRemovers([item(registration(10), removal(20)), item(registration(250), removal(300))], {
      lists: profile.lists,
    }),
    [{ wallet: "0xremover", removals: 2 }]
  );
});
