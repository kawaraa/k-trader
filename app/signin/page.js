"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { request } from "../../src/utilities";
import { btnCls, inputCls } from "../components/tailwind-classes";

export default function Signin() {
  const router = useRouter();
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await request("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e.target.email.value, password: e.target.password.value }),
      });
      router.replace("/");
    } catch (error) {
      setError(error.message);
    }
  };

  useEffect(() => {
    request("/api/bots")
      .then(() => router.replace("/"))
      .catch(() => null);
  }, []);

  return (
    <main className="h-screen p-3 flex justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6 mt-[15vh]">
        <h1 className="text-center text-2xl font-bold">Sign in</h1>

        <input name="email" type="email" placeholder="Email" required className={`${inputCls} `} />
        <input name="password" type="password" placeholder="Password" required className={`${inputCls} `} />
        <button type="submit" className={`${btnCls} !mt-5`}>
          Sign In
        </button>

        {error && <p className="mt-5 text-red">{error}</p>}
      </form>
    </main>
  );
}
