"use client";
import { useEffect, useState } from "react";
import Trader from "./components/trader.js";
import { useRouter, useSearchParams } from "next/navigation";
import { request } from "../shared-code/utilities.js";
import { State } from "./state.js";
import { CheckInput, EditableInput, ToggleSwitch } from "./components/inputs.js";
import TimeRangeSelect from "./components/time-range-select.js";
import TradeTimeSuggestion from "./components/trade-time-suggestion.js";
const defaultLoadedTraders = ["XXBTZEUR", "XETHZEUR", "SOLEUR", "PEPEEUR", "XDGEUR", "SUIEUR"];
const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const { loading, user, traders, loadedTradersPairs, defaultCapital, ...state } = State();
  const [sortedPairs, setSortedPairs] = useState([]);
  const [filter, setFilter] = useState("");
  const [orderby, setOrderby] = useState("liquidity");
  const timeRange = +params.get("since") || 6;
  // const signals = Object.keys(traders)
  //   .map((pair) => traders[pair].signal)
  //   .filter((s) => s);

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
    setFilter(e.target.value);
  };

  const loadMore = () => {
    const loaded = [];
    for (const pair of sortedPairs) {
      if (!loadedTradersPairs.includes(pair)) loaded.push(pair);
      if (loaded.length >= 6) break;
    }
    state.setLoadedTradersPairs(loadedTradersPairs.concat(loaded));
  };

  useEffect(() => {
    state.setLoading(true);
    let pairs = Object.keys(traders).filter(
      (p) => !traders[p].disabled && (!filter || traders[p].signal == filter || traders[p].status == filter)
    );

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
    state.setLoadedTradersPairs(pairs.slice(0, 6));
    state.setLoading(false);
  }, [filter, orderby, traders]);

  useEffect(() => {
    if (!user) router.replace("/login");
    state.setLoadedTradersPairs(defaultLoadedTraders);
  }, [user]);

  if (!Object.keys(traders)[0]) return null;
  return (
    <>
      <div className="flex items-center justify-between">
        <TradeTimeSuggestion cls="flex justify-center items-center flex-1 mb-1" />

        <ToggleSwitch onChange={handleAutoSell} checked={state.autoSell} size={35} cls="id-978">
          <strong className="mr-3 text-red">Auto sell</strong>
        </ToggleSwitch>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <span className="mr-2">Capital:</span>
          <EditableInput
            type="number"
            min="0"
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
        {["dropped-increase", "breakout", "paused", "active", "low-liquidity"].map((status, i) => (
          <CheckInput
            type="radio"
            id={status}
            name="status"
            value={status}
            cls="m-1 flex-auto w-1/3 md:w-auto rounded-md"
            labelCLs="rounded-md"
            key={i}
          >
            {status}
          </CheckInput>
        ))}
      </form>

      <ul className="flex flex-wrap no-select mb-8 justify-center">
        {user &&
          !user.loading &&
          !loading &&
          loadedTradersPairs.map((pair) => (
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
        <button onClick={loadMore} className="bg-pc inline-flex justify-center py-2 px-3 rounded-md mb-5">
          Load more
        </button>
      </div>
    </>
  );
}
