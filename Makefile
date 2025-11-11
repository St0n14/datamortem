.PHONY: all demo up down restart logs clean test demo-data help status

# Variables
COMPOSE := docker-compose
ADMIN_USER := admin
ADMIN_PASS := admin123
DEMO_CASE := demo_case
DEMO_EVIDENCE := demo_evidence
DEMO_EVENTS := 200000

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ General

help: ## Affiche cette aide
	@echo "$(BLUE)DataMortem - Makefile$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(GREEN)<target>$(NC)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

all: ## Setup complet: down, up, migrations, test, ingestion, demo-data
	@echo "$(BLUE)=== DataMortem - Setup Complet ===$(NC)"
	@echo "$(YELLOW)[1/7] Arrêt de la stack si elle tourne...$(NC)"
	@$(MAKE) --no-print-directory down 2>/dev/null || true
	@echo "$(YELLOW)[2/7] Démarrage de la stack...$(NC)"
	@$(MAKE) --no-print-directory up
	@echo "$(YELLOW)[3/7] Attente que les services soient prêts (30s)...$(NC)"
	@sleep 30
	@echo "$(YELLOW)[4/7] Exécution des migrations de base de données...$(NC)"
	@$(MAKE) --no-print-directory db-migrate
	@echo "$(YELLOW)[5/7] Initialisation de l'utilisateur admin...$(NC)"
	@$(COMPOSE) exec -T api uv run python -m app.init_admin 2>/dev/null || echo "$(YELLOW)Admin déjà initialisé$(NC)"
	@echo "$(YELLOW)[6/7] Exécution des tests...$(NC)"
	@$(MAKE) --no-print-directory test || (echo "$(RED)✗ Tests échoués, mais on continue...$(NC)"; true)
	@echo "$(YELLOW)[7/7] Ingestion des données de démo...$(NC)"
	@$(MAKE) --no-print-directory demo-data
	@echo "$(GREEN)✓ Setup complet terminé!$(NC)"
	@echo ""
	@echo "$(BLUE)Accès à l'application:$(NC)"
	@echo "  Frontend: $(GREEN)http://localhost:5174$(NC)"
	@echo "  API:      $(GREEN)http://localhost:8080$(NC)"
	@echo "  Login:    $(YELLOW)$(ADMIN_USER) / $(ADMIN_PASS)$(NC)"
	@$(MAKE) --no-print-directory status

demo: ## Clean + start + migrations + ingestion de données de démo
	@echo "$(BLUE)=== DataMortem - Demo Mode ===$(NC)"
	@echo "$(RED)[1/6] Stopping stack and cleaning volumes...$(NC)"
	@$(COMPOSE) down -v 2>/dev/null || true
	@echo "$(YELLOW)[2/6] Starting fresh stack...$(NC)"
	@$(COMPOSE) up -d
	@echo "$(YELLOW)[3/6] Waiting for services to be ready (30s)...$(NC)"
	@sleep 30
	@echo "$(YELLOW)[4/6] Running database migrations...$(NC)"
	@$(MAKE) --no-print-directory db-migrate
	@echo "$(YELLOW)[5/6] Initializing admin user...$(NC)"
	@$(COMPOSE) exec -T api uv run python -m app.init_admin
	@echo "$(YELLOW)[6/6] Ingesting demo data ($(DEMO_EVENTS) events)...$(NC)"
	@$(MAKE) --no-print-directory demo-data
	@echo "$(GREEN)✓ Demo data ready!$(NC)"
	@echo ""
	@echo "$(BLUE)Access the application:$(NC)"
	@echo "  Frontend: $(GREEN)http://localhost:5174$(NC)"
	@echo "  API:      $(GREEN)http://localhost:8080$(NC)"
	@echo "  Login:    $(YELLOW)$(ADMIN_USER) / $(ADMIN_PASS)$(NC)"

##@ Stack Management

up: ## Lance la stack
	@echo "$(YELLOW)Starting stack...$(NC)"
	@$(COMPOSE) up -d
	@echo "$(GREEN)✓ Stack started$(NC)"
	@$(MAKE) --no-print-directory status

