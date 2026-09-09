using System.Reflection;

sealed partial class ReflectionProvider
{
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
                    typeNullabilityMetadata: returnNullabilityMetadata,
                    signatureEvidence: SignatureEvidence(property));
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
                typeNullabilityMetadata: propertyNullabilityMetadata,
                signatureEvidence: SignatureEvidence(property));
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
            typeNullabilityMetadata: returnNullabilityMetadata,
            signatureEvidence: SignatureEvidence(property));
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
                typeNullabilityMetadata: NullableMetadata.ForProperty(property),
                signatureEvidence: SignatureEvidence(property)) is null)
            {
                return $"Indexer return type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(property.PropertyType)}";
            }
        }
        if (TypeRef(
            UnwrapByRef(property.PropertyType),
            typeNullability: nullability.Create(property),
            typeNullabilityMetadata: NullableMetadata.ForProperty(property),
            signatureEvidence: SignatureEvidence(property)) is null)
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
                typeNullabilityMetadata: NullableMetadata.ForField(field),
                signatureEvidence: SignatureEvidence(field));
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
            typeNullabilityMetadata: NullableMetadata.ForField(field),
            signatureEvidence: SignatureEvidence(field)) is null)
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
