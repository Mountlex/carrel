# Pin to specific TeX Live version for reproducibility
FROM texlive/texlive:TL2024-historic@sha256:7995b32f28e7d91c11fc8b222b97244949c58cb2b61c4705e2d3f39f97bc8c31 AS runtime

# Install Node.js and poppler-utils for PDF thumbnail generation
RUN apt-get update && apt-get install -y \
    curl \
    poppler-utils \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -s /bin/bash latexuser

WORKDIR /home/latexuser/app

# Copy package files and install dependencies
COPY --chown=latexuser:latexuser package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server code and lib directory
COPY --chown=latexuser:latexuser server.js ./
COPY --chown=latexuser:latexuser lib/ ./lib/
COPY --chown=latexuser:latexuser scripts/ ./scripts/

# Create work directory for compilations
RUN mkdir -p /home/latexuser/work && chown -R latexuser:latexuser /home/latexuser

# Switch to non-root user
USER latexuser

# Set work directory for temp files
ENV WORK_DIR=/home/latexuser/work

# Production mode for structured logging
ENV NODE_ENV=production

EXPOSE 3001

# Health check - now verifies dependencies
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "server.js"]

# Every normal build (including flyctl --remote-only) must exercise the real
# engines and HTTP endpoints before an image can be deployed. Fixtures stay in
# this intermediate stage, not in the final filesystem.
FROM runtime AS verified
RUN node scripts/smoke.cjs && touch /tmp/carrel-smoke-passed

FROM runtime AS production
COPY --from=verified /tmp/carrel-smoke-passed /home/latexuser/app/.smoke-passed
