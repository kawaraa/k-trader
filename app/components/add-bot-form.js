"use client";
import { btnCls, inputCls } from "./tailwind-classes";
const cryptocurrencies = require("../../src/data/currencies.json");

export default function AddBotFrom({ bot, onSubmit }) {
  // const strategy = bot?.info?.strategy || "";

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
        name="timeInterval"
        type="number"
        placeholder="Time Interval in mins"
        min={5}
        defaultValue={bot?.info?.timeInterval}
        required
        className={inputCls}
      />

      <input
        name="capital"
        type="number"
        placeholder="Investment Capital amount in EUR"
        step="5"
        defaultValue={bot?.info?.capital}
        required
        className={inputCls}
      />

      <select name="trader" defaultValue={bot?.info?.trader} required className={inputCls}>
        <option value="">Trader</option>
        <option value="Basic" key="basic">
          Basic
        </option>
        <option value="Advance" key="advance">
          Advance
        </option>
      </select>

      <select name="mode" defaultValue={bot?.info?.mode} required className={inputCls}>
        <option value="">Mode</option>
        <option value="test" key="test">
          Test
        </option>
        <option value="live" key="live">
          Live
        </option>
      </select>

      {/* <input
        name="strategy"
        type="text"
        placeholder="Optional: Strategy Settings E.g. on-decrease-12-5"
        defaultValue={strategy}
        className={inputCls}
      /> */}

      <button type="submit" className={`${btnCls} !mt-5`}>
        Save
      </button>
    </form>
  );
}
