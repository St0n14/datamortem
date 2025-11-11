# Cas d'utilisation des Toasts - dataMortem

**Date** : 2025-01-11  
**Système** : ✅ Implémenté et prêt à l'emploi

---

## 📋 Vue d'ensemble

Le système de toasts est **déjà implémenté** et fonctionnel. Voici les cas d'utilisation concrets dans votre application dataMortem.

---

## 🎯 Cas d'utilisation par fonctionnalité

### 1. **Upload d'Evidence** (`EvidencesView.tsx`)

**Situation actuelle** : Utilise `setError` et `setSuccess` avec des Cards inline

**Avec toasts** :

```typescript
import { useToast } from '../contexts/ToastContext';

function EvidencesView() {
  const { showSuccess, showError, showInfo } = useToast();

  const handleAddEvidence = async () => {
    if (!selectedFile) {
      showWarning('Veuillez sélectionner un fichier', 'Fichier requis');
      return;
    }

    // Toast de chargement (ne se ferme pas automatiquement)
    const loadingToast = showInfo('Upload en cours...', 'Upload', 0);

    try {
      await evidenceAPI.upload(selectedFile, evidenceUid, caseId);
      
      // Fermer le toast de chargement et afficher le succès
      showSuccess('Evidence uploadée et extraite avec succès !');
      setShowAddModal(false);
      loadEvidences();
    } catch (err: any) {
      showError(err.message || 'Erreur lors de l\'upload');
    }
  };
}
```

**Avantages** :
- ✅ Pas besoin de gérer l'état `error`/`success`
- ✅ Toast de chargement visible pendant l'upload
- ✅ Message de succès/erreur non-intrusif

---

### 2. **Création de Case** (`EvidencesView.tsx`)

**Situation actuelle** : `setError` et `setSuccess` inline

**Avec toasts** :

```typescript
const handleAddCase = async () => {
  if (!canManageCases) {
    showWarning('Votre profil est en lecture seule', 'Permission refusée');
    return;
  }

  if (!newCase.case_id) {
    showError('L\'ID du case est requis', 'Validation');
    return;
  }

  try {
    await casesAPI.create(newCase);
    showSuccess('Case créé avec succès !');
    setShowAddCaseModal(false);
    await loadCases();
    onCaseChange?.(newCase.case_id);
  } catch (err: any) {
    showError(err.message || 'Impossible de créer le case');
  }
};
```

---

### 3. **Suppression de Case** (`EvidencesView.tsx`)

**Situation actuelle** : `window.confirm` + `setSuccess`/`setError`

**Avec toasts** :

```typescript
const handleDeleteCase = async () => {
  if (!currentCaseId) return;
  
  if (!canManageCases) {
    showWarning('Votre profil est en lecture seule', 'Permission refusée');
    return;
  }

  // Confirmation (garder window.confirm ou créer un Modal)
  if (!window.confirm(`Supprimer le case ${currentCaseId} ?`)) {
    return;
  }

  try {
    await casesAPI.delete(currentCaseId);
    showSuccess('Case supprimé avec succès');
    await loadCases();
    onCaseChange?.(updatedCases[0]?.case_id || '');
  } catch (err: any) {
    showError(err.message || 'Impossible de supprimer le case');
  }
};
```

---

### 4. **Exécution de Pipeline** (`PipelineView.tsx`)

**Situation actuelle** : `showMessage` avec timeout

**Avec toasts** :

```typescript
import { useToast } from '../contexts/ToastContext';

function PipelineView() {
  const { showSuccess, showError, showInfo } = useToast();

  const handleRunModule = async (moduleId: number) => {
    try {
      const result = await pipelineAPI.run({
        module_id: moduleId,
        evidence_uid: selectedEvidence,
      });

      showSuccess(`Module "${moduleName}" lancé avec succès !`, 'Pipeline');
      
      // Polling pour suivre l'état
      const pollInterval = setInterval(async () => {
        const runs = await pipelineAPI.listRuns(selectedEvidence);
        const run = runs.find(r => r.task_run_id === result.task_run_id);
        
        if (run?.status === 'success') {
          clearInterval(pollInterval);
          showSuccess(`Module "${moduleName}" terminé avec succès !`);
        } else if (run?.status === 'error') {
          clearInterval(pollInterval);
          showError(`Le module "${moduleName}" a échoué`);
        }
      }, 3000);
    } catch (error: any) {
      showError(error.message || 'Impossible de lancer le module');
    }
  };

  const handleIndexTaskRun = async (taskRunId: number, taskName: string) => {
    try {
      await indexingAPI.indexTaskRun({ task_run_id: taskRunId });
      showSuccess(`Indexation de "${taskName}" démarrée !`);
      setTimeout(() => loadTaskRuns(), 2000);
    } catch (error: any) {
      showError(error.message || `Impossible d'indexer ${taskName}`);
    }
  };
}
```

---

### 5. **Installation de Script** (`MarketplaceView.tsx`)

**Situation actuelle** : `setError` et `setSuccess` avec état local

**Avec toasts** :

```typescript
import { useToast } from '../contexts/ToastContext';

