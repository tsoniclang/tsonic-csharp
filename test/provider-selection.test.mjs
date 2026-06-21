import { test } from "node:test";
import assert from "node:assert/strict";
import { sourcePrimitiveFactKey, targetBindingFactKey } from "@tsonic/tsts";
import { createCsharpNativeProviderExtension } from "../dist/index.js";

test("C# provider rejects ambiguous target members instead of ranking candidates", () => {
  const provider = getNativeSemanticProvider();
  const containerSymbol = {};
  const literalArgument = { Kind: 1, Text: "1" };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Object)", { kind: "target-named", id: "System.Object" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [literalArgument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: literalArgument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

function getNativeSemanticProvider() {
  const semanticProviders = [];
  const extension = createCsharpNativeProviderExtension({
    selectedSurfaces: [],
    facts: {
      set() {},
    },
  });
  extension.initialize({
    registerTargetBindingProvider: () => true,
    registerTargetSemanticProvider(provider) {
      semanticProviders.push(provider);
      return true;
    },
    registerLifecycleHook: () => true,
    factResolver: {
      register: () => true,
    },
    facts: {
      set() {},
    },
  });
  assert.equal(semanticProviders.length, 1);
  return semanticProviders[0];
}

function method(id, parameterType) {
  return {
    id,
    sourceName: "m",
    targetName: "M",
    kind: "method",
    parameters: [{
      name: "value",
      type: parameterType,
      passingMode: "by-value",
    }],
    returnType: { kind: "target-named", id: "System.Void" },
  };
}

function fakeObservationContext(options) {
  return {
    facts: {
      get: () => undefined,
      set() {},
    },
    factResolver: {
      resolve(subject, key) {
        if (subject === options.targetBindingSubject && key === targetBindingFactKey) {
          return options.targetBinding;
        }
        if (subject === options.sourcePrimitiveSubject && key === sourcePrimitiveFactKey) {
          return options.sourcePrimitive;
        }
        return undefined;
      },
    },
    diagnostics: [],
    compiler: {
      ast: {
        kindName: (node) => node === undefined ? "Undefined" : node.Kind === 1 ? "KindNumericLiteral" : String(node.Kind),
        text: (node) => node?.Text ?? "",
        is: {
          IsStringLiteral: () => false,
        },
      },
    },
  };
}
