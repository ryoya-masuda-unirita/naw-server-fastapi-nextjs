"""テーブル名から派生するリソース名（移植元 jp.co.unirita.ai.core.resource）。"""

from generative_ai_core.resource.resolver import CoreDerivedResourceNameResolver
from generative_ai_core.resource.target_kind import CoreDerivedResourceTargetKind
from generative_ai_core.resource.validator import CoreDerivedResourceNameValidator

__all__ = [
    "CoreDerivedResourceNameResolver",
    "CoreDerivedResourceNameValidator",
    "CoreDerivedResourceTargetKind",
]
