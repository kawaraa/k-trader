import React, { useRef, useEffect } from "react";
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale } from "chart.js";

// Register only what we need
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale);

const MultiLineChart = ({ width = "100%", height = "400px" }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Destroy old chart if exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext("2d");

    // Chart data
    const data = {
      labels: ["Jan", "Feb", "Mar", "Apr", "May"],
      datasets: [
        {
          label: "Website Visits",
          data: [12000, 19000, 15000, 18000, 21000],
          borderColor: "#3e95cd",
          backgroundColor: "rgba(62, 149, 205, 0.1)",
          tension: 0.3,
          borderWidth: 2,
          fill: true,
        },
        {
          label: "Mobile App Users",
          data: [8000, 11000, 9000, 12000, 15000],
          borderColor: "#8e5ea2",
          backgroundColor: "rgba(142, 94, 162, 0.1)",
          tension: 0.3,
          borderWidth: 2,
          fill: true,
        },
        {
          label: "API Requests",
          data: [3500, 6000, 4500, 7000, 9000],
          borderColor: "#3cba9f",
          backgroundColor: "rgba(60, 186, 159, 0.1)",
          tension: 0.3,
          borderWidth: 2,
          fill: true,
        },
      ],
    };

    // Chart options
    const options = {
      responsive: true,
      // maintainAspectRatio: false,
      // animation: { duration: 0 },
      // hover: { animationDuration: 0 },
      // responsiveAnimationDuration: 0,
      // plugins: {
      //   legend: {
      //     position: "top",
      //   },
      //   tooltip: {
      //     mode: "index",
      //     intersect: false,
      //   },
      // },
      // scales: {
      //   y: {
      //     beginAtZero: false,
      //     ticks: {
      //       callback: function (value) {
      //         return value.toLocaleString();
      //       },
      //     },
      //   },
      //   x: {
      //     grid: {
      //       display: false,
      //     },
      //   },
      // },
    };

    // Create chart
    chartInstance.current = new Chart(ctx, {
      type: "line",
      data,
      options,
    });

    // Cleanup
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, []);

  return <canvas ref={chartRef} />;
};

export default MultiLineChart;
