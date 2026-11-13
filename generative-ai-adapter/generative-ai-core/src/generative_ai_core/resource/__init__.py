"""テーブル名から導出するリソース名（移植元 jp.co.unirita.ai.core.resource）。"""

from generative_ai_core.resource.derived_name import (
    CoreDerivedResourceNameResolver,
    CoreDerivedResourceTargetKind,
)

__all__ = ["CoreDerivedResourceNameResolver", "CoreDerivedResourceTargetKind"]
