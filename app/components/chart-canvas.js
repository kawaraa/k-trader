import React, { useRef, useEffect } from "react";
import Chart from "chart.js/auto";

const ChartCanvas = ({ type = "line", data, options }) => {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    const ctx = chartRef.current?.getContext("2d");
    // Create a new Chart instance
    if (ctx) chartInstanceRef.current = new Chart(ctx, { type, data, options });
    // Cleanup on unmount
    return () => chartInstanceRef.current && chartInstanceRef.current.destroy();
  }, [data, options]);

  // width="400" height="200"
  return <canvas ref={chartRef}></canvas>;
};

export default ChartCanvas;