down: ## Arrête la stack
	@echo "$(YELLOW)Stopping stack...$(NC)"
	@$(COMPOSE) down
	@echo "$(GREEN)✓ Stack stopped$(NC)"

restart: ## Redémarre la stack
	@echo "$(YELLOW)Restarting stack...$(NC)"
	@$(COMPOSE) restart
	@echo "$(GREEN)✓ Stack restarted$(NC)"

status: ## Affiche le statut des services
	@echo "$(BLUE)=== Services Status ===$(NC)"
	@$(COMPOSE) ps

logs: ## Affiche les logs (usage: make logs SERVICE=api)
	@if [ -z "$(SERVICE)" ]; then \
		$(COMPOSE) logs -f --tail=100; \
	else \
		$(COMPOSE) logs -f --tail=100 $(SERVICE); \
	fi

##@ Database & Migrations

db-migrate: ## Applique les migrations en attente
	@echo "$(YELLOW)Running database migrations...$(NC)"
	@$(COMPOSE) exec api uv run alembic upgrade head
	@echo "$(GREEN)✓ Migrations applied$(NC)"

db-rollback: ## Annule la dernière migration (usage: make db-rollback STEPS=1)
	@echo "$(YELLOW)Rolling back migration...$(NC)"
	@if [ -z "$(STEPS)" ]; then \
		$(COMPOSE) exec api uv run alembic downgrade -1; \
	else \
		$(COMPOSE) exec api uv run alembic downgrade -$(STEPS); \
	fi
	@echo "$(GREEN)✓ Rollback completed$(NC)"

db-revision: ## Crée une nouvelle migration (usage: make db-revision MSG="description")
	@if [ -z "$(MSG)" ]; then \
		echo "$(RED)Error: Please provide a message with MSG=\"your message\"$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Creating new migration: $(MSG)$(NC)"
	@$(COMPOSE) exec api uv run alembic revision --autogenerate -m "$(MSG)"
	@echo "$(GREEN)✓ Migration created$(NC)"
	@echo "$(YELLOW)Copying migration from container...$(NC)"
	@bash -c 'LATEST=$$($(COMPOSE) exec -T api ls -t /app/alembic/versions/*.py | head -1 | tr -d "\r"); docker cp datamortem-api:$$LATEST services/api/alembic/versions/'
	@echo "$(GREEN)✓ Migration file copied to services/api/alembic/versions/$(NC)"

db-current: ## Affiche la version actuelle de la base
	@echo "$(BLUE)=== Current Database Version ===$(NC)"
	@$(COMPOSE) exec api uv run alembic current

db-history: ## Affiche l'historique des migrations
	@echo "$(BLUE)=== Migration History ===$(NC)"
	@$(COMPOSE) exec api uv run alembic history

db-stamp: ## Marque la base à une révision spécifique sans exécuter (usage: make db-stamp REV=head)
	@if [ -z "$(REV)" ]; then \
		echo "$(RED)Error: Please provide a revision with REV=<revision>$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Stamping database to $(REV)...$(NC)"
	@$(COMPOSE) exec api uv run alembic stamp $(REV)
	@echo "$(GREEN)✓ Database stamped$(NC)"

##@ Database & Data

clean: ## Clean volumes et données (ATTENTION: supprime toutes les données)
	@echo "$(RED)WARNING: This will delete ALL data!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(RED)Cleaning all volumes and data...$(NC)"; \
		$(COMPOSE) down -v; \
		echo "$(GREEN)✓ Cleaned$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
	fi

demo-data: ## Ingère des données de démo
	@echo "$(YELLOW)Waiting for API to be ready...$(NC)"
	@bash -c 'until curl -f http://localhost:8080/api/health 2>/dev/null; do sleep 2; done'
	@echo ""
	@echo "$(YELLOW)Ingesting demo data...$(NC)"
	@DEMO_CASE=$(DEMO_CASE) \
		DEMO_EVIDENCE=$(DEMO_EVIDENCE) \
		DEMO_EVENTS=$(DEMO_EVENTS) \
		ADMIN_USER=$(ADMIN_USER) \
		ADMIN_PASS=$(ADMIN_PASS) \
		bash scripts/demo_data.sh
	@echo "$(GREEN)✓ Demo data ingested$(NC)"

