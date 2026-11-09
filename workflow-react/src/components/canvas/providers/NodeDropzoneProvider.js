/**
 * 节点拖放区域提供者
 */
import React, { createContext, useContext } from 'react';

const NodeDropzoneContext = createContext(undefined);

export const NodeDropzoneProvider = ({ children }) => {
  return (
    <NodeDropzoneContext.Provider value={{}}>
      {children}
    </NodeDropzoneContext.Provider>
  );
};

export const useNodeDropzone = () => {
  const context = useContext(NodeDropzoneContext);
  if (!context) {
    throw new Error('useNodeDropzone must be used within a NodeDropzoneProvider');
  }
  return context;
};
