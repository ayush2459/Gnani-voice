
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.api.v1.cases import router as cases_router
from app.api.v1.commerce import router as commerce_router


app = FastAPI(
    title=settings.APP_NAME,
    description="Voice AI Transaction Recovery Engine",
    version="1.0.0",
)

# Register API routers AFTER creating the FastAPI application
app.include_router(cases_router, prefix="/api/v1")
app.include_router(commerce_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "application": settings.APP_NAME,
        "status": "running",
        "environment": settings.APP_ENV,
    }


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        result = db.execute(
            text("""
                SELECT
                    current_database() AS database,
                    current_user AS db_user,
                    current_setting('port') AS port
            """)
        ).mappings().one()

        return {
            "status": "healthy",
            "database": result["database"],
            "database_user": result["db_user"],
            "port": result["port"],
        }

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        ) from exc
