# Système d'Alertes Superadmin

**Date** : 2025-01-11  
**Statut** : ✅ Implémenté et fonctionnel

---

## 📋 Vue d'ensemble

Le système d'alertes superadmin utilise les **toasts** pour notifier automatiquement les superadmins des problèmes critiques du système. Les alertes sont **uniquement visibles pour les comptes superadmin**.

---

## 🎯 Fonctionnalités

### 1. **Surveillance automatique des services**

Le hook `useSuperAdminAlerts` surveille périodiquement la santé de tous les services critiques :

- ✅ **PostgreSQL** - Base de données
- ✅ **Redis** - Cache et rate limiting
- ✅ **Celery** - Traitement asynchrone
- ✅ **OpenSearch** - Moteur de recherche
- ✅ **API** - Service principal

**Intervalle de vérification** : 60 secondes

### 2. **Types d'alertes**

#### 🔴 **Alertes critiques** (`showError`)
- Services **indisponibles** (`unhealthy`)
- Durée d'affichage : 10 secondes
- Exemples :
  - "PostgreSQL est indisponible : Connection refused"
  - "Redis est indisponible : Timeout"
  - "OpenSearch est indisponible : Cluster health is RED"

#### 🟡 **Alertes de dégradation** (`showWarning`)
- Services **dégradés** (`degraded`)
- Durée d'affichage : 8 secondes
- Exemples :
  - "Celery est dégradé : Workers are slow"
  - "OpenSearch est dégradé : Cluster health is YELLOW"

#### 🔵 **Alertes système** (`showError`)
- Problèmes de surveillance
- Exemple :
  - "Impossible de vérifier la santé des services : Network error"

### 3. **Protection contre le spam**

- **Cooldown entre alertes** : 5 minutes par service
- Évite la répétition excessive des mêmes alertes
- Permet de suivre l'évolution des problèmes sans surcharger l'interface

---

## 🔧 Implémentation

### Hook `useSuperAdminAlerts`

```typescript
import { useSuperAdminAlerts } from './hooks/useSuperAdminAlerts';

function AuthenticatedApp() {
  // Surveille automatiquement la santé des services
  useSuperAdminAlerts();
  
  // ... reste du code
}
```

**Caractéristiques** :
- ✅ S'active **automatiquement** pour les superadmins
- ✅ Se désactive si l'utilisateur n'est plus superadmin
- ✅ Vérification immédiate au montage
- ✅ Vérification périodique toutes les 60 secondes
- ✅ Nettoyage automatique au démontage

### Migration des messages dans `SuperAdminView`

Tous les messages d'erreur/succès ont été migrés vers les toasts :

#### ❌ Avant
```typescript
const [usersError, setUsersError] = useState<string | null>(null);
const [userSuccess, setUserSuccess] = useState<string | null>(null);

// ...
setUsersError('Erreur lors du chargement');
setUserSuccess('Utilisateur créé');
```

#### ✅ Après
```typescript
const { showSuccess, showError, showWarning } = useToast();

// ...
showError('Erreur lors du chargement', 'Erreur');
showSuccess('Utilisateur créé avec succès', 'Création');
```

**Actions migrées** :
- ✅ Création d'utilisateur
- ✅ Suppression d'utilisateur
- ✅ Chargement des utilisateurs
- ✅ Chargement des statistiques
- ✅ Validation des formulaires

---

## 📊 Exemples d'alertes

### Service indisponible

```
🔴 Service critique
PostgreSQL est indisponible : Connection refused
```

### Service dégradé

```
🟡 Service dégradé
OpenSearch est dégradé : Cluster health is YELLOW
```

### Erreur de surveillance

```
🔴 Surveillance système
Impossible de vérifier la santé des services : Network error
```

---

## ⚙️ Configuration

### Intervalle de vérification

Par défaut : **60 secondes**

Pour modifier, éditez `useSuperAdminAlerts.ts` :

```typescript
const CHECK_INTERVAL_MS = 60000; // 60 secondes
```

### Cooldown entre alertes

Par défaut : **5 minutes**

Pour modifier, éditez `useSuperAdminAlerts.ts` :

```typescript
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
```

### Durée d'affichage des toasts

- **Erreurs critiques** : 10 secondes
- **Avertissements** : 8 secondes

Modifiable dans les appels `showError`/`showWarning` :

