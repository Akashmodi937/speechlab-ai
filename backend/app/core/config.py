from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    mongodb_uri: str = ""
    mongodb_database: str = "speechlab"
    mongodb_required: bool = True
    sarvam_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    audio_storage_dir: str = "storage/audio_tests"
    max_audio_size_mb: int = 50
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
