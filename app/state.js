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
  const [notificationOn, setNotificationOn] = useState(false);
  const [traders, setTraders] = useState({});
  const addMessage = (msg) => setMessages([...messages, msg]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const user = await request("/api/auth/user");
      setUser(user);

      const data = await request("/api/trader");
      setTraders(data.traders);
      setEurBalance(data.eurBalance);

      const subscriptions = await request("/api/notification");
      setNotificationOn(subscriptions.length > 0);

      setLoading(false);
    } catch (error) {
      console.log("State:", error);
      setUser(null);
    }
  };

  useEffect(() => {
    // registerServiceWorker();
    fetchData();
  }, []);

  return (
    <StateContext.Provider
      value={{
        user,
        setLoading,
        messages,
        addMessage,
        eurBalance,
        setEurBalance,
        traders,
        setTraders,
        notificationOn,
        setNotificationOn,
      }}
    >
      {messages && <p onClick={() => setMessages([])}>{messages}</p>}

      {children}

      {(user?.loading || loading) && <Loader size="40" wrapperCls="z-9 absolute inset-0 !m-0 bg-blur" />}

      {/* <Messages messages={messages} setMessages={setMessages} /> */}
    </StateContext.Provider>
  );
}

export const State = () => useContext(StateContext);

const registerServiceWorker = async () => {
  if ("serviceWorker" in navigator) {
    return navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      for (const registration of registrations) {
        if (
          registration.active.state == "activated" &&
          registration.active?.scriptURL?.includes("service-worker.js")
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

function registerServiceWorker1(update) {
  // Todo: add this: && !window.location.origin.includes("localhost")
  if ("serviceWorker" in navigator) {
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
}
