'use client';
import { useEffect, useState } from "react";

interface Summary {
  employeeId: string;
  allowedMinutes: number;
  totalMinutes: number;
  difference: number;
}

export default function AdminLunchSummary({ employeeId }: { employeeId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      const res = await fetch(`/api/lunch/summary?employeeId=${employeeId}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    };
    fetchSummary();
  }, [employeeId]);

  if (!summary) return <p>Loading...</p>;

  return (
    <div className="p-4 rounded-lg shadow bg-white mt-4">
      <h2 className="text-lg font-semibold mb-2">Lunch Summary</h2>
      <p>Allowed: {summary.allowedMinutes} minutes</p>
      <p>Actual: {summary.totalMinutes} minutes</p>
      <p className={summary.difference > 0 ? "text-red-600" : "text-green-600"}>
        Difference: {summary.difference} minutes
      </p>
    </div>
  );
}
