import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/globals.css';
import './app/example.css';
import 'katex/dist/katex.min.css';

createRoot(document.getElementById('root')!).render(<App />);
