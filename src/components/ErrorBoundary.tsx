import React, { useState, useEffect, ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.warn("Caught global window error:", event.error);
      if (event.error && event.error.message) {
        setErrorMessage(event.error.message);
      }
    };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  if (hasError) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="p-4 bg-rose-50 border border-rose-300 rounded text-rose-800 text-xs font-sans space-y-2 my-2">
        <div className="font-bold flex items-center gap-2">
          <span>⚠️ Component Error Caught</span>
        </div>
        <p className="font-mono text-[11px] text-rose-700">{errorMessage || "An unexpected error occurred."}</p>
        <button
          type="button"
          onClick={() => {
            setHasError(false);
            setErrorMessage("");
          }}
          className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded font-bold text-[10px] cursor-pointer shadow-xs"
        >
          Reset Component
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
