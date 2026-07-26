import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  csharpRuntimeCarrierFactKey,
} from "../dist/source/csharp-facts.js";
import {
  collectNodesByKind,
  createCsharpSession,
  formatDiagnostics,
} from "./surface-boundary.helpers.mjs";

// Full compiler-session lifecycle proofs replacing behaviours removed with
// test/call-operation-lifecycle.test.mjs and the source-owned-call-closure
// rewrite. Each drives a real session to finalization and asserts the
// finalized facts, rather than a consumer-owned replay.

const sourceOwnedCallMemberId = "tsonic.csharp.source-owned-call";
const int32Carrier = { kind: "source-primitive", name: "int32" };
const boolCarrier = { kind: "source-primitive", name: "bool" };

function finalize(sourceText) {
  const session = createCsharpSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");
  const extensionHost = session.finalizeExtensions();
  return { session, sourceFile, extensionHost };
}

function callsByCallee(sourceFile, session) {
  return collectNodesByKind(sourceFile, session.ast, "KindCallExpression").map((call) => ({
    call,
    name: calleeName(call, session.ast),
  }));
}

function calleeName(call, ast) {
  const expression = ast.as.AsCallExpression(call).Expression;
  if (ast.is.IsIdentifier(expression)) {
    return ast.text(expression);
  }
  return ast.is.IsPropertyAccessExpression(expression) ? ast.text(ast.name(expression)) : undefined;
}

function evidenceOf(extensionHost) {
  return JSON.stringify(extensionHost.diagnostics.all().map((diagnostic) => ({
    extensionCode: diagnostic.extensionCode,
    message: diagnostic.message,
  })));
}

test("source-owned generic parameter instantiation closes from selected type arguments", () => {
  const { session, sourceFile, extensionHost } = finalize(`
    import type { int32 } from "@tsonic/core/types.js";

    function identity<T>(value: T): T {
      return value;
    }

    export function useIdentity(seed: int32): int32 {
      return identity<int32>(seed);
    }
  `);
  const call = callsByCallee(sourceFile, session).find((entry) => entry.name === "identity")?.call;
  const evidence = evidenceOf(extensionHost);
  assert.notEqual(call, undefined, evidence);
  assert.equal(
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  // The open authored T must not survive: the closed instantiation is int32.
  assert.deepEqual(
    extensionHost.facts.get(call, csharpRuntimeCarrierFactKey)?.carrier,
    int32Carrier,
    evidence,
  );
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});

test("source-owned zero-argument call on a source receiver finalizes its selected signature", () => {
  const { session, sourceFile, extensionHost } = finalize(`
    import type { int32 } from "@tsonic/core/types.js";

    class Counter {
      current(): int32 {
        return 1 as int32;
      }
    }

    export function readCounter(counter: Counter): int32 {
      return counter.current();
    }
  `);
  const call = callsByCallee(sourceFile, session).find((entry) => entry.name === "current")?.call;
  const evidence = evidenceOf(extensionHost);
  assert.notEqual(call, undefined, evidence);
  assert.equal(
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  assert.deepEqual(
    extensionHost.facts.get(call, csharpRuntimeCarrierFactKey)?.carrier,
    int32Carrier,
    evidence,
  );
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});

test("source-owned tuple results close through calls and literal element access", () => {
  const { session, sourceFile, extensionHost } = finalize(`
    import type { bool, int32 } from "@tsonic/core/types.js";

    function pair(seed: int32): [int32, bool] {
      return [seed, true as bool];
    }

    export function first(seed: int32): int32 {
      const result: [int32, bool] = pair(seed);
      return result[0];
    }
  `);
  const call = callsByCallee(sourceFile, session).find((entry) => entry.name === "pair")?.call;
  const evidence = evidenceOf(extensionHost);
  assert.notEqual(call, undefined, evidence);
  assert.equal(
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  assert.deepEqual(
    extensionHost.facts.get(call, csharpRuntimeCarrierFactKey)?.carrier,
    { kind: "tuple", elements: [int32Carrier, boolCarrier] },
    evidence,
  );
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});

test("source-owned generic composite results and parameters close through nested calls", () => {
  const { session, sourceFile, extensionHost } = finalize(`
    import type { bool, int32 } from "@tsonic/core/types.js";

    function attachFlag<T>(value: T): [T, bool] {
      return [value, true as bool];
    }

    function first(value: [int32, bool]): int32 {
      return value[0];
    }

    export function use(seed: int32): int32 {
      return first(attachFlag<int32>(seed));
    }
  `);
  const calls = callsByCallee(sourceFile, session);
  const attachFlag = calls.find((entry) => entry.name === "attachFlag")?.call;
  const first = calls.find((entry) => entry.name === "first")?.call;
  const evidence = evidenceOf(extensionHost);
  assert.notEqual(attachFlag, undefined, evidence);
  assert.notEqual(first, undefined, evidence);
  assert.equal(
    extensionHost.facts.get(attachFlag, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  assert.equal(
    extensionHost.facts.get(first, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  assert.deepEqual(
    extensionHost.facts.get(attachFlag, csharpRuntimeCarrierFactKey)?.carrier,
    { kind: "tuple", elements: [int32Carrier, boolCarrier] },
    evidence,
  );
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});

test("source-owned array results close through calls and literal element access", () => {
  const { session, sourceFile, extensionHost } = finalize(`
    import type { int32 } from "@tsonic/core/types.js";

    function singleton(seed: int32): int32[] {
      return [seed];
    }

    export function first(seed: int32): int32 {
      const result: int32[] = singleton(seed);
      return result[0 as int32];
    }
  `);
  const call = callsByCallee(sourceFile, session).find((entry) => entry.name === "singleton")?.call;
  const evidence = evidenceOf(extensionHost);
  assert.notEqual(call, undefined, evidence);
  assert.equal(
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});

test("source-owned class construction and class-valued calls close from declaration shape facts", () => {
  const { session, sourceFile, extensionHost } = finalize(`
    import type { int32 } from "@tsonic/core/types.js";

    class Box {
      constructor(public readonly value: int32) {}
    }

    function makeBox(seed: int32): Box {
      return new Box(seed);
    }

    export function readBox(seed: int32): int32 {
      return makeBox(seed).value;
    }
  `);
  const call = callsByCallee(sourceFile, session).find((entry) => entry.name === "makeBox")?.call;
  const construction = collectNodesByKind(sourceFile, session.ast, "KindNewExpression")[0];
  const evidence = evidenceOf(extensionHost);
  assert.notEqual(call, undefined, evidence);
  assert.notEqual(construction, undefined, evidence);
  assert.equal(
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  assert.equal(
    extensionHost.facts.get(construction, selectedTargetSignatureFactKey)?.member.id,
    sourceOwnedCallMemberId,
    evidence,
  );
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});
