"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#7c3aed", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7"];

type OverTime = { name: string; date: string; count: number; eventId: number }[];
type Funnel = { stage: string; count: number }[];
type Breakdowns = {
  year: { name: string; value: number }[];
  gender: { name: string; value: number }[];
  eventType: { name: string; value: number }[];
};

export default function DashboardCharts({
  overTime, funnel, breakdowns,
}: { overTime: OverTime; funnel: Funnel; breakdowns: Breakdowns }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card">
        <h3 className="font-semibold mb-2">Attendance over time</h3>
        {overTime.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={overTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2">Faith funnel</h3>
        {funnel.every((f) => f.count === 0) ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" fontSize={11} width={120} />
              <Tooltip />
              <Bar dataKey="count" fill="#7c3aed" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card lg:col-span-2">
        <h3 className="font-semibold mb-2">Breakdowns</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PieMini title="By year" data={breakdowns.year} />
          <PieMini title="By gender" data={breakdowns.gender} />
          <PieMini title="By event type" data={breakdowns.eventType} />
        </div>
      </div>
    </div>
  );
}

function PieMini({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div>
      <div className="text-xs text-black/60 text-center mb-1">{title}</div>
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={60} label>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Empty() {
  return <div className="h-[200px] flex items-center justify-center text-xs text-black/40">no data yet</div>;
}
