import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
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

const repoRoot = new URL("..", import.meta.url).pathname;

test("TSTS finalization closes source-owned calls from retained selected evidence", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    function increment(value: int32): int32 {
      return value;
    }

    export function useIncrement(seed: int32): int32 {
      return increment(seed);
    }
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const calls = collectNodesByKind(sourceFile, session.ast, "KindCallExpression");
  const incrementCall = calls.find((call) => callCalleeName(call, session.ast) === "increment");
  const evidence = JSON.stringify({
    calls: calls.map((call) => ({
      name: callCalleeName(call, session.ast),
      selectedMemberId: extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id,
      carrier: extensionHost.facts.get(call, csharpRuntimeCarrierFactKey)?.carrier,
    })),
    diagnostics: extensionHost.diagnostics.all().map((diagnostic) => ({
      extensionCode: diagnostic.extensionCode,
      message: diagnostic.message,
    })),
  });
  assert.notEqual(incrementCall, undefined, evidence);
  assert.equal(
    extensionHost.facts.get(incrementCall, selectedTargetSignatureFactKey)?.member.id,
    "tsonic.csharp.source-owned-call",
    evidence,
  );
  assert.deepEqual(
    extensionHost.facts.get(incrementCall, csharpRuntimeCarrierFactKey)?.carrier,
    { kind: "source-primitive", name: "int32" },
    evidence,
  );
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});

test("C# product code contains no consumer-owned checked-operation replay lifecycle", () => {
  const removedModule = join(
    repoRoot,
    "src/source/csharp-source-semantics/csharp-operation-lifecycle.ts",
  );
  assert.equal(existsSync(removedModule), false);

  const forbidden = [
    "recordCsharpSelectedCallOperationFactsBeforeFinalization",
    "recordCsharpSelectedPropertyOperationFactsBeforeFinalization",
    "recordCsharpCheckedOperationFactsBeforeFinalization",
    "recordCsharpCheckedOperatorFactsBeforeFinalization",
  ];
  const hits = sourceFiles(join(repoRoot, "src")).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return forbidden
      .filter((symbol) => source.includes(symbol))
      .map((symbol) => `${relative(repoRoot, file).split(sep).join("/")}: ${symbol}`);
  });
  assert.deepEqual(hits, []);
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entryName) => {
    const path = join(directory, entryName);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

function callCalleeName(call, ast) {
  const callExpression = ast.as.AsCallExpression(call);
  const expression = callExpression.Expression;
  if (ast.is.IsIdentifier(expression)) {
    return ast.text(expression);
  }
  return ast.is.IsPropertyAccessExpression(expression)
    ? ast.text(ast.name(expression))
    : undefined;
}
