FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the InsightFace buffalo_s recognition model during build (~13MB).
# Detection uses the Haar cascade bundled with opencv-python-headless.
RUN mkdir -p /app/models && \
    wget -q "https://huggingface.co/immich-app/buffalo_s/resolve/main/recognition/model.onnx" \
      -O /app/models/rec_model.onnx && \
    ls -la /app/models/

COPY main.py face_auth.py enrollment_quality.py ./

EXPOSE 5557

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5557"]
