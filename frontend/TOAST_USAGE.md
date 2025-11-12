# Guide d'utilisation des Toasts - Requiem

**Date** : 2025-01-11  
**Statut** : ✅ Système de toasts implémenté

---

## 📋 Vue d'ensemble

Le système de toasts permet d'afficher des notifications à l'utilisateur de manière cohérente et non-intrusive.

---

## 🚀 Utilisation

### 1. Importer le hook

```typescript
import { useToast } from '../contexts/ToastContext';
```

### 2. Utiliser dans un composant

```typescript
function MyComponent() {
  const { showSuccess, showError, showInfo, showWarning } = useToast();

  const handleAction = async () => {
    try {
      await someAPI.call();
      showSuccess('Opération réussie !');
    } catch (error) {
      showError('Une erreur est survenue');
    }
  };

  return <button onClick={handleAction}>Action</button>;
}
```

---

## 📚 API disponible

### Méthodes principales

#### `showSuccess(message, title?, duration?)`
Affiche un toast de succès (vert)

```typescript
showSuccess('Fichier uploadé avec succès');
showSuccess('Fichier uploadé', 'Succès', 3000); // 3 secondes
```

#### `showError(message, title?, duration?)`
Affiche un toast d'erreur (rouge)

```typescript
showError('Impossible de charger les données');
showError('Erreur de connexion', 'Erreur', 5000);
```

#### `showInfo(message, title?, duration?)`
Affiche un toast d'information (cyan)

```typescript
showInfo('Nouvelle version disponible');
showInfo('Mise à jour', 'Information');
```

#### `showWarning(message, title?, duration?)`
Affiche un toast d'avertissement (jaune)

```typescript
showWarning('Cette action est irréversible');
showWarning('Attention', 'Avertissement', 7000);
```

#### `showToast(type, message, title?, duration?)`
Méthode générique pour tous les types

```typescript
showToast('success', 'Opération réussie');
showToast('error', 'Erreur', 'Titre', 5000);
```

#### `removeToast(id)`
Retire un toast spécifique (retourné par `showToast`)

```typescript
const toastId = showInfo('Chargement...');
// Plus tard
removeToast(toastId);
```

#### `clearAll()`
Retire tous les toasts

```typescript
clearAll();
```

---

## 🎨 Personnalisation

### Durée d'affichage

Par défaut : **5000ms (5 secondes)**

```typescript
// Toast qui reste affiché 10 secondes
showInfo('Message important', 'Info', 10000);

// Toast qui ne se ferme pas automatiquement
showError('Erreur critique', 'Erreur', 0);
```

### Position

Le `ToastContainer` peut être positionné différemment :

```typescript
<ToastContainer 
  darkMode={darkMode} 
  position="top-left"  // ou "top-right", "bottom-right", "bottom-left", "top-center", "bottom-center"
/>
```

---

## 💡 Exemples d'utilisation

### Exemple 1 : Upload de fichier

```typescript
const handleUpload = async (file: File) => {
  try {
    showInfo('Upload en cours...', 'Upload', 0); // Ne pas fermer automatiquement
    
    await evidenceAPI.upload(file, evidenceUid, caseId);
    
    showSuccess('Fichier uploadé avec succès !');
  } catch (error: any) {
    showError(error.message || 'Erreur lors de l\'upload');
  }
};
```

### Exemple 2 : Suppression avec confirmation

```typescript
const handleDelete = async (id: string) => {
  if (!confirm('Êtes-vous sûr ?')) {
    return;
  }
  
  try {
    await casesAPI.delete(id);
    showSuccess('Case supprimé avec succès');
    // Rafraîchir la liste
    loadCases();
  } catch (error: any) {
    showError(error.message || 'Impossible de supprimer le case');
  }
};
```

### Exemple 3 : Opération longue

```typescript
const handleLongOperation = async () => {
  const toastId = showInfo('Traitement en cours...', 'Veuillez patienter', 0);
  
  try {
    await longRunningTask();
    removeToast(toastId);
    showSuccess('Traitement terminé !');
  } catch (error) {
    removeToast(toastId);
    showError('Le traitement a échoué');
  }
};
```

### Exemple 4 : Validation de formulaire

```typescript
const handleSubmit = async (data: FormData) => {
  // Validation
  if (!data.email) {
    showWarning('Veuillez remplir l\'email', 'Validation');
    return;
  }
  
  if (!isValidEmail(data.email)) {
    showError('Email invalide', 'Erreur de validation');
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

## 🔄 Migration depuis l'ancien système

### Avant (console.error, alert, etc.)

```typescript
// ❌ Ancien code
try {
  await api.call();
  alert('Succès !');
} catch (error) {
  console.error(error);
  alert('Erreur');
}
```

### Après (avec toasts)

```typescript
// ✅ Nouveau code
const { showSuccess, showError } = useToast();

try {
  await api.call();
  showSuccess('Succès !');
} catch (error: any) {
  showError(error.message || 'Erreur');
}
```

---

## 🎯 Bonnes pratiques

1. **Messages clairs** : Messages courts et compréhensibles
2. **Durée appropriée** : 
   - Succès : 3-5 secondes
   - Erreur : 5-7 secondes
   - Info : 4-6 secondes
   - Warning : 5-7 secondes
3. **Titres optionnels** : Utiliser pour les messages importants
4. **Ne pas abuser** : Pas de toast pour chaque action mineure
5. **Erreurs utilisateur-friendly** : Traduire les erreurs techniques

---

## 🐛 Troubleshooting

### Le toast ne s'affiche pas

1. Vérifier que `ToastProvider` entoure l'application
2. Vérifier que `ToastContainer` est dans le composant
3. Vérifier la console pour les erreurs

### Le toast reste affiché

1. Vérifier que `duration` n'est pas `0` ou `undefined`
2. Vérifier qu'il n'y a pas d'erreur JavaScript qui bloque

### Les toasts se superposent

C'est normal, ils s'empilent verticalement. Le `ToastContainer` gère automatiquement l'espacement.

---

## 📝 Notes techniques

- **Z-index** : Les toasts ont `z-50` pour être au-dessus de tout
- **Animation** : Slide-in depuis la droite avec fade-in
- **Accessibilité** : `role="alert"` et `aria-live="polite"`
- **Dark mode** : S'adapte automatiquement au thème

---

**Version** : 1.0  
**Dernière mise à jour** : 2025-01-11

