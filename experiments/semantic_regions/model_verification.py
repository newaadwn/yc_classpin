"""Shared model checksum check with a small on-disk cache.

Hashing a multi-GB GGUF on every request costs seconds of CPU and disk. The cache
entry is only reused while the file's size and mtime are unchanged and the
expected checksum is the same, so a replaced or edited model is hashed again.
Callers hold output/model-lab/inference.lock while calling this.
"""
import json
from pathlib import Path
from run_local_semantic_grouping import sha256_file


def verified(model: Path, expected: str, cache_file: Path) -> bool:
    """Hash a model once per (size, mtime); later calls reuse the recorded result."""
    stat = model.stat()
    key = str(model)
    try:
        cache = json.loads(cache_file.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        cache = {}
    entry = cache.get(key)
    if entry and entry.get('size') == stat.st_size and entry.get('mtime') == stat.st_mtime_ns and entry.get('sha256') == expected:
        return True
    if sha256_file(model) != expected:
        return False
    cache[key] = {'size': stat.st_size, 'mtime': stat.st_mtime_ns, 'sha256': expected}
    tmp = cache_file.with_suffix('.tmp')
    tmp.write_text(json.dumps(cache), encoding='utf-8')
    tmp.replace(cache_file)
    return True
