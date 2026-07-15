import { useState, useEffect } from 'react';
import { api } from '../api/client';

// Cached in module scope so multiple components don't each fetch.
let _cache = null;
let _promise = null;

/**
 * Returns the full Indian GST state list from the backend.
 * The list is fetched once and cached for the lifetime of the page session.
 *
 * @returns {{ states: Array<{code, name, gstin_prefix}>, loading: boolean }}
 */
export function useGstStates() {
  const [states,  setStates]  = useState(_cache || []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) {
      setStates(_cache);
      setLoading(false);
      return;
    }
    if (!_promise) {
      _promise = api.getGstStates().then(data => {
        _cache = Array.isArray(data) ? data : [];
        return _cache;
      }).catch(() => {
        _promise = null; // allow retry
        return [];
      });
    }
    _promise.then(data => {
      setStates(data);
      setLoading(false);
    });
  }, []);

  return { states, loading };
}

/**
 * Build a Map from state code → state name for fast lookup.
 */
export function useStateMap() {
  const { states } = useGstStates();
  const map = {};
  states.forEach(s => { map[s.code] = s.name; });
  return map;
}
