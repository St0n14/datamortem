# Sandbox Runner for Go scripts
# Secure, isolated environment for custom Go programs

FROM golang:1.21-alpine

# Install minimal system dependencies
RUN apk add --no-cache \
    git \
    ca-certificates

# Create non-root user for script execution
RUN adduser -D -u 1000 -s /bin/sh sandbox && \
    mkdir -p /workspace /output && \
    chown -R sandbox:sandbox /workspace /output

# Pre-create go directories with correct permissions
RUN mkdir -p /home/sandbox/go && \
    chown -R sandbox:sandbox /home/sandbox/go

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER sandbox

# Pre-download common modules (speeds up execution)
RUN go install github.com/Velocidex/ordereddict@latest && \
    go clean -cache -modcache

# Environment variables
ENV GO111MODULE=on \
    GOPROXY=https://proxy.golang.org,direct \
    GOPATH=/home/sandbox/go \
    PATH="/home/sandbox/go/bin:${PATH}"

# Default command (overridden at runtime)
CMD ["go", "version"]
