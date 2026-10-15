"""Small persistent JSON fallback when MongoDB is not configured/available."""
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any
from app.core.config import settings

_lock = asyncio.Lock()

def _path() -> Path:
    root = Path(settings.audio_storage_dir)
    if not root.is_absolute():
        root = (Path(__file__).resolve().parents[5] / root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root / "runs.json"

def _json_default(value: Any):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Cannot JSON serialize {type(value).__name__}")

async def list_local_runs(limit: int = 50) -> list[dict]:
    async with _lock:
        path = _path()
        if not path.exists():
            return []
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
        rows.sort(key=lambda row: str(row.get("created_at", "")), reverse=True)
        return rows[:limit]

async def save_local_run(doc: dict) -> None:
    async with _lock:
        path = _path()
        rows = []
        if path.exists():
            try:
                rows = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                rows = []
        clean = dict(doc)
        clean.pop("_id", None)
        rows = [row for row in rows if row.get("run_id") != clean.get("run_id")]
        rows.append(clean)
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")

async def update_local_run(run_id: str, fields: dict) -> bool:
    async with _lock:
        path = _path()
        if not path.exists():
            return False
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return False
        found = False
        for row in rows:
            if row.get("run_id") == run_id:
                row.update(fields)
                found = True
                break
        if found:
            path.write_text(json.dumps(rows, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")
        return found
