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
