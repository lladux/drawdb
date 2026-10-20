FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
ENV PORT=5000
EXPOSE 5000
CMD ["python", "-m", "app"]
