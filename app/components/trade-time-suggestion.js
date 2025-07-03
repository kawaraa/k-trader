"use client";
import { useState } from "react";
import { getCryptoTimingSuggestion } from "../../src/services/trend-analysis.js";

export default function TradeTimeSuggestion({ cls }) {
  const [tradingTimeSuggestion] = useState(getCryptoTimingSuggestion());

  return (
    <div className={`text-orange ${cls}`}>
      {tradingTimeSuggestion.suggestion} - {tradingTimeSuggestion.reason}
    </div>
  );
}
