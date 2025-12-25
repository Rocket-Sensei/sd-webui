import { useState, useCallback } from "react";
import { authenticatedFetch } from "../utils/api";

export function useImageGeneration() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Add job to queue (async)
  const generateQueued = useCallback(async (params) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const endpoint = params.mode === 'edit'
        ? '/api/queue/edit'
        : params.mode === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      let body;
      let headers = {};

      if ((params.mode === 'edit' || params.mode === 'variation') && params.image) {
        const formData = new FormData();
        formData.append('image', params.image);
        formData.append('model', params.model);
        formData.append('prompt', params.prompt);
        formData.append('n', params.n || 1);
        formData.append('size', params.size || '512x512');
        if (params.negative_prompt) {
          formData.append('negative_prompt', params.negative_prompt);
        }
        if (params.quality) formData.append('quality', params.quality);
        if (params.style) formData.append('style', params.style);
        if (params.seed) formData.append('seed', params.seed);

        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(params);
      }

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Synchronous generation (direct, not queued)
  const generate = useCallback(async (params) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const endpoint = params.mode === 'edit'
        ? '/api/edit'
        : params.mode === 'variation'
        ? '/api/variation'
        : '/api/generate';

      let body;
      let headers = {};

      if ((params.mode === 'edit' || params.mode === 'variation') && params.image) {
        const formData = new FormData();
        formData.append('image', params.image);
        formData.append('model', params.model);
        formData.append('prompt', params.prompt);
        formData.append('n', params.n || 1);
        formData.append('size', params.size || '512x512');
        if (params.negative_prompt) {
          formData.append('negative_prompt', params.negative_prompt);
        }
        if (params.quality) formData.append('quality', params.quality);
        if (params.style) formData.append('style', params.style);
        if (params.seed) formData.append('seed', params.seed);

        body = formData;
        // Don't set Content-Type, let browser set it with boundary
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(params);
      }

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { generate, generateQueued, isLoading, error, result };
}

export function useGenerations(options = {}) {
  const { pageSize = 20 } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [generations, setGenerations] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: pageSize,
    offset: 0,
    hasMore: false
  });

  const fetchGenerations = useCallback(async (append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const offset = append ? pagination.offset + pagination.limit : 0;
      const url = `/api/generations?limit=${pageSize}&offset=${offset}`;
      const response = await authenticatedFetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      if (append) {
        setGenerations((prev) => [...prev, ...data.generations]);
      } else {
        setGenerations(data.generations);
      }

      setPagination(data.pagination);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [pageSize, pagination.offset, pagination.limit]);

  const loadMore = useCallback(() => {
    if (pagination.hasMore && !isLoadingMore) {
      fetchGenerations(true);
    }
  }, [pagination.hasMore, isLoadingMore, fetchGenerations]);

  const deleteGeneration = useCallback(async (id) => {
    try {
      const response = await authenticatedFetch(`/api/generations/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setGenerations((prev) => prev.filter((g) => g.id !== id));
      setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    fetchGenerations,
    loadMore,
    deleteGeneration,
    isLoading,
    isLoadingMore,
    error,
    generations,
    pagination
  };
}
