"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

export default function ForgetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post("http://127.0.0.1:8000/api/forgot-password", {
        email,
      });

      if (res.data.status === "success") {
        toast.success(res.data.message);
        setSuccess(true);
      } else {
        toast.error(res.data.message || "Something went wrong");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold text-foreground dark:text-slate-50 mb-4">
          Forgot Password
        </h1>
        <p className="text-muted-foreground dark:text-slate-400 mb-6">
          Enter your email and we will send you a link to reset your password.
        </p>

        {success ? (
          <div className="bg-green-100 text-green-800 px-4 py-3 rounded-lg text-sm mb-4">
            Check your email for the reset link.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col">
            <span className="text-foreground dark:text-slate-300 text-base font-medium pb-2 flex items-center gap-2">
              <Mail size={18} /> Email
            </span>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-4 py-3 rounded-lg border border-border bg-input dark:bg-gray-800 text-foreground dark:text-slate-50 placeholder:text-muted-foreground dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold py-3 rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Reset Link"}
          </button>
        </form>

        <p className="text-sm text-muted-foreground dark:text-slate-400 mt-4 text-center">
          Remembered your password?{" "}
          <a href="/login" className="text-primary hover:underline">
            Login
          </a>
        </p>
      </div>
    </div>
  );
}