"""MongoDB connection and collection/index initialization."""
from app.core.config import settings

try:
    from pymongo import AsyncMongoClient
    from pymongo.asynchronous.database import AsyncDatabase
except ImportError:  # MongoDB is optional for local/dev use.
    AsyncMongoClient = None  # type: ignore[assignment,misc]
    AsyncDatabase = object  # type: ignore[assignment,misc]

_client = None
_database = None

async def connect_db() -> None:
    global _client, _database
    if not settings.mongodb_uri:
        if settings.mongodb_required:
            raise RuntimeError("MongoDB is required. Set MONGODB_URI in backend/.env (for example mongodb://localhost:27017).")
        return
    if AsyncMongoClient is None:
        if settings.mongodb_required:
            raise RuntimeError("MONGODB_REQUIRED is true, but pymongo is not installed.")
        return
    _client = AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2500)
    try:
        await _client.admin.command("ping")
        _database = _client[settings.mongodb_database]
        await _database["audio_test_runs"].create_index("created_at")
        await _database["audio_test_runs"].create_index("run_id", unique=True)
    except Exception as exc:
        await _client.close()
        _client = None
        _database = None
        if settings.mongodb_required:
            raise RuntimeError(
                f"Could not connect to MongoDB at MONGODB_URI. Check that MongoDB is running and the URI is correct. Original error: {type(exc).__name__}: {exc}"
            ) from exc

async def close_db() -> None:
    global _client, _database
    if _client is not None:
        await _client.close()
    _client = None
    _database = None

def get_database():
    return _database
