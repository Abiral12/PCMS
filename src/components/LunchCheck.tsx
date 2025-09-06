'use client';
import { useState } from "react";

export default function LunchCheck({ employeeId }: { employeeId: string }) {
  const [status, setStatus] = useState<string>("idle");
  const [message, setMessage] = useState<string>("");

  const handleCheck = async (type: "start" | "end") => {
    try {
      setStatus("loading");
      const res = await fetch(`/api/lunch/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });

      if (!res.ok) throw new Error("Failed");
      setMessage(`Lunch ${type === "start" ? "started" : "ended"} successfully!`);
      setStatus("done");
    } catch (err) {
      setMessage("Error logging lunch!");
      setStatus("error");
    }
  };

  return (
    <div className="p-4 rounded-lg shadow bg-white">
      <h2 className="text-lg font-semibold mb-2">Lunch Break</h2>
      <div className="flex gap-4">
        <button
          onClick={() => handleCheck("start")}
          className="px-4 py-2 bg-green-500 text-white rounded-lg"
        >
          Start Lunch
        </button>
        <button
          onClick={() => handleCheck("end")}
          className="px-4 py-2 bg-red-500 text-white rounded-lg"
        >
          End Lunch
        </button>
      </div>
      {message && <p className="mt-2 text-sm">{message}</p>}
    </div>
  );
}
