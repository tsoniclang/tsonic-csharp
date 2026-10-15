using System.Reflection;

sealed partial class ReflectionProvider
{
    const int MaximumDelegateShapeDepth = 128;
    readonly HashSet<Type> delegateSourceShapeInProgress = [];
    readonly Dictionary<(Type Type, int Depth), string> delegateSourceShapeUnsupportedReasons = [];

    (Type Type, int Depth) DelegateSourceShapeContext(Type type)
    {
        return (type, delegateSourceShapeInProgress.Count - (delegateSourceShapeInProgress.Contains(type) ? 1 : 0));
    }

    object? ExportSourceShape(Type type)
    {
        return IsDelegate(type) ? DelegateSourceShape(type) : null;
    }

    string? UnsupportedDelegateSourceShapeReason(Type type)
    {
        var context = DelegateSourceShapeContext(type);
        if (delegateSourceShapeUnsupportedReasons.TryGetValue(context, out var cachedReason))
        {
            return cachedReason;
        }
        if (DelegateSourceShape(type) is not null) return null;
        return delegateSourceShapeUnsupportedReasons.TryGetValue(context, out var reason)
            ? reason
            : $"Delegate type '{TypeMetadataName(type)}' cannot be represented as a closed source function shape.";
    }

    object? RejectDelegateSourceShape(Type type, string reason)
    {
        delegateSourceShapeUnsupportedReasons[DelegateSourceShapeContext(type)] = reason;
        return null;
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
            return RejectDelegateSourceShape(type, "Delegate source shape exceeds its finite expansion-depth budget.");
        }
        if (delegateSourceShapeUnsupportedReasons.ContainsKey(DelegateSourceShapeContext(type)))
        {
            return null;
        }
        delegateSourceShapeInProgress.Add(type);
        try
        {
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
                return RejectDelegateSourceShape(type, "Delegate has no provider-visible Invoke method, so no source function declaration can be generated.");
            }
            var parameters = Parameters(
                invoke.GetParameters(),
                genericParameters: genericParameters,
                genericNullability: genericNullability);
            if (parameters is null)
            {
                var reason = UnsupportedParametersReason(type.GetMethod("Invoke")!.GetParameters(), "Delegate invoke signature")
                    ?? "Delegate invoke signature cannot be represented as closed .NET target type facts.";
                return RejectDelegateSourceShape(type, $"{reason}; the type is retained as target-only .NET data.");
            }
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
            if (returnType is null || targetReturnType is null)
            {
                var reason = UnsupportedReturnTypeReason(type.GetMethod("Invoke")!, "Delegate invoke return type")
                    ?? "Delegate invoke return type cannot be represented as closed .NET target type facts.";
                return RejectDelegateSourceShape(type, $"{reason}; the type is retained as target-only .NET data.");
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
