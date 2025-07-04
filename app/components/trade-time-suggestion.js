"use client";
import { useState } from "react";
import { getCryptoTimingSuggestion } from "../../shared-code/indicators";

export default function TradeTimeSuggestion({ cls }) {
  const [tradingTimeSuggestion] = useState(getCryptoTimingSuggestion());

  return (
    <p className={`text-orange ${cls}`}>
      {tradingTimeSuggestion.suggestion} - {tradingTimeSuggestion.reason}
    </p>
  );
}
