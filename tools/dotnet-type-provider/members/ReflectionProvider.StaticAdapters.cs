using System.Reflection;

sealed partial class ReflectionProvider
{
    sealed record StaticSourceAdapterIdentity(string SourceName, string TargetId);

    IEnumerable<StaticSourceAdapterIdentity> StaticSourceAdapterIdentities(Type type)
    {
        if (!RequiresStaticSourceAdapter(type))
        {
            yield break;
        }

        foreach (var group in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => UnsupportedMethodReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal)
            .GroupBy(method => method.Name, StringComparer.Ordinal))
        {
            yield return StaticAdapterIdentity(type, "call", group.First().Name);
        }
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            if (UnsupportedPropertyReason(type, property) is not null)
            {
                continue;
            }
            if (property.GetMethod is { IsPublic: true })
            {
                yield return StaticAdapterIdentity(type, "property-get", property.Name);
            }
            if (property.SetMethod is { IsPublic: true })
            {
                yield return StaticAdapterIdentity(type, "property-set", property.Name);
            }
        }
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(field => !field.IsSpecialName)
            .OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            if (UnsupportedFieldReason(type, field) is not null)
            {
                continue;
            }
            yield return StaticAdapterIdentity(type, "field-get", field.Name);
            if (!field.IsLiteral && !field.IsInitOnly)
            {
                yield return StaticAdapterIdentity(type, "field-set", field.Name);
            }
        }
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .OrderBy(eventInfo => eventInfo.Name, StringComparer.Ordinal))
        {
            if (UnsupportedSourceEventReason(eventInfo) is not null)
            {
                continue;
            }
            if (eventInfo.AddMethod is { IsPublic: true })
            {
                yield return StaticAdapterIdentity(type, "event-add", eventInfo.Name);
            }
            if (eventInfo.RemoveMethod is { IsPublic: true })
            {
                yield return StaticAdapterIdentity(type, "event-remove", eventInfo.Name);
            }
        }
    }

    IEnumerable<object> StaticSourceAdapterFunctions(Type type)
    {
        if (!RequiresStaticSourceAdapter(type))
        {
            yield break;
        }

        foreach (var function in StaticMethodAdapterFunctions(type))
        {
            yield return function;
        }
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            if (UnsupportedPropertyReason(type, property) is not null)
            {
                continue;
            }
            if (property.GetMethod is { IsPublic: true } getter)
            {
                var function = StaticAccessorAdapterFunction(
                    type,
                    getter,
                    property.Name,
                    "property-get");
                if (function is not null)
                {
                    yield return function;
                }
            }
            if (property.SetMethod is { IsPublic: true } setter)
            {
                var function = StaticAccessorAdapterFunction(
                    type,
                    setter,
                    property.Name,
                    "property-set");
                if (function is not null)
                {
                    yield return function;
                }
            }
        }
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(field => !field.IsSpecialName)
            .OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            if (UnsupportedFieldReason(type, field) is not null)
            {
                continue;
            }
            var getter = StaticFieldAdapterFunction(type, field, false);
            if (getter is not null)
            {
                yield return getter;
            }
            if (!field.IsLiteral && !field.IsInitOnly)
            {
                var setter = StaticFieldAdapterFunction(type, field, true);
                if (setter is not null)
                {
                    yield return setter;
                }
            }
        }
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .OrderBy(eventInfo => eventInfo.Name, StringComparer.Ordinal))
        {
            if (UnsupportedSourceEventReason(eventInfo) is not null)
            {
                continue;
            }
            foreach (var (accessor, operation) in new[]
            {
                (eventInfo.AddMethod, "event-add"),
                (eventInfo.RemoveMethod, "event-remove"),
            })
            {
                if (accessor is not { IsPublic: true })
                {
                    continue;
                }
                var function = StaticAccessorAdapterFunction(
                    type,
                    accessor,
                    eventInfo.Name,
                    operation);
                if (function is not null)
                {
                    yield return function;
                }
            }
        }
    }

    IEnumerable<object> StaticMethodAdapterFunctions(Type type)
    {
        foreach (var group in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => UnsupportedMethodReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal)
            .GroupBy(method => method.Name, StringComparer.Ordinal))
        {
            var first = group.First();
            var signatures = group
                .Select(method =>
                {
                    var plan = StaticAdapterTypeParameterPlanFor(type, method);
                    return plan is null
                        ? null
                        : MethodSignature(
                            method,
                            plan.Context,
                            StaticMemberTargetInvocation(plan, "call"),
                            plan,
                            method.Name);
                })
                .Where(signature => signature is not null)
                .Cast<object>()
                .ToArray();
            var targetDeclaringType = TypeRef(type, requireDelegateSourceShape: false);
            if (signatures.Length == 0 || targetDeclaringType is null)
            {
                continue;
            }
            var identity = StaticAdapterIdentity(type, "call", first.Name);
            yield return new
            {
                kind = "function",
                sourceName = identity.SourceName,
                targetId = identity.TargetId,
                metadataName = StaticAdapterMetadataName(type, first.Name, "call"),
                targetName = first.Name,
                targetBindingId = TargetId(type),
                targetDeclaringType,
                signatures,
            };
        }
    }

    object? StaticAccessorAdapterFunction(
        Type type,
        MethodInfo accessor,
        string targetName,
        string operation)
    {
        var plan = StaticAdapterTypeParameterPlanFor(type, accessor);
        var targetDeclaringType = TypeRef(type, requireDelegateSourceShape: false);
        if (plan is null || targetDeclaringType is null)
        {
            return null;
        }
        var valueParameterIndex = operation is "property-set" or "event-add" or "event-remove"
            ? accessor.GetParameters().Length - 1
            : (int?)null;
        var signature = MethodSignature(
            accessor,
            plan.Context,
            StaticMemberTargetInvocation(plan, operation, valueParameterIndex),
            plan,
            targetName);
        if (signature is null)
        {
            return null;
        }
        var identity = StaticAdapterIdentity(type, operation, targetName);
        return new
        {
            kind = "function",
            sourceName = identity.SourceName,
            targetId = identity.TargetId,
            metadataName = StaticAdapterMetadataName(type, targetName, operation),
            targetName,
            targetBindingId = TargetId(type),
            targetDeclaringType,
            signatures = new[] { signature },
        };
    }

    object? StaticFieldAdapterFunction(Type type, FieldInfo field, bool write)
    {
        var plan = StaticAdapterTypeParameterPlanFor(type, null);
        var fieldType = TypeRef(
            field.FieldType,
            typeNullability: nullability.Create(field),
            typeNullabilityMetadata: NullableMetadata.ForField(field),
            signatureEvidence: SignatureEvidence(field));
        var targetDeclaringType = TypeRef(type, requireDelegateSourceShape: false);
        if (plan is null || fieldType is null || targetDeclaringType is null)
        {
            return null;
        }
        var operation = write ? "property-set" : "property-get";
        var identity = StaticAdapterIdentity(type, write ? "field-set" : "field-get", field.Name);
        var adapterId = identity.TargetId;
        var parameters = write
            ? new object[]
            {
                new
                {
                    name = "value",
                    type = fieldType,
                    passingMode = "by-value",
                },
            }
            : Array.Empty<object>();
        var signature = new
        {
            id = adapterId,
            sourceId = adapterId,
            targetName = field.Name,
            sourceTypeParameters = plan.SourceTypeParameters,
            sourceTypeParameterRoles = plan.SourceTypeParameterRoles,
            parameters,
            returnType = write ? new { kind = "void" } : fieldType,
            targetInvocation = StaticMemberTargetInvocation(
                plan,
                operation,
                write ? 0 : (int?)null),
        };
        return new
        {
            kind = "function",
            sourceName = identity.SourceName,
            targetId = adapterId,
            metadataName = StaticAdapterMetadataName(type, field.Name, operation),
            targetName = field.Name,
            targetBindingId = TargetId(type),
            targetDeclaringType,
            signatures = new[] { signature },
        };
    }

    StaticAdapterTypeParameterPlan? StaticAdapterTypeParameterPlanFor(
        Type type,
        MethodInfo? method)
    {
        var context = method is null
            ? GenericParameterContext.Empty
            : GenericParameterContext.ForMethod(method, type);
        var declaringParameters = TypeParameters(type);
        var methodParameters = method is null
            ? Array.Empty<object>()
            : MethodTypeParameters(method, context);
        var requiresDispatch = method is not null &&
            type.IsInterface &&
            (method.IsAbstract || method.IsVirtual);
        object[] dispatchParameters;
        object receiver;
        if (requiresDispatch)
        {
            var contract = TypeRef(
                type,
                requireDelegateSourceShape: false,
                genericParameters: context);
            if (contract is null)
            {
                return null;
            }
            var dispatchName = StaticDispatchTypeParameterName(type, method!, context);
            dispatchParameters = new object[]
            {
                new
                {
                    name = dispatchName,
                    constraints = new[] { new { kind = "implements", contract } },
                },
            };
            receiver = new { kind = "invocation-type-argument", index = 0 };
        }
        else
        {
            dispatchParameters = Array.Empty<object>();
            receiver = new { kind = "declaring-type" };
        }
        var sourceTypeParameters = dispatchParameters
            .Concat(declaringParameters)
            .Concat(methodParameters)
            .ToArray();
        var bindingStart = dispatchParameters.Length;
        var methodStart = bindingStart + declaringParameters.Length;
        return new StaticAdapterTypeParameterPlan(
            context,
            sourceTypeParameters,
            new
            {
                binding = Enumerable.Range(bindingStart, declaringParameters.Length).ToArray(),
                method = Enumerable.Range(methodStart, methodParameters.Length).ToArray(),
                invocation = Enumerable.Range(0, dispatchParameters.Length).ToArray(),
            },
            receiver);
    }

    static object StaticMemberTargetInvocation(
        StaticAdapterTypeParameterPlan plan,
        string operation,
        int? valueParameterIndex = null)
    {
        return new
        {
            kind = "static-member",
            operation,
            receiver = plan.Receiver,
            valueParameterIndex,
        };
    }

    string StaticDispatchTypeParameterName(
        Type type,
        MethodInfo method,
        GenericParameterContext context)
    {
        var names = type.GetGenericArguments()
            .Where(parameter => parameter.IsGenericParameter)
            .Select(parameter => parameter.Name)
            .Concat(method.GetGenericArguments()
                .Where(parameter => parameter.IsGenericParameter)
                .Select(context.SourceName))
            .ToHashSet(StringComparer.Ordinal);
        var name = "TDispatch";
        for (var suffix = 2; names.Contains(name); suffix++)
        {
            name = $"TDispatch{suffix}";
        }
        return name;
    }

    string StaticAdapterSourceName(
        Type type,
        string operation,
        string memberName)
    {
        var typeName = ProviderSourceTypeName(type);
        var operationName = Identifier(operation);
        return $"__dotnet_{typeName.Length}_{typeName}_{operationName.Length}_{operationName}_{memberName.Length}_{memberName}";
    }

    StaticSourceAdapterIdentity StaticAdapterIdentity(
        Type type,
        string operation,
        string memberName)
    {
        return new StaticSourceAdapterIdentity(
            StaticAdapterSourceName(type, operation, memberName),
            StaticAdapterId(type, memberName, operation));
    }

    static string StaticAdapterId(Type type, string targetName, string operation)
    {
        return $"{TargetId(type)}.{targetName}#source-{operation}";
    }

    static string StaticAdapterMetadataName(Type type, string targetName, string operation)
    {
        return $"{MetadataName(type)}.{targetName}#source-{operation}";
    }

    sealed record StaticAdapterTypeParameterPlan(
        GenericParameterContext Context,
        object[] SourceTypeParameters,
        object SourceTypeParameterRoles,
        object Receiver);

}
