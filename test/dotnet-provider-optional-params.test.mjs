import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../dist/index.js";
import { findTargetMemberForCall } from "../dist/source/csharp-source-semantics/target-member-selection.js";

test(".NET provider preserves optional and params-array facts from reflected member signatures", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in module, true);

  const rawOptional = rawSignature(
    module,
    "ArgumentException",
    "throwIfNullOrEmpty",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(rawOptional.parameters[0].optional, undefined);
  assert.equal(rawOptional.parameters[1].name, "paramName");
  assert.equal(rawOptional.parameters[1].optional, true);

  const rawParams = rawSignature(
    module,
    "Console",
    "writeLine",
    "System.Console.WriteLine(System.String,System.Object[])",
  );
  assert.equal(rawParams.parameters[0].rest, undefined);
  assert.equal(rawParams.parameters[1].name, "arg");
  assert.equal(rawParams.parameters[1].type.kind, "array");
  assert.equal(rawParams.parameters[1].rest, true);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceOptional = sourceSignature(
    sourceModel,
    "ArgumentException",
    "throwIfNullOrEmpty",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(sourceOptional.parameters[1].optional, true);

  const sourceParams = sourceSignature(
    sourceModel,
    "Console",
    "writeLine",
    "System.Console.WriteLine(System.String,System.Object[])",
  );
  assert.equal(sourceParams.parameters[1].rest, true);

  const targetOptional = targetMember(provider, "System.ArgumentException", "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)");
  assert.equal(targetOptional.parameters[1].optional, true);

  const targetParams = targetMember(provider, "System.Console", "System.Console.WriteLine(System.String,System.Object[])");
  assert.equal(targetParams.parameters[1].paramsArray, true);
});

test(".NET selected target-member identity enforces optional and params-array arity facts", () => {
  const optionalMember = method("Example.Target.Optional(System.String,System.String)", [
    parameter("value", stringType()),
    parameter("name", stringType(), { optional: true }),
  ]);
  assert.equal(selectBySignature(optionalMember, 1)?.id, optionalMember.id);
  assert.equal(selectBySignature(optionalMember, 2)?.id, optionalMember.id);
  assert.equal(selectBySignature(optionalMember, 0), undefined);
  assert.equal(selectBySignature(optionalMember, 3), undefined);

  const paramsMember = method("Example.Target.Params(System.String,System.String[])", [
    parameter("format", stringType()),
    parameter("values", { kind: "array", element: stringType() }, { paramsArray: true }),
  ]);
  assert.equal(selectBySignature(paramsMember, 1)?.id, paramsMember.id);
  assert.equal(selectBySignature(paramsMember, 3)?.id, paramsMember.id);
  assert.equal(selectBySignature(paramsMember, 0), undefined);

  const requiredMember = method("Example.Target.Required(System.String,System.String)", [
    parameter("value", stringType()),
    parameter("name", stringType()),
  ]);
  assert.equal(selectBySignature(requiredMember, 1), undefined);

  const malformedParamsMember = method("Example.Target.Malformed(System.String[],System.String)", [
    parameter("values", { kind: "array", element: stringType() }, { paramsArray: true }),
    parameter("tail", stringType()),
  ]);
  assert.equal(selectBySignature(malformedParamsMember, 2), undefined);
});

function rawSignature(module, typeName, memberName, signatureId) {
  const type = module.exports.find((declaration) => declaration.kind === "type" && declaration.sourceName === typeName);
  assert.ok(type, `raw type ${typeName}`);
  const member = type.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.sourceName === memberName &&
    candidate.signatures?.some((signature) => signature.id === signatureId)
  );
  assert.ok(member, `raw member ${typeName}.${memberName}`);
  const signature = member.signatures.find((candidate) => candidate.id === signatureId);
  assert.ok(signature, `raw signature ${signatureId}`);
  return signature;
}

function sourceSignature(model, typeName, memberName, signatureId) {
  const type = model.exports.find((declaration) => declaration.name === typeName);
  assert.ok(type, `source type ${typeName}`);
  const member = type.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.name === memberName &&
    candidate.signatures?.some((signature) => signature.id === signatureId)
  );
  assert.ok(member, `source member ${typeName}.${memberName}`);
  const signature = member.signatures.find((candidate) => candidate.id === signatureId);
  assert.ok(signature, `source signature ${signatureId}`);
  return signature;
}

function targetMember(provider, typeId, memberId) {
  const binding = provider.findTargetBindingByTargetId(typeId);
  assert.ok(binding, `target binding ${typeId}`);
  const member = binding.members?.find((candidate) => candidate.id === memberId);
  assert.ok(member, `target member ${memberId}`);
  return member;
}

function selectBySignature(member, argumentCount) {
  return findTargetMemberForCall(
    {
      id: "Example.Target",
      sourceName: "Target",
      targetName: "Example.Target",
      target: "csharp",
      kind: "class",
      members: [member],
    },
    { signatureId: member.id },
    { arguments: Array.from({ length: argumentCount }, () => ({})) },
    {},
    () => undefined,
  );
}

function method(id, parameters) {
  return {
    id,
    sourceName: "target",
    targetName: "Target",
    kind: "method",
    parameters,
    returnType: { kind: "target-named", id: "System.Void" },
    overloadGroup: "Example.Target.Target",
  };
}

function parameter(name, type, options = {}) {
  return {
    name,
    type,
    passingMode: "by-value",
    ...options,
  };
}

function stringType() {
  return { kind: "target-named", id: "System.String" };
}
