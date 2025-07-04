"use client";
import { useEffect, useState } from "react";
import Trader from "./components/trader.js";
import { useRouter, useSearchParams } from "next/navigation";
import { request } from "../shared-code/utilities.js";
import { State } from "./state.js";
import { CheckInput, EditableInput, ToggleSwitch } from "./components/inputs.js";
import TimeRangeSelect from "./components/time-range-select.js";
import TradeTimeSuggestion from "./components/trade-time-suggestion.js";

const badgeCls =
  "inline-block h-5 min-w-5 px-1 text-sm absolute bottom-6 flex justify-center items-center text-white rounded-full";
const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const { loading, user, traders, loadedTradersPairs, loadTraders, defaultCapital, ...state } = State();
  const [orderby, setOrderby] = useState("liquidity");
  const [sortedPairs, setSortedPairs] = useState([]);
  const timeRange = +params.get("since") || 6;

  const changeDefaultCapital = async (e) => {
    const newCapital = +e.target.value || 0;

    if (!confirm(`Are you sure want increase the default investment capital`)) return;
    state.setLoading(true);
    try {
      await request(`/api/trader/update/ALL/${newCapital}`, { method: "PUT" });
      state.setDefaultCapital(newCapital);
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    state.setLoading(false);
  };

  const handleAutoSell = async (e) => {
    if (!confirm(`Are you sure want pause auto selling`)) return;
    state.setLoading(true);
    try {
      const status = e.target.checked ? "on" : "off";
      await request(`/api/trader/auto-sell/ALL/${status}`, { method: "PUT" });
      state.setAutoSell(status == "on");
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    state.setLoading(false);
  };

  const handleFilterChange = (e) => {
    const pairs = Object.keys(traders).filter((p) => traders[p].signal == e.target.value);
    state.setLoadedTradersPairs(pairs);
  };

  useEffect(() => {
    const pairs = loadedTradersPairs;
    if (pairs) {
      if (orderby == "balance") {
        pairs.sort((a, b) => traders[b].balance - traders[a].balance);
      } else if (orderby == "capital") {
        pairs.sort((a, b) => traders[b].capital - traders[a].capital);
      } else if (orderby == "return-asc") {
        pairs.sort((a, b) => sum(traders[a].trades) - sum(traders[b].trades));
      } else if (orderby == "return-dec") {
        pairs.sort((a, b) => sum(traders[b].trades) - sum(traders[a].trades));
      } else if (orderby == "trades") {
        pairs.sort((a, b) => traders[b].trades.length - traders[a].trades.length);
      }
      setSortedPairs(pairs);
    }
  }, [loadedTradersPairs, orderby]);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user]);

  if (!Object.keys(traders)[0]) return null;
  return (
    <>
      <div className="flex items-center justify-between">
        <TradeTimeSuggestion cls="flex justify-center items-center" />

        <ToggleSwitch onChange={handleAutoSell} checked={state.autoSell} size={35} cls="id-978">
          <span className="mr-3">Pause sell</span>
        </ToggleSwitch>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <span className="mr-2">Capital:</span>
          <EditableInput
            id="default-capital-input-id"
            onBlur={changeDefaultCapital}
            defaultValue={defaultCapital}
            cls="text-orange font-bold text-xl"
          >
            €
          </EditableInput>
        </div>

        <div className="flex items-center">
          <TimeRangeSelect
            name="timeRange"
            id="global-prices-time-range"
            // onChange={(e) => state.setPricesTimeRange(+e.target.value)}
            onChange={(e) => router.replace(`/?since=${e.target.value}`)}
            defaultValue={timeRange}
          />
        </div>

        <div className="flex justify-between">
          <label htmlFor="assets-orderby-select" className="flex items-center mx-2 cursor-pointer">
            Sortby
          </label>
          <select
            name="orderby"
            id="assets-orderby-select"
            onChange={(e) => setOrderby(e.target.value)}
            defaultValue={orderby}
          >
            <option value="balance">Balance</option>
            <option value="capital">Capital</option>
            <option value="return-asc">Return-ASC</option>
            <option value="return-dec">Return-DEC</option>
            <option value="trades">Trades</option>
            <option value="liquidity">liquidity</option>
          </select>
        </div>
      </div>

      <form className="mt-1 mb-5 flex flex-wrap justify-between items-center" onChange={handleFilterChange}>
        {["dropped-increase", "increase-again", "A-shape", "breakout"].map((signal, i) => (
          <CheckInput
            type="radio"
            id={signal}
            name="signal"
            value={signal}
            cls="m-1 flex-auto w-1/3 md:w-auto rounded-md"
            labelCLs="rounded-md"
            key={i}
          >
            {signal}
          </CheckInput>
        ))}
      </form>

      <ul className="flex flex-wrap no-select mb-8 justify-center">
        {user &&
          !user.loading &&
          !loading &&
          sortedPairs.map((pair) => (
            <li className={`w-full lg:w-1/2 2xl:w-1/3 overflow-y-auto rounded-md`} key={pair}>
              <Trader
                pair={pair}
                info={traders[pair]}
                defaultCapital={defaultCapital}
                timeRange={timeRange}
                cls="mb-1 lg:mr-1 xl:mx-1"
              />
            </li>
          ))}
      </ul>

      <div className="relative text-center">
        <button
          onClick={() => loadTraders(6)}
          className="bg-pc inline-flex justify-center py-2 px-3 rounded-md mb-5"
        >
          Load more
        </button>
      </div>
    </>
  );
}