function MarketplaceView() {
  const { showSuccess, showError, showInfo } = useToast();

  const handleInstall = async (scriptId: number) => {
    setInstallingId(scriptId);
    
    try {
      const result = await scriptsAPI.install(scriptId);
      
      if (result.status === 'already_installed') {
        showInfo('Ce script est déjà installé dans votre profil', 'Déjà installé');
      } else {
        showSuccess('Script installé ! Il est maintenant disponible dans Pipeline');
      }
      
      await loadMyScripts();
    } catch (err: any) {
      showError(err.message || "Impossible d'installer le script");
    } finally {
      setInstallingId(null);
    }
  };
}
```

---

### 6. **Recherche OpenSearch** (`App.tsx` / `ExplorerView.tsx`)

**Situation actuelle** : Erreurs dans `console.error`

**Avec toasts** :

```typescript
import { useToast } from '../contexts/ToastContext';

function AuthenticatedApp() {
  const { showError, showWarning } = useToast();

  const loadEventsFromOpenSearch = async () => {
    if (!currentCaseId) {
      setEvents([]);
      return;
    }
    
    try {
      const data = await searchAPI.query({
        query: query,
        case_id: currentCaseId,
        size: 100,
      });
      setEvents(data.hits);
    } catch (err: any) {
      if (err.message?.includes('404')) {
        showWarning('Aucun événement trouvé pour ce case', 'Recherche');
      } else {
        showError('Impossible de charger les événements', 'Erreur OpenSearch');
      }
      setEvents([]);
    }
  };

  const loadTimelineFromOpenSearch = async () => {
    setTimelineLoading(true);
    try {
      const data = await searchAPI.timeline({
        case_id: currentCaseId,
        interval: timelineInterval,
        query,
      });
      setTimelineBuckets(data.buckets || []);
    } catch (err: any) {
      if (err.message?.includes('404')) {
        // Pas d'erreur si le case n'est pas encore indexé
        setTimelineBuckets([]);
      } else {
        showError('Impossible de charger la timeline', 'Erreur');
        setTimelineBuckets([]);
      }
    } finally {
      setTimelineLoading(false);
    }
  };
}
```

---

### 7. **Indexation de Case** (`App.tsx`)

**Situation actuelle** : Erreurs silencieuses ou dans console

**Avec toasts** :

```typescript
const handleIndexCase = async () => {
  if (!currentCaseId) return;

  const loadingToast = showInfo('Indexation en cours...', 'Indexation', 0);

  try {
    await indexingAPI.indexCase({ case_id: currentCaseId });
    showSuccess('Indexation démarrée ! Les événements seront disponibles sous peu');
  } catch (error: any) {
    showError(error.message || 'Impossible de démarrer l\'indexation');
  }
};
```

---

### 8. **Authentification** (`LoginView.tsx`)

**Situation actuelle** : `setError` avec affichage inline

**Avec toasts** :

```typescript
import { useToast } from '../contexts/ToastContext';

function LoginView() {
  const { showError, showWarning, showInfo } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(username, password, showOtpField ? otpCode : undefined);
      // Pas besoin de toast de succès, la redirection se fait automatiquement
    } catch (err: any) {
      const message = err.message || 'Échec de la connexion';
      
      if (/otp/i.test(message)) {
        showWarning('Code OTP requis', 'Authentification');
        setShowOtpField(true);
      } else if (/verify/i.test(message) || /email/.test(message)) {
        showWarning('Veuillez vérifier votre email', 'Email non vérifié');
        setShowResend(true);
      } else {
        showError(message, 'Erreur de connexion');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await authAPI.resendVerification(resendEmail.trim());
      showSuccess('Lien de vérification renvoyé. Consultez votre boîte mail');
    } catch (err: any) {
      showError(err.message || 'Impossible de renvoyer l\'email');
    }
  };
}
```

---

### 9. **Création/Exécution de Script** (`ScriptsView.tsx`)

**Avec toasts** :

```typescript
import { useToast } from '../contexts/ToastContext';

function ScriptsView() {
  const { showSuccess, showError, showInfo, showWarning } = useToast();

  const handleCreateScript = async () => {
    if (!newScript.name || !newScript.source_code) {
      showWarning('Le nom et le code source sont requis', 'Validation');
      return;
    }

    try {
      await scriptsAPI.create(newScript);
      showSuccess('Script créé avec succès !');
      setShowCreateModal(false);
      loadScripts();
    } catch (error: any) {
      showError(error.message || 'Impossible de créer le script');
    }
  };

  const handleRunScript = async (scriptId: number) => {
    if (!selectedEvidence) {
      showWarning('Veuillez sélectionner une evidence', 'Evidence requise');
      return;
    }

    const loadingToast = showInfo('Exécution du script en cours...', 'Exécution', 0);

    try {
      const result = await scriptsAPI.run(scriptId, { evidence_uid: selectedEvidence });
      showSuccess(`Script lancé ! Task ID: ${result.task_run_id}`);
      loadTaskRuns();
    } catch (error: any) {
      showError(error.message || 'Impossible d\'exécuter le script');
    }
  };
}
```

---

### 10. **Gestion des utilisateurs** (`SuperAdminView.tsx`)

**Avec toasts** :

```typescript
import { useToast } from '../contexts/ToastContext';

