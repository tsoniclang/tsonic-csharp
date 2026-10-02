import { createHash } from "node:crypto";
import type { Node } from "@tsonic/tsts";
import { sourceLexicalCaptures } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../../target-model/types/model.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpTypeResolutionState } from "../../resolution/model.js";
import { nextState } from "../../resolution/state.js";
import { csharpObjectShapeMethodRequiresProtocol } from "../../../../target-model/types/method-values.js";

export function selectCsharpObjectMethodImplementation(
  members: readonly CsharpObjectShapeMemberFact[],
  host: CsharpObjectShapePolicyHost,
  state: CsharpTypeResolutionState,
  selectedLiteral?: Node,
): CsharpObjectShapeFact["methodImplementation"] | undefined {
  const declaredMethods = members.flatMap(member => (member.sourceDeclarations ?? [])
    .filter(declaration => host.ast.is.IsMethodDeclaration(declaration) && host.ast.body(declaration) !== undefined &&
      host.ast.is.IsObjectLiteralExpression(host.ast.parent(declaration)!) &&
      (selectedLiteral === undefined || host.ast.parent(declaration) === selectedLiteral))
    .map(declaration => ({ declaration, required: csharpObjectShapeMethodRequiresProtocol(member) })));
  const requiredMethods = declaredMethods.filter(method => method.required);
  if (requiredMethods.length === 0) return undefined;
  const literal = host.ast.parent(requiredMethods[0]!.declaration);
  if (literal === undefined || requiredMethods.some(method => host.ast.parent(method.declaration) !== literal)) return undefined;
  const methods = [...new Set(declaredMethods.filter(method => host.ast.parent(method.declaration) === literal)
    .map(method => method.declaration))].sort((left, right) => host.ast.pos(left) - host.ast.pos(right));
  const selected = sourceLexicalCaptures(literal, methods, host.ast, host.navigation);
  const names = new Set(members.map(member => member.targetName));
  const captures = selected.captures.filter(capture => host.callOnlyAlias(capture.declaration) === undefined).map((capture, index) => {
    const reference = capture.references[0];
    const type = host.typeResolver.resolveNode(capture.declaration, host.ast.getSourceFile(capture.declaration), nextState(state));
    if (reference === undefined || type === undefined) return undefined;
    let fieldName = `__tsonic_capture${index}`;
    while (names.has(fieldName)) fieldName += "_";
    names.add(fieldName);
    return Object.freeze({ declaration: capture.declaration, reference, fieldName, type,
      mutable: host.navigation.declarationUseSummary(capture.declaration).bindingWritten,
    });
  });
  if (captures.some(capture => capture === undefined)) return undefined;
  const file = host.ast.getSourceFile(literal);
  const identity = createHash("sha256").update(JSON.stringify([
    host.ast.getFileName(file), host.ast.pos(literal), host.ast.end(literal),
  ])).digest("hex");
  return Object.freeze({ declaration: literal, identity, methods: Object.freeze(methods),
    captures: Object.freeze(captures as NonNullable<typeof captures[number]>[]),
  });
}
