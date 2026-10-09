import React from 'react';import {createRoot} from 'react-dom/client';import SudokuGame from './SudokuGame';
createRoot(document.getElementById('root')!).render(<React.StrictMode><SudokuGame globalKeyboard/></React.StrictMode>);
