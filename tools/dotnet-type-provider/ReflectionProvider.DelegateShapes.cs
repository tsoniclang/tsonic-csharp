using System.Reflection;

sealed partial class ReflectionProvider
{
    const int MaximumDelegateShapeDepth = 128;
    readonly HashSet<Type> delegateSourceShapeInProgress = [];
    readonly Dictionary<Type, string> delegateSourceShapeUnsupportedReasons = [];

    object? ExportSourceShape(Type type)
    {
        return IsDelegate(type) ? DelegateSourceShape(type) : null;
    }

    string? UnsupportedDelegateSourceShapeReason(Type type)
    {
        if (delegateSourceShapeUnsupportedReasons.TryGetValue(type, out var cachedReason))
        {
            return cachedReason;
        }
        var reason = ComputeUnsupportedDelegateSourceShapeReason(type);
        if (reason is not null)
        {
            delegateSourceShapeUnsupportedReasons[type] = reason;
        }
        return reason;
    }

    string? ComputeUnsupportedDelegateSourceShapeReason(Type type)
    {
        var invoke = type.GetMethod("Invoke");
        if (invoke is null)
        {
            return "Delegate has no provider-visible Invoke method, so no source function declaration can be generated.";
        }
        if (Parameters(invoke.GetParameters()) is null)
        {
            return $"{UnsupportedParametersReason(invoke.GetParameters(), "Delegate invoke signature")}; the type is retained as target-only .NET data.";
        }
        var returnReason = UnsupportedReturnTypeReason(invoke, "Delegate invoke return type");
        return returnReason is null
            ? null
            : $"{returnReason}; the type is retained as target-only .NET data.";
    }

    object? DelegateSourceShape(
        Type type,
        GenericParameterContext? genericParameters = null,
        NullabilityInfo? typeNullability = null,
        NullableMetadata? typeNullabilityMetadata = null,
        GenericNullabilityContext? genericNullability = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        genericNullability ??= GenericNullabilityContext.Empty;
        if (delegateSourceShapeInProgress.Contains(type))
        {
            return null;
        }
        if (delegateSourceShapeInProgress.Count >= MaximumDelegateShapeDepth)
        {
            delegateSourceShapeUnsupportedReasons[type] = "Delegate source shape exceeds its finite expansion-depth budget.";
            return null;
        }
        delegateSourceShapeInProgress.Add(type);
        try
        {
            if (UnsupportedDelegateSourceShapeReason(type) is not null)
            {
                return null;
            }
            var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
            if (type.IsConstructedGenericType)
            {
                genericParameters = genericParameters.WithConstructedTypeArguments(definition, type);
                genericNullability = genericNullability.WithConstructedTypeArguments(
                    definition,
                    type,
                    typeNullability,
                    typeNullabilityMetadata);
            }
            var invoke = definition.GetMethod("Invoke");
            if (invoke is null)
            {
                return null;
            }
            var parameters = Parameters(
                invoke.GetParameters(),
                genericParameters: genericParameters,
                genericNullability: genericNullability);
            var returnNullability = genericNullability.Resolve(invoke.ReturnType, nullability.Create(invoke.ReturnParameter));
            var returnNullabilityMetadata = genericNullability.ResolveMetadata(
                invoke.ReturnType,
                NullableMetadata.ForParameter(invoke.ReturnParameter));
            var targetReturnType = TypeRef(
                UnwrapByRef(invoke.ReturnType),
                genericParameters: genericParameters,
                typeNullability: returnNullability,
                typeNullabilityMetadata: returnNullabilityMetadata,
                genericNullability: genericNullability,
                signatureEvidence: SignatureEvidence(invoke.ReturnParameter));
            var returnPassing = ReturnPassingMode(invoke.ReturnParameter);
            var returnType = returnPassing is null
                ? targetReturnType
                : ByRefReturnSourceType(
                    invoke.ReturnType,
                    genericParameters,
                    returnNullability,
                    returnNullabilityMetadata);
            if (parameters is null || returnType is null || targetReturnType is null)
            {
                return null;
            }
            return new
            {
                kind = "function",
                id = TypeTargetId(type),
                parameters,
                returnType,
                targetReturnType = returnPassing is null ? null : targetReturnType,
                returnPassing,
            };
        }
        finally
        {
            delegateSourceShapeInProgress.Remove(type);
        }
    }
}
