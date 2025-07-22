"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from "chart.js";
import { getVolatility } from "../../shared-code/utilities";
// Register required components (minimal setup for line chart)
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

// const opn = { animation: { duration: 0 }, hover: { animationDuration: 0 }, responsiveAnimationDuration: 0 };
export default function ChartCanvas({ labels, datasets, options, showZoom }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [maxLevel, setMaxLevel] = useState(0);
  const [leftZoomLevel, setLeftZoomLevel] = useState(0);
  const [rightZoomLevel, setRightZoomLevel] = useState(0);

  const data = {
    labels: labels.slice(leftZoomLevel, rightZoomLevel),
    datasets: datasets.map((ds) => ({ ...ds, data: ds.data.slice(leftZoomLevel, rightZoomLevel) })),
  };

  const volatility = getVolatility(data.datasets[1]?.data).toFixed(1);

  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.data = data;
      chartInstanceRef.current.options = options;
      chartInstanceRef.current.update();
    }

    if (maxLevel <= 1) {
      const max = datasets[0]?.data?.length || 0;
      setMaxLevel(max + 1);
      setRightZoomLevel(max + 1);
    }
  }, [data, options, datasets]);

  useEffect(() => {
    const ctx = chartRef.current?.getContext("2d");
    if (ctx) {
      chartInstanceRef.current = new Chart(ctx, { type: "line", data, options });
      // Cleanup on unmount
      return () => chartInstanceRef.current && chartInstanceRef.current.destroy();
    }
  }, []);

  return (
    <div className="relative h-[inherit] pt-4">
      <canvas ref={chartRef}></canvas>(
      <div className="absolute top-0 right-1 left-1 flex justify-center items-center">
        {showZoom && (
          <label className="flex flex-auto items-center">
            <strong>+</strong>
            <input
              id="zoom"
              type="range"
              min="0"
              max={maxLevel}
              step="90"
              value={leftZoomLevel}
              onChange={(e) => setLeftZoomLevel(Number(e.target.value))}
              className="flex-auto h-2 cursor-pointer appearance-none bg-gray-200 dark:bg-gray-700 rounded-lg"
            />
            <strong>-</strong>
          </label>
        )}

        <strong className="w-20 text-center">{volatility}%</strong>

        {showZoom && (
          <label className="flex flex-auto items-center">
            <strong>-</strong>
            <input
              id="zoom"
              type="range"
              min="0"
              max={maxLevel}
              step="90"
              value={rightZoomLevel}
              onChange={(e) => setRightZoomLevel(Number(e.target.value) + 1)}
              className="flex-auto h-2 cursor-pointer appearance-none bg-gray-200 dark:bg-gray-700 rounded-lg"
            />
            <strong>+</strong>
          </label>
        )}
      </div>
      )
    </div>
  );
}
