import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccessApp } from './AccessApp.js';

const root = document.querySelector('#root');

if (!root) {
  throw new Error('Elemento raiz não encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <AccessApp />
  </StrictMode>,
);
