import type { Node } from "@tsonic/tsts";
import type { SourcePresence } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectMethodSourceCapture } from "../../../target-model/records/native/native-value-carriers.js";
import { represented, nativeRepresentationFailure } from "../../../policy/types/source-type-flow/representation-results.js";

export function selectCsharpObjectMethodImplementation(
  members: readonly CsharpObjectShapeMemberFact[],
  host: Pick<CsharpObjectShapePolicyHost, "ast" | "objectMethodSources" | "nativeValue" | "captureInitialization">,
  selectedLiteral?: Node,
): CsharpRepresentationOutcome<SourcePresence<NonNullable<CsharpObjectShapeFact["methodImplementation"]>>> {
  const methods = [...new Set(members.filter(member => member.memberKind === "method").flatMap(member =>
    (member.sourceDeclarations ?? []).filter(declaration => host.ast.is.IsMethodDeclaration(declaration) &&
      host.ast.body(declaration) !== undefined && host.ast.parent(declaration) !== undefined &&
      host.ast.is.IsObjectLiteralExpression(host.ast.parent(declaration)!) &&
      (selectedLiteral === undefined || host.ast.parent(declaration) === selectedLiteral))))]
    .sort((left, right) => host.ast.pos(left) - host.ast.pos(right));
  if (methods.length === 0) return represented(Object.freeze({ kind: "none" }));
  const literal = host.ast.parent(methods[0]!)!;
  if (methods.some(method => host.ast.parent(method) !== literal)) return nativeRepresentationFailure(literal,
    "CSHARP_METHOD_ENVIRONMENT_MISMATCH", "A Native method implementation must retain one exact original authored object environment.");
  const selected = host.objectMethodSources.get(literal);
  if (selected === undefined) return nativeRepresentationFailure(literal, "CSHARP_METHOD_ENVIRONMENT_MISSING",
    "The original object method requires its completed Native capture inventory.");
  const byDeclaration = new Map<Node, CsharpObjectMethodSourceCapture>();
  for (const method of methods) {
    const captures = selected.captures(method);
    if (captures === undefined) return nativeRepresentationFailure(method, "CSHARP_METHOD_ENVIRONMENT_MISSING",
      "An authored object method has no complete original Native capture inventory.");
    for (const capture of captures) if (!byDeclaration.has(capture.declaration)) byDeclaration.set(capture.declaration, capture);
  }
  const names = new Set(members.map(member => member.targetName));
  const captures: NonNullable<CsharpObjectShapeFact["methodImplementation"]>["captures"][number][] = [];
  for (const [index, capture] of [...byDeclaration.values()].entries()) {
    const type = host.nativeValue(capture.declaration);
    if (type.kind !== "represented") return type;
    let fieldName = `__tsonic_capture${index}`;
    while (names.has(fieldName)) fieldName += "_";
    names.add(fieldName);
    captures.push(Object.freeze({ declaration: capture.declaration, reference: capture.reference, fieldName,
      type: type.value, mutable: capture.mutable, initialization: host.captureInitialization(capture.declaration) }));
  }
  return represented(Object.freeze({ kind: "present", value: Object.freeze({ declaration: literal, identity: selected.identity,
    methods: Object.freeze(methods), captures: Object.freeze(captures) }) }));
}
