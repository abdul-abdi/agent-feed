import json
import math
from typing import Any


def canonicalize(value: Any) -> str:
    """Canonicalize to deterministic JSON per §6.2: sorted keys, no whitespace,
    reject non-finite numbers.
    """
    return json.dumps(
        _walk(value), separators=(",", ":"), sort_keys=True, ensure_ascii=False
    )


def _walk(v: Any) -> Any:
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        if isinstance(v, float) and not math.isfinite(v):
            raise ValueError("non-finite number")
        return v
    if isinstance(v, list):
        return [_walk(item) for item in v]
    if isinstance(v, dict):
        return {k: _walk(v[k]) for k in sorted(v.keys())}
    return v
