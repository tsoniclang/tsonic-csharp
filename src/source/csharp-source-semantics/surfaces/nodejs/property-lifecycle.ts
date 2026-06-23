import {
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  asNodeSubject,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getProviderNamespaceImportSpecifier,
} from "./declarations.js";
import {
  getCsharpNodejsStaticPropertyOperation,
  getNodejsStaticPropertyDeclaration,
} from "./members.js";

export function recordCsharpNodejsNamespacePropertyFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!compiler.ast.is.IsPropertyAccessExpression(node) || lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      const propertyAccess = compiler.ast.as.AsPropertyAccessExpression(node);
      const receiver = asNodeSubject(propertyAccess?.Expression);
      const propertyName = compiler.ast.text(propertyAccess?.name);
      if (receiver === undefined || propertyName.length === 0) {
        return;
      }
      const moduleSpecifier = getProviderNamespaceImportSpecifier(receiver, context);
      if (moduleSpecifier === undefined) {
        return;
      }
      const declaration = getNodejsStaticPropertyDeclaration(moduleSpecifier, propertyName);
      if (declaration === undefined) {
        return;
      }
      const operation = getCsharpNodejsStaticPropertyOperation(declaration);
      if (operation === undefined) {
        return;
      }
      lifecycleContext.host.facts.set(node, targetOperationFactKey, operation.operation, [{ message: `C# NodeJS surface namespace property '${propertyName}' selected from checked provider namespace import '${moduleSpecifier}'.` }]);
      lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, operation.csharpOperation, [{ message: `C# NodeJS surface namespace property '${propertyName}' operation finalized from provider-owned module '${moduleSpecifier}'.` }]);
    });
  }
}
