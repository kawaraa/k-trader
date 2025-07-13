"use client";
import { createContext, useContext, useEffect, useState } from "react";
// import Messages from "./components/messages";
import Loader from "./components/loader";
import { request } from "../shared-code/utilities.js";
const StateContext = createContext();

export function StateProvider({ children }) {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [user, setUser] = useState({ loading: true });
  const [eurBalance, setEurBalance] = useState(0);
  const [defaultCapital, setDefaultCapital] = useState(0);
  const [autoSell, setAutoSell] = useState(false);
  const [traders, setTraders] = useState({});
  const [loadedTradersPairs, setLoadedTradersPairs] = useState([]);
  const [pricesTimeRange, setPricesTimeRange] = useState(6);
  const addMessage = (msg) => setMessages([...messages, msg]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const user = await request("/api/auth/user");
      setUser(user);

      const data = await request("/api/trader");
      setTraders(data.traders);
      if (data.eurBalance) setEurBalance(data.eurBalance);
      if (data.defaultCapital) setDefaultCapital(data.defaultCapital);
      setAutoSell(data.autoSell);
    } catch (error) {
      console.log("State:", error);
      setUser(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    registerServiceWorker();
    fetchData();
  }, []);

  useEffect(() => {
    if (user && !user.loading) {
      if (window?.priceEventSource) window.priceEventSource.close();
      window.priceEventSource = new EventSource("/api/sse/all/price", { withCredentials: true });
      window.priceEventSource.onopen = () => console.log("SSE connection opened");
      window.priceEventSource.onerror = (error) => {
        console.error("Price: SSE connection error:");
        window.priceEventSource.close(); // Close client-side connection
      };
      window.priceEventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const pair = Object.keys(data)[0];
        window.dispatchEvent(new CustomEvent(pair, { detail: data[pair] }));
      };

      const handler = () => {
        request(`/api/prices/event/all`, { method: "PATCH" });
        window.priceEventSource.close();
      };
      window.addEventListener("beforeunload", handler);

      // This terminates the connection
      return () => {
        handler();
        window.addEventListener("beforeunload", handler);
      };
    }
  }, [user]);

  return (
    <StateContext.Provider
      value={{
        user,
        setLoading,
        messages,
        addMessage,
        eurBalance,
        setEurBalance,
        autoSell,
        setAutoSell,
        defaultCapital,
        setDefaultCapital,
        traders,
        loadedTradersPairs,
        setLoadedTradersPairs,
        pricesTimeRange,
        setPricesTimeRange,
      }}
    >
      {messages && <p onClick={() => setMessages([])}>{messages}</p>}

      {children}

      <Loader loading={user?.loading || loading} screen size="60" />
      {/* <Messages messages={messages} setMessages={setMessages} /> */}
    </StateContext.Provider>
  );
}

export const State = () => useContext(StateContext);

const registerServiceWorker = async (update) => {
  if ("serviceWorker" in navigator && !window.location.origin.includes("localhost")) {
    return navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      for (const registration of registrations) {
        if (
          registration.active.state == "activated" &&
          registration.active?.scriptURL?.includes("service-worker.js") &&
          !update
        ) {
          continue;
        }
        await new Promise((res, rej) => registration.unregister().then(res).catch(rej));
      }

      navigator.serviceWorker
        .register("/service-worker.js")
        .then((registration) => console.log("Registration scope: ", registration.scope))
        .catch((error) => console.log("Web Worker Registration Error: ", error));
    });
  }
};
