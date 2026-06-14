import { useEffect, useState } from 'react'

interface Hello {
  message: string
  utc: string
}

function App() {
  const [hello, setHello] = useState<Hello | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Hello>
      })
      .then(setHello)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="max-w-xl w-full space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">sap-assistant</h1>
        <p className="text-slate-400">
          A SAP integration playground. Frontend in React 19 + Vite. Backend in .NET 9.
        </p>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-left text-sm">
          <div className="font-mono text-slate-400">GET /api/hello</div>
          {hello && (
            <pre className="mt-2 text-emerald-400 whitespace-pre-wrap break-all">
              {JSON.stringify(hello, null, 2)}
            </pre>
          )}
          {error && <div className="mt-2 text-red-400">Error: {error}</div>}
          {!hello && !error && <div className="mt-2 text-slate-500">loading…</div>}
        </div>
      </div>
    </main>
  )
}

export default App
