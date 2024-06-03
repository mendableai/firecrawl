"use client";

import { useEffect, useRef, useState } from "react";
import { Theme, allThemes } from "@/lib/theme";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Input } from "./ui/input";
import { Github } from "lucide-react";

export default function MainComponent() {
  const [roastUrl, setRoastUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [roastData, setRoastData] = useState("");

  const [spiceLevel, setSpiceLevel] = useState(2);

  return (
    <div
      className="h-screen"
      style={{
        background: `linear-gradient(to bottom right, rgba(255, 255, 255, 0.75) 58%, #fff, red )`,
      }}
    >
      <main className="relative flex h-[95vh] flex-col items-center justify-center bg-transparent bg-opacity-80">
        <div className="w-3/4 flex flex-col items-center gap-4">
          <h1 className="font-inter-tight text-4xl lg:text-5xl xl:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-500 via-zinc-900 to-zinc-900 pb-4 text-center">
            <em className="relative px-1 italic animate-text transition-all text-transparent bg-clip-text bg-gradient-to-tr from-red-600 to-red-400 inline-flex justify-center items-center text-6xl lg:text-7xl xl:text-8xl">
              Roast
            </em>
            <br />{" "}
            <span className="text-4xl lg:text-5xl xl:text-6xl">My Website</span>
          </h1>
          <div className="flex flex-col sm:flex-row  items-center gap-4 justify-center w-3/5">
            <Input
              type="text"
              className="w-full p-2 border border-gray-300 rounded r"
              placeholder="https://coconut.com/"
              value={roastUrl}
              onChange={(e) => setRoastUrl(e.target.value)}
            />
            <Button
              className="px-6 py-2 bg-red-500/25 text-red-500 0 rounded-lg hover:bg-red-300 w-1/8 whitespace-nowrap"
              onClick={async () => {
                if (roastUrl) {
                  setLoading(true);
                  try {
                    const response = await fetch(
                      `/api/roastWebsite?url=${encodeURIComponent(
                        roastUrl
                      )}&spiceLevel=${spiceLevel}`
                    );
                    if (!response.ok) {
                      throw new Error(`Error: ${response.statusText}`);
                    }
                    const data = await response.json();
                    setRoastData(data.roastResult);
                  } catch (error) {
                    console.error("Error:", error);
                  } finally {
                    setLoading(false);
                  }
                }
              }}
            >
              {loading ? "Loading..." : "Get Roasted 🌶️"}
            </Button>
          </div>
          <div className="flex items-center justify-center mt-4">
            <label
              htmlFor="spice-level"
              className="mr-4 font-medium text-gray-700"
            >
              Choose your roast level:
            </label>
            <select
              id="spice-level"
              className="cursor-pointer rounded-lg border border-gray-300 bg-white py-2 px-4 text-center shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              value={spiceLevel}
              onChange={(e) => setSpiceLevel(Number(e.target.value))}
            >
              <option value={1}>Mild 🌶️</option>
              <option value={2}>Medium 🌶️🌶️</option>
              <option value={3}>Spicy 🌶️🌶️🌶️</option>
            </select>
          </div>
          {loading ? (
            <div className="mt-4 w-3/5 p-4 border border-gray-300 rounded shadow bg-gradient-to-r from-red-500 to-red-400 animate-pulse">
              <p className="text-white text-center">Preparing your roast...</p>
            </div>
          ) : (
            roastData && (
              <div className="!font-sans mt-4 w-3/5 p-4 border border-gray-300 rounded shadow">
                <p>{roastData}</p>
              </div>
            )
          )}
        </div>
        <div
          className={`fixed bottom-0 left-0 right-0 p-4 text-white text-center font-light flex justify-center items-center gap-4`}
        >
          <a
            href="https://firecrawl.dev"
            target="_blank"
            className="text-black hover:text-orange-400"
            style={{ textShadow: "2px 2px 4px rgba(0, 0, 0, 0.15)" }}
          >
            A demo web scraping and vision extraction from Firecrawl 🔥
          </a>
        </div>
      </main>
    </div>
  );
}
