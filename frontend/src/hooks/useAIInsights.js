import { useState, useEffect } from 'react';
import { api } from '../api/client';

export function useAIInsights() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);

  useEffect(() => {
    let isMounted = true;
    
    async function fetchInsights() {
      try {
        setLoading(true);
        const data = await api.ai.dashboardInsights();
        if (isMounted) {
          setInsights(data.insights || []);
          setNote(data.dataQualityNote || null);
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchInsights();
    
    return () => { isMounted = false; };
  }, []);

  return { insights, loading, error, note };
}
