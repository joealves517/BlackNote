import React from 'react';
import { renderToString } from 'react-dom/server';
import { useChat } from '@ai-sdk/react';

function App() {
  const result = useChat();
  console.log("Keys:", Object.keys(result));
  return React.createElement('div', null, 'hello');
}

renderToString(React.createElement(App));
