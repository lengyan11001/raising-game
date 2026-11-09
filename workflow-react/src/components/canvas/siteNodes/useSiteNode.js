import { useCallback, useEffect, useRef, useState } from 'react';
import { siteNode, updateSiteNode } from '../../../site/SiteBridge';

export function useSiteNode(nodeId = '') {
  const read = useCallback(() => {
    if (typeof nodeId !== 'string' || !nodeId) return null;
    const current = siteNode(nodeId);
    return current ? { ...current, data: { ...(current.data || {}) } } : null;
  }, [nodeId]);
  const [node, setNode] = useState(read);
  const nodeRef = useRef(node);

  useEffect(() => {
    nodeRef.current = node;
  }, [node]);

  useEffect(() => {
    const refresh = (event) => {
      if (!event?.detail?.nodeId || event.detail.nodeId === nodeId) setNode(read());
    };
    window.addEventListener('workflow-react-node-change', refresh);
    window.addEventListener('workflow-react:sync', refresh);
    return () => {
      window.removeEventListener('workflow-react-node-change', refresh);
      window.removeEventListener('workflow-react:sync', refresh);
    };
  }, [nodeId, read]);

  const update = useCallback((patch = {}) => {
    const next = updateSiteNode(nodeId, patch);
    if (next) setNode(read());
    return next;
  }, [nodeId, read]);

  const run = useCallback(() => {
    if (typeof window.runWorkflowSingleNode === 'function') return window.runWorkflowSingleNode(nodeId);
    return null;
  }, [nodeId]);

  return { node, update, run, nodeRef };
}

export function optionsFrom(values = [], labels = {}) {
  return (Array.isArray(values) ? values : []).map((value) => ({
    value,
    label: labels[value] ?? (value === -1 ? '自动' : value),
  }));
}

export function selectedOption(options = [], value = '') {
  return options.find((option) => String(option.value) === String(value))?.value ?? options[0]?.value ?? '';
}