```typescript
showError(message, 'Titre', 10000); // 10 secondes
showWarning(message, 'Titre', 8000); // 8 secondes
```

---

## 🔍 Endpoints utilisés

### `/api/health/status`

Retourne le statut simple de tous les services :

```json
{
  "api": { "status": "healthy", "message": "Running" },
  "postgres": { "status": "healthy", "message": "Connected" },
  "redis": { "status": "healthy", "message": "Connected" },
  "celery": { "status": "healthy", "message": "Workers active" },
  "opensearch": { "status": "healthy", "message": "Cluster is GREEN" }
}
```

**Statuts possibles** :
- `healthy` : Service opérationnel
- `degraded` : Service fonctionnel mais avec problèmes
- `unhealthy` : Service indisponible

---

## 🎨 Interface utilisateur

### Position des toasts

Les toasts superadmin apparaissent en **haut à droite** (comme tous les toasts).

### Design

- **Erreurs** : Fond rouge avec icône d'alerte
- **Avertissements** : Fond orange avec icône d'avertissement
- **Succès** : Fond vert avec icône de validation

### Empilement

Les toasts s'empilent automatiquement si plusieurs alertes sont actives simultanément.

---

## 🚀 Utilisation

### Pour les développeurs

Le système est **automatique** et ne nécessite aucune configuration supplémentaire. Il suffit d'être connecté en tant que superadmin.

### Pour tester

1. **Connectez-vous en tant que superadmin**
2. **Arrêtez un service** (ex: `docker-compose stop postgres`)
3. **Attendez 60 secondes maximum**
4. **Une alerte toast apparaît automatiquement**

### Pour désactiver temporairement

Commentez l'appel dans `App.tsx` :

```typescript
// useSuperAdminAlerts(); // Désactivé temporairement
```

---

## 📝 Logique de détection

### Services surveillés

1. **PostgreSQL** : Vérifie la connexion et la disponibilité
2. **Redis** : Vérifie la connexion et la disponibilité
3. **Celery** : Vérifie les workers actifs
4. **OpenSearch** : Vérifie la santé du cluster
5. **API** : Vérifie que l'API répond

### Conditions d'alerte

- **`unhealthy`** → Alerte critique (rouge)
- **`degraded`** → Alerte de dégradation (orange)
- **Erreur de vérification** → Alerte système (rouge)

### Protection anti-spam

- Chaque service a son propre cooldown
- Les alertes ne se répètent pas avant 5 minutes
- Permet de suivre l'évolution sans surcharger

---

## 🔐 Sécurité

- ✅ **Authentification requise** : Les endpoints `/api/health/*` nécessitent une authentification
- ✅ **Rôle vérifié** : Seuls les superadmins voient les alertes
- ✅ **Pas de données sensibles** : Les alertes ne contiennent que des messages génériques

---

## 🐛 Dépannage

### Les alertes n'apparaissent pas

1. **Vérifiez que vous êtes superadmin** :
   ```typescript
   console.log(user?.role); // Doit être "superadmin"
   ```

2. **Vérifiez la console** :
   - Erreurs réseau ?
   - Erreurs d'authentification ?

3. **Vérifiez l'endpoint** :
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:8080/api/health/status
   ```

### Trop d'alertes

- Augmentez `ALERT_COOLDOWN_MS` dans `useSuperAdminAlerts.ts`
- Augmentez `CHECK_INTERVAL_MS` pour vérifier moins souvent

### Pas assez d'alertes

- Diminuez `ALERT_COOLDOWN_MS`
- Diminuez `CHECK_INTERVAL_MS` pour vérifier plus souvent

---

## 📚 Fichiers modifiés

1. ✅ `frontend/src/hooks/useSuperAdminAlerts.ts` - Hook de surveillance
2. ✅ `frontend/src/views/SuperAdminView.tsx` - Migration vers toasts
3. ✅ `frontend/src/App.tsx` - Intégration du hook
4. ✅ `frontend/src/services/api.ts` - Ajout endpoint `getDetailed`

---

## 🎯 Prochaines améliorations possibles

- [ ] Alertes pour disque plein
- [ ] Alertes pour rate limiting désactivé
- [ ] Alertes pour HedgeDoc indisponible
- [ ] Historique des alertes
- [ ] Configuration via interface admin
- [ ] Notifications par email pour les alertes critiques

---

**Le système est opérationnel et prêt à surveiller votre infrastructure !** 🎉


