.PHONY: all build-python build-rust build-go build-all clean help

# Default Python versions to build
PYTHON_VERSIONS := 3.10 3.11 3.12
RUST_VERSION := 1.75
GO_VERSION := 1.21

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m

help: ## Show this help
	@echo "$(BLUE)Sandbox Runners - Docker Images$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(GREEN)<target>$(NC)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Build Images

build-python: ## Build Python sandbox images (all versions)
	@echo "$(YELLOW)Building Python sandbox images...$(NC)"
	@for version in $(PYTHON_VERSIONS); do \
		echo "$(BLUE)→ Building Python $$version$(NC)"; \
		docker build \
			-f Dockerfile.python \
			-t datamortem-sandbox-python:$$version \
			--build-arg PYTHON_VERSION=$$version \
			. || exit 1; \
	done
	@echo "$(GREEN)✓ Python images built$(NC)"

build-python-version: ## Build specific Python version (usage: make build-python-version VERSION=3.11)
	@if [ -z "$(VERSION)" ]; then \
		echo "$(YELLOW)Error: VERSION not specified$(NC)"; \
		echo "Usage: make build-python-version VERSION=3.11"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Building Python $(VERSION) sandbox image...$(NC)"
	@docker build \
		-f Dockerfile.python \
		-t datamortem-sandbox-python:$(VERSION) \
		--build-arg PYTHON_VERSION=$(VERSION) \
		.
	@echo "$(GREEN)✓ Python $(VERSION) image built$(NC)"

build-rust: ## Build Rust sandbox image
	@echo "$(YELLOW)Building Rust $(RUST_VERSION) sandbox image...$(NC)"
	@docker build \
		-f Dockerfile.rust \
		-t datamortem-sandbox-rust:$(RUST_VERSION) \
		-t datamortem-sandbox-rust:latest \
		.
	@echo "$(GREEN)✓ Rust image built$(NC)"

build-go: ## Build Go sandbox image
	@echo "$(YELLOW)Building Go $(GO_VERSION) sandbox image...$(NC)"
	@docker build \
		-f Dockerfile.go \
		-t datamortem-sandbox-go:$(GO_VERSION) \
		-t datamortem-sandbox-go:latest \
		.
	@echo "$(GREEN)✓ Go image built$(NC)"

build-all: build-python build-rust build-go ## Build all sandbox images
	@echo "$(GREEN)✓ All sandbox images built successfully!$(NC)"

##@ Manage Images

list: ## List all sandbox images
	@echo "$(BLUE)=== Sandbox Images ===$(NC)"
	@docker images | grep "datamortem-sandbox" || echo "No sandbox images found"

clean: ## Remove all sandbox images
	@echo "$(YELLOW)Removing all sandbox images...$(NC)"
	@docker images | grep "datamortem-sandbox" | awk '{print $$3}' | xargs -r docker rmi -f
	@echo "$(GREEN)✓ All sandbox images removed$(NC)"

##@ Testing

test-python: ## Test Python sandbox with a simple script
	@echo "$(YELLOW)Testing Python sandbox...$(NC)"
	@docker run --rm \
		-v $(PWD)/test:/workspace:ro \
		-v $(PWD)/test-output:/output:rw \
		-e CASE_ID=test_case \
		-e EVIDENCE_UID=test_evidence \
		-e OUTPUT_DIR=/output \
		--user sandbox \
		--network none \
		--memory 512m \
		--cpus 1.0 \
		datamortem-sandbox-python:3.11 \
		python -c "import sys; print(f'Python {sys.version}'); print('Hello from sandbox!')"
	@echo "$(GREEN)✓ Python sandbox test passed$(NC)"

test-rust: ## Test Rust sandbox with a simple program
	@echo "$(YELLOW)Testing Rust sandbox...$(NC)"
	@docker run --rm \
		--user sandbox \
		--network none \
		--memory 512m \
		--cpus 1.0 \
		datamortem-sandbox-rust:latest \
		rustc --version
	@echo "$(GREEN)✓ Rust sandbox test passed$(NC)"

test-go: ## Test Go sandbox with a simple program
	@echo "$(YELLOW)Testing Go sandbox...$(NC)"
	@docker run --rm \
		--user sandbox \
		--network none \
		--memory 512m \
		--cpus 1.0 \
		datamortem-sandbox-go:latest \
		go version
	@echo "$(GREEN)✓ Go sandbox test passed$(NC)"

test-all: test-python test-rust test-go ## Test all sandbox images
	@echo "$(GREEN)✓ All sandbox tests passed!$(NC)"

##@ Info

size: ## Show image sizes
	@echo "$(BLUE)=== Sandbox Image Sizes ===$(NC)"
	@docker images | grep "datamortem-sandbox" | awk '{printf "%-50s %10s\n", $$1":"$$2, $$7" "$$8}'
