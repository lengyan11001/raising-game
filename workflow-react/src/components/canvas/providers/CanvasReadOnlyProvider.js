import React, { createContext, useContext } from 'react';

const CanvasReadOnlyContext = createContext(false);

export function CanvasReadOnlyProvider({ readOnly = false, children }) {
  return (
    <CanvasReadOnlyContext.Provider value={Boolean(readOnly)}>
      {children}
    </CanvasReadOnlyContext.Provider>
  );
}

export function useCanvasReadOnly() {
  const ctx = useContext(CanvasReadOnlyContext);
  if (ctx) return true;
  return typeof window !== 'undefined' && typeof window.isWorkflowCanvasReadOnly === 'function'
    ? Boolean(window.isWorkflowCanvasReadOnly())
    : false;
}
