"use client";
import { btnCls, inputCls } from "./tailwind-classes";
import getSupportedModes from "../../src/trend-analysis";
const strategyModes = []; //getSupportedModes();

export default function AddBotFrom({ bot, onSubmit }) {
  const mode = bot?.info?.mode || "";

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md mx-auto space-y-2 flex flex-col">
      <select name="pair" defaultValue={bot?.pair} required className={inputCls}>
        <option value="">Pair</option>
        {[].map((pair) => (
          <option value={pair} key={pair}>
            {pair.replace("EUR", "")}
          </option>
        ))}
      </select>
      <input
        name="capital"
        type="number"
        placeholder="Investment Capital amount in EUR"
        step="5"
        defaultValue={bot?.info?.capital}
        required
        className={inputCls}
      />
      <select name="mode" defaultValue={mode} required className={inputCls}>
        <option value="">Trading mode</option>
        {strategyModes.map((mode, i) => (
          <option value={mode} key={i}>
            {mode}
          </option>
        ))}
      </select>
      <input
        name="strategyRange"
        type="number"
        step="0.5"
        placeholder="Strategy range in hours"
        defaultValue={bot?.info?.strategyRange}
        required
        className={inputCls}
      />
      <input
        name="priceChange"
        type="number"
        step="0.5"
        placeholder="Price percentage change"
        defaultValue={bot?.info?.priceChange}
        required
        className={inputCls}
      />
      <input
        name="timeinterval"
        type="number"
        placeholder="Time Interval in mins"
        min={5}
        defaultValue={bot?.info?.timeinterval}
        required
        className={inputCls}
      />

      <button type="submit" className={`${btnCls} !mt-5`}>
        Save
      </button>
    </form>
  );
}