##@ Testing

test: ## Lance les tests (pytest + intégration)
	@echo "$(YELLOW)Running tests...$(NC)"
	@echo "$(BLUE)→ API health check$(NC)"
	@curl -sf http://localhost:8080/api/health >/dev/null && echo "$(GREEN)✓ API is healthy$(NC)" || (echo "$(RED)✗ API is not running$(NC)"; exit 1)
	@echo "$(BLUE)→ Unit tests (pytest)$(NC)"
	@$(COMPOSE) exec -T api uv run pytest /app/tests -v --tb=short || (echo "$(YELLOW)⚠ Some unit tests failed, continuing...$(NC)"; true)
	@echo "$(BLUE)→ End-to-end ingestion + RBAC smoke test$(NC)"
	@$(COMPOSE) exec -T api uv run python /app/scripts/test_ingestion_complete.py --base-url http://localhost:8000 --os-url http://opensearch:9200 --case-id test_ingest_smoke --evidence-uid test_ev_smoke --events 10 --cleanup --rbac-check

test-unit: ## Lance uniquement les tests unitaires (pytest)
	@echo "$(YELLOW)Running unit tests...$(NC)"
	@$(COMPOSE) exec -T api uv run pytest /app/tests -v --tb=short

test-ingestion: ## Test le flux d'ingestion complet
	@echo "$(YELLOW)Testing ingestion flow...$(NC)"
	@$(COMPOSE) exec -T api uv run python /app/scripts/test_ingestion_complete.py --base-url http://localhost:8000 --os-url http://opensearch:9200 --case-id test_ingestion --events 100 --cleanup

##@ Docker

build: ## Build les images Docker
	@echo "$(YELLOW)Building Docker images...$(NC)"
	@$(COMPOSE) build
	@echo "$(GREEN)✓ Images built$(NC)"

rebuild: ## Rebuild les images sans cache
	@echo "$(YELLOW)Rebuilding Docker images...$(NC)"
	@$(COMPOSE) build --no-cache
	@echo "$(GREEN)✓ Images rebuilt$(NC)"

##@ Development Tools

shell-api: ## Ouvre un shell dans le container API
	@$(COMPOSE) exec api bash

shell-frontend: ## Ouvre un shell dans le container frontend
	@$(COMPOSE) exec frontend sh

db-shell: ## Ouvre un shell PostgreSQL
	@$(COMPOSE) exec postgres psql -U datamortem -d datamortem

opensearch-shell: ## Ouvre un shell OpenSearch (curl)
	@echo "$(BLUE)OpenSearch shell - Examples:$(NC)"
	@echo "  curl http://localhost:9200/_cat/indices?v"
	@echo "  curl http://localhost:9200/datamortem-case-*/\_search?size=10"
	@$(COMPOSE) exec api bash

check-opensearch: ## Vérifie l'état d'OpenSearch
	@echo "$(BLUE)=== OpenSearch Status ===$(NC)"
	@curl -s http://localhost:9200/_cluster/health | python3 -m json.tool || echo "$(RED)OpenSearch not available$(NC)"
	@echo ""
	@echo "$(BLUE)=== Indices ===$(NC)"
	@curl -s http://localhost:9200/_cat/indices?v || echo "$(RED)Cannot fetch indices$(NC)"

check-postgres: ## Vérifie l'état de PostgreSQL
	@echo "$(BLUE)=== PostgreSQL Status ===$(NC)"
	@$(COMPOSE) exec postgres pg_isready -U datamortem

##@ Quick Access

frontend: ## Ouvre le frontend dans le navigateur
	@open http://localhost:5174 || xdg-open http://localhost:5174 || echo "$(YELLOW)Open http://localhost:5174 in your browser$(NC)"

api-docs: ## Ouvre la documentation API (Swagger)
	@open http://localhost:8080/docs || xdg-open http://localhost:8080/docs || echo "$(YELLOW)Open http://localhost:8080/docs in your browser$(NC)"

dashboards: ## Ouvre OpenSearch Dashboards
	@open http://localhost:5601 || xdg-open http://localhost:5601 || echo "$(YELLOW)Open http://localhost:5601 in your browser$(NC)"
