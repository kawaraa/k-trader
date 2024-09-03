"use client";
import { btnCls, inputCls } from "./tailwind-classes";
const cryptocurrencies = require("../../src/currencies.json");

export default function AddBotFrom({ bot, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-md mx-auto space-y-2 flex flex-col">
      <select name="pair" defaultValue={bot?.pair} required className={inputCls}>
        <option value="">Pair</option>
        {Object.keys(cryptocurrencies).map((pair) => (
          <option value={pair} key={pair}>
            {pair.replace("EUR", "")}
          </option>
        ))}
      </select>
      <input
        name="capital"
        type="number"
        placeholder="Capital amount in EUR"
        defaultValue={bot?.info?.capital}
        required
        className={inputCls}
      />
      <input
        name="investment"
        type="number"
        placeholder="Investment"
        step="0.1"
        defaultValue={bot?.info?.investment}
        required
        className={inputCls}
      />
      <input
        name="strategyRange"
        type="number"
        step="0.05"
        placeholder="Strategy range in days"
        defaultValue={bot?.info?.strategyRange}
        required
        className={inputCls}
      />
      <input
        name="priceChange"
        type="number"
        step="0.1"
        placeholder="Price percentage change"
        defaultValue={bot?.info?.priceChange}
        required
        className={inputCls}
      />
      <select name="mode" defaultValue={bot?.mode} required className={inputCls}>
        <option value="">Mode</option>
        <option value="near-low">Near low</option>
        <option value="high-drop">High drop</option>
        <option value="near-low-partly-trade">Near low and partly trade</option>
        <option value="high-drop-partly-trade">High drop and partly trade</option>
      </select>

      <input
        name="timeInterval"
        type="number"
        placeholder="Time Interval in mins"
        defaultValue={bot?.info?.timeInterval}
        required
        className={inputCls}
      />

      <button type="submit" className={`${btnCls} !mt-5`}>
        Save
      </button>
    </form>
  );
}
