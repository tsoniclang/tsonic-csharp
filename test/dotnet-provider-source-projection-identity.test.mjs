import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../dist/index.js";
import { getCompleteDotnetModule } from "./dotnet-provider.helpers.mjs";

const moduleSpecifier = "@tsonic/dotnet/System.Text.Json.js";

test("one CLR signature retains distinct static and extension source-operation identities", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
  });
  const module = getCompleteDotnetModule(provider, moduleSpecifier, {
    requestedExports: ["JsonDocument", "JsonSerializer"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));
  const model = dotnetModuleToProviderDeclarationModel(module);
  const document = requiredExport(model, "JsonDocument");
  const serializer = requiredExport(model, "JsonSerializer");
  const extensionMember = requiredMethod(document, "Deserialize", false);
  const staticMember = requiredMethod(serializer, "Deserialize", true);
  const extensionSignature = requiredJsonTypeInfoSignature(
    extensionMember,
    1,
  );
  const staticSignature = requiredJsonTypeInfoSignature(staticMember, 2);

  assert.notEqual(extensionMember.id, staticMember.id);
  assert.notEqual(extensionSignature.id, staticSignature.id);
  assert.match(extensionMember.id, /#source-member#instance#Deserialize$/u);
  assert.match(staticMember.id, /#source-member#static#Deserialize$/u);

  const extensionRelation = requiredSignatureRelation(
    provider,
    "JsonDocument",
    extensionSignature.id,
  );
  const staticRelation = requiredSignatureRelation(
    provider,
    "JsonSerializer",
    staticSignature.id,
  );

  assert.equal(extensionRelation.targetMember.id, staticRelation.targetMember.id);
  assert.deepEqual(extensionRelation.receiver, {
    kind: "target-parameter",
    targetParameterIndex: 0,
  });
  assert.deepEqual(
    extensionRelation.parameters.map((parameter) => [
      parameter.sourceParameterIndex,
      parameter.targetParameterIndex,
    ]),
    [[0, 1]],
  );
  assert.deepEqual(staticRelation.receiver, { kind: "none" });
  assert.deepEqual(
    staticRelation.parameters.map((parameter) => [
      parameter.sourceParameterIndex,
      parameter.targetParameterIndex,
    ]),
    [[0, 0], [1, 1]],
  );
});

function requiredExport(model, name) {
  const declaration = model.exports.find((candidate) =>
    candidate.name === name
  );
  assert.ok(declaration);
  return declaration;
}

function requiredMethod(declaration, name, isStatic) {
  const member = declaration.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.name === name &&
    (candidate.static === true) === isStatic
  );
  assert.ok(member);
  return member;
}

function requiredJsonTypeInfoSignature(member, parameterCount) {
  const signature = member.signatures?.find((candidate) =>
    candidate.typeParameters?.length === 1 &&
    candidate.parameters.length === parameterCount &&
    (
      parameterCount === 1 ||
      (
        candidate.parameters[0]?.type.kind === "provider-ref" &&
        candidate.parameters[0]?.type.exportName === "JsonDocument"
      )
    ) &&
    candidate.parameters.at(-1)?.type.kind === "provider-ref" &&
    candidate.parameters.at(-1)?.type.exportName === "JsonTypeInfo"
  );
  assert.ok(signature);
  return signature;
}

function requiredSignatureRelation(provider, exportName, signatureId) {
  const result = provider.resolveTargetRelations({
    moduleSpecifier,
    providerModuleId: moduleSpecifier,
    artifactFileName: `tsts-provider://test/${exportName}.d.ts`,
    exportName,
  });
  assert.equal(Array.isArray(result), true, JSON.stringify(result));
  const matches = result.filter((relation) =>
    relation.kind === "signature" && relation.signatureId === signatureId
  );
  assert.equal(matches.length, 1);
  return matches[0];
}
