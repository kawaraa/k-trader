"use client";
import { btnCls, inputCls } from "./tailwind-classes";
const cryptocurrencies = require("../../src/currencies.json");

export default function AddBotFrom({ bot, onSubmit }) {
  const mode = bot?.info?.mode || "";

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

      <select
        name="mode"
        defaultValue={mode.replace("-soft", "").replace("-hard", "")}
        required
        className={inputCls}
      >
        <option value="">Trading mode</option>
        <option value="high-drop-partly-trade">High drop and partly trade</option>
        <option value="near-low-partly-trade">Near low and partly trade</option>
        <option value="on-increase-partly-trade">On increase and partly trade</option>
        <option value="high-drop-slowly-trade">High drop and slowly trade</option>
        <option value="near-low-slowly-trade">Near low and slowly trade</option>
        <option value="on-increase-slowly-trade">On increase and slowly trade</option>
      </select>

      {/* text-sm */}
      <div className="flex items-center mb-4">
        <strong
          title="Relative Strength Index (RSI) or momentum oscillator is a method is designed to measure the speed and change of price movements"
          className="flex-auto mr-3"
        >
          RSI Mode:
        </strong>
        <label for="hard" className="flex items-center mr-12">
          <input
            required
            defaultChecked={mode.includes("hard")}
            id="hard"
            type="radio"
            value="hard"
            name="rsiMode"
            className="w-4 h-4"
          />
          <span className="ml-2">Hard</span>
        </label>

        <label for="soft" className="flex items-center">
          <input
            required
            defaultChecked={mode.includes("soft")}
            id="soft"
            type="radio"
            value="soft"
            name="rsiMode"
            className="w-4 h-4"
          />
          <span className="ml-2">Soft</span>
        </label>
      </div>

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
