"use client";
import { btnCls, inputCls } from "./tailwind-classes";
const { tradable } = require("../../src/currencies.json");

export default function AddBotFrom({ bot, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-md mx-auto space-y-2 flex flex-col">
      <select name="pair" defaultValue={bot?.pair} className={inputCls}>
        <option value="">Pair</option>
        {Object.keys(tradable).map((pair) => (
          <option value={pair} key={pair}>
            {pair.replace("ZEUR", "").replace("EUR", "")}
          </option>
        ))}
      </select>

      <input
        name="capital"
        type="number"
        placeholder="Capital amount in EUR"
        defaultValue={bot?.info?.capital}
        className={inputCls}
      />
      <input
        name="investment"
        type="number"
        placeholder="Investment"
        step="0.5"
        defaultValue={bot?.info?.investment}
        className={inputCls}
      />
      <input
        name="priceChange"
        type="number"
        step="0.1"
        placeholder="Price percentage change"
        defaultValue={bot?.info?.priceChange}
        className={inputCls}
      />
      <input
        name="strategyRange"
        type="number"
        step="0.05"
        placeholder="Strategy range in days"
        defaultValue={bot?.info?.strategyRange}
        className={inputCls}
      />
      <input
        name="timeInterval"
        type="number"
        placeholder="Time Interval in mins"
        defaultValue={bot?.info?.timeInterval}
        className={inputCls}
      />

      <button type="submit" className={`${btnCls} !mt-5`}>
        Save
      </button>
    </form>
  );
}