function SuperAdminView() {
  const { showSuccess, showError, showWarning } = useToast();

  const handleCreateUser = async (userData: AdminCreateUserRequest) => {
    try {
      await adminAPI.createUser(userData);
      showSuccess(`Utilisateur "${userData.username}" créé avec succès`);
      loadUsers();
    } catch (error: any) {
      showError(error.message || 'Impossible de créer l\'utilisateur');
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!window.confirm(`Supprimer l'utilisateur "${username}" ?`)) {
      return;
    }

    try {
      await adminAPI.deleteUser(userId);
      showSuccess(`Utilisateur "${username}" supprimé`);
      loadUsers();
    } catch (error: any) {
      showError(error.message || 'Impossible de supprimer l\'utilisateur');
    }
  };
}
```

---

### 11. **Validation de formulaire**

**Avec toasts** :

```typescript
const handleSubmit = async (data: FormData) => {
  // Validation
  if (!data.email) {
    showWarning('Veuillez remplir l\'email', 'Validation');
    return;
  }

  if (!isValidEmail(data.email)) {
    showError('Format d\'email invalide', 'Validation');
    return;
  }

  if (data.password && data.password.length < 8) {
    showError('Le mot de passe doit faire au moins 8 caractères', 'Validation');
    return;
  }

  try {
    await submitForm(data);
    showSuccess('Formulaire soumis avec succès !');
  } catch (error: any) {
    showError(error.message || 'Erreur lors de la soumission');
  }
};
```

---

### 12. **Opérations longues avec progression**

**Avec toasts** :

```typescript
const handleLongOperation = async () => {
  // Toast de démarrage (ne se ferme pas)
  const startToast = showInfo('Traitement en cours...', 'Veuillez patienter', 0);

  try {
    // Simuler une opération longue
    for (let i = 0; i < 10; i++) {
      await processStep(i);
      // Mettre à jour le message (optionnel, nécessite une fonction updateToast)
    }

    // Fermer le toast de chargement
    showSuccess('Traitement terminé avec succès !');
  } catch (error: any) {
    showError(error.message || 'Le traitement a échoué');
  }
};
```

---

## 📊 Résumé des cas d'utilisation

| Fonctionnalité | Type de toast | Durée | Exemple |
|----------------|---------------|-------|---------|
| **Upload réussi** | `showSuccess` | 5s | "Evidence uploadée avec succès !" |
| **Upload échoué** | `showError` | 7s | "Erreur lors de l'upload" |
| **Upload en cours** | `showInfo` | 0 (manuel) | "Upload en cours..." |
| **Validation** | `showWarning` | 5s | "Veuillez remplir tous les champs" |
| **Suppression** | `showSuccess` | 5s | "Case supprimé avec succès" |
| **Permission refusée** | `showWarning` | 7s | "Votre profil est en lecture seule" |
| **Recherche vide** | `showInfo` | 4s | "Aucun résultat trouvé" |
| **Erreur réseau** | `showError` | 7s | "Impossible de se connecter au serveur" |
| **Indexation démarrée** | `showSuccess` | 5s | "Indexation démarrée !" |
| **Script installé** | `showSuccess` | 5s | "Script installé !" |

---

## 🎯 Migration recommandée

### Priorité 1 : Actions critiques
1. ✅ Upload d'evidence
2. ✅ Création/suppression de case
3. ✅ Exécution de pipeline
4. ✅ Indexation

### Priorité 2 : Actions utilisateur
5. ✅ Installation de script
6. ✅ Création/exécution de script
7. ✅ Recherche OpenSearch
8. ✅ Authentification

### Priorité 3 : Administration
9. ✅ Gestion des utilisateurs
10. ✅ Validation de formulaires

---

## 💡 Avantages vs système actuel

| Avant (setError/setSuccess) | Après (Toasts) |
|------------------------------|-----------------|
| ❌ Messages inline qui prennent de l'espace | ✅ Messages non-intrusifs en overlay |
| ❌ Besoin de gérer l'état `error`/`success` | ✅ Pas d'état à gérer |
| ❌ Messages qui restent affichés | ✅ Fermeture automatique |
| ❌ Pas de feedback visuel cohérent | ✅ Design cohérent avec icônes |
| ❌ Difficile de voir plusieurs messages | ✅ Empilement automatique |

---

## 🚀 Prochaines étapes

1. **Tester** : Le système est déjà fonctionnel, testez-le !
2. **Migrer progressivement** : Commencez par les actions critiques
3. **Remplacer** : `setError`/`setSuccess` → `showError`/`showSuccess`
4. **Supprimer** : Les Cards d'erreur/succès inline une fois migré

---

**Le système est prêt ! Vous pouvez commencer à l'utiliser immédiatement.** 🎉

