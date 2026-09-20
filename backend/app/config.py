from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    storage_provider: str = "local"
    storage_bucket: str = "clipforge-uploads"
    storage_region: str = "us-east-1"
    database_url: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
