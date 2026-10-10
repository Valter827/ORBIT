# COSMO Brain

COSMO 1.0 owns the assistant identity and its scoped context. A model supplies inference through an approved provider. Runtime discovery, routing, storage and security enforcement remain outside the model. A model cannot grant permissions or authorize tools through generated text.

New COSMO profiles recommend Auto. Existing profile selections are preserved by migration. Manual chat selection explicitly switches Auto off. Model Studio roles are preferences, not permission grants. Profile imports reset provider-policy authority; importing a profile does not grant cloud use or tool execution.

Model capability metadata and bounded probe results are separate evidence. `UNKNOWN` is not `SUPPORTED`. Tools require verified compatibility before local Agent routing; passing chat does not establish Agent support. Tools used for probing are synthetic schemas and are never executed. A one-image color test is evidence for the image protocol, not a general vision-quality score.

Automatic routing first applies Local Only, configured-provider approval, chat/vision/tool/context gates, then role preferences and compatible benchmark evidence. Failed requests can use one alternate allowed brain before output begins. Manual selection, aborted requests and partially emitted answers do not silently switch. Fallback does not bypass context fitting or privacy checks.

Memory diagnostics report retrieved facts and facts present in the final assembled system context separately. The synthetic real acceptance script additionally grades distinct final-answer facts. Retrieval success alone is not answer-completeness success. User data is not included in benchmark inputs or the acceptance fixtures.

No COSMO-specific weights have been trained or delivered in this release. See `COSMO_FINE_TUNING_DESIGN.md` for the future design and consent boundary.
