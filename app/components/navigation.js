"use client";
import { State } from "../state";
import ComboBox, { ToggleSwitch } from "./inputs";
import { urlBase64ToUint8Array } from "../services/encoding-helper";
import { useEffect, useState } from "react";
const key = process.env.NEXT_PUBLIC_VAPID_KEY;

export default function Navigation(props) {
  const { eurBalance, traders, loadedTraders } = State();
  const [notificationOn, setNotificationOn] = useState();
  const [pushNotificationSubscription, setPushNotificationSubscription] = useState();
  const pairs = Object.keys(traders);
  const loadedPairs = Object.keys(loadedTraders);

  const handleNotificationSettings = async (e) => {
    try {
      const subscription = await checkNotificationPermission();
      if (!subscription) throw new Error("No notification permission is granted");
      if (!e.target.checked) {
        await fetch("/api/notification", {
          method: "POST",
          body: JSON.stringify(subscription),
          headers: { "Content-Type": "application/json" },
        }).then((res) => res.json());
        setNotificationOn(true);
      } else {
        await fetch(`/api/notification?endpoint=${subscription.endpoint}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }).then((res) => res.json());
        setNotificationOn(false);
      }
    } catch (error) {
      alert(error.message);
      // console.log("Change Notification: ", error);
    }
  };

  const checkNotificationPermission = async (check) => {
    try {
      if (Notification.permission === "granted" && check) return setNotificationOn(true);
      await Notification.requestPermission();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key), // From `web-push generate-vapid-keys`
      });
      return subscription;
      // console.log("Push subscription:", subscription);
      // Send subscription to your backend (for testing, log it)
    } catch (error) {
      console.log("requestPushNotification: ", error);
      return null;
    }
  };

  useEffect(() => {
    checkNotificationPermission(true);
  }, []);

  return (
    <header className="no-select flex px-1 sm:px-3 py-3 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-center justify-between">
      <div className="flex-auto min-w-16">
        <strong className="text-2xl font-bold text-emerald-500">€{parseInt(eurBalance)}</strong>
      </div>

      <ComboBox items={pairs} link="/trader?pair=" />

      <ToggleSwitch onChange={handleNotificationSettings} checked={notificationOn} size={35} cls="mr-3">
        <span className="mx-1 w-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="pointer-events-none w-full"
            fill="none"
            strokeWidth="1.8"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
            />
          </svg>
        </span>
      </ToggleSwitch>

      <div className="flex items-center items-end">
        <strong>
          {loadedPairs.length}/<span className="text-green">{pairs.length}</span>
        </strong>
        <span className={`w-6 ml-1 flex rounded-3xl`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 6h8a3 3 0 0 1 0 6a3 3 0 0 1 0 6h-8" />
            <path d="M8 6l0 12" />
            <path d="M8 12l6 0" />
            <path d="M9 3l0 3" />
            <path d="M13 3l0 3" />
            <path d="M9 18l0 3" />
            <path d="M13 18l0 3" />
          </svg>
        </span>
      </div>
    </header>
  );
}

// window.addEventListener("click", async function requestPushNotification() {
//   function urlBase64ToUint8Array(base64String) {
//     const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
//     const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
//     const rawData = atob(base64);
//     return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
//   }

//   const registration = await navigator.serviceWorker.ready;
//   console.log("A", registration);
//   let subscription = await registration.pushManager.getSubscription();
//   console.log("B", subscription);

//   if (!subscription) {
//     subscription = await registration.pushManager.subscribe({
//       userVisibleOnly: true,
//       applicationServerKey: urlBase64ToUint8Array(
//         "BIgLN0vOoxx9SrLsScyLZfVqwfzSxjaObZY8nn8AjVSgcs9cIK3pRwgOYLrNKQovWT2g-sKolrAa_q84tHYX_VM"
//       ),
//     });
//     console.log("C", subscription);
//   }
// });
