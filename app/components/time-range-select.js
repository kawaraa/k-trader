"use client";
export default function TimeRangeSelect({ children, ...p }) {
  return (
    <select {...p}>
      <option value="3">3 hours</option>
      <option value="6">6 hours</option>
      <option value="12">12 hours</option>
      <option value="24">24 hours</option>
      <option value="48">48 hours</option>
      {children}
    </select>
  );
}
