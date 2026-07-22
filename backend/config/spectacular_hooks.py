"""drf-spectacular postprocessing hooks.

The frontend's TypeScript types are generated from this schema, so schema shape is
API contract. This hook fixes a DRF/OpenAPI mismatch that otherwise makes the generated
types unusable under `strictNullChecks`.
"""


def make_response_fields_required(result, generator, request, public):
    """Mark every property of a *response* component as ``required``.

    DRF always serialises every declared field into the output representation — a
    read-only field, a field with a default, or a SerializerMethodField is always
    present in the response (possibly null, but present). OpenAPI, however, marks such
    fields ``required: false`` because their *input* is optional, so drf-spectacular
    emits response schemas with optional properties. The generated TS then types every
    such field as ``T | undefined``, forcing defensive `?? ...` guards on values that
    are in fact always there.

    With ``COMPONENT_SPLIT_REQUEST`` enabled, request bodies live in separate
    ``*Request`` components (which legitimately have optional/partial fields — e.g. the
    ``Patched*`` PATCH bodies). So we require-all on everything EXCEPT those, giving
    precise, non-optional response types while leaving request bodies untouched.
    """
    schemas = (result.get("components") or {}).get("schemas") or {}
    for name, schema in schemas.items():
        if name.endswith("Request"):
            continue
        properties = schema.get("properties")
        if properties:
            schema["required"] = list(properties.keys())
    return result
