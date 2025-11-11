/**
 * Exemple d'utilisation du système de toasts
 * 
 * Ce fichier montre comment utiliser les toasts dans vos composants.
 * Vous pouvez supprimer ce fichier une fois que vous avez migré vos composants.
 */

import React, { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';

export function ToastExample() {
  const { showSuccess, showError, showInfo, showWarning } = useToast();
  const [loading, setLoading] = useState(false);

  // Exemple 1 : Succès simple
  const handleSuccess = () => {
    showSuccess('Opération réussie !');
  };

  // Exemple 2 : Erreur avec titre
  const handleError = () => {
    showError('Impossible de charger les données', 'Erreur');
  };

  // Exemple 3 : Info avec durée personnalisée
  const handleInfo = () => {
    showInfo('Nouvelle version disponible', 'Information', 7000);
  };

  // Exemple 4 : Warning
  const handleWarning = () => {
    showWarning('Cette action est irréversible', 'Attention');
  };

  // Exemple 5 : Opération asynchrone avec toast
  const handleAsyncOperation = async () => {
    setLoading(true);
    
    // Toast de chargement (ne se ferme pas automatiquement)
    const loadingToast = showInfo('Traitement en cours...', 'Veuillez patienter', 0);
    
    try {
      // Simuler une opération
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fermer le toast de chargement et afficher le succès
      showSuccess('Traitement terminé avec succès !');
    } catch (error) {
      showError('Le traitement a échoué');
    } finally {
      setLoading(false);
    }
  };

  // Exemple 6 : Upload de fichier
  const handleFileUpload = async (file: File) => {
    const uploadToast = showInfo('Upload en cours...', 'Upload', 0);
    
    try {
      // Simuler l'upload
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      showSuccess(`Fichier "${file.name}" uploadé avec succès !`);
    } catch (error: any) {
      showError(error.message || 'Erreur lors de l\'upload');
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold mb-4">Exemples de Toasts</h2>
      
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSuccess}>
          Toast Succès
        </Button>
        <Button onClick={handleError}>
          Toast Erreur
        </Button>
        <Button onClick={handleInfo}>
          Toast Info
        </Button>
        <Button onClick={handleWarning}>
          Toast Warning
        </Button>
        <Button onClick={handleAsyncOperation} disabled={loading}>
          Opération Async
        </Button>
      </div>
    </div>
  );
}

