import test from "node:test";
import assert from "node:assert/strict";
import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  targetConversionFactKey,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpStringTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  collectNodesByKind,
  createCsharpSession,
  formatDiagnostics,
} from "./surface-boundary.helpers.mjs";

test("selected JS source profile maps closed global parsing and timer operations", () => {
  const session = createCsharpSession(`
    export function parse(value: string): number {
      return parseInt(value, 10);
    }

    export function output(value: string): void {
      console.log(\`value=\${value}\`);
    }

    export function schedule(): void {
      const timeout = setTimeout(() => {}, 1);
      clearTimeout(timeout);
      const interval = setInterval(() => {}, 2);
      clearInterval(interval);
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");

  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");
  const extensionHost = session.finalizeExtensions();
  const calls = collectNodesByKind(sourceFile, session.ast, "KindCallExpression");
  const selectedIds = calls.map((call) => extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id)
    .filter((id) => id !== undefined);

  assert.deepEqual(selectedIds, [
    "Tsonic.CSharp.Js.Globals.parseInt",
    "Tsonic.CSharp.Js.console.log",
    "Tsonic.CSharp.Js.Timers.setTimeout",
    "Tsonic.CSharp.Js.Timers.clearTimeout",
    "Tsonic.CSharp.Js.Timers.setInterval",
    "Tsonic.CSharp.Js.Timers.clearInterval",
  ]);
  const template = collectNodesByKind(sourceFile, session.ast, "KindTemplateExpression")[0];
  assert.deepEqual(extensionHost.facts.get(template, runtimeCarrierFactKey)?.carrier, csharpStringTargetType());
  assert.equal(extensionHost.facts.get(template, targetConversionFactKey)?.convertedType?.id, "System.Object");

  const intervalCall = calls.find((call) =>
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id === "Tsonic.CSharp.Js.Timers.setInterval");
  const intervalOperation = extensionHost.facts.get(intervalCall, csharpTargetOperationFactKey);
  assert.deepEqual(intervalOperation?.selectedMember.parameters[0].type.csharpDelegateSignature, {
    parameters: [],
    returnType: {
      kind: "target-named",
      id: "System.Void",
      csharpRender: { kind: "predefined", name: "void" },
      csharpSpecialType: "void",
    },
  });
  const callbackCarriers = collectNodesByKind(sourceFile, session.ast, "KindArrowFunction")
    .map((callback) => extensionHost.facts.get(callback, runtimeCarrierFactKey)?.carrier);
  assert.deepEqual(callbackCarriers, [
    intervalOperation?.selectedMember.parameters[0].type,
    intervalOperation?.selectedMember.parameters[0].type,
  ]);
  assert.equal(formatDiagnostics(extensionHost.diagnostics.all()), "");
});

test("pure C# source profile does not expose JS global parsing or timers", () => {
  const session = createCsharpSession(`
    export function parse(value: string): number {
      setTimeout(() => {}, 1);
      return parseInt(value, 10);
    }
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = formatDiagnostics(session.ensureChecked(sourceFile));

  assert.match(diagnostics, /Cannot find name 'setTimeout'/u);
  assert.match(diagnostics, /Cannot find name 'parseInt'/u);
});
