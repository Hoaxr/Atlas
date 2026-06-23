import { useState, useEffect } from 'react';

function App() {
  const [apiData, setApiData] = useState({ message: 'Laden...', database: '' });

  useEffect(() => {
    fetch('http://localhost:3000/api/status')
      .then((res) => res.json())
      .then((data) => setApiData(data));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center max-w-sm">
        <h1 className="text-3xl font-black text-cyan-400 mb-2">🚀 MediaManager</h1>
        <p className="text-emerald-400 font-mono text-sm mb-2">{apiData.message}</p>
        <p className="text-xs text-slate-500">{apiData.database}</p>
      </div>
    </div>
  );
}

export default App;
