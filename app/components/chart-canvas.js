import React, { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";

export default function ChartCanvas({ type = "line", labels, datasets, options }) {
  const maxLevel = datasets[0]?.data?.length || 0;
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(maxLevel);

  const data = {
    labels: labels.slice(-zoomLevel),
    datasets: datasets.map((ds) => ({ ...ds, data: ds.data.slice(-zoomLevel) })),
  };

  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.data = data;
      chartInstanceRef.current.options = options;
      chartInstanceRef.current.update();
    }
  }, [data, options]);

  useEffect(() => {
    const ctx = chartRef.current?.getContext("2d");
    if (ctx) {
      chartInstanceRef.current = new Chart(ctx, { type, data, options });
      // Cleanup on unmount
      return () => chartInstanceRef.current && chartInstanceRef.current.destroy();
    }
  }, []);

  return (
    <div className="relative h-[inherit]">
      <canvas ref={chartRef}></canvas>

      <div className="absolute top-7 right-1 w-46 flex">
        <strong>-</strong>
        <input
          id="zoom"
          type="range"
          min="144"
          max={maxLevel}
          step="144"
          value={zoomLevel}
          onChange={(e) => setZoomLevel(Number(e.target.value))}
          className="flex-auto card rounded-lg cursor-pointer"
        />
        <strong>+</strong>
      </div>
    </div>
  );
}
