
"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("Checking...");

  useEffect(() => {
    fetch("http://localhost:3001/api/health/db")
      .then((res) => {
        if (!res.ok) {
          throw new Error("API unavailable");
        }
        return res.json();
      })
      .then((data) => {
        setStatus(data.database);
      })
      .catch(() => {
        setStatus("Connection failed");
      });
  }, []);

  return (
    <main className="flex min-h-screen flex-col
      items-center justify-center gap-6 p-8">

      <h1 className="text-4xl font-bold">
        Restaurant Reservation SaaS
      </h1>

      <p>Multi-restaurant booking platform</p>

      <div className="rounded-lg border p-6">
        <p>Database status: {status}</p>
      </div>

    </main>
  );
}
