import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { healthAPI } from '../services/api';

/**
 * Hook pour surveiller la santé des services et afficher des alertes
 * uniquement pour les superadmins
 */
export function useSuperAdminAlerts() {
  const { user } = useAuth();
  const { showError, showWarning } = useToast();
  const lastAlertTime = useRef<Map<string, number>>(new Map());
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  // Intervalle de vérification : 60 secondes
  const CHECK_INTERVAL_MS = 60000;
  // Délai minimum entre deux alertes pour le même service : 5 minutes
  const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

  const isSuperAdmin = user?.role === 'superadmin';

  const shouldShowAlert = useCallback((serviceName: string): boolean => {
    const now = Date.now();
    const lastAlert = lastAlertTime.current.get(serviceName) || 0;
    
    if (now - lastAlert < ALERT_COOLDOWN_MS) {
      return false; // Trop tôt pour réafficher la même alerte
    }
    
    lastAlertTime.current.set(serviceName, now);
    return true;
  }, []);

  const checkHealth = useCallback(async () => {
    if (!isSuperAdmin) {
      return;
    }

    try {
      const status = await healthAPI.getStatus();

      // Vérifier chaque service
      const services = [
        { name: 'PostgreSQL', status: status.postgres },
        { name: 'Redis', status: status.redis },
        { name: 'Celery', status: status.celery },
        { name: 'OpenSearch', status: status.opensearch },
      ];

      services.forEach(({ name, status: serviceStatus }) => {
        // Vérification de sécurité : s'assurer que serviceStatus existe et a les propriétés attendues
        if (!serviceStatus || !serviceStatus.status) {
          return;
        }
        
        if (serviceStatus.status === 'unhealthy') {
          if (shouldShowAlert(name)) {
            showError(
              `${name} est indisponible : ${serviceStatus.message || 'Erreur inconnue'}`,
              'Service critique',
              10000 // 10 secondes pour les erreurs critiques
            );
          }
        } else if (serviceStatus.status === 'degraded') {
          if (shouldShowAlert(name)) {
            showWarning(
              `${name} est dégradé : ${serviceStatus.message || 'Performance réduite'}`,
              'Service dégradé',
              8000
            );
          }
        }
      });

      // Vérifier l'API elle-même
      if (status.api && status.api.status) {
        if (status.api.status === 'unhealthy') {
          if (shouldShowAlert('API')) {
            showError(
              `L'API est indisponible : ${status.api.message || 'Erreur inconnue'}`,
              'Service critique',
              10000
            );
          }
        } else if (status.api.status === 'degraded') {
          if (shouldShowAlert('API')) {
            showWarning(
              `L'API est dégradée : ${status.api.message || 'Performance réduite'}`,
              'Service dégradé',
              8000
            );
          }
        }
      }
    } catch (error: any) {
      // Si on ne peut même pas récupérer le statut, c'est critique
      if (shouldShowAlert('HealthCheck')) {
        showError(
          `Impossible de vérifier la santé des services : ${error.message || 'Erreur inconnue'}`,
          'Surveillance système',
          10000
        );
      }
    }
  }, [isSuperAdmin, shouldShowAlert, showError, showWarning]);

  useEffect(() => {
    if (!isSuperAdmin) {
      // Nettoyer l'intervalle si l'utilisateur n'est plus superadmin
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
        checkInterval.current = null;
      }
      return;
    }

    // Ne pas bloquer le montage initial - retarder la première vérification
    // Cela permet à l'application de se rendre immédiatement
    const initialDelay = setTimeout(() => {
      checkHealth();
    }, 2000); // Attendre 2 secondes avant la première vérification

    // Puis vérification périodique
    checkInterval.current = setInterval(checkHealth, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialDelay);
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
        checkInterval.current = null;
      }
    };
  }, [isSuperAdmin, checkHealth]);
}

