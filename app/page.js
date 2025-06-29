"use client";
import { useEffect, useState } from "react";
import Trader from "./components/trader.js";
import { useRouter } from "next/navigation";
import { request, dateToString } from "../shared-code/utilities.js";
import { State } from "./state.js";
import { EditableInput } from "./components/inputs.js";
import TimeRangeSelect from "./components/time-range-select.js";

const badgeCls =
  "inline-block h-5 min-w-5 px-1 text-sm absolute bottom-6 flex justify-center items-center text-white rounded-full";
// const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Home() {
  const router = useRouter();
  const state = State();
  const [orderbyTime, setOrderbyTime] = useState(false);
  const pairs = Object.keys(state.loadedTraders);

  // const sortedBots = orderbyTime
  //   ? botsPairs.toSorted((p1, p2) => Date.parse(bots[p1].createTime) - Date.parse(bots[p2].createTime))
  //   : botsPairs.toSorted((p1, p2) => sum(bots[p2].trades) - sum(bots[p1].trades));

  const catchErr = (er) => alert(er.message || er.error || er);

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

  useEffect(() => {
    if (!state.user) router.replace("/login");
  }, [state.user]);

  return (
    <>
      <div className="mb-5 flex justify-between items-center">
        <div className="flex items-center">
          <span className="mr-2">Default Capital: </span>
          <EditableInput
            id="default-capital-input-id"
            onBlur={changeDefaultCapital}
            defaultValue={state.defaultCapital}
            cls="text-orange font-bold text-xl"
          >
            €
          </EditableInput>
        </div>

        <div className="flex items-center">
          <TimeRangeSelect
            name="timeRange"
            id="global-prices-time-range"
            onChange={(e) => state.setPricesTimeRange(+e.target.value)}
            defaultValue={state.pricesTimeRange}
          />
        </div>

        <div className="flex justify-between">
          <label for="orderby" className="flex items-center m-2 cursor-pointer">
            <input
              id="orderby"
              type="checkbox"
              value="orderby"
              name="orderby"
              className="w-4 h-4"
              onChange={(e) => setOrderbyTime(e.target.checked)}
            />
            <span className="ml-1">Orderby time</span>
          </label>
        </div>
      </div>

      <ul className="flex flex-wrap no-select mb-8 justify-center">
        {state.user &&
          !state.user.loading &&
          !state.loading &&
          pairs.map((pair) => (
            <li className={`w-full lg:w-1/2 2xl:w-1/3 overflow-y-auto rounded-md`} key={pair}>
              <Trader
                pair={pair}
                info={state.loadedTraders[pair]}
                defaultCapital={state.defaultCapital}
                timeRange={state.pricesTimeRange}
                cls="mb-1 lg:mr-1 xl:mx-1"
              />
            </li>
          ))}
      </ul>

      <div className="relative text-center">
        <button
          onClick={() => state.loadTraders(6)}
          className="bg-pc inline-flex justify-center py-2 px-3 rounded-md mb-5"
        >
          Load more
        </button>
      </div>
    </>
  );
}
