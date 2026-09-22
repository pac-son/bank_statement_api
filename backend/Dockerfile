FROM python:3.11-slim

# Install system dependencies for Tesseract, OpenCV, and PostgreSQL
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1-mesa-glx \
    libglib2.0-0 \
    poppler-utils \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Command will be overridden in docker-compose.yml for web vs worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
