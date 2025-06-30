"use client";
export default function TimeRangeSelect({ children, ...p }) {
  return (
    <select {...p}>
      <option value="3">3 hrs</option>
      <option value="6">6 hrs</option>
      <option value="12">12 hrs</option>
      <option value="24">24 hrs</option>
      <option value="48">48 hrs</option>
      {children}
    </select>
  );
}
