FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

WORKDIR /app

# curl is used by the compose healthchecks; psycopg2-binary/paramiko/snowflake
# all ship wheels, so no compiler toolchain is needed here.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-service.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-service.txt

COPY . .

# Overridden per service in compose: the API runs uvicorn, the worker runs celery.
CMD ["uvicorn", "service.api:api", "--host", "0.0.0.0", "--port", "8000"]
