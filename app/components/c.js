import React, { useRef, useEffect } from "react";
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale } from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale);

const DualAxisChart = () => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext("2d");

    const data = {
      labels: ["Jan", "Feb", "Mar", "Apr", "May"],
      datasets: [
        // First dataset - Left axis (related to second dataset)
        {
          label: "Temperature (°C)",
          data: [15, 18, 22, 17, 25],
          borderColor: "#FF6B6B",
          backgroundColor: "rgba(255, 107, 107, 0.1)",
          yAxisID: "y",
          borderWidth: 2,
          tension: 0.3,
        },
        // Second dataset - Left axis (same scale as first)
        {
          label: "Humidity (%)",
          data: [45, 60, 55, 50, 65],
          borderColor: "#4ECDC4",
          backgroundColor: "rgba(78, 205, 196, 0.1)",
          yAxisID: "y",
          borderWidth: 2,
          tension: 0.3,
        },
        // Third dataset - Right axis (independent scale)
        {
          label: "Sales ($1000)",
          data: [120, 190, 150, 180, 210],
          borderColor: "#FFA500",
          backgroundColor: "rgba(255, 165, 0, 0.1)",
          yAxisID: "y1",
          borderWidth: 2,
          tension: 0.3,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: {
            display: true,
            text: "Temperature/Humidity",
            color: "#666",
          },
          grid: {
            drawOnChartArea: true,
          },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          title: {
            display: true,
            text: "Sales ($1000)",
            color: "#666",
          },
          grid: {
            drawOnChartArea: false, // Avoid double grid lines
          },
          // Optional: Adjust scale to fit your data
          min: 100,
          max: 250,
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    };

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data,
      options,
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, []);

  return <canvas ref={chartRef} />;
};

export default DualAxisChart;
