"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { request } from "../../shared-code/utilities.js";
import { btnCls, inputCls } from "../components/tailwind-classes";
import { State } from "../state";

export default function Signin() {
  const router = useRouter();
  const { user, setLoading, addMessage } = State();
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await request("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: e.target.username.value, password: e.target.password.value }),
      });
      router.replace("/");
    } catch (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    console.log(user);
    // if (!user?.loading && user?.id) router.replace("/");
  }, [user]);

  return (
    <>
      <main className="no-select h-screen p-3 flex justify-center">
        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6 mt-[15vh]">
          <h1 className="text-center text-2xl font-bold">Sign in</h1>

          <input
            name="username"
            type="text"
            placeholder="Username, Email or phone number"
            min="5"
            max="50"
            required
            className={`${inputCls} `}
          />
          <input name="password" type="password" placeholder="Password" required className={`${inputCls} `} />
          <button type="submit" className={`${btnCls} !mt-5`}>
            Sign In
          </button>

          {error && <p className="mt-5 text-red">{error}</p>}
        </form>
      </main>
    </>
  );
}
