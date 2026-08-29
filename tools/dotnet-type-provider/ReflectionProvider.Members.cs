using System.Collections.Concurrent;
using System.Globalization;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

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

    IEnumerable<object> Members(Type type)
    {
        foreach (var member in Constructors(type))
        {
            yield return member;
        }

        foreach (var member in Properties(type))
        {
            yield return member;
        }

        foreach (var member in Fields(type))
        {
            yield return member;
        }

        foreach (var member in Events(type))
        {
            yield return member;
        }

        foreach (var group in Methods(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = SourceMemberName(first.Name),
                targetName = first.Name,
                targetId = $"{TargetId(type)}.{first.Name}",
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }

        foreach (var member in ExtensionProjectionMembers(type))
        {
            yield return member;
        }

        foreach (var group in Operators(type).GroupBy(OperatorProjectionGroupKey))
        {
            var first = group.First();
            var projection = OperatorSourceProjectionFor(first);
            if (projection is null)
            {
                continue;
            }
            var signatures = group.Select(method =>
            {
                var selected = OperatorSourceProjectionFor(method);
                return selected is null
                    ? null
                    : MethodSignature(method, targetInvocation: new
                    {
                        kind = "native-operator",
                        form = selected.Form,
                        @operator = selected.Operator,
                        operandParameterIndexes = Enumerable.Range(0, method.GetParameters().Length).ToArray(),
                        @checked = selected.Checked ? true : (bool?)null,
                    });
            }).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "operator",
                sourceName = projection.SourceName,
                targetName = first.Name,
                targetId = $"{TargetId(type)}.{first.Name}",
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                sourceStatic = false,
                sourceProjection = "operator-adapter",
                receiverPassing = "target-parameter",
                sourceReceiverParameterIndex = projection.ReceiverParameterIndex,
                signatures,
            };
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
            typeNullabilityMetadata: NullableMetadata.ForField(field));
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

    IEnumerable<object> ConversionOperators(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(IsConversionOperator)
            .Where(method => UnsupportedOperatorReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var parameters = method.GetParameters();
            if (parameters.Length != 1)
            {
                continue;
            }
            var sourceType = TypeRef(
                UnwrapByRef(parameters[0].ParameterType),
                typeNullability: nullability.Create(parameters[0]),
                typeNullabilityMetadata: NullableMetadata.ForParameter(parameters[0]));
            var targetType = TypeRef(
                method.ReturnType,
                typeNullability: nullability.Create(method.ReturnParameter),
                typeNullabilityMetadata: NullableMetadata.ForParameter(method.ReturnParameter));
            if (sourceType is null || targetType is null)
            {
                continue;
            }
            yield return new
            {
                id = MethodId(method),
                targetName = method.Name,
                metadataName = MethodMetadataId(method),
                conversionKind = method.Name == "op_Implicit" ? "implicit" : "explicit",
                sourceType,
                targetType,
            };
        }
    }

    object[] UnsupportedMembers(Type type)
    {
        return UnsupportedConstructors(type)
            .Concat(UnsupportedProperties(type))
            .Concat(UnsupportedFields(type))
            .Concat(UnsupportedMethods(type))
            .Concat(UnsupportedOperators(type))
            .Concat(UnsupportedSourceEvents(type))
            .ToArray();
    }

    IEnumerable<object> Constructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var signature = ConstructorSignature(type, constructor);
            if (signature is null)
            {
                continue;
            }
            yield return new
            {
                kind = "constructor",
                sourceName = "constructor",
                targetName = ".ctor",
                targetId = ConstructorId(constructor),
                metadataName = ConstructorMetadataName(constructor),
                signatures = new[] { signature },
            };
        }
    }

    IEnumerable<object> UnsupportedConstructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var reason = UnsupportedConstructorReason(constructor);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "constructor",
                "constructor",
                ".ctor",
                ConstructorId(constructor),
                ConstructorMetadataName(constructor),
                false,
                reason);
        }
    }

    string? UnsupportedConstructorReason(ConstructorInfo constructor)
    {
        return UnsupportedParametersReason(constructor.GetParameters(), "Constructor signature");
    }

    IEnumerable<object> Properties(Type type)
    {
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            if (UnsupportedPropertyReason(type, property) is not null)
            {
                continue;
            }
            var accessors = property.GetAccessors(false);
            if (accessors.Length == 0)
            {
                continue;
            }
            var attributes = AttributeFacts(property.GetCustomAttributesData(), "property", $"{TargetId(type)}.{property.Name}");
            var indexParameters = property.GetIndexParameters();
            if (indexParameters.Length > 0)
            {
                if (indexParameters.Length > 1)
                {
                    foreach (var adapter in MultiParameterIndexerMembers(type, property, attributes))
                    {
                        yield return adapter;
                    }
                    continue;
                }
                var targetId = $"{TargetId(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeTargetId(UnwrapByRef(parameter.ParameterType))))})";
                var metadataName = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})";
                var parameters = Parameters(indexParameters, targetId);
                var returnNullability = nullability.Create(property);
                var returnNullabilityMetadata = NullableMetadata.ForProperty(property);
                var targetReturnType = TypeRef(
                    UnwrapByRef(property.PropertyType),
                    typeNullability: returnNullability,
                    typeNullabilityMetadata: returnNullabilityMetadata);
                var indexerReturnPassing = ReturnPassingMode(property.GetMethod?.ReturnParameter);
                var returnType = indexerReturnPassing is null
                    ? targetReturnType
                    : ByRefReturnSourceType(
                        property.PropertyType,
                        GenericParameterContext.Empty,
                        returnNullability,
                        returnNullabilityMetadata);
                if (parameters is null || returnType is null || targetReturnType is null)
                {
                    continue;
                }
                yield return new
                {
                    kind = "indexer",
                    sourceName = SourceMemberName(property.Name),
                    targetName = property.Name,
                    targetId,
                    metadataName,
                    @static = accessors[0].IsStatic ? true : (bool?)null,
                    readable = HasPublicGetter(property) ? true : (bool?)null,
                    writable = HasPublicSetter(property) ? true : (bool?)null,
                    attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                    unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
                    signatures = new[]
                    {
                        new
                        {
                            id = targetId,
                            sourceId = targetId,
                            targetName = property.Name,
                            parameters,
                            returnType,
                            targetReturnType = indexerReturnPassing is null ? null : targetReturnType,
                            returnPassing = indexerReturnPassing,
                        },
                    },
                };
                continue;
            }

            var propertyNullability = nullability.Create(property);
            var propertyNullabilityMetadata = NullableMetadata.ForProperty(property);
            var typeRef = TypeRef(
                UnwrapByRef(property.PropertyType),
                typeNullability: propertyNullability,
                typeNullabilityMetadata: propertyNullabilityMetadata);
            var returnPassing = ReturnPassingMode(property.GetMethod?.ReturnParameter);
            var sourceType = returnPassing is null
                ? null
                : ByRefReturnSourceType(
                    property.PropertyType,
                    GenericParameterContext.Empty,
                    propertyNullability,
                    propertyNullabilityMetadata);
            if (typeRef is null || (returnPassing is not null && sourceType is null))
            {
                continue;
            }
            var isStatic = accessors[0].IsStatic;
            if (isStatic && RequiresStaticSourceAdapter(type))
            {
                continue;
            }
            yield return new
            {
                kind = "property",
                sourceName = SourceMemberName(property.Name),
                targetName = property.Name,
                targetId = $"{TargetId(type)}.{property.Name}",
                metadataName = $"{MetadataName(type)}.{property.Name}",
                @static = isStatic ? true : (bool?)null,
                readable = HasPublicGetter(property) ? true : (bool?)null,
                writable = HasPublicSetter(property) ? true : (bool?)null,
                type = typeRef,
                sourceType,
                returnPassing,
                attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            };
        }
    }

    IEnumerable<object> MultiParameterIndexerMembers(Type type, PropertyInfo property, AttributeCollection attributes)
    {
        var indexParameters = property.GetIndexParameters();
        var targetId = $"{TargetId(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeTargetId(UnwrapByRef(parameter.ParameterType))))})";
        var metadataName = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})";
        var returnNullability = nullability.Create(property);
        var returnNullabilityMetadata = NullableMetadata.ForProperty(property);
        var targetReturnType = TypeRef(
            UnwrapByRef(property.PropertyType),
            typeNullability: returnNullability,
            typeNullabilityMetadata: returnNullabilityMetadata);
        var returnPassing = ReturnPassingMode(property.GetMethod?.ReturnParameter);
        var sourceReturnType = returnPassing is null
            ? targetReturnType
            : ByRefReturnSourceType(
                property.PropertyType,
                GenericParameterContext.Empty,
                returnNullability,
                returnNullabilityMetadata);
        if (targetReturnType is null || sourceReturnType is null)
        {
            yield break;
        }
        if (property.GetMethod is { IsPublic: true } getter)
        {
            var getId = $"{targetId}#get";
            var parameters = Parameters(getter.GetParameters(), getId);
            if (parameters is not null)
            {
                yield return new
                {
                    kind = "method",
                    sourceName = "get",
                    targetName = property.Name,
                    targetId = getId,
                    metadataName = $"{metadataName}#get",
                    @static = getter.IsStatic ? true : (bool?)null,
                    signatures = new[]
                    {
                        new
                        {
                            id = getId,
                            sourceId = getId,
                            targetName = property.Name,
                            parameters,
                            returnType = sourceReturnType,
                            targetReturnType = returnPassing is null ? null : targetReturnType,
                            returnPassing,
                            targetInvocation = new
                            {
                                kind = "native-indexer-get",
                                indexParameterIndexes = Enumerable.Range(0, indexParameters.Length).ToArray(),
                            },
                        },
                    },
                    attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                    unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
                };
            }
        }
        if (property.SetMethod is { IsPublic: true } setter)
        {
            var setId = $"{targetId}#set";
            var parameters = Parameters(setter.GetParameters(), setId);
            if (parameters is not null)
            {
                yield return new
                {
                    kind = "method",
                    sourceName = "set",
                    targetName = property.Name,
                    targetId = setId,
                    metadataName = $"{metadataName}#set",
                    @static = setter.IsStatic ? true : (bool?)null,
                    signatures = new[]
                    {
                        new
                        {
                            id = setId,
                            sourceId = setId,
                            targetName = property.Name,
                            parameters,
                            returnType = new { kind = "void" },
                            targetInvocation = new
                            {
                                kind = "native-indexer-set",
                                indexParameterIndexes = Enumerable.Range(0, indexParameters.Length).ToArray(),
                                valueParameterIndex = indexParameters.Length,
                            },
                        },
                    },
                    attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                    unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
                };
            }
        }
    }

    IEnumerable<object> UnsupportedProperties(Type type)
    {
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            var reason = UnsupportedPropertyReason(type, property);
            if (reason is null)
            {
                continue;
            }
            var accessors = property.GetAccessors(false);
            var isStatic = accessors.Length > 0 && accessors[0].IsStatic;
            var indexParameters = property.GetIndexParameters();
            var memberKind = indexParameters.Length > 0 ? "indexer" : "property";
            var targetId = indexParameters.Length > 0
                ? $"{TargetId(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeTargetId(UnwrapByRef(parameter.ParameterType))))})"
                : $"{TargetId(type)}.{property.Name}";
            var metadataName = indexParameters.Length > 0
                ? $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})"
                : $"{MetadataName(type)}.{property.Name}";
            yield return UnsupportedMember(
                memberKind,
                SourceMemberName(property.Name),
                property.Name,
                targetId,
                metadataName,
                isStatic,
                reason);
        }
    }

    string? UnsupportedPropertyReason(Type type, PropertyInfo property)
    {
        if (!IsSourceIdentifier(SourceMemberName(property.Name)))
        {
            return $"CLR property name '{property.Name}' is not an exact source identifier; provider aliases must be declared explicitly rather than synthesized.";
        }
        var accessors = property.GetAccessors(false);
        if (accessors.Length == 0)
        {
            return "Property has no public accessor visible to the provider.";
        }
        var indexParameters = property.GetIndexParameters();
        if (indexParameters.Length > 0)
        {
            if (Parameters(indexParameters) is null)
            {
                return UnsupportedParametersReason(indexParameters, "Indexer signature")!;
            }
            if (TypeRef(
                UnwrapByRef(property.PropertyType),
                typeNullability: nullability.Create(property),
                typeNullabilityMetadata: NullableMetadata.ForProperty(property)) is null)
            {
                return $"Indexer return type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(property.PropertyType)}";
            }
        }
        if (TypeRef(
            UnwrapByRef(property.PropertyType),
            typeNullability: nullability.Create(property),
            typeNullabilityMetadata: NullableMetadata.ForProperty(property)) is null)
        {
            return $"Property type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(property.PropertyType)}";
        }
        if (
            !HasPublicGetter(property) &&
            !(accessors[0].IsStatic && RequiresStaticSourceAdapter(type) &&
              HasPublicSetter(property))
        )
        {
            return "Write-only properties require a provider write-only member declaration model before they can be exposed safely.";
        }
        return null;
    }

    IEnumerable<object> Fields(Type type)
    {
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            if (field.IsSpecialName)
            {
                continue;
            }
            var typeRef = TypeRef(
                field.FieldType,
                typeNullability: nullability.Create(field),
                typeNullabilityMetadata: NullableMetadata.ForField(field));
            if (typeRef is null)
            {
                continue;
            }
            if (field.IsStatic && RequiresStaticSourceAdapter(type))
            {
                continue;
            }
            var attributes = AttributeFacts(field.GetCustomAttributesData(), "field", $"{TargetId(type)}.{field.Name}");
            yield return new
            {
                kind = "field",
                sourceName = SourceMemberName(field.Name),
                targetName = field.Name,
                targetId = $"{TargetId(type)}.{field.Name}",
                metadataName = $"{MetadataName(type)}.{field.Name}",
                @static = field.IsStatic ? true : (bool?)null,
                readable = true,
                writable = !field.IsLiteral && !field.IsInitOnly ? true : (bool?)null,
                type = typeRef,
                attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            };
        }
    }

    IEnumerable<object> UnsupportedFields(Type type)
    {
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            var reason = UnsupportedFieldReason(type, field);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "field",
                SourceMemberName(field.Name),
                field.Name,
                $"{TargetId(type)}.{field.Name}",
                $"{MetadataName(type)}.{field.Name}",
                field.IsStatic,
                reason);
        }
    }

    string? UnsupportedFieldReason(Type type, FieldInfo field)
    {
        if (!IsSourceIdentifier(SourceMemberName(field.Name)))
        {
            return $"CLR field name '{field.Name}' is not an exact source identifier; provider aliases must be declared explicitly rather than synthesized.";
        }
        if (field.IsSpecialName)
        {
            return "Special-name fields are target-only CLR implementation details and are not exposed as source declarations.";
        }
        if (TypeRef(
            field.FieldType,
            typeNullability: nullability.Create(field),
            typeNullabilityMetadata: NullableMetadata.ForField(field)) is null)
        {
            return $"Field type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(field.FieldType)}";
        }
        return null;
    }

    IEnumerable<object> Events(Type type)
    {
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(eventInfo => eventInfo.Name, StringComparer.Ordinal))
        {
            var accessor = EventAccessor(eventInfo);
            if (accessor?.IsStatic == true && RequiresStaticSourceAdapter(type))
            {
                continue;
            }
            foreach (var adapter in EventSubscriptionMembers(type, eventInfo))
            {
                yield return adapter;
            }
        }
    }

    IEnumerable<object> EventSubscriptionMembers(Type type, EventInfo eventInfo)
    {
        var eventId = EventTargetId(type, eventInfo);
        var metadataName = EventMetadataName(type, eventInfo);
        foreach (var (accessor, operation, sourcePrefix) in new[]
        {
            (eventInfo.AddMethod, "native-event-add", "add"),
            (eventInfo.RemoveMethod, "native-event-remove", "remove"),
        })
        {
            if (accessor is not { IsPublic: true })
            {
                continue;
            }
            var id = $"{eventId}#{sourcePrefix}";
            var parameters = Parameters(accessor.GetParameters(), id);
            if (parameters is null || parameters.Length != 1)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = $"{sourcePrefix}{eventInfo.Name}",
                targetName = eventInfo.Name,
                targetId = id,
                metadataName = $"{metadataName}#{sourcePrefix}",
                @static = accessor.IsStatic ? true : (bool?)null,
                signatures = new[]
                {
                    new
                    {
                        id,
                        sourceId = id,
                        targetName = eventInfo.Name,
                        parameters,
                        returnType = new { kind = "void" },
                        targetInvocation = new
                        {
                            kind = operation,
                            handlerParameterIndex = 0,
                        },
                    },
                },
            };
        }
    }

    IEnumerable<object> UnsupportedSourceEvents(Type type)
    {
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(eventInfo => eventInfo.Name, StringComparer.Ordinal))
        {
            var reason = UnsupportedSourceEventReason(eventInfo);
            if (reason is null)
            {
                continue;
            }
            var accessor = EventAccessor(eventInfo);
            yield return new
            {
                kind = "unsupported-member",
                memberKind = "event",
                sourceName = SourceMemberName(eventInfo.Name),
                targetName = eventInfo.Name,
                targetId = EventTargetId(type, eventInfo),
                metadataName = EventMetadataName(type, eventInfo),
                @static = accessor?.IsStatic == true ? true : (bool?)null,
                reason,
            };
        }
    }

    string? UnsupportedSourceEventReason(EventInfo eventInfo)
    {
        if (!IsSourceIdentifier(SourceMemberName(eventInfo.Name)))
        {
            return $"CLR event name '{eventInfo.Name}' is not an exact source identifier; provider aliases must be declared explicitly rather than synthesized.";
        }
        var eventHandlerType = eventInfo.EventHandlerType;
        if (eventHandlerType is null)
        {
            return "Event has no provider-visible event-handler type, so no source event declaration can be generated.";
        }
        if (TypeRef(
            eventHandlerType,
            requireDelegateSourceShape: false,
            typeNullability: nullability.Create(eventInfo),
            typeNullabilityMetadata: NullableMetadata.ForEvent(eventInfo)) is null)
        {
            return $"Event handler type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(eventHandlerType)}";
        }
        if (EventAccessor(eventInfo) is null)
        {
            return "Event has no public add/remove accessor visible to the provider.";
        }
        return null;
    }

    static bool HasPublicGetter(PropertyInfo property)
    {
        return property.GetMethod is not null && property.GetMethod.IsPublic;
    }

    static bool HasPublicSetter(PropertyInfo property)
    {
        return property.SetMethod is not null && property.SetMethod.IsPublic;
    }

    IEnumerable<MethodInfo> Methods(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => !method.IsStatic || !RequiresStaticSourceAdapter(type))
            .Where(method => UnsupportedMethodReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    IEnumerable<object> ExtensionProjectionMembers(Type receiverType)
    {
        foreach (var group in ExtensionProjectionMethods(receiverType).GroupBy(ExtensionProjectionGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method, GenericParameterContext.ForExtensionProjection(method, receiverType))).Where(signature => signature is not null).Cast<object>().ToArray();
            var targetDeclaringType = TypeRef(first.DeclaringType!, requireDelegateSourceShape: false);
            if (signatures.Length == 0 || targetDeclaringType is null)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = SourceMemberName(first.Name),
                targetName = first.Name,
                targetId = $"{TargetId(first.DeclaringType!)}.{first.Name}",
                metadataName = $"{MetadataName(first.DeclaringType!)}.{first.Name}",
                @static = true,
                sourceStatic = false,
                sourceProjection = "extension-method",
                receiverPassing = "target-parameter",
                sourceReceiverParameterIndex = 0,
                targetDeclaringType,
                signatures,
            };
        }
    }

    IEnumerable<MethodInfo> ExtensionProjectionMethods(Type receiverType)
    {
        return activeModuleTypes
            .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly))
            .Where(method => IsExtensionMethod(method))
            .Where(method => !method.IsSpecialName)
            .Where(method => ExtensionReceiverApplies(receiverType, method))
            .Where(method => UnsupportedMethodReason(method.DeclaringType!, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    static string ExtensionProjectionGroupKey(MethodInfo method)
    {
        return $"{TargetId(method.DeclaringType!)}:{method.Name}";
    }

    static bool ExtensionReceiverApplies(Type receiverType, MethodInfo method)
    {
        var receiverParameter = method.GetParameters().FirstOrDefault();
        if (receiverParameter is null)
        {
            return false;
        }
        return ReceiverTypeAccepts(UnwrapByRef(receiverParameter.ParameterType), receiverType);
    }

    static bool ReceiverTypeAccepts(Type receiverParameterType, Type receiverType)
    {
        if (receiverParameterType.IsAssignableFrom(receiverType))
        {
            return true;
        }
        if (receiverParameterType.IsGenericType)
        {
            var receiverParameterDefinition = receiverParameterType.GetGenericTypeDefinition();
            if (receiverType.IsGenericType && receiverType.GetGenericTypeDefinition() == receiverParameterDefinition)
            {
                return true;
            }
            return receiverType.GetInterfaces().Any(candidate =>
                candidate.IsGenericType && candidate.GetGenericTypeDefinition() == receiverParameterDefinition);
        }
        return false;
    }

    IEnumerable<MethodInfo> Operators(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .Where(method => !IsConversionOperator(method))
            .Where(method => UnsupportedOperatorReason(type, method) is null)
            .OrderBy(OperatorId, StringComparer.Ordinal);
    }

    static string OperatorProjectionGroupKey(MethodInfo method)
    {
        var projection = OperatorSourceProjectionFor(method);
        return projection is null
            ? $"unsupported:{OperatorId(method)}"
            : $"{projection.SourceName}:{projection.ReceiverParameterIndex}";
    }

    static OperatorSourceProjection? OperatorSourceProjectionFor(MethodInfo method)
    {
        var descriptor = method.Name switch
        {
            "op_UnaryPlus" => ("operatorPlus", "prefix", "unary-plus", false),
            "op_UnaryNegation" => ("operatorNegate", "prefix", "unary-negation", false),
            "op_CheckedUnaryNegation" => ("checkedOperatorNegate", "prefix", "unary-negation", true),
            "op_LogicalNot" => ("operatorNot", "prefix", "logical-not", false),
            "op_OnesComplement" => ("operatorOnesComplement", "prefix", "ones-complement", false),
            "op_Addition" => ("operatorAdd", "binary", "addition", false),
            "op_CheckedAddition" => ("checkedOperatorAdd", "binary", "addition", true),
            "op_Subtraction" => ("operatorSubtract", "binary", "subtraction", false),
            "op_CheckedSubtraction" => ("checkedOperatorSubtract", "binary", "subtraction", true),
            "op_Multiply" => ("operatorMultiply", "binary", "multiplication", false),
            "op_CheckedMultiply" => ("checkedOperatorMultiply", "binary", "multiplication", true),
            "op_Division" => ("operatorDivide", "binary", "division", false),
            "op_Modulus" => ("operatorModulus", "binary", "modulus", false),
            "op_BitwiseAnd" => ("operatorBitwiseAnd", "binary", "bitwise-and", false),
            "op_BitwiseOr" => ("operatorBitwiseOr", "binary", "bitwise-or", false),
            "op_ExclusiveOr" => ("operatorExclusiveOr", "binary", "exclusive-or", false),
            "op_LeftShift" => ("operatorLeftShift", "binary", "left-shift", false),
            "op_RightShift" => ("operatorRightShift", "binary", "right-shift", false),
            "op_UnsignedRightShift" => ("operatorUnsignedRightShift", "binary", "unsigned-right-shift", false),
            "op_Equality" => ("operatorEquals", "binary", "equality", false),
            "op_Inequality" => ("operatorNotEquals", "binary", "inequality", false),
            "op_LessThan" => ("operatorLessThan", "binary", "less-than", false),
            "op_LessThanOrEqual" => ("operatorLessThanOrEqual", "binary", "less-than-or-equal", false),
            "op_GreaterThan" => ("operatorGreaterThan", "binary", "greater-than", false),
            "op_GreaterThanOrEqual" => ("operatorGreaterThanOrEqual", "binary", "greater-than-or-equal", false),
            _ => ((string SourceName, string Form, string Operator, bool Checked)?)null,
        };
        if (descriptor is null)
        {
            return null;
        }
        var parameters = method.GetParameters();
        var expectedArity = descriptor.Value.Form == "prefix" ? 1 : 2;
        if (parameters.Length != expectedArity || parameters.Any(parameter => parameter.ParameterType.IsByRef))
        {
            return null;
        }
        var declaringType = method.DeclaringType!;
        var receiverParameterIndex = Array.FindIndex(parameters, parameter =>
            OperatorOperandBelongsToDeclaringType(UnwrapByRef(parameter.ParameterType), declaringType));
        return receiverParameterIndex < 0
            ? null
            : new OperatorSourceProjection(
                descriptor.Value.SourceName,
                descriptor.Value.Form,
                descriptor.Value.Operator,
                descriptor.Value.Checked,
                receiverParameterIndex);
    }

    static bool OperatorOperandBelongsToDeclaringType(Type operandType, Type declaringType)
    {
        if (operandType == declaringType)
        {
            return true;
        }
        return declaringType.IsGenericTypeDefinition &&
            operandType.IsGenericType &&
            operandType.GetGenericTypeDefinition() == declaringType;
    }

    sealed record OperatorSourceProjection(
        string SourceName,
        string Form,
        string Operator,
        bool Checked,
        int ReceiverParameterIndex);

    IEnumerable<object> UnsupportedMethods(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var reason = UnsupportedMethodReason(type, method);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "method",
                SourceMemberName(method.Name),
                method.Name,
                MethodId(method),
                MethodMetadataId(method),
                method.IsStatic,
                reason);
        }
    }

    string? UnsupportedMethodReason(Type type, MethodInfo method)
    {
        if (!IsSourceIdentifier(SourceMemberName(method.Name)))
        {
            return $"CLR method name '{method.Name}' is not an exact source identifier; provider aliases must be declared explicitly rather than synthesized.";
        }
        if (Parameters(method.GetParameters()) is null)
        {
            return UnsupportedParametersReason(method.GetParameters(), "Method signature")!;
        }
        return UnsupportedReturnTypeReason(method, "Method return type");
    }

    IEnumerable<object> UnsupportedOperators(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var reason = UnsupportedOperatorReason(type, method);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "operator",
                SourceMemberName(method.Name),
                method.Name,
                OperatorId(method),
                MethodMetadataId(method),
                true,
                reason);
        }
    }

    string? UnsupportedOperatorReason(Type type, MethodInfo method)
    {
        if (IsConversionOperator(method) && method.GetParameters().Length != 1)
        {
            return "Conversion operators require exactly one source parameter before provider conversion facts can be exposed safely.";
        }
        if (OperatorSourceProjectionFor(method) is null)
        {
            return "Operator has no exact legal TypeScript adapter and C# operator-expression projection.";
        }
        if (Parameters(method.GetParameters()) is null)
        {
            return UnsupportedParametersReason(method.GetParameters(), "Operator signature")!;
        }
        return UnsupportedReturnTypeReason(method, "Operator return type");
    }

    string? UnsupportedReturnTypeReason(MethodInfo method, string context)
    {
        var returnType = method.ReturnType;
        var returnNullability = nullability.Create(method.ReturnParameter);
        var returnNullabilityMetadata = NullableMetadata.ForParameter(method.ReturnParameter);
        var genericParameters = GenericParameterContext.ForMethod(method, method.DeclaringType!);
        var targetType = TypeRef(
            UnwrapByRef(returnType),
            genericParameters: genericParameters,
            typeNullability: returnNullability,
            typeNullabilityMetadata: returnNullabilityMetadata);
        var sourceType = returnType.IsByRef
            ? ByRefReturnSourceType(
                returnType,
                genericParameters,
                returnNullability,
                returnNullabilityMetadata)
            : targetType;
        return targetType is null || sourceType is null
            ? $"{context} cannot be represented as closed .NET target type facts. {TypeRefFailureReason(returnType)}"
            : null;
    }

    static bool IsConversionOperator(MethodInfo method)
    {
        return method.IsSpecialName &&
            (method.Name == "op_Implicit" || method.Name == "op_Explicit");
    }

    static object UnsupportedMember(
        string memberKind,
        string sourceName,
        string targetName,
        string targetId,
        string metadataName,
        bool isStatic,
        string reason)
    {
        return new
        {
            kind = "unsupported-member",
            memberKind,
            sourceName,
            targetName,
            targetId,
            metadataName,
            @static = isStatic ? true : (bool?)null,
            reason,
        };
    }

    string? UnsupportedParametersReason(ParameterInfo[] parameters, string context)
    {
        foreach (var parameter in parameters)
        {
            var parameterType = UnwrapByRef(parameter.ParameterType);
            if (TypeRef(
                parameterType,
                typeNullability: nullability.Create(parameter),
                typeNullabilityMetadata: NullableMetadata.ForParameter(parameter)) is null)
            {
                return $"{context} contains parameter '{parameter.Name ?? ""}' with type '{TypeMetadataName(parameterType)}' that cannot be represented as closed .NET target type facts. {TypeRefFailureReason(parameterType)}";
            }
        }
        return null;
    }

    static bool IsExtensionMethod(MethodInfo method)
    {
        return method.IsStatic &&
            HasRuntimeAttribute(method, typeof(System.Runtime.CompilerServices.ExtensionAttribute));
    }

    object? MethodSignature(
        MethodInfo method,
        GenericParameterContext? genericParameters = null,
        object? targetInvocation = null,
        StaticAdapterTypeParameterPlan? sourceTypeParameterPlan = null,
        string? targetName = null)
    {
        genericParameters ??= GenericParameterContext.ForMethod(method, method.DeclaringType!);
        var id = method.IsSpecialName && method.Name.StartsWith("op_", StringComparison.Ordinal) && !IsConversionOperator(method)
            ? OperatorId(method)
            : MethodId(method);
        var parameters = Parameters(method.GetParameters(), id, genericParameters);
        var returnNullability = nullability.Create(method.ReturnParameter);
        var returnNullabilityMetadata = NullableMetadata.ForParameter(method.ReturnParameter);
        var targetReturnType = TypeRef(
            UnwrapByRef(method.ReturnType),
            genericParameters: genericParameters,
            typeNullability: returnNullability,
            typeNullabilityMetadata: returnNullabilityMetadata);
        var returnPassing = ReturnPassingMode(method.ReturnParameter);
        var returnType = returnPassing is null
            ? targetReturnType
            : ByRefReturnSourceType(
                method.ReturnType,
                genericParameters,
                returnNullability,
                returnNullabilityMetadata);
        if (parameters is null || returnType is null || targetReturnType is null)
        {
            return null;
        }
        var typeParameters = MethodTypeParameters(method, genericParameters);
        var attributes = AttributeFacts(method.GetCustomAttributesData(), "method", id);
        var returnAttributes = AttributeFacts(method.ReturnParameter.GetCustomAttributesData(), "return", $"{id}:return");
        var sourceId = SourceSignatureId(method, id);
        return new
        {
            id,
            sourceId,
            targetName = targetName ?? method.Name,
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            sourceTypeParameters = sourceTypeParameterPlan?.SourceTypeParameters,
            sourceTypeParameterRoles = sourceTypeParameterPlan?.SourceTypeParameterRoles,
            parameters,
            returnType,
            targetReturnType = returnPassing is null ? null : targetReturnType,
            returnPassing,
            returnAttributes = returnAttributes.Supported.Length == 0 ? null : returnAttributes.Supported,
            unsupportedReturnAttributes = returnAttributes.Unsupported.Length == 0 ? null : returnAttributes.Unsupported,
            targetInvocation,
        };
    }

    string SourceSignatureId(MethodInfo method, string id)
    {
        if (method.IsStatic || !method.IsVirtual)
        {
            return id;
        }
        var baseDefinition = MetadataBaseDefinition(method);
        if (baseDefinition == method ||
            baseDefinition.DeclaringType == method.DeclaringType ||
            !baseDefinition.IsPublic)
        {
            return id;
        }
        return MethodId(baseDefinition);
    }

    static MethodInfo MetadataBaseDefinition(MethodInfo method)
    {
        if ((method.Attributes & MethodAttributes.NewSlot) != 0)
        {
            return method;
        }
        var definition = method;
        for (var baseType = method.DeclaringType?.BaseType; baseType is not null; baseType = baseType.BaseType)
        {
            var matches = baseType
                .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(candidate => candidate.IsVirtual && MethodSlotKey(candidate) == MethodSlotKey(method))
                .ToArray();
            if (matches.Length > 1)
            {
                throw new InvalidOperationException($"Virtual method '{MethodId(method)}' has more than one metadata base-slot candidate on '{TypeMetadataName(baseType)}'.");
            }
            if (matches.Length == 1)
            {
                definition = matches[0];
            }
        }
        return definition;
    }

    static string MethodSlotKey(MethodInfo method)
    {
        return $"{method.Name}`{method.GetGenericArguments().Length}({string.Join(",", method.GetParameters().Select(parameter => $"{PassingMode(parameter)}:{TypeSlotKey(UnwrapByRef(parameter.ParameterType))}"))})";
    }

    static string TypeSlotKey(Type type)
    {
        if (type.IsGenericParameter)
        {
            return type.DeclaringMethod is null
                ? $"!{type.GenericParameterPosition}"
                : $"!!{type.GenericParameterPosition}";
        }
        if (type.IsArray)
        {
            return $"{TypeSlotKey(type.GetElementType()!)}{ArrayRankSuffix(type)}";
        }
        if (type.IsPointer)
        {
            return $"{TypeSlotKey(type.GetElementType()!)}*";
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            return $"{TargetId(type.GetGenericTypeDefinition())}<{string.Join(",", type.GetGenericArguments().Select(TypeSlotKey))}>";
        }
        return TargetId(type);
    }

    object? ConstructorSignature(Type type, ConstructorInfo constructor)
    {
        var id = ConstructorId(constructor);
        var parameters = Parameters(constructor.GetParameters(), id);
        if (parameters is null)
        {
            return null;
        }
        var attributes = AttributeFacts(constructor.GetCustomAttributesData(), "constructor", id);
        return new
        {
            id,
            sourceId = id,
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            parameters,
        };
    }

    object[]? Parameters(
        ParameterInfo[] parameters,
        string? ownerId = null,
        GenericParameterContext? genericParameters = null,
        GenericNullabilityContext? genericNullability = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        genericNullability ??= GenericNullabilityContext.Empty;
        var result = new List<object>();
        for (var index = 0; index < parameters.Length; index++)
        {
            var parameter = parameters[index];
            var parameterType = UnwrapByRef(parameter.ParameterType);
            var parameterNullability = genericNullability.Resolve(parameterType, nullability.Create(parameter))
                ?? throw new InvalidOperationException($"Parameter '{parameter.Name ?? index.ToString()}' has no nullability information.");
            var parameterNullabilityMetadata = genericNullability.ResolveMetadata(
                parameterType,
                NullableMetadata.ForParameter(parameter))
                ?? throw new InvalidOperationException($"Parameter '{parameter.Name ?? index.ToString()}' has no nullable metadata information.");
            var type = TypeRef(
                parameterType,
                genericParameters: genericParameters,
                typeNullability: parameterNullability,
                typeNullabilityMetadata: parameterNullabilityMetadata,
                genericNullability: genericNullability);
            if (type is null)
            {
                return null;
            }
            var isParamsArray = HasRuntimeAttribute(parameter, typeof(ParamArrayAttribute)) && parameterType.IsArray;
            var sourceType = NullableParameterSourceTypeRef(
                parameterType,
                isParamsArray,
                parameterNullability,
                parameterNullabilityMetadata,
                genericParameters,
                genericNullability);
            var defaultValue = ParameterDefaultValue(parameter, parameterType, ownerId, index, out var unsupportedDefaultValue);
            var attributes = ownerId is null
                ? null
                : AttributeFacts(parameter.GetCustomAttributesData(), "parameter", $"{ownerId}:parameter:{ParameterIdentifier(parameter, index)}");
            result.Add(new
            {
                name = ParameterIdentifier(parameter, index),
                type,
                sourceType,
                passingMode = PassingMode(parameter),
                optional = parameter.IsOptional ? true : (bool?)null,
                rest = isParamsArray ? true : (bool?)null,
                defaultValue,
                unsupportedDefaultValue,
                attributes = attributes is null || attributes.Supported.Length == 0 ? null : attributes.Supported,
                unsupportedAttributes = attributes is null || attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            });
        }
        return result.ToArray();
    }

    object? ParameterDefaultValue(ParameterInfo parameter, Type parameterType, string? ownerId, int parameterIndex, out object? unsupportedDefaultValue)
    {
        unsupportedDefaultValue = null;
        if (!TryGetRawDefaultValue(parameter, out var value, out var unsupportedReason))
        {
            if (unsupportedReason is not null)
            {
                unsupportedDefaultValue = UnsupportedParameterDefaultValue(parameter, parameterType, ownerId, parameterIndex, unsupportedReason);
            }
            return null;
        }
        if (value is null)
        {
            return new { kind = "null" };
        }

        parameterType = IsNullableShape(parameterType, out var nullableElement) ? nullableElement : parameterType;
        if (parameterType.IsEnum)
        {
            var enumDefaultValue = EnumParameterDefaultValue(parameterType, value);
            if (enumDefaultValue is null)
            {
                unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                    parameter,
                    parameterType,
                    ownerId,
                    parameterIndex,
                    $"Enum default value for '{parameterType.FullName ?? parameterType.Name}' has no deterministic underlying value.");
            }
            return enumDefaultValue;
        }
        if (IsRuntimeType(parameterType, typeof(string)) && value is string stringValue)
        {
            return new { kind = "string", value = stringValue };
        }
        if (IsRuntimeType(parameterType, typeof(string)))
        {
            unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                parameter,
                parameterType,
                ownerId,
                parameterIndex,
                "String default value metadata was not exposed as a deterministic string value.");
            return null;
        }

        var sourcePrimitiveName = SourcePrimitiveName(parameterType);
        if (sourcePrimitiveName is null)
        {
            unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                parameter,
                parameterType,
                ownerId,
                parameterIndex,
                $"Default value type '{parameterType.FullName ?? parameterType.Name}' is outside the supported .NET parameter default value set.");
            return null;
        }
        var sourcePrimitiveValue = SourcePrimitiveDefaultValue(parameterType, value);
        if (sourcePrimitiveValue is null)
        {
            unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                parameter,
                parameterType,
                ownerId,
                parameterIndex,
                $"Source primitive default value '{parameterType.FullName ?? parameterType.Name}' cannot be serialized deterministically.");
            return null;
        }
        return new { kind = "source-primitive", name = sourcePrimitiveName, value = sourcePrimitiveValue };
    }

    object UnsupportedParameterDefaultValue(ParameterInfo parameter, Type parameterType, string? ownerId, int parameterIndex, string reason)
    {
        var owner = parameter.Member.DeclaringType is null
            ? parameter.Member.Name
            : $"{MetadataName(parameter.Member.DeclaringType)}.{parameter.Member.Name}";
        var parameterName = ParameterIdentifier(parameter, parameterIndex);
        var idOwner = ownerId ?? owner;
        return new
        {
            kind = "unsupported-default-value",
            id = $"{idOwner}:parameter:{parameterName}:default",
            parameterName,
            reason,
            evidence = new[]
            {
                new { message = $"Reflected from .NET parameter '{parameter.Name ?? ""}' on '{owner}' with default value type '{parameterType.FullName ?? parameterType.Name}'." },
            },
        };
    }

    static bool TryGetRawDefaultValue(ParameterInfo parameter, out object? value, out string? unsupportedReason)
    {
        value = null;
        unsupportedReason = null;
        try
        {
            if (!parameter.HasDefaultValue)
            {
                return false;
            }
            value = parameter.RawDefaultValue;
        }
        catch (Exception exception) when (
            exception is FormatException ||
            exception is InvalidOperationException ||
            exception is NotSupportedException ||
            exception is ArgumentException)
        {
            value = null;
            unsupportedReason = $"Raw default value metadata could not be read deterministically: {exception.GetType().Name}: {exception.Message}";
            return false;
        }
        return value is not DBNull && value is not Missing;
    }

    static object? EnumParameterDefaultValue(Type enumType, object value)
    {
        var underlyingType = EnumUnderlyingType(enumType);
        var underlyingValue = SourcePrimitiveDefaultValue(underlyingType, value);
        if (underlyingValue is null)
        {
            return null;
        }
        return new
        {
            kind = "enum",
            value = Convert.ToString(underlyingValue, CultureInfo.InvariantCulture),
            fieldName = EnumFieldName(enumType, underlyingType, value),
        };
    }

    static object? SourcePrimitiveDefaultValue(Type primitiveType, object value)
    {
        if (IsRuntimeType(primitiveType, typeof(bool)) && value is bool boolValue)
        {
            return boolValue;
        }
        if (IsRuntimeType(primitiveType, typeof(char)) && value is char charValue)
        {
            return charValue.ToString();
        }
        if (IsRuntimeType(primitiveType, typeof(float)))
        {
            return Convert.ToSingle(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(double)))
        {
            return Convert.ToDouble(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(decimal)))
        {
            return Convert.ToDecimal(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(Half)))
        {
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(nint)))
        {
            return Convert.ToInt64(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(nuint)))
        {
            return Convert.ToUInt64(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        return IsIntegerPrimitive(primitiveType)
            ? InvariantString(value)
            : null;
    }

    static string InvariantString(object value)
    {
        return value is IFormattable formattable
            ? formattable.ToString(null, CultureInfo.InvariantCulture)
            : value.ToString() ?? "";
    }

    static bool IsIntegerPrimitive(Type type)
    {
        return IsRuntimeType(type, typeof(sbyte)) ||
            IsRuntimeType(type, typeof(byte)) ||
            IsRuntimeType(type, typeof(short)) ||
            IsRuntimeType(type, typeof(ushort)) ||
            IsRuntimeType(type, typeof(int)) ||
            IsRuntimeType(type, typeof(uint)) ||
            IsRuntimeType(type, typeof(long)) ||
            IsRuntimeType(type, typeof(ulong)) ||
            IsRuntimeType(type, typeof(Int128)) ||
            IsRuntimeType(type, typeof(UInt128));
    }

    static string PassingMode(ParameterInfo parameter)
    {
        if (!parameter.ParameterType.IsByRef)
        {
            return "by-value";
        }
        if (parameter.IsOut)
        {
            return "byref-writeonly-must-init";
        }
        return HasRuntimeAttribute(parameter, typeof(System.Runtime.InteropServices.InAttribute))
            ? "byref-readonly"
            : "byref-readwrite";
    }

    static string? ReturnPassingMode(ParameterInfo? parameter)
    {
        if (parameter is null || !parameter.ParameterType.IsByRef)
        {
            return null;
        }
        var readonlyReturn = parameter.IsIn ||
            parameter.GetRequiredCustomModifiers().Contains(typeof(System.Runtime.CompilerServices.IsReadOnlyAttribute)) ||
            parameter.GetRequiredCustomModifiers().Contains(typeof(System.Runtime.InteropServices.InAttribute));
        return readonlyReturn ? "byref-readonly" : "byref-readwrite";
    }

    object? ByRefReturnSourceType(
        Type returnType,
        GenericParameterContext genericParameters,
        NullabilityInfo? returnNullability,
        NullableMetadata? returnNullabilityMetadata)
    {
        var pointee = SourceShape(
            UnwrapByRef(returnType),
            genericParameters,
            returnNullability,
            returnNullabilityMetadata);
        return pointee is null
            ? null
            : new
            {
                kind = "provider-ref",
                moduleSpecifier = "@tsonic/core/types.js",
                exportName = "Pointer",
                typeArguments = new[] { pointee },
            };
    }

    static MethodInfo? EventAccessor(EventInfo eventInfo)
    {
        return eventInfo.GetAddMethod(false) ?? eventInfo.GetRemoveMethod(false);
    }

    static string EventMetadataName(Type declaringType, EventInfo eventInfo)
    {
        return $"{MetadataName(declaringType)}.{eventInfo.Name}";
    }

    static string EventTargetId(Type declaringType, EventInfo eventInfo)
    {
        return $"{TargetId(declaringType)}.{eventInfo.Name}";
    }
}
