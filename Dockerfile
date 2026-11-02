# Kendi sunucumuza taşırken: aynı testler bu container içinde çalışır.
#   docker build -t site-test-agent .
#   docker run --rm -e WEBHOOK_URL=... -v $PWD/results:/app/results site-test-agent --mode hourly
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENTRYPOINT ["node", "run.js"]
CMD ["--mode", "hourly"]
