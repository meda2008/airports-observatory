FROM node:24-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
COPY deploy-service/package*.json /app/deploy-service/
RUN node -e "require('fs').mkdirSync('/etc/ssl/certs',{recursive:true});require('fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt',require('tls').rootCertificates.join('\n'))" \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && printf 'Acquire::Retries "3";\n' > /etc/apt/apt.conf.d/80-airports-retries \
    && cd /app/deploy-service && npm ci --omit=dev && npx playwright install --with-deps chromium
# Keep CPU OCR dependencies in a cached layer before site-specific source changes.
COPY deploy-service/requirements-ocr.txt /tmp/airports-requirements-ocr.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && python3 -m venv /opt/airports-ocr \
    && /opt/airports-ocr/bin/python -m pip install --no-cache-dir --only-binary=:all: -r /tmp/airports-requirements-ocr.txt \
    && /opt/airports-ocr/bin/python -c "import ddddocr; ddddocr.DdddOcr(show_ad=False)" \
    && rm -rf /var/lib/apt/lists/*
ENV OCR_PYTHON=/opt/airports-ocr/bin/python OMP_NUM_THREADS=1
COPY lib /app/lib
COPY package.json /app/package.json
COPY catalog /app/catalog
COPY scripts/export-current-inventory.cjs /app/scripts/export-current-inventory.cjs
COPY scripts/measurements.cjs scripts/local-product.cjs /app/scripts/
COPY collection/site-collectors /app/collection/site-collectors
COPY collection/site-contracts /app/collection/site-contracts
COPY collection/website-collectors /app/collection/website-collectors
COPY collection/url-collectors /app/collection/url-collectors
COPY collection/*.cjs collection/*.mjs collection/*.json /app/collection/
COPY collection/site-recipes /app/collection/site-recipes
COPY deploy-service/*.cjs /app/deploy-service/
COPY deploy-service/three-services /app/deploy-service/three-services
COPY deploy-service/measurement-sidecar/local-healthcheck.cjs /app/deploy-service/measurement-sidecar/local-healthcheck.cjs
COPY deploy-service/public /app/deploy-service/public
COPY deploy-service/ocr-runner.py deploy-service/requirements-ocr.txt /app/deploy-service/
RUN mkdir -p /data && chown -R node:node /data /app/deploy-service
ENV STORE_FILE=/data/collector.sqlite PORT=8080 HOST=0.0.0.0 COLLECTION_ENABLED=false
EXPOSE 8080
CMD ["node","deploy-service/server.cjs"]
